(function () {
  "use strict";

  var ROOT_ID = "mindcoreAgreementScreen";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "mindcore-agreement-screen";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "mindcoreAgreementTitle");
      root.setAttribute("hidden", "");
    }
    if (root.parentNode !== document.body || root !== document.body.lastElementChild) {
      document.body.appendChild(root);
    }
    return root;
  }

  function lockBodyScroll() {
    document.documentElement.classList.add("mindcore-agreement-open");
    document.body.classList.add("mindcore-agreement-open");
  }

  function unlockBodyScroll() {
    document.documentElement.classList.remove("mindcore-agreement-open");
    document.body.classList.remove("mindcore-agreement-open");
  }

  function getDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function getField(root, name) {
    return root.querySelector('[name="' + name + '"]');
  }

  function getFieldsConfig(agreement) {
    var defaults = {
      first_name: { label: "Имя", placeholder: "", enabled: true, required: true },
      last_name: { label: "Фамилия", placeholder: "", enabled: true, required: true },
      phone: { label: "Телефон", placeholder: "", enabled: true, required: true },
      email: { label: "E-mail", placeholder: "", enabled: true, required: true }
    };
    var source = agreement && agreement.fields_config && typeof agreement.fields_config === "object"
      ? agreement.fields_config
      : {};

    return Object.keys(defaults).reduce(function (config, key) {
      var field = source[key] && typeof source[key] === "object" ? source[key] : {};
      config[key] = {
        label: typeof field.label === "string" ? field.label : defaults[key].label,
        placeholder: typeof field.placeholder === "string" ? field.placeholder : defaults[key].placeholder,
        enabled: typeof field.enabled === "boolean" ? field.enabled : defaults[key].enabled,
        required: typeof field.required === "boolean" ? field.required : defaults[key].required
      };
      return config;
    }, {});
  }

  function renderField(key, field, saved) {
    if (!field.enabled) return "";
    var input = {
      first_name: { type: "text", name: "contact_first_name", autocomplete: "given-name", value: saved.contact_first_name || "" },
      last_name: { type: "text", name: "contact_last_name", autocomplete: "family-name", value: saved.contact_last_name || "" },
      phone: { type: "tel", name: "contact_phone", autocomplete: "tel", value: saved.contact_phone || "" },
      email: { type: "email", name: "contact_email", autocomplete: "email", value: saved.contact_email || "" }
    }[key];

    return [
      '<label><span>' + escapeHtml(field.label) + '</span>',
      '<input type="' + input.type + '" name="' + input.name + '" autocomplete="' + input.autocomplete + '" value="' + escapeHtml(input.value) + '" placeholder="' + escapeHtml(field.placeholder) + '"' + (field.required ? " required" : "") + ">",
      '</label>'
    ].join("");
  }

  function readForm(root, collectDataEnabled) {
    var accepted = Boolean(getField(root, "agreementAccepted") && getField(root, "agreementAccepted").checked);
    var data = { accepted: accepted };
    if (collectDataEnabled) {
      [
        "contact_first_name",
        "contact_last_name",
        "contact_phone",
        "contact_email"
      ].forEach(function (name) {
        var field = getField(root, name);
        if (field) data[name] = String(field.value || "").trim();
      });
    }
    return data;
  }

  function validate(data, collectDataEnabled, fieldsConfig) {
    if (!data.accepted) return false;
    if (!collectDataEnabled) return true;
    return [
      { key: "first_name", name: "contact_first_name", type: "text" },
      { key: "last_name", name: "contact_last_name", type: "text" },
      { key: "phone", name: "contact_phone", type: "phone" },
      { key: "email", name: "contact_email", type: "email" }
    ].every(function (item) {
      var field = fieldsConfig[item.key];
      if (!field.enabled) return true;
      var value = data[item.name] || "";
      if (!field.required && !value) return true;
      if (item.type === "phone") return getDigits(value).length >= 7;
      if (item.type === "email") return EMAIL_RE.test(value);
      return Boolean(value);
    });
  }

  function render(options) {
    var agreement = options.agreement || {};
    var collectDataEnabled = Boolean(agreement.collect_data_enabled === true);
    var root = ensureRoot();
    var title = agreement.title || "Пользовательское соглашение";
    var checkboxText = agreement.checkbox_text || "Я принимаю условия соглашения";
    var buttonText = agreement.button_text || "Продолжить";
    var saved = options.productUser || {};
    var fieldsConfig = getFieldsConfig(agreement);
    var fieldsHtml = [
      renderField("first_name", fieldsConfig.first_name, saved),
      renderField("last_name", fieldsConfig.last_name, saved),
      renderField("phone", fieldsConfig.phone, saved),
      renderField("email", fieldsConfig.email, saved)
    ].join("");

    root.innerHTML = [
      '<div class="mindcore-agreement-screen__sheet card">',
      '<header class="mindcore-agreement-screen__header">',
      '<h1 id="mindcoreAgreementTitle">' + escapeHtml(title) + '</h1>',
      '</header>',
      '<div class="mindcore-agreement-screen__body">',
      '<section class="mindcore-agreement-screen__text" tabindex="0">' + escapeHtml(agreement.agreement_text || "").replace(/\n/g, "<br>") + '</section>',
      collectDataEnabled && fieldsHtml ? [
        '<div class="mindcore-agreement-screen__fields" aria-label="Контактные данные">',
        fieldsHtml,
        '</div>'
      ].join("") : "",
      '<label class="mindcore-agreement-screen__checkbox"><input type="checkbox" name="agreementAccepted"><span>' + escapeHtml(checkboxText) + '</span></label>',
      '<p class="mindcore-agreement-screen__error" role="alert" hidden></p>',
      '</div>',
      '<footer class="mindcore-agreement-screen__footer">',
      '<button type="button" class="btn btn-primary" data-agreement-submit disabled>' + escapeHtml(buttonText) + '</button>',
      '</footer>',
      '</div>'
    ].join("");

    return root;
  }

  function setError(root, message) {
    var node = root.querySelector(".mindcore-agreement-screen__error");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function setBusy(root, busy) {
    var button = root.querySelector("[data-agreement-submit]");
    if (button) button.classList.toggle("is-loading", Boolean(busy));
    if (button) button.textContent = busy ? "Сохраняем…" : (button.getAttribute("data-label") || button.textContent);
    Array.from(root.querySelectorAll("input, button")).forEach(function (el) { el.disabled = Boolean(busy) || (el.matches("[data-agreement-submit]") && el.hasAttribute("data-invalid")); });
  }

  window.AgreementScreen = {
    show: function (options) {
      options = options || {};
      var root = render(options);
      var collectDataEnabled = Boolean(options.agreement && options.agreement.collect_data_enabled === true);
      var fieldsConfig = getFieldsConfig(options.agreement || {});
      var submit = root.querySelector("[data-agreement-submit]");
      if (submit) submit.setAttribute("data-label", submit.textContent || "Продолжить");

      function updateState() {
        var valid = validate(readForm(root, collectDataEnabled), collectDataEnabled, fieldsConfig);
        if (submit) {
          submit.disabled = !valid;
          if (valid) submit.removeAttribute("data-invalid");
          else submit.setAttribute("data-invalid", "");
        }
      }

      root.addEventListener("input", updateState);
      root.addEventListener("change", updateState);
      root.addEventListener("click", function (event) {
        var button = event.target.closest("[data-agreement-submit]");
        if (!button || button.disabled) return;
        setError(root, "");
        setBusy(root, true);
        Promise.resolve(options.onSubmit && options.onSubmit(readForm(root, collectDataEnabled)))
          .then(function () { window.AgreementScreen.hide(); })
          .catch(function (error) { setError(root, error && error.message ? error.message : "Не удалось сохранить данные. Попробуйте ещё раз."); })
          .finally(function () { setBusy(root, false); updateState(); });
      });

      lockBodyScroll();
      root.scrollTop = 0;
      root.classList.add("is-visible");
      root.removeAttribute("hidden");
      updateState();
    },
    showError: function (message, onRetry) {
      var root = ensureRoot();
      root.innerHTML = [
        '<div class="mindcore-agreement-screen__sheet card mindcore-agreement-screen__sheet--error">',
        '<h1 id="mindcoreAgreementTitle">' + escapeHtml(message || "Не удалось загрузить соглашение") + '</h1>',
        '<p class="mindcore-agreement-screen__error-text">Попробуйте повторить загрузку.</p>',
        '<button type="button" class="btn btn-primary" data-agreement-retry>Повторить</button>',
        '</div>'
      ].join("");
      root.querySelector("[data-agreement-retry]").addEventListener("click", function () {
        if (typeof onRetry === "function") onRetry();
      });
      lockBodyScroll();
      root.scrollTop = 0;
      root.classList.add("is-visible");
      root.removeAttribute("hidden");
    },
    hide: function () {
      var root = document.getElementById(ROOT_ID);
      if (root) {
        root.classList.remove("is-visible");
        root.setAttribute("hidden", "");
      }
      unlockBodyScroll();
    }
  };
})();
