(function () {
  "use strict";

  var DAY_MS = 86400000;
  var instances = new Map();
  var configRequests = new Map();
  var generation = 0;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isHttpsUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      return new URL(value).protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function normalizeConfig(value) {
    if (!isObject(value) || value.ok !== true || value.enabled !== true || !isObject(value.settings)) return null;
    var showBeforeDays = value.settings.show_before_days;
    if (!Number.isInteger(showBeforeDays) || showBeforeDays < 0 || showBeforeDays > 365) return null;
    if (!Array.isArray(value.options) || value.options.length < 1 || value.options.length > 2) return null;

    var options = value.options.slice().sort(function (left, right) {
      return Number(left.sort_order) - Number(right.sort_order);
    });
    var valid = options.every(function (option) {
      return isObject(option)
        && typeof option.id === "string" && option.id.trim()
        && typeof option.title === "string" && option.title.trim()
        && Number.isInteger(option.days_to_add) && option.days_to_add > 0
        && Number.isSafeInteger(option.price_minor) && option.price_minor >= 0
        && option.price_minor <= 1000000000000
        && typeof option.currency === "string" && /^[A-Z]{3}$/.test(option.currency)
        && (option.description == null || typeof option.description === "string")
        && Number.isInteger(option.sort_order);
    });
    if (!valid) return null;

    var supportUrl = value.settings.support_url;
    if (supportUrl != null && typeof supportUrl !== "string") return null;
    var supportLabel = value.settings.support_label;
    if (supportLabel != null && typeof supportLabel !== "string") return null;

    return {
      ok: true,
      enabled: true,
      settings: {
        show_before_days: showBeforeDays,
        support_url: typeof supportUrl === "string" && isHttpsUrl(supportUrl) ? supportUrl.trim() : null,
        support_label: typeof supportLabel === "string" && supportLabel.trim() ? supportLabel.trim() : "Связаться с поддержкой"
      },
      options: options
    };
  }

  function functionUrl(supabaseUrl, functionName) {
    return String(supabaseUrl || "").replace(/\/+$/, "") + "/functions/v1/" + functionName;
  }

  function requestHeaders(anonKey) {
    return {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: "Bearer " + anonKey
    };
  }

  function loadConfig(options) {
    options = options || {};
    var courseId = String(options.courseId || "").trim();
    var supabaseUrl = String(options.supabaseUrl || "").trim();
    var anonKey = String(options.anonKey || "").trim();
    if (!courseId || !supabaseUrl || !anonKey) return Promise.resolve(null);
    if (configRequests.has(courseId)) return configRequests.get(courseId);

    var requestGeneration = generation;
    var promise = fetch(functionUrl(supabaseUrl, "get-renewal-config"), {
      method: "POST",
      headers: requestHeaders(anonKey),
      body: JSON.stringify({ course_id: courseId })
    }).then(function (response) {
      if (!response.ok) throw new Error("renewal_config_failed");
      return response.json();
    }).then(function (data) {
      if (requestGeneration !== generation) return null;
      return normalizeConfig(data);
    }).catch(function () {
      return null;
    });
    configRequests.set(courseId, promise);
    return promise;
  }

  function formatPrice(minor, currency) {
    var whole = Math.floor(minor / 100);
    var remainder = minor % 100;
    var formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(whole);
    if (remainder !== 0) formatted += "," + String(remainder).padStart(2, "0");
    return currency === "RUB" ? formatted + " ₽" : formatted + " " + currency;
  }

  function formatDate(value) {
    if (value == null || String(value).trim() === "") return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function shouldShowWarning(accessExpiresAt, showBeforeDays, nowMs) {
    var expiresAt = new Date(accessExpiresAt);
    if (Number.isNaN(expiresAt.getTime()) || !Number.isInteger(showBeforeDays) || showBeforeDays < 0) return false;
    var remainingMs = expiresAt.getTime() - (typeof nowMs === "number" ? nowMs : Date.now());
    return remainingMs > 0 && remainingMs <= showBeforeDays * DAY_MS;
  }

  function appendTextElement(parent, tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function createSupportLink(config) {
    if (!config.settings.support_url) return null;
    var link = document.createElement("a");
    link.className = "renewal-screen__support";
    link.href = config.settings.support_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = config.settings.support_label;
    return link;
  }

  function setBusy(instance, optionId) {
    instance.busy = true;
    instance.root.setAttribute("aria-busy", "true");
    instance.buttons.forEach(function (button) {
      button.disabled = true;
      if (button.dataset.optionId === optionId) button.textContent = "Создаём заявку…";
    });
  }

  function clearBusy(instance) {
    instance.busy = false;
    instance.root.setAttribute("aria-busy", "false");
    instance.buttons.forEach(function (button) {
      button.disabled = false;
      button.textContent = button.dataset.defaultLabel;
    });
  }

  function showError(instance, message) {
    instance.error.textContent = message;
    instance.error.hidden = false;
  }

  async function createRequest(instance, optionId) {
    if (instance.busy || instance.destroyed) return;
    var option = instance.config.options.find(function (item) { return item.id === optionId; });
    if (!option) return;
    instance.error.hidden = true;
    instance.error.textContent = "";
    setBusy(instance, optionId);

    try {
      var response = await fetch(functionUrl(instance.supabaseUrl, "create-renewal-request"), {
        method: "POST",
        headers: requestHeaders(instance.anonKey),
        body: JSON.stringify({
          course_id: instance.courseId,
          product_user_id: instance.productUser.id,
          renewal_option_id: option.id
        })
      });
      var data = await response.json().catch(function () { return null; });
      if (instance.destroyed) return;
      if (response.status === 409) {
        throw { conflict: true };
      }
      if (!response.ok || !data || data.ok !== true || !isHttpsUrl(data.payment_url)) {
        throw { conflict: false };
      }
      var paymentUrl = data.payment_url;
      var navigationMode;
      if (typeof instance.onNavigate === "function") navigationMode = instance.onNavigate(paymentUrl);
      else {
        window.location.assign(paymentUrl);
        navigationMode = "current";
      }
      if (navigationMode === "external") clearBusy(instance);
      return;
    } catch (error) {
      if (instance.destroyed) return;
      showError(instance, error && error.conflict
        ? "У вас уже есть незавершённая заявка на продление. Для изменения тарифа свяжитесь с поддержкой."
        : "Не удалось перейти к оплате. Попробуйте ещё раз.");
    }
    clearBusy(instance);
  }

  function render(options) {
    options = options || {};
    var container = options.container;
    var config = normalizeConfig(options.renewalConfig);
    var productUser = options.productUser;
    if (!container || !config || !productUser || !productUser.id) return false;
    destroy(container);

    var mode = options.mode === "expired" ? "expired" : "warning";
    var root = document.createElement("section");
    root.className = "card renewal-screen renewal-screen--" + mode;
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-busy", "false");

    appendTextElement(root, "p", "renewal-screen__eyebrow", mode === "expired" ? "Доступ завершён" : "Доступ скоро закончится");
    appendTextElement(root, "h2", "renewal-screen__title", mode === "expired" ? "Доступ к программе завершён" : "Продлите доступ заранее");
    if (mode === "expired") {
      appendTextElement(root, "p", "renewal-screen__lead", "Выберите вариант продления. После оплаты эксперт подтвердит её, и доступ откроется при следующем запуске кабинета.");
    }
    var dateText = formatDate(options.accessExpiresAt);
    if (dateText) appendTextElement(root, "p", "renewal-screen__date", (mode === "expired" ? "Доступ был активен до: " : "Доступ открыт до: ") + dateText);

    var tariffList = document.createElement("div");
    tariffList.className = "renewal-screen__tariffs";
    var buttons = [];
    config.options.forEach(function (option) {
      var tariff = document.createElement("article");
      tariff.className = "renewal-screen__tariff";
      appendTextElement(tariff, "h3", "renewal-screen__tariff-title", option.title);
      appendTextElement(tariff, "p", "renewal-screen__days", "+" + option.days_to_add + " дней доступа");
      if (option.description && option.description.trim()) appendTextElement(tariff, "p", "renewal-screen__description", option.description.trim());
      var price = formatPrice(option.price_minor, option.currency);
      appendTextElement(tariff, "p", "renewal-screen__price", price);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary renewal-screen__action";
      button.dataset.optionId = option.id;
      button.dataset.defaultLabel = "Выбрать за " + price;
      button.textContent = button.dataset.defaultLabel;
      tariff.appendChild(button);
      buttons.push(button);
      tariffList.appendChild(tariff);
    });
    root.appendChild(tariffList);

    var error = appendTextElement(root, "p", "renewal-screen__error", "");
    error.setAttribute("role", "alert");
    error.hidden = true;
    var supportLink = createSupportLink(config);
    if (supportLink) root.appendChild(supportLink);
    if (mode === "expired" && typeof options.backUrl === "string" && options.backUrl.trim()) {
      var backLink = document.createElement("a");
      backLink.className = "btn renewal-screen__back";
      backLink.href = options.backUrl;
      backLink.textContent = "Назад в кабинет";
      root.appendChild(backLink);
    }

    container.innerHTML = "";
    container.appendChild(root);
    container.hidden = false;
    var instance = {
      root: root,
      container: container,
      config: config,
      courseId: String(options.courseId || ""),
      productUser: productUser,
      supabaseUrl: String(options.supabaseUrl || ""),
      anonKey: String(options.anonKey || ""),
      onNavigate: options.onNavigate,
      onBack: options.onBack,
      buttons: buttons,
      error: error,
      busy: false,
      destroyed: false
    };
    instance.clickHandler = function (event) {
      var backLink = event.target.closest("a.renewal-screen__back");
      if (backLink && root.contains(backLink) && typeof instance.onBack === "function") {
        event.preventDefault();
        instance.onBack(backLink.href);
        return;
      }
      var button = event.target.closest("button[data-option-id]");
      if (button && root.contains(button)) void createRequest(instance, button.dataset.optionId);
    };
    root.addEventListener("click", instance.clickHandler);
    instances.set(container, instance);
    return true;
  }

  function destroy(container) {
    if (!container) return;
    var instance = instances.get(container);
    if (instance) {
      instance.destroyed = true;
      instance.root.removeEventListener("click", instance.clickHandler);
      instances.delete(container);
    }
    container.innerHTML = "";
    container.hidden = true;
  }

  function reset() {
    generation += 1;
    configRequests.clear();
    Array.from(instances.keys()).forEach(destroy);
  }

  window.RenewalScreen = {
    DAY_MS: DAY_MS,
    loadConfig: loadConfig,
    normalizeConfig: normalizeConfig,
    formatPrice: formatPrice,
    shouldShowWarning: shouldShowWarning,
    render: render,
    destroy: destroy,
    reset: reset
  };
})();
