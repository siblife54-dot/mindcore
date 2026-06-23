(function () {
  "use strict";

  console.log("[EvaCalculator] loaded v2 shared nutrition modal");

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function getGoalLabel(goal) {
    if (goal === "loss") return "Похудение";
    if (goal === "gain") return "Набор";
    return "Поддержание";
  }

  function ensureHost() {
    var section = document.getElementById("nutritionSection");
    if (!section) return null;

    var host = document.getElementById("evaCalculatorCardHost");
    if (!host) {
      host = document.createElement("section");
      host.id = "evaCalculatorCardHost";
      var nutritionHost = document.getElementById("nutritionCardHost");
      if (nutritionHost && nutritionHost.parentNode === section) {
        nutritionHost.insertAdjacentElement("afterend", host);
      } else {
        section.appendChild(host);
      }
    }
    return host;
  }

  function renderCard(enabled) {
    var section = document.getElementById("nutritionSection");
    var host = ensureHost();
    if (!host) return;

    if (!enabled) {
      host.innerHTML = "";
      return;
    }

    if (section) section.hidden = false;
    host.innerHTML = [
      '<section class="card eva-calculator-card">',
      '<h3>Калькулятор КБЖУ</h3>',
      '<p>Рассчитайте калории, белки, жиры и углеводы под вашу цель.</p>',
      '<button type="button" class="btn btn-primary" data-eva-calculator-open>Рассчитать КБЖУ</button>',
      '</section>'
    ].join("");
  }

  function createModal() {
    var modal = document.createElement("div");
    modal.id = "evaCalculatorModal";
    modal.className = "nutrition-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = [
      '<div class="nutrition-modal__backdrop" data-eva-calculator-close></div>',
      '<div class="nutrition-modal__sheet" role="dialog" aria-modal="true" aria-label="Калькулятор КБЖУ">',
      '<button class="nutrition-modal__close" type="button" data-eva-calculator-close aria-label="Закрыть">×</button>',
      '<div class="nutrition-modal__content">',
      '<h2 class="eva-calculator-title">Калькулятор КБЖУ</h2>',
      '<p class="eva-calculator-text">Заполните поля — рассчитаем калории, белки, жиры и углеводы под вашу цель.</p>',
      '<form class="eva-calculator-form" novalidate>',
      field("Вес, кг", "weight", "number", "35", "250"),
      field("Рост, см", "height", "number", "130", "220"),
      field("Возраст", "age", "number", "14", "100"),
      selectField("Пол", "sex", [
        ["female", "Женский"],
        ["male", "Мужской"]
      ]),
      selectField("Активность", "activity", [
        ["1.2", "Низкая активность"],
        ["1.375", "1–3 тренировки в неделю"],
        ["1.55", "3–5 тренировок в неделю"],
        ["1.725", "6–7 тренировок в неделю"]
      ]),
      selectField("Цель", "goal", [
        ["loss", "Похудение"],
        ["maintain", "Поддержание"],
        ["gain", "Набор"]
      ]),
      '<button class="btn btn-primary eva-calculator-submit" type="submit">Рассчитать</button>',
      '</form>',
      '<div class="eva-calculator-result" aria-live="polite" hidden></div>',
      '</div>',
      '</div>'
    ].join("");
    document.body.appendChild(modal);
    modal.querySelector(".eva-calculator-form").addEventListener("submit", onSubmit);
    return modal;
  }

  function field(label, name, type, min, max) {
    return '<label class="eva-calculator-field"><span>' + label + '</span><input type="' + type + '" name="' + name + '" min="' + min + '" max="' + max + '" step="0.1" required></label>';
  }

  function selectField(label, name, options) {
    return '<label class="eva-calculator-field"><span>' + label + '</span><select name="' + name + '" required>' + options.map(function (option) {
      return '<option value="' + escapeHtml(option[0]) + '">' + escapeHtml(option[1]) + '</option>';
    }).join("") + '</select></label>';
  }

  var modalRoot = null;
  var closeTransitionCleanup = null;

  function getModal() {
    if (!modalRoot) {
      modalRoot = document.getElementById("evaCalculatorModal") || createModal();
    }
    return modalRoot;
  }

  function openEvaCalculator() {
    var modal = getModal();
    var sheet = modal && modal.querySelector(".nutrition-modal__sheet");
    console.log("[EvaCalculator] open clicked", {
      modal: modal,
      modalClass: modal && modal.className,
      sheet: sheet,
      sheetClass: sheet && sheet.className,
      hidden: modal && modal.hidden
    });
    if (!sheet) return;
    if (typeof closeTransitionCleanup === "function") {
      closeTransitionCleanup();
      closeTransitionCleanup = null;
    }
    modal.hidden = false;
    modal.removeAttribute("hidden");
    modal.classList.remove("is-open");
    // Force the hidden/closed state to apply before opening so the sheet
    // is positioned as a modal overlay instead of a page block in WebViews.
    modal.offsetHeight;
    modal.classList.add("is-open");
    document.body.classList.add("modal-open", "calculator-modal-open");
    modal.setAttribute("aria-hidden", "false");
    console.log("[EvaCalculator] after open", {
      hiddenProp: modal.hidden,
      hasHiddenAttr: modal.hasAttribute("hidden"),
      className: modal.className,
      display: getComputedStyle(modal).display,
      sheetDisplay: getComputedStyle(sheet).display,
      sheetTransform: getComputedStyle(sheet).transform,
      sheetRect: sheet.getBoundingClientRect()
    });
  }

  function closeEvaCalculator() {
    var modal = getModal();
    if (!modal) return;
    if (modal.hidden) return;
    var sheet = modal.querySelector(".nutrition-modal__sheet");

    function finishClose() {
      if (typeof closeTransitionCleanup === "function") {
        closeTransitionCleanup();
        closeTransitionCleanup = null;
      }
      modal.hidden = true;
      document.body.classList.remove("modal-open", "calculator-modal-open");
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    if (!sheet) {
      finishClose();
      return;
    }

    var onTransitionEnd = function (event) {
      if (event.target !== sheet || event.propertyName !== "transform") return;
      finishClose();
    };

    closeTransitionCleanup = function () {
      sheet.removeEventListener("transitionend", onTransitionEnd);
    };

    sheet.addEventListener("transitionend", onTransitionEnd);
    setTimeout(function () {
      if (!modal.classList.contains("is-open") && !modal.hidden) finishClose();
    }, 260);
  }

  function onSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var weight = toNumber(data.get("weight"));
    var height = toNumber(data.get("height"));
    var age = toNumber(data.get("age"));
    var activity = toNumber(data.get("activity"));
    var sex = String(data.get("sex") || "female");
    var goal = String(data.get("goal") || "maintain");

    if (!(weight > 0) || !(height > 0) || !(age > 0) || !(activity > 0)) {
      form.reportValidity();
      return;
    }

    var bmr = 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
    var maintenanceCalories = bmr * activity;
    var calories = maintenanceCalories;
    if (goal === "loss") calories = maintenanceCalories * 0.85;
    if (goal === "gain") calories = maintenanceCalories * 1.1;

    var protein = weight * 1.8;
    var fats = weight * 0.9;
    var carbs = (calories - protein * 4 - fats * 9) / 4;

    var result = form.parentElement.querySelector(".eva-calculator-result");
    result.hidden = false;
    result.innerHTML = [
      '<p><strong>Поддержка:</strong> ' + Math.round(maintenanceCalories) + ' ккал</p>',
      '<p><strong>Рекомендованная калорийность:</strong> ' + Math.round(calories) + ' ккал</p>',
      '<p><strong>Белки:</strong> ' + Math.round(protein) + ' г</p>',
      '<p><strong>Жиры:</strong> ' + Math.round(fats) + ' г</p>',
      '<p><strong>Углеводы:</strong> ' + Math.round(Math.max(0, carbs)) + ' г</p>',
      '<p><strong>Цель:</strong> ' + escapeHtml(getGoalLabel(goal)) + '</p>'
    ].join("");
  }

  document.addEventListener("click", function (event) {
    var openBtn = event.target.closest("[data-eva-calculator-open]");
    if (openBtn) {
      event.preventDefault();
      openEvaCalculator();
      return;
    }

    var closeBtn = event.target.closest("[data-eva-calculator-close]");
    if (closeBtn) {
      event.preventDefault();
      closeEvaCalculator();
      return;
    }
  });

  window.EvaCalculator = {
    renderCard: renderCard,
    open: openEvaCalculator,
    close: closeEvaCalculator
  };
}());
