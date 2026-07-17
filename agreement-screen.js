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
    if (document.body.classList.contains("mindcore-agreement-open")) return;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.setAttribute("data-mindcore-agreement-scroll-y", String(scrollY));
    document.documentElement.classList.add("mindcore-agreement-open");
    document.body.classList.add("mindcore-agreement-open");
    document.body.style.position = "fixed";
    document.body.style.top = "-" + scrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }

  function unlockBodyScroll() {
    if (!document.body.classList.contains("mindcore-agreement-open")) return;
    var scrollY = Number(document.body.getAttribute("data-mindcore-agreement-scroll-y") || 0);
    document.documentElement.classList.remove("mindcore-agreement-open");
    document.body.classList.remove("mindcore-agreement-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    document.body.removeAttribute("data-mindcore-agreement-scroll-y");
    window.scrollTo(0, scrollY);
  }

  function getDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function getField(root, name) {
    return root.querySelector('[name="' + name + '"]');
  }

  function readForm(root, collectDataEnabled) {
    var accepted = Boolean(getField(root, "agreementAccepted") && getField(root, "agreementAccepted").checked);
    var data = { accepted: accepted };
    if (collectDataEnabled) {
      data.contact_first_name = String(getField(root, "contact_first_name").value || "").trim();
      data.contact_last_name = String(getField(root, "contact_last_name").value || "").trim();
      data.contact_phone = String(getField(root, "contact_phone").value || "").trim();
      data.contact_email = String(getField(root, "contact_email").value || "").trim();
    }
    return data;
  }

  function validate(data, collectDataEnabled) {
    if (!data.accepted) return false;
    if (!collectDataEnabled) return true;
    return Boolean(
      data.contact_first_name &&
      data.contact_last_name &&
      getDigits(data.contact_phone).length >= 7 &&
      EMAIL_RE.test(data.contact_email)
    );
  }

  function render(options) {
    var agreement = options.agreement || {};
    var collectDataEnabled = Boolean(agreement.collect_data_enabled === true);
    var root = ensureRoot();
    var title = agreement.title || "Пользовательское соглашение";
    var checkboxText = agreement.checkbox_text || "Я принимаю условия соглашения";
    var buttonText = agreement.button_text || "Продолжить";
    var saved = options.productUser || {};

    root.innerHTML = [
      '<div class="mindcore-agreement-screen__sheet card">',
      '<header class="mindcore-agreement-screen__header">',
      '<h1 id="mindcoreAgreementTitle">' + escapeHtml(title) + '</h1>',
      '</header>',
      '<div class="mindcore-agreement-screen__body">',
      '<section class="mindcore-agreement-screen__text" tabindex="0">' + escapeHtml(agreement.agreement_text || "").replace(/\n/g, "<br>") + '</section>',
      collectDataEnabled ? [
        '<div class="mindcore-agreement-screen__fields" aria-label="Контактные данные">',
        '<label><span>Имя</span><input type="text" name="contact_first_name" autocomplete="given-name" value="' + escapeHtml(saved.contact_first_name || "") + '" required></label>',
        '<label><span>Фамилия</span><input type="text" name="contact_last_name" autocomplete="family-name" value="' + escapeHtml(saved.contact_last_name || "") + '" required></label>',
        '<label><span>Телефон</span><input type="tel" name="contact_phone" autocomplete="tel" value="' + escapeHtml(saved.contact_phone || "") + '" required></label>',
        '<label><span>E-mail</span><input type="email" name="contact_email" autocomplete="email" value="' + escapeHtml(saved.contact_email || "") + '" required></label>',
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
      var submit = root.querySelector("[data-agreement-submit]");
      if (submit) submit.setAttribute("data-label", submit.textContent || "Продолжить");

      function updateState() {
        var valid = validate(readForm(root, collectDataEnabled), collectDataEnabled);
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
