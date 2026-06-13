(function () {
  "use strict";

  var EVA_STORAGE_KEY = "eva_calculator_result_v1";

  function toNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }

  function round(value) {
    return Math.round(value);
  }

  function createEvaCalculator(options) {
    var storage = options && options.storage;
    var onPlanSaved = options && options.onPlanSaved;

    var debug = {
      exists: false,
      storageUsed: "unknown",
      updatedAt: "",
      loadedSuccessfully: false
    };

    var GOAL_HINTS = {
      loss: ["выраженный лишний вес", "примерно 30%+ жира", "лишний вес от 8–10 кг и больше"],
      skinny_fat: ["вес в норме", "есть живот, бока", "мало мышц", "хочется подтянуть тело"],
      muscle_gain: ["худощавое телосложение", "сложно набрать вес", "хочется увеличить ягодицы, ноги, плечи"]
    };

    function getStorageType() {
      return storage && storage.type ? storage.type : "local";
    }

    async function loadPlan() {
      try {
        debug.storageUsed = getStorageType();
        if (!storage || typeof storage.getItem !== "function") {
          debug.exists = false;
          debug.loadedSuccessfully = true;
          return null;
        }

        var raw = await storage.getItem(EVA_STORAGE_KEY);
        if (!raw) {
          debug.exists = false;
          debug.loadedSuccessfully = true;
          return null;
        }

        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          debug.exists = false;
          debug.loadedSuccessfully = true;
          return null;
        }

        debug.exists = true;
        debug.updatedAt = parsed.updatedAt || "";
        debug.loadedSuccessfully = true;
        return parsed;
      } catch (error) {
        debug.loadedSuccessfully = false;
        return null;
      }
    }

    async function savePlan(plan) {
      if (storage && typeof storage.setItem === "function") {
        await storage.setItem(EVA_STORAGE_KEY, JSON.stringify(plan));
      }
      debug.exists = true;
      debug.storageUsed = getStorageType();
      debug.updatedAt = plan.updatedAt;
      debug.loadedSuccessfully = true;
      if (typeof onPlanSaved === "function") onPlanSaved(plan);
    }

    function getDebugInfo() {
      return {
        exists: debug.exists,
        storageUsed: debug.storageUsed,
        updatedAt: debug.updatedAt,
        loadedSuccessfully: debug.loadedSuccessfully
      };
    }

    function formatGoal(goal) {
      if (goal === "loss") return "Похудение";
      if (goal === "skinny_fat") return "Skinny Fat";
      if (goal === "muscle_gain") return "Набор мышечной массы";
      return "Похудение";
    }

    function computePlan(input) {
      var supportCalories = (10 * input.weight + 6.25 * input.height - 5 * input.age - 161) * 1.375;
      var calories;
      var protein;
      var fats;

      if (input.goal === "loss") {
        calories = supportCalories * 0.8;
        if (input.weight < 80) protein = input.weight * 1.7;
        else if (input.weight <= 100) protein = 140;
        else protein = 150;
        fats = input.weight * 0.8;
      } else if (input.goal === "skinny_fat") {
        calories = supportCalories * 0.9;
        protein = input.weight * 1.8;
        if (input.weight > 80) protein = Math.min(protein, 140);
        fats = input.weight * 0.9;
      } else {
        calories = supportCalories * 1.1;
        protein = input.weight * 1.8;
        fats = input.weight * 1;
      }

      var carbs = (calories - protein * 4 - fats * 9) / 4;

      return {
        supportCalories: round(supportCalories),
        calories: round(calories),
        protein: round(protein),
        fats: round(fats),
        carbs: Math.max(0, round(carbs))
      };
    }

    function createEvaCalculatorModal() {
      var modal = document.createElement("div");
      modal.className = "eva-calculator-modal";
      modal.hidden = true;
      modal.innerHTML = [
        '<div class="eva-calculator-backdrop" data-eva-calculator-close="1"></div>',
        '<div class="eva-calculator-sheet" role="dialog" aria-modal="true" aria-label="Калькулятор КБЖУ Евы">',
        '<button class="eva-calculator-close" type="button" data-eva-calculator-close="1" aria-label="Закрыть">×</button>',
        '<div class="eva-calculator-content"></div>',
        '</div>'
      ].join("");
      document.body.appendChild(modal);
      return modal;
    }

    var resultRevealTimeout = null;

    function ensureEvaCalculatorModal() {
      var modal = document.querySelector(".eva-calculator-modal");
      if (modal) return modal;
      return createEvaCalculatorModal();
    }

    function getModal() {
      return ensureEvaCalculatorModal();
    }

    function renderGoalHints() {
      return [
        '<div class="eva-calculator-text eva-calculator-hints">',
        '<p><strong>Похудение:</strong> ' + GOAL_HINTS.loss.join('; ') + '.</p>',
        '<p><strong>Skinny Fat:</strong> ' + GOAL_HINTS.skinny_fat.join('; ') + '.</p>',
        '<p><strong>Набор мышечной массы:</strong> ' + GOAL_HINTS.muscle_gain.join('; ') + '.</p>',
        '</div>'
      ].join("");
    }

    function renderForm(plan, errors) {
      var content = getModal().querySelector(".eva-calculator-content");
      var data = plan || {};
      var errs = errors || {};

      function selected(key, value) {
        return data[key] === value ? "selected" : "";
      }

      function valueOf(key) {
        return data[key] != null ? String(data[key]) : "";
      }

      content.innerHTML = [
        '<h2 class="eva-calculator-title">Калькулятор КБЖУ</h2>',
        '<p class="eva-calculator-text">Расчёт под цель: похудение, skinny fat или набор мышечной массы.</p>',
        '<form id="evaCalculatorForm" class="eva-calculator-form" novalidate>',
        field("Вес, кг", "weight", "number", valueOf("weight"), errs.weight, "35-250"),
        field("Рост, см", "height", "number", valueOf("height"), errs.height, "130-220"),
        field("Возраст", "age", "number", valueOf("age"), errs.age, "14-80"),
        selectField("Цель", "goal", errs.goal, [
          { value: "loss", label: "Похудение", selected: selected("goal", "loss") },
          { value: "skinny_fat", label: "Skinny Fat", selected: selected("goal", "skinny_fat") },
          { value: "muscle_gain", label: "Набор мышечной массы", selected: selected("goal", "muscle_gain") }
        ]),
        renderGoalHints(),
        '<button class="btn btn-primary eva-calculator-submit" type="submit">Рассчитать</button>',
        '</form>'
      ].join("");

      content.querySelector("#evaCalculatorForm").addEventListener("submit", onSubmitForm);
    }

    function field(label, name, type, value, error, placeholder) {
      return [
        '<label class="eva-calculator-field">',
        '<span>' + label + '</span>',
        '<input type="' + type + '" name="' + name + '" value="' + escapeHtml(value) + '" placeholder="' + placeholder + '" required>',
        (error ? '<small>' + escapeHtml(error) + '</small>' : ""),
        '</label>'
      ].join("");
    }

    function selectField(label, name, error, items) {
      var options = items.map(function (item) {
        return '<option value="' + item.value + '" ' + item.selected + '>' + item.label + '</option>';
      }).join("");

      return [
        '<label class="eva-calculator-field">',
        '<span>' + label + '</span>',
        '<select name="' + name + '" required>' + options + '</select>',
        (error ? '<small>' + escapeHtml(error) + '</small>' : ""),
        '</label>'
      ].join("");
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function validate(data) {
      var errors = {};
      if (!Number.isFinite(data.weight) || data.weight < 35 || data.weight > 250) errors.weight = "Вес должен быть в диапазоне 35–250 кг.";
      if (!Number.isFinite(data.height) || data.height < 130 || data.height > 220) errors.height = "Рост должен быть в диапазоне 130–220 см.";
      if (!Number.isFinite(data.age) || data.age < 14 || data.age > 80) errors.age = "Укажи возраст от 14 до 80 лет.";
      if (!["loss", "skinny_fat", "muscle_gain"].includes(data.goal)) errors.goal = "Выбери цель.";
      return errors;
    }

    async function onSubmitForm(event) {
      event.preventDefault();
      var form = event.currentTarget;
      var raw = {
        weight: toNumber(form.weight.value),
        height: toNumber(form.height.value),
        age: toNumber(form.age.value),
        goal: form.goal.value
      };

      var errors = validate(raw);
      if (Object.keys(errors).length) {
        renderForm(raw, errors);
        return;
      }

      var result = computePlan(raw);
      var plan = {
        age: raw.age,
        height: raw.height,
        weight: raw.weight,
        goal: raw.goal,
        supportCalories: result.supportCalories,
        calories: result.calories,
        protein: result.protein,
        fats: result.fats,
        carbs: result.carbs,
        activity: "1.375",
        updatedAt: new Date().toISOString()
      };

      await savePlan(plan);
      renderSuccessThenResult(plan);
    }

    function clearResultRevealTimeout() {
      if (resultRevealTimeout) {
        clearTimeout(resultRevealTimeout);
        resultRevealTimeout = null;
      }
    }

    function renderSuccessThenResult(plan) {
      clearResultRevealTimeout();
      var content = getModal().querySelector(".eva-calculator-content");

      content.innerHTML = [
        '<div class="eva-calculator-success" aria-live="polite">',
        '<strong class="eva-calculator-success__title">✓ План питания рассчитан</strong>',
        '<p class="eva-calculator-success__text">Результат сохранён в профиль</p>',
        '</div>'
      ].join("");

      requestAnimationFrame(function () {
        var block = content.querySelector(".eva-calculator-success");
        if (block) block.classList.add("is-visible");
      });

      resultRevealTimeout = setTimeout(function () {
        var block = content.querySelector(".eva-calculator-success");
        if (block) block.classList.add("is-hidden");

        resultRevealTimeout = setTimeout(function () {
          renderResult(plan);
          resultRevealTimeout = null;
        }, 200);
      }, 900);
    }

    function renderResult(plan) {
      var content = getModal().querySelector(".eva-calculator-content");

      content.innerHTML = [
        '<h2 class="eva-calculator-title">Твой план готов</h2>',
        '<div class="eva-calculator-result">',
        '<p>Поддержка: ' + plan.supportCalories + ' ккал</p>',
        '<strong>Рекомендованная калорийность: ' + plan.calories + ' ккал</strong>',
        '<p>Белки: ' + plan.protein + ' г</p>',
        '<p>Жиры: ' + plan.fats + ' г</p>',
        '<p>Углеводы: ' + plan.carbs + ' г</p>',
        '<p>Цель: ' + formatGoal(plan.goal) + '</p>',
        '</div>',
        '<p class="eva-calculator-text">Расчёт сделан по формуле для женщин с фиксированной активностью: примерно 3 тренировки в неделю.</p>',
        '<p class="eva-calculator-text eva-calculator-text--success">Результат сохранён в профиль.</p>',
        '<div class="eva-calculator-actions">',
        '<button class="btn btn-primary" type="button" data-eva-calculator-close="1">Понятно</button>',
        '</div>'
      ].join("");
    }

    function openEvaCalculator(initialData) {
      var modal = ensureEvaCalculatorModal();
      var sheet = modal ? modal.querySelector(".eva-calculator-sheet") : null;

      if (!modal || !sheet) {
        console.error("Eva calculator modal/sheet not found");
        document.body.classList.remove("eva-calculator-open");
        return;
      }

      clearResultRevealTimeout();
      renderForm(initialData || { goal: "loss" });

      modal.hidden = false;

      requestAnimationFrame(function () {
        modal.classList.add("is-open");
        document.body.classList.add("eva-calculator-open");
      });
    }

    function closeEvaCalculator() {
      var modal = document.querySelector(".eva-calculator-modal");
      clearResultRevealTimeout();

      if (modal) {
        modal.classList.remove("is-open");
        modal.hidden = true;
      }

      document.body.classList.remove("eva-calculator-open");
    }

    async function openFromTrigger() {
      var plan = await loadPlan();
      openEvaCalculator(plan || null);
    }

    document.body.classList.remove("eva-calculator-open");

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;

      var openButton = target.closest("[data-eva-calculator-open]");
      if (openButton) {
        event.preventDefault();
        void openFromTrigger();
        return;
      }

      var closeButton = target.closest("[data-eva-calculator-close]");
      if (closeButton) {
        event.preventDefault();
        closeEvaCalculator();
        return;
      }
    });

    return {
      loadPlan: loadPlan,
      open: openEvaCalculator,
      close: closeEvaCalculator,
      getDebugInfo: getDebugInfo,
      formatGoal: formatGoal
    };
  }

  globalThis.EvaCalculator = {
    create: createEvaCalculator
  };
})();
