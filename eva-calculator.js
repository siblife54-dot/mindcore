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
    modal.className = "eva-calculator-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = [
      '<div class="eva-calculator-backdrop" data-eva-calculator-close></div>',
      '<div class="eva-calculator-sheet" role="dialog" aria-modal="true" aria-label="Калькулятор КБЖУ">',
      '<button class="eva-calculator-close" type="button" data-eva-calculator-close aria-label="Закрыть">×</button>',
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

  function getModal() {
    return document.querySelector(".eva-calculator-modal") || createModal();
  }

  function openEvaCalculator() {
    var modal = getModal();
    var sheet = modal.querySelector(".eva-calculator-sheet");
    if (!sheet) return;
    document.body.classList.add("eva-calculator-open");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeEvaCalculator() {
    var modal = document.querySelector(".eva-calculator-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("eva-calculator-open");
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
