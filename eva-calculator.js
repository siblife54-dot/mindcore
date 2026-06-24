(function () {
  "use strict";

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
    if (goal === "skinny-fat") return "Skinny Fat";
    if (goal === "muscle-gain") return "Набор мышечной массы";
    return "Похудение";
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
      selectField("Цель", "goal", [
        ["loss", "Похудение"],
        ["skinny-fat", "Skinny Fat"],
        ["muscle-gain", "Набор мышечной массы"]
      ]),
      goalHelpBlock(),
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

  function goalHelpBlock() {
    return [
      '<div class="eva-calculator-field eva-calculator-goal-help" aria-label="Помощь в выборе цели">',
      '<strong>Помощь в выборе цели</strong>',
      '<div><b>Похудение:</b><ul><li>нужно скинуть примерно 6–10 кг и более</li><li>выраженный лишний вес</li><li>30%+ жира</li></ul></div>',
      '<div><b>Skinny Fat:</b><ul><li>нужно скинуть примерно 3–5 кг</li><li>вес в норме</li><li>есть живот и бока</li><li>мало мышц</li><li>хочется подтянуть тело</li></ul></div>',
      '<div><b>Набор мышечной массы:</b><ul><li>худощавое телосложение</li><li>сложно набрать вес</li><li>хочется увеличить ягодицы, ноги и мышечную массу</li></ul></div>',
      '</div>'
    ].join("");
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
    var goal = String(data.get("goal") || "loss");

    if (!(weight > 0) || !(height > 0) || !(age > 0)) {
      form.reportValidity();
      return;
    }

    var maintenanceCalories = (10 * weight + 6.25 * height - 5 * age - 161) * 1.375;
    var calories = maintenanceCalories * 0.8;
    var protein;
    var fats;

    if (goal === "loss") {
      protein = weight < 80 ? 1.7 * weight : (weight <= 100 ? 140 : 150);
      fats = 0.8 * weight;
    } else if (goal === "skinny-fat") {
      calories = maintenanceCalories * 0.9;
      protein = Math.min(1.8 * weight, 140);
      fats = 0.9 * weight;
    } else if (goal === "muscle-gain") {
      calories = maintenanceCalories * 1.1;
      protein = 1.8 * weight;
      fats = 1.0 * weight;
    } else {
      goal = "loss";
      protein = weight < 80 ? 1.7 * weight : (weight <= 100 ? 140 : 150);
      fats = 0.8 * weight;
    }

    var carbs = (calories - protein * 4 - fats * 9) / 4;

    var result = form.parentElement.querySelector(".eva-calculator-result");
    result.hidden = false;
    result.innerHTML = [
      '<p><strong>Поддержка:</strong> ' + Math.round(maintenanceCalories) + ' ккал</p>',
      '<p><strong>Рекомендованная калорийность:</strong> ' + Math.round(calories) + ' ккал</p>',
      '<p><strong>Белки:</strong> ' + Math.round(protein) + ' г</p>',
      '<p><strong>Жиры:</strong> ' + Math.round(fats) + ' г</p>',
      '<p><strong>Углеводы:</strong> ' + Math.round(Math.max(0, carbs)) + ' г</p>',
      '<p><strong>Выбранная цель:</strong> ' + escapeHtml(getGoalLabel(goal)) + '</p>'
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
