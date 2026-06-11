(function () {
  "use strict";

  var STORAGE_KEY = "nutrition_calculator_v1";

  function toNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }

  function round(value) {
    return Math.round(value);
  }

  function createNutritionCalculator(options) {
    var storage = options && options.storage;
    var onPlanSaved = options && options.onPlanSaved;
    var getLessonLink = options && options.getLessonLink;

    var debug = {
      exists: false,
      storageUsed: "unknown",
      updatedAt: "",
      loadedSuccessfully: false
    };

    function getStorageType() {
      return storage && storage.type ? storage.type : "local";
    }

    async function loadLegacyPlan() {
      if (!storage || typeof storage.getItem !== "function") return null;
      var raw = await storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    }

    function getCalculatorInputs(plan) {
      plan = plan || {};
      return {
        age: plan.age,
        height: plan.height,
        weight: plan.weight,
        sex: plan.sex,
        activity: plan.activity,
        goal: plan.goal
      };
    }

    async function loadPlan() {
      try {
        debug.storageUsed = getStorageType();

        if (storage && typeof storage.loadAppState === "function") {
          var state = await storage.loadAppState();
          if (state && state.kbju && Object.keys(state.kbju).length) {
            debug.exists = true;
            debug.updatedAt = state.kbju.updatedAt || state.updatedAt || "";
            debug.loadedSuccessfully = true;
            return Object.assign({}, state.calculatorInputs || {}, state.kbju || {});
          }
        }

        var legacy = await loadLegacyPlan();
        if (!legacy) {
          debug.exists = false;
          debug.loadedSuccessfully = true;
          return null;
        }

        debug.exists = true;
        debug.updatedAt = legacy.updatedAt || "";
        debug.loadedSuccessfully = true;
        return legacy;
      } catch (error) {
        debug.loadedSuccessfully = false;
        return null;
      }
    }

    async function savePlan(plan) {
      if (storage && typeof storage.updateAppState === "function") {
        await storage.updateAppState({
          kbju: plan,
          calculatorInputs: getCalculatorInputs(plan)
        });
      } else if (storage && typeof storage.setItem === "function") {
        await storage.setItem(STORAGE_KEY, JSON.stringify(plan));
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

    function computePlan(input) {
      var protein = round(input.weight * 1.5);
      var fats = round(input.weight * 0.8);
      var carbsMultiplier = input.goal === "cut" ? 2 : (input.goal === "loss" ? 3 : 4);
      var carbs = round(input.weight * carbsMultiplier);
      var calories = round(protein * 4 + carbs * 4 + fats * 9);

      return {
        calories: calories,
        protein: protein,
        fats: fats,
        carbs: carbs
      };
    }

    function createModalMarkup() {
      var root = document.createElement("div");
      root.className = "nutrition-modal";
      root.hidden = true;
      root.innerHTML = [
        '<div class="nutrition-modal__backdrop" data-close="1"></div>',
        '<div class="nutrition-modal__sheet" role="dialog" aria-modal="true" aria-label="Калькулятор КБЖУ">',
        '<button class="nutrition-modal__close" type="button" data-close="1" aria-label="Закрыть">×</button>',
        '<div class="nutrition-modal__content"></div>',
        '</div>'
      ].join("");
      document.body.appendChild(root);
      return root;
    }

    var modalRoot = null;
    var closeTransitionCleanup = null;
    var resultRevealTimeout = null;

    function getModal() {
      if (!modalRoot) {
        modalRoot = createModalMarkup();
      }
      return modalRoot;
    }

    function formatGoal(goal) {
      if (goal === "cut") return "Сушка";
      if (goal === "loss") return "Похудение";
      return "Поддержание";
    }

    function renderForm(plan, errors) {
      var content = getModal().querySelector(".nutrition-modal__content");
      var data = plan || {};
      var errs = errors || {};

      function selected(key, value) {
        return data[key] === value ? "selected" : "";
      }

      function valueOf(key) {
        return data[key] != null ? String(data[key]) : "";
      }

      content.innerHTML = [
        '<h2 class="nutrition-title">Калькулятор КБЖУ</h2>',
        '<p class="nutrition-text">Заполни поля — рассчитаем дневные калории и макросы.</p>',
        '<form id="nutritionForm" class="nutrition-form" novalidate>',
        field("Возраст", "age", "number", valueOf("age"), errs.age, "14-80"),
        field("Рост (см)", "height", "number", valueOf("height"), errs.height, "130-220"),
        field("Вес (кг)", "weight", "number", valueOf("weight"), errs.weight, "35-250"),
        selectField("Пол", "sex", errs.sex, [
          { value: "female", label: "Женский", selected: selected("sex", "female") },
          { value: "male", label: "Мужской", selected: selected("sex", "male") }
        ]),
        selectField("Активность", "activity", errs.activity, [
          { value: "1.2", label: "Минимальная", selected: selected("activity", "1.2") },
          { value: "1.375", label: "Низкая", selected: selected("activity", "1.375") },
          { value: "1.55", label: "Средняя", selected: selected("activity", "1.55") },
          { value: "1.725", label: "Высокая", selected: selected("activity", "1.725") }
        ]),
        selectField("Цель", "goal", errs.goal, [
          { value: "maintain", label: "Поддержание", selected: selected("goal", "maintain") },
          { value: "loss", label: "Похудение", selected: selected("goal", "loss") },
          { value: "cut", label: "Сушка", selected: selected("goal", "cut") }
        ]),
        '<button class="btn btn-primary nutrition-submit" type="submit">Рассчитать</button>',
        '</form>'
      ].join("");

      content.querySelector("#nutritionForm").addEventListener("submit", onSubmitForm);
    }

    function field(label, name, type, value, error, placeholder) {
      return [
        '<label class="nutrition-field">',
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
        '<label class="nutrition-field">',
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
      if (!Number.isFinite(data.age) || data.age < 14 || data.age > 80) errors.age = "Укажи возраст от 14 до 80 лет.";
      if (!Number.isFinite(data.height) || data.height < 130 || data.height > 220) errors.height = "Рост должен быть в диапазоне 130–220 см.";
      if (!Number.isFinite(data.weight) || data.weight < 35 || data.weight > 250) errors.weight = "Вес должен быть в диапазоне 35–250 кг.";
      if (!["female", "male"].includes(data.sex)) errors.sex = "Выбери пол.";
      if (!["1.2", "1.375", "1.55", "1.725"].includes(data.activity)) errors.activity = "Выбери уровень активности.";
      if (!["maintain", "loss", "cut"].includes(data.goal)) errors.goal = "Выбери цель.";
      return errors;
    }

    async function onSubmitForm(event) {
      event.preventDefault();
      var form = event.currentTarget;
      var raw = {
        age: toNumber(form.age.value),
        height: toNumber(form.height.value),
        weight: toNumber(form.weight.value),
        sex: form.sex.value,
        activity: form.activity.value,
        goal: form.goal.value
      };

      var errors = validate(raw);
      if (Object.keys(errors).length) {
        renderForm(raw, errors);
        return;
      }

      var result = computePlan({
        age: raw.age,
        height: raw.height,
        weight: raw.weight,
        sex: raw.sex,
        activityFactor: Number(raw.activity),
        goal: raw.goal
      });

      var plan = {
        age: raw.age,
        height: raw.height,
        weight: raw.weight,
        sex: raw.sex,
        activity: raw.activity,
        goal: raw.goal,
        calories: result.calories,
        protein: result.protein,
        fats: result.fats,
        carbs: result.carbs,
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
      var content = getModal().querySelector(".nutrition-modal__content");

      content.innerHTML = [
        '<div class="nutrition-success" aria-live="polite">',
        '<strong class="nutrition-success__title">✓ План питания рассчитан</strong>',
        '<p class="nutrition-success__text">Результат сохранён в профиль</p>',
        '</div>'
      ].join("");

      requestAnimationFrame(function () {
        var block = content.querySelector(".nutrition-success");
        if (block) block.classList.add("is-visible");
      });

      resultRevealTimeout = setTimeout(function () {
        var block = content.querySelector(".nutrition-success");
        if (block) block.classList.add("is-hidden");

        resultRevealTimeout = setTimeout(function () {
          renderResult(plan);
          resultRevealTimeout = null;
        }, 200);
      }, 900);
    }

    function renderResult(plan) {
      var content = getModal().querySelector(".nutrition-modal__content");
      var lessonLink = typeof getLessonLink === "function" ? getLessonLink() : null;

      content.innerHTML = [
        '<h2 class="nutrition-title">Твой план готов</h2>',
        '<div class="nutrition-result">',
        '<strong>' + plan.calories + ' ккал/день</strong>',
        '<p>Б ' + plan.protein + ' · Ж ' + plan.fats + ' · У ' + plan.carbs + '</p>',
        '<p>Цель: ' + formatGoal(plan.goal) + '</p>',
        '</div>',
        '<p class="nutrition-text">Начни с этого уровня и наблюдай за динамикой 10–14 дней.</p>',
        '<p class="nutrition-text nutrition-text--success">Результат сохранён в профиль.</p>',
        '<div class="nutrition-actions">',
        '<button class="btn btn-primary" type="button" data-close="1">Понятно</button>',
        (lessonLink ? '<a class="btn" href="' + lessonLink + '">Перейти к урокам</a>' : ""),
        '</div>'
      ].join("");
    }

    function open(initialData) {
      var root = getModal();
      clearResultRevealTimeout();
      if (typeof closeTransitionCleanup === "function") {
        closeTransitionCleanup();
        closeTransitionCleanup = null;
      }
      renderForm(initialData || {
        sex: "female",
        activity: "1.375",
        goal: "maintain"
      });

      root.hidden = false;
      root.classList.remove("is-open");
      // Force the closed state to apply before opening so the shared bottom-sheet
      // animation and visible state work reliably in Telegram WebView.
      root.offsetHeight;
      root.classList.add("is-open");
      document.body.classList.add("modal-open", "calculator-modal-open");
    }

    function close() {
      var root = getModal();
      if (root.hidden) return;
      clearResultRevealTimeout();

      var sheet = root.querySelector(".nutrition-modal__sheet");

      function finishClose() {
        if (typeof closeTransitionCleanup === "function") {
          closeTransitionCleanup();
          closeTransitionCleanup = null;
        }
        root.hidden = true;
        document.body.classList.remove("modal-open", "calculator-modal-open");
      }

      if (!sheet) {
        finishClose();
        return;
      }

      root.classList.remove("is-open");

      var onTransitionEnd = function (event) {
        if (event.target !== sheet || event.propertyName !== "transform") return;
        finishClose();
      };

      closeTransitionCleanup = function () {
        sheet.removeEventListener("transitionend", onTransitionEnd);
      };

      sheet.addEventListener("transitionend", onTransitionEnd);
      setTimeout(function () {
        if (!root.classList.contains("is-open") && !root.hidden) finishClose();
      }, 260);
    }

    document.addEventListener("click", function (event) {
      if (!modalRoot || modalRoot.hidden) return;
      if (event.target && event.target.getAttribute("data-close") === "1") {
        close();
      }
    });

    return {
      loadPlan: loadPlan,
      open: open,
      close: close,
      getDebugInfo: getDebugInfo,
      formatGoal: formatGoal
    };
  }


  var EVA_STORAGE_KEY = "eva_calculator_result_v1";

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
        fats = input.weight;
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

    function createModalMarkup() {
      var root = document.createElement("div");
      root.className = "nutrition-modal";
      root.hidden = true;
      root.innerHTML = [
        '<div class="nutrition-modal__backdrop" data-close="eva"></div>',
        '<div class="nutrition-modal__sheet" role="dialog" aria-modal="true" aria-label="Калькулятор КБЖУ">',
        '<button class="nutrition-modal__close" type="button" data-close="eva" aria-label="Закрыть">×</button>',
        '<div class="nutrition-modal__content"></div>',
        '</div>'
      ].join("");
      document.body.appendChild(root);
      return root;
    }

    var modalRoot = null;
    var closeTransitionCleanup = null;
    var resultRevealTimeout = null;

    function getModal() {
      if (!modalRoot) modalRoot = createModalMarkup();
      return modalRoot;
    }

    function renderGoalHints() {
      return [
        '<div class="nutrition-text">',
        '<p><strong>Похудение:</strong> ' + GOAL_HINTS.loss.join('; ') + '.</p>',
        '<p><strong>Skinny Fat:</strong> ' + GOAL_HINTS.skinny_fat.join('; ') + '.</p>',
        '<p><strong>Набор мышечной массы:</strong> ' + GOAL_HINTS.muscle_gain.join('; ') + '.</p>',
        '</div>'
      ].join("");
    }

    function renderForm(plan, errors) {
      var content = getModal().querySelector(".nutrition-modal__content");
      var data = plan || {};
      var errs = errors || {};

      function selected(key, value) {
        return data[key] === value ? "selected" : "";
      }

      function valueOf(key) {
        return data[key] != null ? String(data[key]) : "";
      }

      content.innerHTML = [
        '<h2 class="nutrition-title">Калькулятор КБЖУ</h2>',
        '<p class="nutrition-text">Расчёт под цель: похудение, skinny fat или набор мышечной массы.</p>',
        '<form id="evaCalculatorForm" class="nutrition-form" novalidate>',
        field("Вес, кг", "weight", "number", valueOf("weight"), errs.weight, "35-250"),
        field("Рост, см", "height", "number", valueOf("height"), errs.height, "130-220"),
        field("Возраст", "age", "number", valueOf("age"), errs.age, "14-80"),
        selectField("Цель", "goal", errs.goal, [
          { value: "loss", label: "Похудение", selected: selected("goal", "loss") },
          { value: "skinny_fat", label: "Skinny Fat", selected: selected("goal", "skinny_fat") },
          { value: "muscle_gain", label: "Набор мышечной массы", selected: selected("goal", "muscle_gain") }
        ]),
        renderGoalHints(),
        '<button class="btn btn-primary nutrition-submit" type="submit">Рассчитать</button>',
        '</form>'
      ].join("");

      content.querySelector("#evaCalculatorForm").addEventListener("submit", onSubmitForm);
    }

    function field(label, name, type, value, error, placeholder) {
      return [
        '<label class="nutrition-field">',
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
        '<label class="nutrition-field">',
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
      var content = getModal().querySelector(".nutrition-modal__content");

      content.innerHTML = [
        '<div class="nutrition-success" aria-live="polite">',
        '<strong class="nutrition-success__title">✓ План питания рассчитан</strong>',
        '<p class="nutrition-success__text">Результат сохранён в профиль</p>',
        '</div>'
      ].join("");

      requestAnimationFrame(function () {
        var block = content.querySelector(".nutrition-success");
        if (block) block.classList.add("is-visible");
      });

      resultRevealTimeout = setTimeout(function () {
        var block = content.querySelector(".nutrition-success");
        if (block) block.classList.add("is-hidden");

        resultRevealTimeout = setTimeout(function () {
          renderResult(plan);
          resultRevealTimeout = null;
        }, 200);
      }, 900);
    }

    function renderResult(plan) {
      var content = getModal().querySelector(".nutrition-modal__content");

      content.innerHTML = [
        '<h2 class="nutrition-title">Твой план готов</h2>',
        '<div class="nutrition-result">',
        '<p>Поддержка: ' + plan.supportCalories + ' ккал</p>',
        '<strong>Рекомендованная калорийность: ' + plan.calories + ' ккал</strong>',
        '<p>Белки: ' + plan.protein + ' г</p>',
        '<p>Жиры: ' + plan.fats + ' г</p>',
        '<p>Углеводы: ' + plan.carbs + ' г</p>',
        '<p>Выбранная цель: ' + formatGoal(plan.goal) + '</p>',
        '</div>',
        '<p class="nutrition-text">Расчёт сделан по формуле для женщин с фиксированной активностью: примерно 3 тренировки в неделю.</p>',
        '<p class="nutrition-text nutrition-text--success">Результат сохранён в профиль.</p>',
        '<div class="nutrition-actions">',
        '<button class="btn btn-primary" type="button" data-close="eva">Понятно</button>',
        '</div>'
      ].join("");
    }

    function open(initialData) {
      var root = getModal();
      clearResultRevealTimeout();
      if (typeof closeTransitionCleanup === "function") {
        closeTransitionCleanup();
        closeTransitionCleanup = null;
      }
      renderForm(initialData || { goal: "loss" });

      root.hidden = false;
      root.classList.remove("is-open");
      // Use the same already-proven bottom-sheet opening sequence as the
      // nutrition calculator: render content, reveal the shared modal root,
      // then add the shared open class after layout has seen the closed state.
      root.offsetHeight;
      root.classList.add("is-open");
      document.body.classList.add("modal-open", "calculator-modal-open");
    }

    function close() {
      var root = getModal();
      if (root.hidden) return;
      clearResultRevealTimeout();

      var sheet = root.querySelector(".nutrition-modal__sheet");

      function finishClose() {
        if (typeof closeTransitionCleanup === "function") {
          closeTransitionCleanup();
          closeTransitionCleanup = null;
        }
        root.hidden = true;
        document.body.classList.remove("modal-open", "calculator-modal-open");
      }

      if (!sheet) {
        finishClose();
        return;
      }

      root.classList.remove("is-open");

      var onTransitionEnd = function (event) {
        if (event.target !== sheet || event.propertyName !== "transform") return;
        finishClose();
      };

      closeTransitionCleanup = function () {
        sheet.removeEventListener("transitionend", onTransitionEnd);
      };

      sheet.addEventListener("transitionend", onTransitionEnd);
      setTimeout(function () {
        if (!root.classList.contains("is-open") && !root.hidden) finishClose();
      }, 260);
    }

    document.addEventListener("click", function (event) {
      if (!modalRoot || modalRoot.hidden) return;
      if (event.target && event.target.getAttribute("data-close") === "eva") {
        close();
      }
    });

    return {
      loadPlan: loadPlan,
      open: open,
      close: close,
      getDebugInfo: getDebugInfo,
      formatGoal: formatGoal
    };
  }

  globalThis.NutritionCalculator = {
    create: createNutritionCalculator,
    createEva: createEvaCalculator
  };
})();
