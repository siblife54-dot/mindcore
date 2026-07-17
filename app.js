(function () {
  "use strict";

  var APP_STATE_KEY_BASE = "course_app_state_v1";
  var STORAGE_KEY_BASE = "course_completed_lessons_v1";
  var APP_STATE_KEY = APP_STATE_KEY_BASE;
  var STORAGE_KEY = STORAGE_KEY_BASE;
  var LEGACY_STORAGE_KEY = "completedLessons";
  var DEBUG_IMG_STATUS = {};
  var DEBUG_LAST_CONTEXT = null;
  var APP_STORAGE = null;
  var APP_PROFILE = null;
  var COURSE_SETTINGS = null;
  var COURSE_ACCESS = null;
  var PRODUCT_USER = null;
  var CURRENT_COURSE = null;
  var NUTRITION = null;
  var EMOTION_STORAGE_KEY = "emotion_navigator_state";
  var DESIGNER_XP_TOAST_KEY = "designer_xp_last_gain_v1";
  var LAST_LESSONS = [];
  var COURSE_FORMS = [];
  var COURSE_FORM_ANSWERS = {};
  var COURSE_FORM_ANSWERS_LOADING = false;
  var COURSE_FORM_ANSWERS_LOADED = false;
  var COURSE_FORM_ANSWERS_ERROR = null;
  var STORAGE_DEBUG = {
    platform: "browser",
    telegramDetected: false,
    cloudAvailable: false,
    vkBridgeDetected: false,
    maxBridgeDetected: false,
    activeStorage: "local",
    migratedLegacyToState: false,
    migratedLocalToCloud: false
  };
  var WEBAPP_THEME_IDS = {
    dark_premium: "theme-dark-premium",
    light_clean: "theme-light-clean",
    fitness_power: "theme-fitness-power",
    soft_women: "theme-soft-women",
    business_black: "theme-business-black",
    wow_glass: "theme-wow-glass",
    matcha_aesthetic: "theme-matcha-aesthetic",
    emerald_gold: "theme-emerald-gold"
  };
  var WEBAPP_THEMES = Array.isArray(window.APP_THEME_PRESETS) && window.APP_THEME_PRESETS.length
    ? window.APP_THEME_PRESETS.slice()
    : Object.keys(WEBAPP_THEME_IDS).map(function (themeId) { return { id: themeId }; });
  var INTERNAL_NAVIGATION_KEY = "mindcore_internal_navigation_v1";
  var INTERNAL_NAVIGATION_TTL_MS = 10000;
  var STARTUP_MODE = "external";

  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function isPreviewMode() {
    var params = new URLSearchParams(window.location.search);
    return params.get("preview") === "1";
  }

  function getActiveCourseId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("course") || getConfig().courseId;
  }

  function getNavigationType() {
    try {
      var entries = performance && typeof performance.getEntriesByType === "function"
        ? performance.getEntriesByType("navigation")
        : [];
      return entries && entries[0] ? entries[0].type : "";
    } catch (error) {
      return "";
    }
  }

  function getNormalizedPathname(url) {
    try {
      return new URL(url, window.location.href).pathname;
    } catch (error) {
      return window.location.pathname;
    }
  }

  function readInternalNavigationMark() {
    var raw = null;
    try {
      raw = sessionStorage.getItem(INTERNAL_NAVIGATION_KEY);
      if (raw) sessionStorage.removeItem(INTERNAL_NAVIGATION_KEY);
    } catch (error) {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function detectStartupMode() {
    if (getNavigationType() === "reload") return "external";

    var mark = readInternalNavigationMark();
    if (!mark || typeof mark !== "object") return "external";

    var createdAt = Number(mark.createdAt);
    var currentCourseId = String(getActiveCourseId() || "");
    var markedCourseId = String(mark.courseId || "");
    var currentPath = getNormalizedPathname(window.location.href);
    var markedPath = String(mark.targetPath || "");
    var isValid = createdAt
      && Date.now() - createdAt <= INTERNAL_NAVIGATION_TTL_MS
      && markedCourseId === currentCourseId
      && markedPath === currentPath;

    return isValid ? "internal" : "external";
  }

  function markInternalNavigation(targetUrl) {
    try {
      var url = new URL(targetUrl, window.location.href);
      var mark = {
        courseId: String(getActiveCourseId() || ""),
        targetPath: url.pathname,
        createdAt: Date.now()
      };
      sessionStorage.setItem(INTERNAL_NAVIGATION_KEY, JSON.stringify(mark));
    } catch (error) {
      try {
        sessionStorage.removeItem(INTERNAL_NAVIGATION_KEY);
      } catch (removeError) {}
    }
  }

  function navigateInternally(targetUrl) {
    markInternalNavigation(targetUrl);
    window.location.href = targetUrl;
  }

  function getCourseScopedKey(baseKey) {
    var courseId = String(getActiveCourseId() || getConfig().courseId || "default").trim() || "default";
    return baseKey + "__" + courseId.replace(/[^a-z0-9_-]+/gi, "_");
  }

  function refreshStorageKeys() {
    APP_STATE_KEY = getCourseScopedKey(APP_STATE_KEY_BASE);
    STORAGE_KEY = getCourseScopedKey(STORAGE_KEY_BASE);
  }

  function getPreviewThemeId() {
    var params = new URLSearchParams(window.location.search);
    var raw = String(params.get("preview_theme") || "").trim();
    if (!raw) return null;
    return normalizeThemeId(raw);
  }

  function appendPreviewParams(url) {
    var currentParams = new URLSearchParams(window.location.search);
    var isPreview = currentParams.get("preview") === "1";
    var previewTheme = currentParams.get("preview_theme");

    if (!isPreview) {
      return appendTelegramHash(url);
    }

    var nextUrl = new URL(url, window.location.href);
    nextUrl.searchParams.set("preview", "1");
    if (previewTheme) {
      nextUrl.searchParams.set("preview_theme", normalizeThemeId(previewTheme));
    }
    return appendTelegramHash(nextUrl.pathname.split("/").pop() + "?" + nextUrl.searchParams.toString());
  }

  function appendTelegramHash(url) {
    var hash = window.location.hash || "";
    if (!/tgWebApp/i.test(hash)) return url;
    if (String(url || "").indexOf("#") !== -1) return url;
    return String(url || "") + hash;
  }

  function getIndexUrlWithCourse() {
    var courseId = getActiveCourseId();
    return appendPreviewParams("./index.html?course=" + encodeURIComponent(courseId));
  }

  function wireLessonBackLinks() {
    var backUrl = getIndexUrlWithCourse();
    var selectors = [
      'a[href="index.html"]',
      'a[href="./index.html"]',
      ".top-back",
      ".lesson-back",
      ".lesson-back-btn",
      '[data-back-to-dashboard]'
    ];
    document.querySelectorAll(selectors.join(", ")).forEach(function (element) {
      if (element.tagName === "A") {
        element.href = backUrl;
        return;
      }
      if (element.tagName === "BUTTON") {
        element.onclick = function () {
          navigateInternally(backUrl);
        };
      }
    });
  }

  function normalizeThemeId(themeId) {
    var value = String(themeId || "").trim();
    var existsInPresets = WEBAPP_THEMES.some(function (theme) { return theme && theme.id === value; });
    if (existsInPresets && WEBAPP_THEME_IDS[value]) return value;
    return "dark_premium";
  }

  function applyTheme(config, themeId) {
    Array.from(document.body.classList).forEach(function (className) {
      if (className.indexOf("theme-") === 0) {
        document.body.classList.remove(className);
      }
    });
    document.body.classList.add(WEBAPP_THEME_IDS[normalizeThemeId(themeId)]);

    var brand = document.getElementById("brandName");
    if (brand) brand.textContent = config.brandName || "Кабинет курса";
  }

  var previewThemeOverride = null;

  function applyThemeToWebApp(theme) {
    if (!theme) return;
    var themeId = normalizeThemeId(theme.id || theme.theme_id || theme.slug);
    applyTheme(getConfig(), themeId);
    document.body.setAttribute("data-preview-theme", themeId);
  }

  async function fetchCourseSettings(config) {
    var client = window.getSupabaseClient();
    if (!client) {
      throw new Error("Supabase client not initialized. Проверьте config.js и supabase.js");
    }

    var result = await client
      .from("course_settings")
      .select("theme_id, course_structure, addon_nutrition_calculator, addon_eva_calculator, addon_emotion_navigator, addon_designer_xp, addon_forms_enabled, addon_agreement_enabled, access_mode, access_control_enabled, access_duration_days, access_expired_title, access_expired_text, access_expired_button_text, access_expired_button_url")
      .eq("course_id", getActiveCourseId())
      .maybeSingle();

    if (result.error) {
      console.warn("Supabase course_settings load error:", result.error);
      return {
        theme_id: "dark_premium",
        addon_nutrition_calculator: false,
        addon_eva_calculator: false,
        course_structure: "classic",
        addon_emotion_navigator: false,
        addon_designer_xp: false,
        addon_forms_enabled: false,
        addon_agreement_enabled: false,
        access_mode: null,
        access_control_enabled: false,
        access_duration_days: null,
        access_expired_title: "",
        access_expired_text: "",
        access_expired_button_text: "",
        access_expired_button_url: ""
      };
    }

    return {
      theme_id: normalizeThemeId(result.data && result.data.theme_id),
      course_structure: (result.data && result.data.course_structure === "grouped") ? "grouped" : "classic",
      addon_nutrition_calculator: Boolean(result.data && result.data.addon_nutrition_calculator === true),
      addon_eva_calculator: Boolean(result.data && result.data.addon_eva_calculator === true),
      addon_emotion_navigator: Boolean(result.data && result.data.addon_emotion_navigator === true),
      addon_designer_xp: Boolean(result.data && result.data.addon_designer_xp === true),
      addon_forms_enabled: Boolean(result.data && result.data.addon_forms_enabled === true),
      addon_agreement_enabled: Boolean(result.data && result.data.addon_agreement_enabled === true),
      access_mode: result.data && result.data.access_mode
        ? String(result.data.access_mode)
        : null,
      access_control_enabled: Boolean(result.data && result.data.access_control_enabled === true),
      access_duration_days: result.data ? result.data.access_duration_days : null,
      access_expired_title: (result.data && result.data.access_expired_title) || "",
      access_expired_text: (result.data && result.data.access_expired_text) || "",
      access_expired_button_text: (result.data && result.data.access_expired_button_text) || "",
      access_expired_button_url: (result.data && result.data.access_expired_button_url) || ""
    };
  }

  async function fetchCourseAccessInfo() {
    var client = window.getSupabaseClient();
    if (!client) return { tariff: "trial", isFreeTier: true };

    var result = await client
      .from("courses")
      .select("status, account:accounts(tariff)")
      .eq("course_id", getActiveCourseId())
      .maybeSingle();

    if (result.error) {
      console.warn("Supabase course access load error:", result.error);
      return { tariff: "trial", isFreeTier: true };
    }

    var tariff = String(result.data && result.data.account && result.data.account.tariff ? result.data.account.tariff : "trial").toLowerCase();
    return {
      tariff: tariff,
      status: String(result.data && result.data.status ? result.data.status : "active").toLowerCase(),
      isFreeTier: tariff === "trial" || tariff === "free"
    };
  }

  function renderDashboardWatermark(courseAccess) {
    var host = document.getElementById("dashboardWatermarkHost");
    if (!host) return;

    if (!courseAccess || !courseAccess.isFreeTier) {
      host.innerHTML = "";
      return;
    }

    host.innerHTML = [
      '<div class="dashboard-watermark-wrap">',
      '<a class="dashboard-watermark-link" href="https://t.me/mindcore_miniapp_bot" target="_blank" rel="noopener noreferrer" aria-label="Открыть MindCore в Telegram">',
      '<span class="dashboard-watermark-icon" aria-hidden="true">⚡</span>',
      '<span>Создано в MindCore</span>',
      '</a>',
      '</div>'
    ].join("");
  }

  function isNutritionCalculatorEnabled(courseSettings) {
    return Boolean(courseSettings && courseSettings.addon_nutrition_calculator === true);
  }

  function isEvaCalculatorEnabled(courseSettings) {
    return Boolean(courseSettings && courseSettings.addon_eva_calculator === true);
  }



  function isEmotionNavigatorEnabled(courseSettings) {
    return Boolean(courseSettings && courseSettings.addon_emotion_navigator === true);
  }

  function isDesignerXpEnabled(courseSettings) {
    return Boolean(courseSettings && courseSettings.addon_designer_xp === true);
  }

  function isFormsEnabled(courseSettings) {
    return Boolean(courseSettings && courseSettings.addon_forms_enabled === true);
  }

  function getDesignerLevelByXp(xp) {
    var levels = [
      { minXp: 0, level: 1, title: "Start" },
      { minXp: 50, level: 2, title: "Junior" },
      { minXp: 150, level: 3, title: "Visual" },
      { minXp: 300, level: 4, title: "Product" },
      { minXp: 500, level: 5, title: "Portfolio Ready" }
    ];
    var current = levels[0];
    levels.forEach(function (item) {
      if (xp >= item.minXp) current = item;
    });
    return { current: current, levels: levels };
  }

  function getEmotionNavigatorConfig() {
    return {
      anxiety: { title: "Тревога", description: "Ваше тело может находиться в режиме ожидания угрозы, даже если реальной опасности сейчас нет.", recommendation: "Сделайте медленный выдох длиннее вдоха в течение 1 минуты.", practice: "Практика “5-4-3-2-1”", lesson: "Как успокоить тело при тревоге" },
      fear: { title: "Страх", description: "Страх часто появляется, когда психика пытается защитить вас от неизвестности.", recommendation: "Попробуйте назвать вслух то, чего вы боитесь.", practice: "Техника “Рациональный вопрос”", lesson: "Как работать со страхом" },
      anger: { title: "Злость", description: "Злость — это сигнал о нарушенных границах или внутреннем напряжении.", recommendation: "Попробуйте выписать мысли без цензуры 2 минуты.", practice: "Разгрузка через письмо", lesson: "Экологичное проживание злости" },
      guilt: { title: "Вина", description: "Чувство вины часто заставляет нас требовать от себя невозможного.", recommendation: "Спросите себя: “Точно ли я обязан быть идеальным?”", practice: "Практика самоподдержки", lesson: "Как перестать жить через вину" },
      fatigue: { title: "Усталость", description: "Иногда психика устает раньше тела.", recommendation: "Сделайте паузу без телефона хотя бы на 10 минут.", practice: "Практика восстановления внимания", lesson: "Как восстановить внутренний ресурс" },
      apathy: { title: "Апатия", description: "Апатия может быть способом психики защититься от перегрузки.", recommendation: "Попробуйте сделать одно очень маленькое действие прямо сейчас.", practice: "Метод “микрошагов”", lesson: "Как выйти из состояния апатии" }
    };
  }

  function renderEmotionNavigator() {
    var section = document.getElementById("emotionNavigatorSection");
    var host = document.getElementById("emotionNavigatorHost");
    if (!isEmotionNavigatorEnabled(COURSE_SETTINGS)) {
      if (section) section.hidden = true;
      if (host) host.innerHTML = "";
      return;
    }
    if (!section || !host) return;
    section.hidden = false;

    var config = getEmotionNavigatorConfig();
    var order = ["anxiety", "fear", "anger", "guilt", "fatigue", "apathy"];
    var savedState = localStorage.getItem(EMOTION_STORAGE_KEY);
    var selected = config[savedState] ? savedState : "";

    host.innerHTML = [
      '<section class="card emotion-card">',
      '<h3 class="emotion-title">Как вы себя чувствуете сегодня?</h3>',
      '<p class="emotion-subtitle">Выберите состояние — и получите короткую рекомендацию.</p>',
      '<div class="emotion-grid" id="emotionGrid"></div>',
      '<div class="emotion-result" id="emotionResult"></div>',
      '</section>'
    ].join("");

    var grid = document.getElementById("emotionGrid");
    var result = document.getElementById("emotionResult");

    function showDemoToast() {
      var toast = document.createElement("div");
      toast.className = "emotion-toast";
      toast.textContent = "В полной версии здесь откроется рекомендованный урок.";
      host.appendChild(toast);
      requestAnimationFrame(function () { toast.classList.add("is-visible"); });
      setTimeout(function () {
        toast.classList.remove("is-visible");
        setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
      }, 2200);
    }

    function renderResult(stateKey) {
      var state = config[stateKey];
      if (!state) { result.innerHTML = ""; return; }
      result.innerHTML = [
        '<section class="emotion-result-card">',
        '<h4>' + escapeHtml(state.title) + '</h4>',
        '<p><strong>Описание:</strong> ' + escapeHtml(state.description) + '</p>',
        '<p><strong>Рекомендация:</strong> ' + escapeHtml(state.recommendation) + '</p>',
        '<p><strong>Упражнение:</strong> ' + escapeHtml(state.practice) + '</p>',
        '<p><strong>Урок:</strong> ' + escapeHtml(state.lesson) + '</p>',
        '<div class="emotion-actions">',
        '<button type="button" class="btn btn-primary" id="emotionOpenLessonBtn">Открыть подходящий урок</button>',
        '<button type="button" class="btn" id="emotionResetBtn">Выбрать другое состояние</button>',
        '</div>',
        '</section>'
      ].join("");
      var openBtn = document.getElementById("emotionOpenLessonBtn");
      if (openBtn) openBtn.addEventListener("click", showDemoToast);
      var resetBtn = document.getElementById("emotionResetBtn");
      if (resetBtn) resetBtn.addEventListener("click", function () {
        selected = "";
        localStorage.removeItem(EMOTION_STORAGE_KEY);
        updateUI();
      });
    }

    function updateUI() {
      grid.innerHTML = order.map(function (key) {
        var state = config[key];
        var activeClass = selected === key ? " is-active" : "";
        return '<button type="button" class="emotion-chip' + activeClass + '" data-emotion="' + key + '">' + escapeHtml(state.title) + '</button>';
      }).join("");
      grid.querySelectorAll(".emotion-chip").forEach(function (button) {
        button.addEventListener("click", function () {
          selected = button.getAttribute("data-emotion") || "";
          if (selected) localStorage.setItem(EMOTION_STORAGE_KEY, selected);
          updateUI();
        });
      });
      renderResult(selected);
    }

    updateUI();
  }

  function initTelegramViewport() {
    var tg = globalThis.Telegram && globalThis.Telegram.WebApp;
    if (!tg) return;

    if (typeof tg.ready === "function") tg.ready();
    if (typeof tg.expand === "function") tg.expand();
  }

  function getUserName(profile) {
    if (!profile) return "Студент";
    return profile.fullName || profile.firstName || profile.username || "Студент";
  }

  function getInitials(name) {
    var clean = (name || "Студент").trim();
    var words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) return "СТ";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function parseCompletedRaw(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  async function loadAppState() {
    if (APP_STORAGE && typeof APP_STORAGE.loadAppState === "function") {
      return APP_STORAGE.loadAppState();
    }

    var raw = APP_STORAGE ? await APP_STORAGE.getItem(APP_STATE_KEY) : null;
    var platform = globalThis.CourseAppPlatform || {};
    if (platform.normalizeAppState) {
      try {
        return platform.normalizeAppState(raw ? JSON.parse(raw) : null);
      } catch (error) {
        return platform.normalizeAppState(null);
      }
    }

    return { completedLessons: [], kbju: {}, calculatorInputs: {}, lastOpenedLesson: null, updatedAt: "" };
  }

  async function saveAppState(state) {
    if (APP_STORAGE && typeof APP_STORAGE.saveAppState === "function") {
      return APP_STORAGE.saveAppState(state);
    }

    var next = Object.assign({ completedLessons: [], kbju: {}, calculatorInputs: {}, lastOpenedLesson: null }, state || {});
    next.updatedAt = next.updatedAt || new Date().toISOString();
    await APP_STORAGE.setItem(APP_STATE_KEY, JSON.stringify(next));
    return next;
  }

  async function updateAppState(partialState) {
    if (APP_STORAGE && typeof APP_STORAGE.updateAppState === "function") {
      return APP_STORAGE.updateAppState(partialState);
    }

    var current = await loadAppState();
    return saveAppState(Object.assign({}, current, partialState || {}, { updatedAt: new Date().toISOString() }));
  }

  async function loadCompleted() {
    var state = await loadAppState();
    if (Array.isArray(state.completedLessons) && state.completedLessons.length) return state.completedLessons;

    var rawPrimary = await APP_STORAGE.getItem(STORAGE_KEY);
    var primary = parseCompletedRaw(rawPrimary);
    if (primary.length) return primary;

    var rawLegacy = await APP_STORAGE.getItem(LEGACY_STORAGE_KEY);
    return parseCompletedRaw(rawLegacy);
  }

  async function saveCompleted(ids) {
    var clean = Array.from(new Set(ids.filter(Boolean)));
    await updateAppState({ completedLessons: clean });
  }

  async function markCompleted(id) {
    var completed = await loadCompleted();
    if (!completed.includes(id)) {
      completed.push(id);
      await saveCompleted(completed);
    }
  }

  async function initStorage() {
    var platform = globalThis.CourseAppPlatform || {};
    var detectTelegramWebApp = platform.detectTelegramWebApp || function () { return false; };
    var detectPlatform = platform.detectPlatform || function () { return "browser"; };
    var getAppStorage = platform.getAppStorage;

    STORAGE_DEBUG.platform = detectPlatform();
    STORAGE_DEBUG.telegramDetected = Boolean(detectTelegramWebApp());
    STORAGE_DEBUG.cloudAvailable = Boolean(globalThis.Telegram && globalThis.Telegram.WebApp && globalThis.Telegram.WebApp.CloudStorage);
    STORAGE_DEBUG.vkBridgeDetected = Boolean(globalThis.vkBridge || globalThis.VKBridge);
    STORAGE_DEBUG.maxBridgeDetected = Boolean(globalThis.WebApp);

    if (typeof getAppStorage !== "function") {
      APP_STORAGE = {
        type: "local",
        cloudFailed: false,
        appStateKey: APP_STATE_KEY,
        getItem: function (key) { try { return Promise.resolve(localStorage.getItem(key)); } catch (e) { return Promise.resolve(null); } },
        setItem: function (key, value) { try { localStorage.setItem(key, value); } catch (e) { console.warn("localStorage set failed:", e); } return Promise.resolve(); },
        removeItem: function (key) { try { localStorage.removeItem(key); } catch (e) { console.warn("localStorage remove failed:", e); } return Promise.resolve(); },
        loadAppState: async function () {
          try { return JSON.parse(localStorage.getItem(APP_STATE_KEY)) || { completedLessons: [], kbju: {}, calculatorInputs: {}, lastOpenedLesson: null, updatedAt: "" }; }
          catch (e) { return { completedLessons: [], kbju: {}, calculatorInputs: {}, lastOpenedLesson: null, updatedAt: "" }; }
        },
        saveAppState: async function (state) { await this.setItem(APP_STATE_KEY, JSON.stringify(state)); return state; },
        updateAppState: async function (partialState) { var current = await this.loadAppState(); var next = Object.assign({}, current, partialState || {}, { updatedAt: new Date().toISOString() }); await this.saveAppState(next); return next; }
      };
      STORAGE_DEBUG.activeStorage = "local";
    } else {
      APP_STORAGE = await getAppStorage({ appStateKey: APP_STATE_KEY, storageKey: STORAGE_KEY });
      STORAGE_DEBUG.activeStorage = APP_STORAGE.type || "local";
    }

    await migrateLegacyState();
    STORAGE_DEBUG.activeStorage = APP_STORAGE.type || STORAGE_DEBUG.activeStorage;
  }

  async function migrateLegacyState() {
    var state = await loadAppState();
    var changed = false;

    if (!state.completedLessons.length && APP_STATE_KEY !== APP_STATE_KEY_BASE) {
      var rawGlobalState = null;
      try { rawGlobalState = localStorage.getItem(APP_STATE_KEY_BASE); } catch (e) { rawGlobalState = null; }
      var globalState = null;
      if (rawGlobalState && globalThis.CourseAppPlatform && globalThis.CourseAppPlatform.normalizeAppState) {
        try { globalState = globalThis.CourseAppPlatform.normalizeAppState(JSON.parse(rawGlobalState)); }
        catch (e) { globalState = null; }
      }
      if (globalState && Array.isArray(globalState.completedLessons) && globalState.completedLessons.length) {
        state.completedLessons = globalState.completedLessons;
        if (globalState.kbju && Object.keys(globalState.kbju).length) state.kbju = globalState.kbju;
        if (globalState.calculatorInputs && Object.keys(globalState.calculatorInputs).length) state.calculatorInputs = globalState.calculatorInputs;
        changed = true;
      }
    }

    if (!state.completedLessons.length) {
      var rawPrimary = await APP_STORAGE.getItem(STORAGE_KEY);
      var rawLegacy = await APP_STORAGE.getItem(LEGACY_STORAGE_KEY);
      var completed = parseCompletedRaw(rawPrimary);
      if (!completed.length) completed = parseCompletedRaw(rawLegacy);
      if (!completed.length) {
        try { completed = parseCompletedRaw(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)); }
        catch (e) { completed = []; }
      }
      if (completed.length) {
        state.completedLessons = completed;
        changed = true;
      }
    }

    if (!state.kbju || !Object.keys(state.kbju).length) {
      var rawNutrition = await APP_STORAGE.getItem("nutrition_calculator_v1");
      if (!rawNutrition) {
        try { rawNutrition = localStorage.getItem("nutrition_calculator_v1"); } catch (e) { rawNutrition = null; }
      }
      if (rawNutrition) {
        try {
          var plan = JSON.parse(rawNutrition);
          if (plan && typeof plan === "object") {
            state.kbju = plan;
            state.calculatorInputs = {
              age: plan.age, height: plan.height, weight: plan.weight, sex: plan.sex, activity: plan.activity, goal: plan.goal
            };
            changed = true;
          }
        } catch (e) {
          // ignore malformed legacy nutrition payload
        }
      }
    }

    if (changed) {
      state.updatedAt = new Date().toISOString();
      await saveAppState(state);
      STORAGE_DEBUG.migratedLegacyToState = true;
      if (STORAGE_DEBUG.activeStorage !== "local") STORAGE_DEBUG.migratedLocalToCloud = true;
    }
  }

  async function getProfile() {
    var platform = globalThis.CourseAppPlatform || {};
    if (typeof platform.getUserProfile === "function") {
      var profile = await platform.getUserProfile();
      if (profile && (profile.firstName || profile.lastName || profile.username || profile.photoUrl || profile.userId)) {
        var fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
        return Object.assign({}, profile, {
          id: profile.userId,
          fullName: fullName,
          avatarUrl: profile.photoUrl || "",
          hasAvatar: Boolean(profile.photoUrl),
          isTelegram: profile.platform === "telegram"
        });
      }
    }

    return {
      platform: (platform.detectPlatform && platform.detectPlatform()) || "browser",
      userId: null,
      id: null,
      firstName: "Студент",
      lastName: "",
      fullName: "Студент",
      username: "",
      photoUrl: "",
      avatarUrl: "",
      hasAvatar: false,
      isTelegram: false
    };
  }

  function safeLocalStorageGet(key) {
    try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch (error) { return null; }
  }

  function safeLocalStorageSet(key, value) {
    try { if (window.localStorage) window.localStorage.setItem(key, value); } catch (error) { console.warn("localStorage set failed:", error); }
  }

  function getStableGuestId() {
    var key = "mindcore_guest_id";
    var existing = safeLocalStorageGet(key);
    if (existing) return existing;

    var randomPart = "";
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        randomPart = window.crypto.randomUUID();
      }
    } catch (error) {
      randomPart = "";
    }
    if (!randomPart) {
      randomPart = String(Date.now()) + "_" + Math.random().toString(36).slice(2, 12);
    }

    var guestId = "guest_" + randomPart;
    safeLocalStorageSet(key, guestId);
    return guestId;
  }

  function getDisplayNameFromProfile(profile) {
    profile = profile || {};
    var fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
    return fullName || profile.fullName || profile.username || "Студент";
  }

  function addDays(date, days) {
    var next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function getAccessDurationDays(courseSettings) {
    var rawDays = courseSettings && courseSettings.access_duration_days;
    var days = Number(rawDays);
    if (!Number.isFinite(days) || days <= 0) {
      console.warn("[MindCore] Invalid access_duration_days, fallback to 120 days:", rawDays);
      return 120;
    }
    return Math.floor(days);
  }

  function resolveCourseTitle(course) {
    course = course || {};
    return course.title || course.course_title || course.name || getConfig().brandName || "";
  }

  function resolveExpertName(course) {
    course = course || {};
    return course.expert_name || course.expertName || course.author_name || course.author || course.teacher_name || course.instructor_name || "";
  }

  async function fetchCurrentCourseInfo() {
    var client = window.getSupabaseClient();
    var courseId = getActiveCourseId();
    if (!client || !courseId) return null;

    var result = await client
      .from("courses")
      .select("*")
      .eq("course_id", courseId)
      .maybeSingle();

    if (result.error) {
      console.warn("Supabase current course load error:", result.error);
      return null;
    }

    return result.data || null;
  }

  async function ensureWebAppUser() {
    var client = window.getSupabaseClient();
    if (!client) return null;

    try {
      var profile = APP_PROFILE || await getProfile();
      var platformApi = globalThis.CourseAppPlatform || {};
      var platform = profile.platform || (platformApi.detectPlatform && platformApi.detectPlatform()) || "browser";
      var rawUserId = profile.userId != null ? profile.userId : profile.id;
      var platformUserId = rawUserId != null && String(rawUserId).trim() ? String(rawUserId).trim() : getStableGuestId();
      var displayName = getDisplayNameFromProfile(profile);
      var now = new Date().toISOString();
      var payload = {
        platform: platform,
        platform_user_id: platformUserId,
        telegram_id: platform === "telegram" ? platformUserId : null,
        vk_id: platform === "vk" ? platformUserId : null,
        max_id: platform === "max" ? platformUserId : null,
        first_name: profile.firstName || "",
        last_name: profile.lastName || "",
        username: profile.username || "",
        display_name: displayName,
        avatar_url: profile.avatarUrl || profile.photoUrl || "",
        last_seen_at: now,
        metadata: {
          source: "mindcore_webapp",
          storage: STORAGE_DEBUG,
          course_id: getActiveCourseId(),
          has_platform_user: Boolean(rawUserId != null && String(rawUserId).trim())
        }
      };

      var result = await client
        .from("webapp_users")
        .upsert(payload, { onConflict: "platform,platform_user_id" })
        .select("*")
        .single();

      if (result.error) {
        console.warn("Supabase webapp_users save error:", result.error);
        return null;
      }

      console.log("[MindCore] WebApp user saved", result.data);
      return result.data || null;
    } catch (error) {
      console.warn("Supabase webapp_users save error:", error);
      return null;
    }
  }

  async function ensureProductUser(webappUser) {
    var client = window.getSupabaseClient();
    var courseId = getActiveCourseId();
    if (!client || !webappUser || !webappUser.id || !courseId) return null;

    try {
      var course = CURRENT_COURSE || await fetchCurrentCourseInfo() || {};
      if (!CURRENT_COURSE && course && Object.keys(course).length) CURRENT_COURSE = course;

      var nowDate = new Date();
      var now = nowDate.toISOString();
      var displayName = webappUser.display_name || getDisplayNameFromProfile(APP_PROFILE);
      var basePayload = {
        course_id: courseId,
        webapp_user_id: webappUser.id,
        expert_name: resolveExpertName(course),
        course_title: resolveCourseTitle(course),
        user_display_name: displayName,
        status: "active",
        last_seen_at: now,
        metadata: {
          source: "mindcore_webapp",
          platform: webappUser.platform || (APP_PROFILE && APP_PROFILE.platform) || "browser",
          platform_user_id: webappUser.platform_user_id || "",
          course_found: Boolean(course && Object.keys(course).length),
          storage: STORAGE_DEBUG
        }
      };

      var existingResult = await client
        .from("product_users")
        .select("*")
        .eq("course_id", courseId)
        .eq("webapp_user_id", webappUser.id)
        .maybeSingle();

      if (existingResult.error) {
        console.warn("Supabase product_users lookup error:", existingResult.error);
        return null;
      }

      var saveResult;
      if (existingResult.data) {
        saveResult = await client
          .from("product_users")
          .update({
            last_seen_at: now,
            user_display_name: basePayload.user_display_name,
            expert_name: basePayload.expert_name,
            course_title: basePayload.course_title,
            metadata: basePayload.metadata
          })
          .eq("id", existingResult.data.id)
          .select("*")
          .single();
      } else {
        var accessControlEnabled = Boolean(COURSE_SETTINGS && COURSE_SETTINGS.access_control_enabled === true);
        var accessExpiresAt = null;
        if (accessControlEnabled) {
          accessExpiresAt = addDays(nowDate, getAccessDurationDays(COURSE_SETTINGS)).toISOString();
        }

        saveResult = await client
          .from("product_users")
          .insert(Object.assign({}, basePayload, {
            access_started_at: now,
            access_expires_at: accessExpiresAt,
            created_at: now,
            updated_at: now
          }))
          .select("*")
          .single();
      }

      if (saveResult.error) {
        console.warn("Supabase product_users save error:", saveResult.error);
        return null;
      }

      PRODUCT_USER = saveResult.data || null;
      console.log("[MindCore] Product user saved", saveResult.data);
      console.log("[MindCore] Access started:", PRODUCT_USER && PRODUCT_USER.access_started_at);
      console.log("[MindCore] Access expires:", PRODUCT_USER && PRODUCT_USER.access_expires_at);
      console.log("[MindCore] Access status:", PRODUCT_USER && PRODUCT_USER.status);
      return PRODUCT_USER;
    } catch (error) {
      console.warn("Supabase product_users save error:", error);
      return null;
    }
  }


  function isAgreementEnabled() {
    return Boolean(COURSE_SETTINGS && COURSE_SETTINGS.addon_agreement_enabled === true);
  }

  async function fetchCourseAgreement() {
    var client = window.getSupabaseClient();
    if (!client) throw new Error("Не удалось загрузить соглашение");

    var result = await client
      .from("course_agreements")
      .select("course_id, title, agreement_text, checkbox_text, button_text, collect_data_enabled, fields_config, version, created_at, updated_at")
      .eq("course_id", getActiveCourseId())
      .maybeSingle();

    if (result.error || !result.data) {
      console.warn("Supabase course_agreements load error:", result.error || "Agreement not found");
      throw new Error("Не удалось загрузить соглашение");
    }

    return result.data;
  }

  function isAgreementAccepted(productUser, agreement) {
    if (!productUser || !agreement) return false;
    return Boolean(productUser.agreement_accepted === true && String(productUser.agreement_accepted_version || "") === String(agreement.version || ""));
  }

  async function saveAgreementAcceptance(agreement, formData) {
    var client = window.getSupabaseClient();
    if (!client || !PRODUCT_USER || !PRODUCT_USER.id) throw new Error("Не удалось сохранить данные. Попробуйте ещё раз.");

    var payload = {
      agreement_accepted: true,
      agreement_accepted_at: new Date().toISOString(),
      agreement_accepted_version: agreement.version,
      agreement_text_snapshot: agreement.agreement_text || ""
    };

    if (agreement.collect_data_enabled === true) {
      payload.contact_first_name = formData.contact_first_name || "";
      payload.contact_last_name = formData.contact_last_name || "";
      payload.contact_phone = formData.contact_phone || "";
      payload.contact_email = formData.contact_email || "";
    }

    var result = await client
      .from("product_users")
      .update(payload)
      .eq("id", PRODUCT_USER.id)
      .eq("course_id", getActiveCourseId())
      .select("*")
      .single();

    if (result.error || !result.data) {
      console.warn("Supabase agreement save error:", result.error || "Product user not updated");
      throw new Error("Не удалось сохранить данные. Попробуйте ещё раз.");
    }

    PRODUCT_USER = result.data;
    return PRODUCT_USER;
  }

  async function ensureAgreementAcceptedBeforeCourse(onAccepted) {
    if (!isAgreementEnabled()) return false;
    if (!PRODUCT_USER || !PRODUCT_USER.id) throw new Error("Не удалось загрузить соглашение");

    var agreement = await fetchCourseAgreement();
    if (isAgreementAccepted(PRODUCT_USER, agreement)) return false;

    if (window.StartupScreen && typeof window.StartupScreen.hide === "function") window.StartupScreen.hide();
    if (!window.AgreementScreen || typeof window.AgreementScreen.show !== "function") throw new Error("Не удалось загрузить соглашение");

    window.AgreementScreen.show({
      agreement: agreement,
      productUser: PRODUCT_USER,
      onSubmit: async function (formData) {
        await saveAgreementAcceptance(agreement, formData);
        if (typeof onAccepted === "function") await onAccepted();
      }
    });
    return true;
  }

  function showAgreementLoadError(retryHandler) {
    if (window.StartupScreen && typeof window.StartupScreen.hide === "function") window.StartupScreen.hide();
    if (window.AgreementScreen && typeof window.AgreementScreen.showError === "function") {
      window.AgreementScreen.showError("Не удалось загрузить соглашение", retryHandler);
      return;
    }

    if (document.body.getAttribute("data-page") === "dashboard") {
      showDashboardError("Не удалось загрузить соглашение");
    } else {
      var stateBox = document.getElementById("lessonState");
      if (stateBox) {
        stateBox.classList.remove("skeleton");
        stateBox.hidden = false;
        stateBox.textContent = "Не удалось загрузить соглашение";
      }
    }
  }

  async function saveWebAppAccess() {
    try {
      var webappUser = await ensureWebAppUser();
      if (webappUser) PRODUCT_USER = await ensureProductUser(webappUser);
      return PRODUCT_USER;
    } catch (error) {
      console.warn("Supabase webapp access save error:", error);
      return null;
    }
  }

  function normalizeLesson(raw) {
      var isLocked = raw.is_locked === true || String(raw.is_locked || "").trim() === "1";

    return {
      id: raw.id,
      course_id: raw.course_id,
      lesson_id: raw.lesson_id,
      day_number: Number(raw.day_number || 0),
      lesson_label: raw.lesson_label || "",
      group_title: raw.group_title || "",
      is_locked: isLocked,
      title: raw.title || "Без названия",
      subtitle: raw.subtitle || "",
      preview_image_url: raw.preview_image_url || "",
      preview_image_: raw.preview_image_ || "",
      video_url: raw.video_url || "",
      content_html: raw.content_html || "",
      content_text: raw.content_text || "",
      attachments: raw.attachments || ""
    };
  }

  function getLessonGroupHeaderParts(groupTitle, groupIndex) {
    var title = String(groupTitle || "").trim();
    var fallbackIndex = Number(groupIndex || 0) || 1;
    var kind = /модул/i.test(title) ? "МОДУЛЬ" : "НЕДЕЛЯ";
    var index = fallbackIndex;
    var normalizedTitle = title;
    var match = title.match(/^(недел(?:я|и|ю|е)|модул(?:ь|я|ю|е))\s*(\d+)\s*(?:[-–—:|.]\s*)?(.*)$/i);

    if (match) {
      kind = /модул/i.test(match[1]) ? "МОДУЛЬ" : "НЕДЕЛЯ";
      index = Number(match[2]) || fallbackIndex;
      if (String(match[3] || "").trim()) {
        normalizedTitle = String(match[3] || "").trim();
      }
    }

    return {
      chip: kind + " " + index,
      title: normalizedTitle
    };
  }

  function getLessonDisplayLabel(lesson) {
    if (!lesson) return "Урок";

    var customLabel = String(lesson.lesson_label || "").trim();
    if (customLabel) return customLabel;

    if (lesson.day_number) {
      return "День " + lesson.day_number;
    }

    return "Урок";
  }

   async function fetchLessons(config) {
    var client = window.getSupabaseClient();

    if (!client) {
      throw new Error("Supabase client not initialized. Проверьте config.js и supabase.js");
    }

    var result = await client
      .from("lessons")
      .select("*")
      .eq("course_id", getActiveCourseId())
      .order("day_number", { ascending: true });

    if (result.error) {
      console.error("Supabase load error:", result.error);
      throw new Error("Ошибка загрузки данных из Supabase");
    }

    return (result.data || []).map(normalizeLesson);
  }

    async function fetchLessonBlocks(lessonId) {
    var client = window.getSupabaseClient();

    if (!client) {
      throw new Error("Supabase client not initialized");
    }

    var result = await client
      .from("lesson_blocks")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error("Supabase blocks load error:", result.error);
      throw new Error("Ошибка загрузки блоков урока");
    }

    return result.data || [];
  }

  async function fetchLessonBlockGroups(lessonId) {
    var client = window.getSupabaseClient();

    if (!client) {
      throw new Error("Supabase client not initialized");
    }

    var result = await client
      .from("lesson_block_groups")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.warn("Supabase lesson block groups load error:", result.error);
      throw new Error("Ошибка загрузки групп материалов урока");
    }

    return result.data || [];
  }

  async function fetchBlockItems(blockId) {
    var client = window.getSupabaseClient();

    if (!client) {
      throw new Error("Supabase client not initialized");
    }

    var result = await client
      .from("lesson_block_items")
      .select("*")
      .eq("block_id", blockId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error("Supabase block items load error:", result.error);
      throw new Error("Ошибка загрузки элементов блока");
    }

    return result.data || [];
  }

  function getMaxCompletedDayNumber(lessons, completed) {
    var maxDay = 0;
    lessons.forEach(function (lesson) {
      if (completed.includes(lesson.lesson_id) && lesson.day_number > maxDay) {
        maxDay = lesson.day_number;
      }
    });
    return maxDay;
  }

  function getAccessibilityModel(lessons, completed) {
    if (isPreviewMode()) {
      var map = {};
      lessons.forEach(function (lesson) {
        map[lesson.lesson_id] = true;
      });

      return {
        maxCompletedDayNumber: lessons.length,
        threshold: lessons.length,
        map: map
      };
    }

    var maxCompletedDayNumber = getMaxCompletedDayNumber(lessons, completed);
    var threshold = maxCompletedDayNumber + 1;
    var map = {};

    lessons.forEach(function (lesson) {
      var isSequentiallyOpen = lesson.day_number <= threshold;
      var isLockedBySheet = lesson.is_locked === true;
      map[lesson.lesson_id] = isLockedBySheet ? false : isSequentiallyOpen;
    });

    return {
      maxCompletedDayNumber: maxCompletedDayNumber,
      threshold: threshold,
      map: map
    };
  }

  function isDebugMode() {
    var params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1";
  }

  function extractGoogleDriveFileId(url) {
    var value = String(url || "").trim();
    if (!value) return null;

    var byFilePath = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (byFilePath && byFilePath[1]) return byFilePath[1];

    var byGoogleusercontent = value.match(/googleusercontent\.com\/.*?\/d\/([^/]+)/i);
    if (byGoogleusercontent && byGoogleusercontent[1]) return byGoogleusercontent[1];

    try {
      var parsed = new URL(value);
      var idFromParam = parsed.searchParams.get("id");
      if (idFromParam) return idFromParam;
    } catch (e) {
      return null;
    }

    return null;
  }

  function normalizePreviewImageUrl(url) {
    var value = String(url || "").trim();
    if (!value) return "";

    var driveId = extractGoogleDriveFileId(value);
    if (driveId) {
      return "https://drive.google.com/thumbnail?id=" + driveId + "&sz=w1200";
    }

    return value;
  }

  function getPreviewSrc(lesson) {
    var raw = String(lesson.preview_image_url || lesson.preview_image_ || "").trim();
    if (!raw) return "";
    return normalizePreviewImageUrl(raw);
  }

  async function renderDebugPanel(config, lessons, completed, model) {
    if (!isDebugMode()) return;

    DEBUG_LAST_CONTEXT = {
      config: config,
      lessons: lessons,
      completed: completed,
      model: model
    };

    var existing = document.getElementById("debugPanel");
    if (existing) existing.remove();

    var panel = document.createElement("aside");
    panel.id = "debugPanel";
    panel.className = "debug-panel";

    var rawAppState = await APP_STORAGE.getItem(APP_STATE_KEY);
    var rawStorage = await APP_STORAGE.getItem(STORAGE_KEY);
    var rawLegacy = await APP_STORAGE.getItem(LEGACY_STORAGE_KEY);

    var lines = [
      "DEBUG MODE",
      "courseId: " + (getActiveCourseId() || "(пусто)"),
      "appStateKey: " + APP_STATE_KEY,
      "progressKey: " + STORAGE_KEY,
      "telegram hash present: " + (/tgWebApp/i.test(window.location.hash || "") ? "yes" : "no"),
      "total lessons loaded: " + lessons.length,
      "storage." + APP_STATE_KEY + ": " + String(rawAppState),
      "storage." + STORAGE_KEY + ": " + String(rawStorage),
      "storage." + LEGACY_STORAGE_KEY + " raw value: " + String(rawLegacy),
      "parsed completedLessons array: " + JSON.stringify(completed),
      "maxCompletedDayNumber: " + model.maxCompletedDayNumber,
      "unlockThreshold: " + model.threshold,
      "Platform: " + STORAGE_DEBUG.platform,
      "Telegram WebApp detected: " + (STORAGE_DEBUG.telegramDetected ? "yes" : "no"),
      "CloudStorage available: " + (STORAGE_DEBUG.cloudAvailable ? "yes" : "no"),
      "MAX WebApp detected: " + (STORAGE_DEBUG.maxBridgeDetected ? "yes" : "no"),
      "VK Bridge detected: " + (STORAGE_DEBUG.vkBridgeDetected ? "yes" : "no"),
      "Active storage: " + STORAGE_DEBUG.activeStorage,
      "User platform: " + String(APP_PROFILE && APP_PROFILE.platform),
      "User id: " + String(APP_PROFILE && APP_PROFILE.id),
      "first_name: " + String(APP_PROFILE && APP_PROFILE.firstName),
      "last_name: " + String(APP_PROFILE && APP_PROFILE.lastName),
      "username: " + String(APP_PROFILE && APP_PROFILE.username),
      "avatar available: " + ((APP_PROFILE && APP_PROFILE.hasAvatar) ? "yes" : "no"),
      "migrated legacy -> appState: " + (STORAGE_DEBUG.migratedLegacyToState ? "yes" : "no"),
      "migrated local -> remote storage: " + (STORAGE_DEBUG.migratedLocalToCloud ? "yes" : "no"),
      ""
    ];

    if (NUTRITION) {
      var nutritionDebug = NUTRITION.getDebugInfo();
      lines.push("calculator data exists: " + (nutritionDebug.exists ? "yes" : "no"));
      lines.push("calculator storage used: " + (nutritionDebug.storageUsed || "unknown"));
      lines.push("calculator updatedAt: " + (nutritionDebug.updatedAt || "-"));
      lines.push("calculator values loaded successfully: " + (nutritionDebug.loadedSuccessfully ? "yes" : "no"));
      lines.push("");
    }

    lessons.forEach(function (lesson) {
      var normalizedPreview = getPreviewSrc(lesson);
      var imgStatus = DEBUG_IMG_STATUS[lesson.lesson_id] || "PENDING";

      lines.push(
        [
          "lesson_id=" + lesson.lesson_id,
          "day_number=" + lesson.day_number,
          "accessible=" + Boolean(model.map[lesson.lesson_id])
        ].join(" | ")
      );
      lines.push("preview_image_url(raw): " + String(lesson.preview_image_url || ""));
      lines.push("preview_image_(raw): " + String(lesson.preview_image_ || ""));
      lines.push("preview_image(normalized): " + String(normalizedPreview));
      lines.push("video_url(raw): " + String(lesson.video_url || ""));
      lines.push("img: " + imgStatus);
      lines.push("");
    });

    panel.textContent = lines.join("\n");
    document.body.appendChild(panel);
  }

  async function refreshDebugPanel() {
    if (!DEBUG_LAST_CONTEXT || !isDebugMode()) return;
    await renderDebugPanel(
      DEBUG_LAST_CONTEXT.config,
      DEBUG_LAST_CONTEXT.lessons,
      DEBUG_LAST_CONTEXT.completed,
      DEBUG_LAST_CONTEXT.model
    );
  }



  function renderDesignerXpToast(host) {
    var raw = localStorage.getItem(DESIGNER_XP_TOAST_KEY);
    if (!raw || !host) return;
    localStorage.removeItem(DESIGNER_XP_TOAST_KEY);
    var toast = document.createElement("div");
    toast.className = "designer-xp-toast";
    toast.innerHTML = '<strong>+50 XP</strong><span>Вы стали ближе к следующему уровню.</span>';
    host.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add("is-visible"); });
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 260);
    }, 2200);
  }

  async function renderDesignerXpCard(lessons) {
    var section = document.getElementById("designerXpSection");
    var host = document.getElementById("designerXpHost");
    if (!isDesignerXpEnabled(COURSE_SETTINGS)) {
      if (section) section.hidden = true;
      if (host) host.innerHTML = "";
      return;
    }
    if (!section || !host) return;
    section.hidden = false;

    var completed = await loadCompleted();
    var completedCount = lessons.filter(function (lesson) { return completed.includes(lesson.lesson_id); }).length;
    var xp = completedCount * 50;
    var model = getDesignerLevelByXp(xp);
    var current = model.current;
    var next = model.levels.find(function (item) { return item.minXp > current.minXp; }) || null;
    var maxXp = model.levels[model.levels.length - 1].minXp;
    var baseXp = current.minXp;
    var targetXp = next ? next.minXp : maxXp;
    var progress = next ? Math.max(0, Math.min(100, Math.round(((xp - baseXp) / (targetXp - baseXp)) * 100))) : 100;
    var xpText = next ? (xp + " / " + next.minXp + " XP до следующего уровня") : (xp + " XP · Максимальный уровень достигнут");

    host.innerHTML = [
      '<section class="card designer-xp-card">',
      '<div class="designer-xp-header">',
      '<div class="designer-xp-heading"><h3 class="designer-xp-level">Designer Lv.' + current.level + '</h3><p class="designer-xp-track">' + escapeHtml(current.title) + '</p></div>',
      '<span class="designer-xp-badge">+50 XP за урок</span>',
      '</div>',
      '<p class="designer-xp-meta">' + xpText + '</p>',
      '<div class="designer-xp-progress"><div class="designer-xp-progress__fill" style="width:' + progress + '%"></div></div>',
      '<ol class="designer-xp-scale">',
      model.levels.map(function (item) {
        var state = xp >= item.minXp ? "is-active" : "";
        return '<li class="' + state + '"><span class="designer-xp-scale__dot">Lv.' + item.level + '</span><span class="designer-xp-scale__label">' + escapeHtml(item.title) + '</span></li>';
      }).join(''),
      '</ol>',
      '</section>'
    ].join("");

    renderDesignerXpToast(host);
  }

  function normalizeFormSchema(schema) {
    var parsed = schema;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch (error) { parsed = null; }
    }
    var questions = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.questions) ? parsed.questions : []);
    return questions.map(function (question, index) {
      var type = String(question.type || "").trim();
      if (["text", "single_choice", "multiple_choice"].indexOf(type) === -1) return null;
      var id = String(question.id || question.name || ("question_" + (index + 1))).trim();
      var options = Array.isArray(question.options) ? question.options : [];
      return {
        id: id,
        type: type,
        title: question.title || question.label || question.question || ("Вопрос " + (index + 1)),
        required: question.required === true,
        options: options.map(function (option) {
          if (option && typeof option === "object") return { value: String(option.value || option.label || ""), label: String(option.label || option.value || "") };
          return { value: String(option), label: String(option) };
        }).filter(function (option) { return option.value || option.label; }),
        allowOther: question.allow_other === true,
        otherLabel: String(question.other_label || "").trim() || "Другое",
        otherPlaceholder: String(question.other_placeholder || "").trim() || "Напишите свой вариант"
      };
    }).filter(Boolean);
  }

  function normalizeFormSettings(settings) {
    if (typeof settings === "string") {
      try { settings = JSON.parse(settings); } catch (error) { settings = {}; }
    }
    return settings && typeof settings === "object" ? settings : {};
  }

  function getAnswerSummaryItems(answer) {
    var summary = answer && answer.summary;
    if (Array.isArray(summary)) return summary.map(String).filter(Boolean);
    if (typeof summary === "string" && summary.trim()) {
      try {
        var parsed = JSON.parse(summary);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch (error) {
        return [summary.trim()];
      }
      return [summary.trim()];
    }
    return [];
  }

  function normalizeMultipleChoiceAnswer(value) {
    if (Array.isArray(value)) return { selected: value.map(String).filter(Boolean), other: "" };
    if (value && typeof value === "object") {
      return {
        selected: Array.isArray(value.selected) ? value.selected.map(String).filter(Boolean) : [],
        other: String(value.other || "").trim()
      };
    }
    return { selected: [], other: "" };
  }

  function getFormAnswerSummaryItems(form, answer) {
    var answersJson = answer && answer.answers_json;
    if (typeof answersJson === "string") {
      try { answersJson = JSON.parse(answersJson); } catch (error) { answersJson = null; }
    }
    if (answersJson && typeof answersJson === "object") return buildFormSummary(form, answersJson);
    return getAnswerSummaryItems(answer);
  }

  function buildFormSummary(form, answers) {
    var items = [];
    normalizeFormSchema(form.form_schema).forEach(function (question) {
      var value = answers[question.id];
      if (question.type === "multiple_choice") {
        var normalized = normalizeMultipleChoiceAnswer(value);
        normalized.selected.forEach(function (item) { if (String(item || "").trim()) items.push(String(item).trim()); });
        if (normalized.other) items.push(normalized.other);
      } else if (Array.isArray(value)) {
        value.forEach(function (item) { if (String(item || "").trim()) items.push(String(item).trim()); });
      } else if (String(value || "").trim()) {
        items.push(String(value).trim());
      }
    });
    return items;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  async function fetchCourseForms() {
    COURSE_FORMS = [];
    COURSE_FORM_ANSWERS = {};
    COURSE_FORM_ANSWERS_LOADED = false;
    COURSE_FORM_ANSWERS_ERROR = null;
    if (!isFormsEnabled(COURSE_SETTINGS)) return [];

    var client = window.getSupabaseClient();
    var courseId = getActiveCourseId();
    if (!client || !courseId) return [];

    var formsResult = await client
      .from("course_forms")
      .select("*")
      .eq("course_id", courseId)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    if (formsResult.error) {
      console.warn("Supabase course_forms load error:", formsResult.error);
      return [];
    }

    COURSE_FORMS = formsResult.data || [];
    await loadSavedCourseFormAnswers();

    return COURSE_FORMS;
  }

  async function loadSavedCourseFormAnswers() {
    COURSE_FORM_ANSWERS = {};
    COURSE_FORM_ANSWERS_LOADED = false;
    COURSE_FORM_ANSWERS_ERROR = null;
    if (!COURSE_FORMS.length) {
      COURSE_FORM_ANSWERS_LOADED = true;
      return COURSE_FORM_ANSWERS;
    }

    var client = window.getSupabaseClient();
    var courseId = getActiveCourseId();
    var productUserId = PRODUCT_USER && PRODUCT_USER.id;
    console.log("[MindCore Forms] Loading saved answers");
    console.log("[MindCore Forms] current product_user_id:", productUserId || null);
    if (!client || !courseId || !productUserId) {
      COURSE_FORM_ANSWERS_LOADED = true;
      if (!productUserId) console.warn("[MindCore Forms] Saved answers were not loaded: product_user_id is missing");
      return COURSE_FORM_ANSWERS;
    }

    COURSE_FORM_ANSWERS_LOADING = true;
    var formIds = COURSE_FORMS.map(function (form) { return form && form.id; }).filter(Boolean);
    var answersResult = await client
      .from("course_form_answers")
      .select("*")
      .eq("course_id", courseId)
      .eq("product_user_id", productUserId)
      .in("form_id", formIds)
      .order("submitted_at", { ascending: false });
    COURSE_FORM_ANSWERS_LOADING = false;

    if (answersResult.error) {
      COURSE_FORM_ANSWERS_ERROR = answersResult.error;
      console.warn("Supabase course_form_answers load error:", answersResult.error);
      return COURSE_FORM_ANSWERS;
    }

    (answersResult.data || []).forEach(function (answer) {
      if (answer && answer.form_id && !COURSE_FORM_ANSWERS[answer.form_id]) COURSE_FORM_ANSWERS[answer.form_id] = answer;
    });
    COURSE_FORM_ANSWERS_LOADED = true;
    console.log("[MindCore Forms] loaded answers:", answersResult.data || []);
    console.log("[MindCore Forms] completed form ids:", Object.keys(COURSE_FORM_ANSWERS));
    return COURSE_FORM_ANSWERS;
  }

  function getFormAnswerValue(answer, questionId) {
    var answersJson = answer && answer.answers_json;
    if (typeof answersJson === "string") {
      try { answersJson = JSON.parse(answersJson); } catch (error) { answersJson = {}; }
    }
    return answersJson && Object.prototype.hasOwnProperty.call(answersJson, questionId) ? answersJson[questionId] : "";
  }

  function getFormFieldSelector(questionId) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return '[name="' + CSS.escape(questionId) + '"]';
    }
    return '[name="' + String(questionId).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
  }

  function getCourseFormDataSelector(attribute, value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return '[' + attribute + '="' + CSS.escape(value) + '"]';
    }
    return '[' + attribute + '="' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
  }

  function createFormsModal() {
    var modal = document.getElementById("courseFormsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "courseFormsModal";
    modal.className = "nutrition-modal course-form-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = [
      '<div class="nutrition-modal__backdrop" data-course-form-close></div>',
      '<div class="nutrition-modal__sheet" role="dialog" aria-modal="true" aria-label="Форма курса">',
      '<div class="nutrition-modal__content"></div>',
      '</div>'
    ].join("");
    modal.addEventListener("click", function (event) {
      if (event.target && event.target.hasAttribute("data-course-form-close")) closeCourseFormModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function openCourseFormModal() {
    var modal = createFormsModal();
    modal.hidden = false;
    modal.removeAttribute("hidden");
    modal.offsetHeight;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open", "calculator-modal-open");
    return modal.querySelector(".nutrition-modal__content");
  }

  function closeCourseFormModal() {
    var modal = document.getElementById("courseFormsModal");
    if (!modal || modal.hidden) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      modal.hidden = true;
      document.body.classList.remove("modal-open", "calculator-modal-open");
    }, 180);
  }

  function getSubmittedFormTitle(form, settings) {
    var resultTitle = settings && typeof settings.result_title === "string" ? settings.result_title.trim() : "";
    if (resultTitle) return resultTitle;
    return "Ваша " + (form.title || "форма").toLowerCase();
  }

  function formatCourseFormSubmittedDate(answer) {
    var value = answer && answer.submitted_at;
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
    } catch (error) {
      return date.toLocaleDateString("ru-RU");
    }
  }

  function getSubmittedFormButtonText(settings) {
    var candidates = [
      settings && settings.submitted_button_text,
      settings && settings.view_answers_button_text,
      settings && settings.result_button_text
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === "string" && candidates[i].trim()) return candidates[i].trim();
    }
    return "Посмотреть ответы";
  }

  function renderCourseFormView(form, answer) {
    var content = openCourseFormModal();
    var items = getFormAnswerSummaryItems(form, answer);
    var settings = normalizeFormSettings(form.settings);
    var submittedDate = formatCourseFormSubmittedDate(answer);
    content.innerHTML = [
      '<div class="course-form-modal__header">',
      '<div class="course-form-modal__heading">',
      '<h2 class="nutrition-title">' + escapeHtml(getSubmittedFormTitle(form, settings)) + '</h2>',
      (submittedDate ? '<p class="nutrition-text course-form-submitted-at">Зафиксировано ' + escapeHtml(submittedDate) + '</p>' : ''),
      (form.description ? '<p class="nutrition-text">' + escapeHtml(form.description) + '</p>' : '<p class="nutrition-text">Ответы по форме сохранены.</p>'),
      '</div>',
      '<button class="nutrition-modal__close" type="button" data-course-form-close aria-label="Закрыть">×</button>',
      '</div>',
      '<div class="course-form-modal__body">',
      '<div class="course-form-summary">',
      (items.length ? '<ul class="course-form-answer-list">' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join("") + '</ul>' : '<p>Ответ сохранён.</p>'),
      '</div>',
      '</div>',
      '<div class="nutrition-actions course-form-modal__footer">',
      (settings.allow_edit === true ? '<button type="button" class="btn btn-primary" id="courseFormEditBtn">Редактировать</button>' : ''),
      '<button type="button" class="btn" data-course-form-close>Закрыть</button>',
      '</div>'
    ].join("");
    var editBtn = document.getElementById("courseFormEditBtn");
    if (editBtn) editBtn.addEventListener("click", function () { renderCourseFormEditor(form, answer); });
  }

  function renderCourseFormEditor(form, existingAnswer) {
    var content = openCourseFormModal();
    var questions = normalizeFormSchema(form.form_schema);
    content.innerHTML = [
      '<div class="course-form-modal__header">',
      '<div class="course-form-modal__heading">',
      '<h2 class="nutrition-title">' + escapeHtml(form.title || "Форма") + '</h2>',
      (form.description ? '<p class="nutrition-text">' + escapeHtml(form.description) + '</p>' : ''),
      '</div>',
      '<button class="nutrition-modal__close" type="button" data-course-form-close aria-label="Закрыть">×</button>',
      '</div>',
      '<form class="nutrition-form course-form" id="courseFormEditor">',
      '<div class="course-form-modal__body">',
      questions.map(function (question) {
        var saved = getFormAnswerValue(existingAnswer, question.id);
        if (question.type === "text") {
          return '<label class="nutrition-field"><span>' + escapeHtml(question.title) + '</span><input name="' + escapeAttr(question.id) + '" type="text" value="' + escapeAttr(saved || "") + '"' + (question.required ? ' required' : '') + '></label>';
        }
        var savedMultiple = question.type === "multiple_choice" ? normalizeMultipleChoiceAnswer(saved) : null;
        var optionsHtml = question.options.map(function (option) {
          var checked = question.type === "multiple_choice" ? (savedMultiple.selected.indexOf(option.value) !== -1) : saved === option.value;
          return '<label class="course-form-option"><input name="' + escapeAttr(question.id) + '" type="' + (question.type === "multiple_choice" ? "checkbox" : "radio") + '" value="' + escapeAttr(option.value) + '"' + (checked ? ' checked' : '') + (question.required && question.type === "single_choice" ? ' required' : '') + '> <span>' + escapeHtml(option.label) + '</span></label>';
        }).join("");
        if (question.type === "multiple_choice" && question.allowOther) {
          var otherChecked = !!(savedMultiple && savedMultiple.other);
          optionsHtml += '<label class="course-form-option"><input type="checkbox" data-course-form-other-toggle="' + escapeAttr(question.id) + '"' + (otherChecked ? ' checked' : '') + '> <span>' + escapeHtml(question.otherLabel) + '</span></label>';
          optionsHtml += '<label class="nutrition-field course-form-other-field" data-course-form-other-field="' + escapeAttr(question.id) + '"' + (otherChecked ? '' : ' hidden') + '><span class="sr-only">' + escapeHtml(question.otherLabel) + '</span><input type="text" data-course-form-other-input="' + escapeAttr(question.id) + '" value="' + escapeAttr(savedMultiple ? savedMultiple.other : "") + '" placeholder="' + escapeAttr(question.otherPlaceholder) + '"></label>';
        }
        return '<fieldset class="nutrition-field course-form-fieldset" data-course-form-question="' + escapeAttr(question.id) + '"><legend>' + escapeHtml(question.title) + '</legend>' + optionsHtml + '<p class="course-form-error" data-course-form-error="' + escapeAttr(question.id) + '" hidden></p></fieldset>';
      }).join(""),
      '</div>',
      '<div class="course-form-modal__footer">',
      '<button type="submit" class="btn btn-primary nutrition-submit">Сохранить</button>',
      '</div>',
      '</form>'
    ].join("");
    content.querySelectorAll("[data-course-form-other-toggle]").forEach(function (toggle) {
      toggle.addEventListener("change", function () {
        var id = toggle.getAttribute("data-course-form-other-toggle");
        var field = content.querySelector(getCourseFormDataSelector("data-course-form-other-field", id));
        var input = content.querySelector(getCourseFormDataSelector("data-course-form-other-input", id));
        if (field) field.hidden = !toggle.checked;
        if (!toggle.checked && input) input.value = "";
      });
    });
    document.getElementById("courseFormEditor").addEventListener("submit", function (event) {
      event.preventDefault();
      void saveCourseFormAnswer(form, questions, existingAnswer);
    });
  }

  async function saveCourseFormAnswer(form, questions, existingAnswer) {
    var client = window.getSupabaseClient();
    if (!client) return;
    var formElement = document.getElementById("courseFormEditor");
    var answers = {};
    var hasErrors = false;
    formElement.querySelectorAll("[data-course-form-error]").forEach(function (errorNode) { errorNode.hidden = true; errorNode.textContent = ""; });
    questions.forEach(function (question) {
      var selector = getFormFieldSelector(question.id);
      if (question.type === "multiple_choice") {
        var selected = Array.from(formElement.querySelectorAll(selector + ':checked')).map(function (input) { return input.value; });
        if (question.allowOther) {
          var otherToggle = formElement.querySelector(getCourseFormDataSelector("data-course-form-other-toggle", question.id));
          var otherInput = formElement.querySelector(getCourseFormDataSelector("data-course-form-other-input", question.id));
          var other = otherToggle && otherToggle.checked && otherInput ? String(otherInput.value || "").trim() : "";
          answers[question.id] = { selected: selected, other: other };
          if (otherToggle && otherToggle.checked && !other) {
            hasErrors = true;
            var otherError = formElement.querySelector(getCourseFormDataSelector("data-course-form-error", question.id));
            if (otherError) { otherError.textContent = "Заполните поле «" + question.otherLabel + "» или снимите выбор."; otherError.hidden = false; }
          } else if (question.required && !selected.length && !other) {
            hasErrors = true;
            var requiredError = formElement.querySelector(getCourseFormDataSelector("data-course-form-error", question.id));
            if (requiredError) { requiredError.textContent = "Выберите хотя бы один вариант ответа."; requiredError.hidden = false; }
          }
        } else {
          answers[question.id] = selected;
          if (question.required && !selected.length) {
            hasErrors = true;
            var errorNode = formElement.querySelector(getCourseFormDataSelector("data-course-form-error", question.id));
            if (errorNode) { errorNode.textContent = "Выберите хотя бы один вариант ответа."; errorNode.hidden = false; }
          }
        }
      } else {
        var field = formElement.querySelector(selector);
        answers[question.id] = field ? field.value : "";
      }
    });
    if (hasErrors) return;
    var summary = buildFormSummary(form, answers);
    var courseId = getActiveCourseId();
    var productUserId = PRODUCT_USER && PRODUCT_USER.id ? PRODUCT_USER.id : null;
    var webappUserId = PRODUCT_USER && PRODUCT_USER.webapp_user_id ? PRODUCT_USER.webapp_user_id : (APP_PROFILE && APP_PROFILE.id ? APP_PROFILE.id : null);
    console.log("[MindCore Forms] Saving answer:");
    console.log("[MindCore Forms] form_id:", form.id);
    console.log("[MindCore Forms] course_id:", courseId);
    console.log("[MindCore Forms] product_user_id:", productUserId);
    console.log("[MindCore Forms] webapp_user_id:", webappUserId);
    if (!isUuid(productUserId)) {
      console.warn("[MindCore Forms] Answer was not saved: product_user_id is missing or is not a Supabase UUID", productUserId);
      return;
    }
    if (!isUuid(webappUserId)) {
      console.warn("[MindCore Forms] Answer was not saved: webapp_user_id is missing or is not a Supabase UUID", webappUserId);
      return;
    }
    var payload = {
      form_id: form.id,
      course_id: courseId,
      product_user_id: productUserId,
      webapp_user_id: webappUserId,
      answers_json: answers,
      summary: summary,
      status: "submitted",
      submitted_at: new Date().toISOString()
    };
    var settings = normalizeFormSettings(form.settings);
    var storedAnswer = existingAnswer || COURSE_FORM_ANSWERS[form.id] || null;
    if (!storedAnswer && settings.submission_mode === "once") {
      var duplicateResult = await client
        .from("course_form_answers")
        .select("*")
        .eq("course_id", courseId)
        .eq("form_id", form.id)
        .eq("product_user_id", productUserId)
        .maybeSingle();
      if (duplicateResult.error) {
        console.warn("[MindCore Forms] save error:", duplicateResult.error);
        return;
      }
      storedAnswer = duplicateResult.data || null;
    }
    var result;
    if (storedAnswer && storedAnswer.id) {
      if (settings.submission_mode === "once" && settings.allow_edit !== true) {
        result = { data: storedAnswer, error: null };
      } else {
        result = await client.from("course_form_answers").update(payload).eq("id", storedAnswer.id).select("*").single();
      }
    } else {
      result = await client.from("course_form_answers").insert(payload).select("*").single();
    }
    console.log("[MindCore Forms] save result:", result.data || null);
    console.log("[MindCore Forms] save error:", result.error || null);
    if (result.error) {
      console.warn("Supabase course_form_answers save error:", result.error);
      return;
    }
    COURSE_FORM_ANSWERS[form.id] = result.data;
    await renderCourseForms();
    renderCourseFormView(form, result.data);
  }

  async function renderCourseForms() {
    var section = document.getElementById("courseFormsSection");
    var host = document.getElementById("courseFormsHost");
    if (!section || !host) return;
    if (!isFormsEnabled(COURSE_SETTINGS)) {
      section.hidden = true;
      host.innerHTML = "";
      return;
    }
    if (!COURSE_FORMS.length && !COURSE_FORM_ANSWERS_LOADED) await fetchCourseForms();
    if (!COURSE_FORMS.length) {
      section.hidden = true;
      host.innerHTML = "";
      return;
    }
    section.hidden = false;
    if (COURSE_FORM_ANSWERS_LOADING || (!COURSE_FORM_ANSWERS_LOADED && !COURSE_FORM_ANSWERS_ERROR)) {
      host.innerHTML = '<section class="card course-form-card"><p>Проверяем сохранённые ответы…</p></section>';
      return;
    }
    if (COURSE_FORM_ANSWERS_ERROR) {
      host.innerHTML = '<section class="card course-form-card"><p>Не удалось загрузить ответы. Попробуйте обновить страницу.</p></section>';
      return;
    }
    host.innerHTML = COURSE_FORMS.map(function (form) {
      var answer = COURSE_FORM_ANSWERS[form.id];
      var settings = normalizeFormSettings(form.settings);
      var showSubmitted = answer && settings.submission_mode === "once";
      var items = getFormAnswerSummaryItems(form, answer);
      var submittedDate = showSubmitted ? formatCourseFormSubmittedDate(answer) : "";
      return [
        '<section class="card course-form-card">',
        '<div class="course-form-card__header">',
        (showSubmitted ? '<span class="course-form-card__accent" aria-hidden="true"></span>' : ''),
        '<div class="course-form-card__heading">',
        '<h3>' + escapeHtml(showSubmitted ? getSubmittedFormTitle(form, settings) : (form.title || "Форма")) + '</h3>',
        (submittedDate ? '<p class="course-form-card__meta">Зафиксировано ' + escapeHtml(submittedDate) + '</p>' : ''),
        '</div>',
        '</div>',
        (showSubmitted
          ? '<ul class="course-form-card__summary course-form-answer-list">' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join("") + '</ul>'
          : '<p>' + escapeHtml(form.description || "") + '</p>'),
        '<button type="button" class="btn btn-primary course-form-open" data-form-id="' + escapeAttr(form.id) + '">' + escapeHtml(showSubmitted ? getSubmittedFormButtonText(settings) : (form.button_text || "Заполнить")) + '</button>',
        '</section>'
      ].join("");
    }).join("");
    host.querySelectorAll(".course-form-open").forEach(function (button) {
      button.addEventListener("click", function () {
        var form = COURSE_FORMS.find(function (item) { return String(item.id) === String(button.getAttribute("data-form-id")); });
        if (!form) return;
        var answer = form && COURSE_FORM_ANSWERS[form.id];
        var settings = normalizeFormSettings(form && form.settings);
        if (answer && settings.submission_mode === "once") renderCourseFormView(form, answer);
        else renderCourseFormEditor(form, null);
      });
    });
  }

  function getNutritionLessonLink() {
    if (!LAST_LESSONS || !LAST_LESSONS.length) return null;
    var nutritionLesson = LAST_LESSONS.find(function (lesson) {
      return /питан/i.test(lesson.title || "");
    });
    if (!nutritionLesson) return null;
    return appendPreviewParams("./lesson.html?id=" + encodeURIComponent(nutritionLesson.lesson_id) + "&course=" + encodeURIComponent(getActiveCourseId()));
  }

  async function renderNutritionCard() {
    var section = document.getElementById("nutritionSection");
    var host = document.getElementById("nutritionCardHost");
    var profileHint = document.getElementById("profileNutritionHint");
    var nutritionEnabled = isNutritionCalculatorEnabled(COURSE_SETTINGS);
    var evaEnabled = isEvaCalculatorEnabled(COURSE_SETTINGS);

    if (!nutritionEnabled && !evaEnabled) {
      if (section) section.hidden = true;
      if (host) host.innerHTML = "";
      if (globalThis.EvaCalculator && typeof globalThis.EvaCalculator.renderCard === "function") {
        globalThis.EvaCalculator.renderCard(false);
      }
      if (profileHint) profileHint.textContent = "";
      return;
    }

    if (section) section.hidden = false;
    if (!host) return;

    var plan = nutritionEnabled && NUTRITION ? await NUTRITION.loadPlan() : null;
    var hasPlan = Boolean(plan && plan.calories);
    var cards = [];

    if (nutritionEnabled && NUTRITION) {
      cards.push([
        '<section class="card nutrition-card">',
        '<h3>Ваш план питания</h3>',
        (hasPlan
          ? '<p><strong>' + plan.calories + ' ккал/день</strong></p><p>Б ' + plan.protein + ' · Ж ' + plan.fats + ' · У ' + plan.carbs + '</p><p>Цель: ' + NUTRITION.formatGoal(plan.goal) + '</p>'
          : '<p>Рассчитай свою норму калорий и БЖУ, чтобы пройти курс с понятной отправной точкой.</p>'),
        '<button type="button" class="btn btn-primary" id="nutritionOpenBtn">' + (hasPlan ? 'Пересчитать' : 'Рассчитать КБЖУ') + '</button>',
        '</section>'
      ].join(''));
    }


    host.innerHTML = cards.join('');

    if (profileHint) {
      if (hasPlan) profileHint.textContent = 'КБЖУ: ' + plan.calories + ' ккал';
      else profileHint.textContent = '';
    }

    var openBtn = document.getElementById("nutritionOpenBtn");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        NUTRITION.open(plan || null);
      });
    }

    if (globalThis.EvaCalculator && typeof globalThis.EvaCalculator.renderCard === "function") {
      globalThis.EvaCalculator.renderCard(evaEnabled);
    }

  }

  function getAccessExpiredScreenModel(accessResult) {
    var settings = COURSE_SETTINGS || {};
    return {
      title: String(settings.access_expired_title || "").trim() || "Доступ к программе завершён",
      text: String(settings.access_expired_text || "").trim() || "Срок доступа к программе закончился. Чтобы продлить доступ, нажмите кнопку ниже.",
      buttonText: String(settings.access_expired_button_text || "").trim() || "Продлить доступ",
      buttonUrl: String(settings.access_expired_button_url || "").trim(),
      accessExpiresAt: accessResult && accessResult.productUser && accessResult.productUser.access_expires_at
    };
  }

  function formatAccessDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function renderAccessExpiredScreen(host, accessResult) {
    if (!host) return;
    var model = getAccessExpiredScreenModel(accessResult);
    var expiredDate = formatAccessDate(model.accessExpiresAt);
    host.innerHTML = [
      '<section class="card access-expired-card" role="status" aria-live="polite">',
      '<div class="access-expired-icon" aria-hidden="true">⏳</div>',
      '<h2>' + escapeHtml(model.title) + '</h2>',
      '<p>' + escapeHtml(model.text) + '</p>',
      (expiredDate ? '<p class="access-expired-date">Доступ был активен до: <strong>' + escapeHtml(expiredDate) + '</strong></p>' : ''),
      (model.buttonUrl ? '<a class="btn btn-primary access-expired-btn" href="' + escapeAttr(model.buttonUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(model.buttonText) + '</a>' : ''),
      '</section>'
    ].join("");
  }

  function getTelegramInitData() {
    var platform = globalThis.CourseAppPlatform || {};
    var tg = typeof platform.getTelegramWebApp === "function"
      ? platform.getTelegramWebApp()
      : null;

    return tg && typeof tg.initData === "string"
      ? tg.initData
      : "";
  }

  async function checkCourseEntryAccess() {
    var settings = COURSE_SETTINGS || {};
    var accessMode = settings.access_mode ? String(settings.access_mode) : null;

    if (accessMode === "open") {
      return { allowed: true, reason: "open_access" };
    }

    if (accessMode !== "telegram_channel") {
      return { allowed: false, reason: "access_mode_not_resolved" };
    }

    var telegramInitData = getTelegramInitData();
    if (!telegramInitData) {
      return { allowed: false, reason: "telegram_auth_required" };
    }

    var courseId = getActiveCourseId();
    try {
      var client = window.getSupabaseClient();
      if (!client || !client.functions || typeof client.functions.invoke !== "function") {
        throw new Error("Supabase functions client not initialized");
      }

      var result = await client.functions.invoke("check-course-access", {
        body: {
          course_id: courseId,
          telegram_init_data: telegramInitData
        }
      });

      if (result.error) {
        throw result.error;
      }

      if (result.data && typeof result.data.allowed === "boolean") {
        return result.data;
      }

      throw new Error("Invalid access check response");
    } catch (error) {
      console.warn("[MindCore] Course entry access check failed", {
        course_id: courseId,
        error_type: error instanceof Error ? error.name : "UnknownError"
      });
      return { allowed: false, reason: "access_check_failed" };
    }
  }

  function getCourseEntryAccessDeniedModel(accessResult) {
    var reason = accessResult && accessResult.reason;
    if (reason === "telegram_auth_required") {
      return {
        icon: "🔒",
        title: "Откройте кабинет в Telegram",
        text: "Для проверки доступа откройте личный кабинет через кнопку в закрытом Telegram-канале."
      };
    }

    if (reason === "not_telegram_channel_member") {
      return {
        icon: "🚫",
        title: "Доступ не найден",
        text: "Этот кабинет доступен только участникам программы."
      };
    }

    return {
      icon: "⚠️",
      title: "Не удалось проверить доступ",
      text: "Закройте кабинет и попробуйте открыть его снова чуть позже."
    };
  }

  function renderCourseEntryAccessDenied(accessResult) {
    var model = getCourseEntryAccessDeniedModel(accessResult);
    var page = document.body.getAttribute("data-page");
    var host = page === "lesson"
      ? document.getElementById("lessonState")
      : document.getElementById("lessonsContainer");
    var stateBox = document.getElementById("stateBox");
    var main = document.getElementById("lessonMain");

    if (page === "dashboard") {
      setDashboardCourseContentBlocked(true);
      if (stateBox) stateBox.hidden = true;
    }

    if (page === "lesson") {
      if (main) main.hidden = true;
      if (host) {
        host.hidden = false;
        host.classList.remove("skeleton");
      }
    }

    if (!host) return;
    host.innerHTML = [
      '<section class="card access-expired-card" role="status" aria-live="polite">',
      '<div class="access-expired-icon" aria-hidden="true">' + escapeHtml(model.icon) + '</div>',
      '<h2>' + escapeHtml(model.title) + '</h2>',
      '<p>' + escapeHtml(model.text) + '</p>',
      '</section>'
    ].join("");
  }

  async function checkCourseAccess() {
    var settings = COURSE_SETTINGS || {};
    var enabled = Boolean(settings.access_control_enabled === true);
    var productUser = PRODUCT_USER || null;
    var allowed = true;
    var reason = "access_control_disabled";

    if (enabled) {
      allowed = false;
      reason = "product_user_missing";
      if (productUser) {
        var status = String(productUser.status || "active").toLowerCase();
        if (status === "blocked" || status === "expired") {
          reason = "status_" + status;
        } else if (productUser.access_expires_at && new Date() > new Date(productUser.access_expires_at)) {
          reason = "access_expired";
        } else {
          allowed = true;
          reason = "allowed";
        }
      }
    }

    console.log("[MindCore] Access control enabled:", enabled);
    console.log("[MindCore] Access started:", productUser && productUser.access_started_at);
    console.log("[MindCore] Access expires:", productUser && productUser.access_expires_at);
    console.log("[MindCore] Access status:", productUser && productUser.status);
    console.log("[MindCore] Access allowed:", allowed);
    console.log("[MindCore] Access blocked reason:", allowed ? "" : reason);

    return { allowed: allowed, reason: reason, productUser: productUser, settings: settings };
  }

  function setDashboardCourseContentBlocked(blocked) {
    var list = document.getElementById("lessonsContainer");
    var stateBox = document.getElementById("stateBox");
    var progressWrap = document.querySelector(".progress-wrap");
    var sectionTitles = Array.from(document.querySelectorAll(".section-title"));
    if (progressWrap) progressWrap.hidden = blocked;
    sectionTitles.forEach(function (title) {
      var text = String(title.textContent || "").trim().toLowerCase();
      if (text === "ваш прогресс" || text === "уроки") title.hidden = blocked;
    });
    if (blocked && list) list.innerHTML = "";
    if (blocked && stateBox) stateBox.hidden = true;
  }

  async function renderDashboard(lessons, config) {
    console.log("[preview access]", {
      isPreview: isPreviewMode(),
      url: window.location.href
    });
    var name = getUserName(APP_PROFILE);
    var avatar = document.getElementById("avatar");
    var studentName = document.getElementById("studentName");
    var list = document.getElementById("lessonsContainer");
    var stateBox = document.getElementById("stateBox");

    studentName.textContent = name;
    avatar.textContent = getInitials(name);
    avatar.style.backgroundImage = "";
    if (APP_PROFILE && APP_PROFILE.avatarUrl) {
      avatar.textContent = "";
      avatar.style.backgroundImage = "url(\"" + escapeAttr(APP_PROFILE.avatarUrl) + "\")";
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    }

    var completed = await loadCompleted();
    var accessModel = getAccessibilityModel(lessons, completed);

    await renderNutritionCard();
    renderEmotionNavigator();
    await renderDesignerXpCard(lessons);
    await renderCourseForms();
    renderDashboardWatermark(COURSE_ACCESS);

    var courseAccessResult = await checkCourseAccess();
    setDashboardCourseContentBlocked(!courseAccessResult.allowed);
    if (!courseAccessResult.allowed) {
      renderAccessExpiredScreen(list, courseAccessResult);
      await renderDebugPanel(config, lessons, completed, accessModel);
      return;
    }

    setDashboardCourseContentBlocked(false);
    await renderDebugPanel(config, lessons, completed, accessModel);

    if (!lessons.length) {
      list.innerHTML = "";
      stateBox.hidden = false;
      stateBox.textContent = "Нет доступных уроков";
      await renderProgress(lessons);
      return;
    }

    stateBox.hidden = true;

    function renderLessonCard(lesson) {
      var done = completed.includes(lesson.lesson_id);
      var accessible = Boolean(accessModel.map[lesson.lesson_id]);
      var locked = isPreviewMode() ? false : !accessible;

      return [
        '<article class="lesson-card' + (locked ? ' locked' : '') + '">',
        '<div class="lesson-preview">',
        (getPreviewSrc(lesson) ? '<img src="' + escapeAttr(getPreviewSrc(lesson)) + '" alt="Превью урока" loading="lazy" data-lesson-id="' + escapeAttr(lesson.lesson_id) + '">' : ''),
        '</div>',
        '<div class="lesson-card-body">',
        '<div class="lesson-meta">',
        '<span class="lesson-day">' + escapeHtml(getLessonDisplayLabel(lesson)) + '</span>',
        '<div class="lesson-indicators">',
        (done ? '<span class="status done">Пройдено</span>' : ''),
        (locked ? '<span class="status locked">Закрыто</span>' : ''),
        '</div>',
        '</div>',
        '<h3>' + escapeHtml(lesson.title) + '</h3>',
        '<p>' + escapeHtml(lesson.subtitle || "Описание отсутствует") + '</p>',
        '<div class="lesson-actions">',
        (locked
          ? '<button class="btn btn-open" type="button" disabled>Открыть</button>'
          : '<a class="btn btn-open" href="' + escapeAttr(appendPreviewParams("./lesson.html?id=" + encodeURIComponent(lesson.lesson_id) + "&course=" + encodeURIComponent(getActiveCourseId()))) + '">Открыть</a>'),
        '</div>',
        '</div>',
        '</article>'
      ].join("");
    }

    if (COURSE_SETTINGS && COURSE_SETTINGS.course_structure === "grouped") {
      var lastGroupTitle = "";
      var groupIndex = 0;

      list.innerHTML = lessons.map(function (lesson) {
        var groupTitle = String(lesson.group_title || "").trim();
        var groupHeader = "";

        if (groupTitle && groupTitle !== lastGroupTitle) {
          groupIndex += 1;
          var groupHeaderParts = getLessonGroupHeaderParts(groupTitle, groupIndex);

          groupHeader = [
            '<div class="lesson-group-header">',
            '<span class="lesson-group-header__chip">' + escapeHtml(groupHeaderParts.chip) + '</span>',
            '<h2 class="lesson-group-header__title">' + escapeHtml(groupHeaderParts.title) + '</h2>',
            '</div>'
          ].join("");
        }

        if (groupTitle) lastGroupTitle = groupTitle;

        return groupHeader + renderLessonCard(lesson);
      }).join("");
    } else {
      list.innerHTML = lessons.map(renderLessonCard).join("");
    }

    if (isDebugMode()) {
      var previewImages = list.querySelectorAll(".lesson-preview img[data-lesson-id]");
      previewImages.forEach(function (img) {
        var lessonId = img.getAttribute("data-lesson-id") || "";

        img.addEventListener("load", function () {
          DEBUG_IMG_STATUS[lessonId] = "OK";
          console.log("[IMG OK] lesson_id=" + lessonId + " src=" + img.currentSrc);
          void refreshDebugPanel();
        });

        img.addEventListener("error", function () {
          DEBUG_IMG_STATUS[lessonId] = "FAIL";
          console.log("[IMG FAIL] lesson_id=" + lessonId + " src=" + img.currentSrc);
          img.style.display = "none";
          void refreshDebugPanel();
        });

        if (img.complete && img.naturalWidth > 0) {
          DEBUG_IMG_STATUS[lessonId] = "OK";
        }
      });
      void refreshDebugPanel();
    }

    await renderProgress(lessons);
  }

  async function renderProgress(lessons) {
    var completed = await loadCompleted();
    var total = lessons.length;
    var completedCount = lessons.filter(function (l) {
      return completed.includes(l.lesson_id);
    }).length;

    var pct = total ? Math.round((completedCount / total) * 100) : 0;

    document.getElementById("progressText").textContent = "Пройдено: " + completedCount + " из " + total;
    document.getElementById("progressPct").textContent = pct + "%";
    document.getElementById("progressFill").style.width = pct + "%";
  }


  function extractDriveFileId(url) {
    if (!url) return null;

    var byPath = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (byPath && byPath[1]) return byPath[1];

    try {
      var parsed = new URL(url);
      var fromId = parsed.searchParams.get("id");
      if (fromId) return fromId;
    } catch (e) {
      return null;
    }

    return null;
  }

  function normalizeMediaUrl(url, type) {
    var value = String(url || "").trim();
    if (!value) return "";

    var driveFileId = extractDriveFileId(value);
    if (driveFileId) {
      if (type === "video") {
        return "https://drive.google.com/file/d/" + driveFileId + "/preview";
      }
      return value;
    }

    if (/drive\.google\.com\/drive\/folders\//i.test(value)) {
      return value;
    }


    return value;
  }

  function getVideoRenderModel(url) {
    var normalized = normalizeMediaUrl(url, "video");
    if (!normalized) {
      return { mode: "none", url: "" };
    }


    if (/^https:\/\//i.test(normalized)) {
      return { mode: "embed", url: normalized };
    }

    return { mode: "none", url: "" };
  }

  function getLessonBlockVideoUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";

    if (!/^https?:\/\//i.test(raw)) {
      return "https://kinescope.io/embed/" + raw;
    }

    var normalized = normalizeMediaUrl(raw, "video");
    if (!normalized) return "";

    return normalized;
  }

  function resolveLessonFileUrl(fileId) {
    var raw = String(fileId || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return "https://drive.google.com/file/d/" + encodeURIComponent(raw) + "/view?usp=sharing";
  }

  // ===== Attachments: parse + tags =====
  function parseAttachments(raw) {
    if (!raw) return [];

    // Каждая строка = один материал
    var lines = String(raw)
      .split(/\r?\n|;/g) // перенос строки или ;
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    var files = lines.map(function (line, idx) {
      var name = "Материал " + (idx + 1);
      var url = "";

      if (line.indexOf("|") !== -1) {
        var parts = line.split("|").map(function (x) { return x.trim(); });
        var a = parts[0] || "";
        var b = parts[1] || "";

        var aIsUrl = /^https?:\/\//i.test(a);
        var bIsUrl = /^https?:\/\//i.test(b);

        // Поддержка: "URL | Название" и "Название | URL"
        if (aIsUrl && !bIsUrl) { url = a; name = b || name; }
        else if (bIsUrl && !aIsUrl) { url = b; name = a || name; }
        else { name = a || name; url = b || ""; }
      } else {
        url = line;
      }

      url = normalizeMediaUrl(url, "file");

      return { name: name, url: url };
    });

    // Убираем мусор: пустые или не ссылки
    return files.filter(function (f) {
      return /^https?:\/\//i.test(f.url);
    });
  }

  function getFileExt(nameOrUrl) {
    var v = String(nameOrUrl || "").trim().toLowerCase();
    v = v.split("#")[0].split("?")[0];
    var m = v.match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : "";
  }

  function getFileTag(file) {
    var ext = getFileExt(file.name);
    if (!ext) ext = getFileExt(file.url);

    if (!ext) return "LINK";
    if (ext === "PDF") return "PDF";
    if (ext === "DOC" || ext === "DOCX") return "DOC";
    if (ext === "XLS" || ext === "XLSX" || ext === "CSV") return "XLS";
    if (ext === "PPT" || ext === "PPTX") return "PPT";
    if (ext === "ZIP" || ext === "RAR" || ext === "7Z") return "ZIP";
    if (ext === "JPG" || ext === "JPEG" || ext === "PNG" || ext === "WEBP") return "IMG";
    return ext;
  }
  // ====================================

  async function renderLesson(lessons) {
    var stateBox = document.getElementById("lessonState");
    var main = document.getElementById("lessonMain");
    var id = new URLSearchParams(window.location.search).get("id");

    if (!id) {
      stateBox.classList.remove("skeleton");
      stateBox.textContent = "ID урока не найден. Откройте урок из списка.";
      return;
    }

    var lesson = lessons.find(function (l) {
      return l.lesson_id === id;
    });

    if (!lesson) {
      stateBox.classList.remove("skeleton");
      stateBox.textContent = "Урок не найден для выбранного курса.";
      return;
    }

    var courseAccessResult = await checkCourseAccess();
    if (!courseAccessResult.allowed) {
      if (main) main.hidden = true;
      stateBox.hidden = false;
      stateBox.classList.remove("skeleton");
      renderAccessExpiredScreen(stateBox, courseAccessResult);
      wireLessonBackLinks();
      return;
    }

    var completed = await loadCompleted();
    var accessModel = getAccessibilityModel(lessons, completed);

    console.log("[preview access]", {
      isPreview: isPreviewMode(),
      url: window.location.href
    });

    if (!isPreviewMode() && !accessModel.map[lesson.lesson_id]) {
      stateBox.classList.remove("skeleton");
      stateBox.textContent = "Этот урок пока недоступен.";
      return;
    }

    wireLessonBackLinks();

    stateBox.hidden = true;
    main.hidden = false;

    await updateAppState({ lastOpenedLesson: lesson.lesson_id });

    document.getElementById("lessonDay").textContent = getLessonDisplayLabel(lesson);
    document.getElementById("lessonTitle").textContent = lesson.title;
    document.getElementById("lessonSubtitle").textContent = lesson.subtitle || "";

    var lessonNutritionHost = document.getElementById("lessonNutritionHost");
    if (lessonNutritionHost) {
      lessonNutritionHost.innerHTML = "";
    }

    var content = document.getElementById("lessonContent");
    var blocks = await fetchLessonBlocks(lesson.id);

    var videoDescriptionQueue = [];

    function renderVideoDescription(block) {
      var description = String((block && block.video_description) || "");
      if (!description.trim()) return "";

      var descriptionIndex = videoDescriptionQueue.push(description) - 1;
      return '<p class="lesson-media__description" data-video-description-index="' + descriptionIndex + '"></p>';
    }

    function hydrateVideoDescriptions() {
      content.querySelectorAll(".lesson-media__description[data-video-description-index]").forEach(function (descriptionNode) {
        var descriptionIndex = Number(descriptionNode.getAttribute("data-video-description-index"));
        descriptionNode.textContent = videoDescriptionQueue[descriptionIndex] || "";
      });
    }

    async function renderLessonBlock(block) {
      var items = await fetchBlockItems(block.id);
      var html = "";

      if (items.length) {
        items.forEach(function (item) {
          if (item.item_type === "text" && item.text_html) {
            html += '<div class="rich-text-content">' + item.text_html + '</div>';
          }

          if (item.item_type === "video" && item.video_id) {
            var embedUrl = getLessonBlockVideoUrl(item.video_id);
            if (!embedUrl) return;
            html += [
              '<div class="lesson-media">',
              '<div class="lesson-media__frame">',
              '<iframe class="lesson-media__content" src="' + escapeAttr(embedUrl) + '" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy">',
              '</iframe>',
              '</div>',
              renderVideoDescription(block),
              '</div>'
            ].join(" ");
          }

          if (item.item_type === "file" && item.file_id) {
            var fileUrl = resolveLessonFileUrl(item.file_id);
            if (!fileUrl) return;
            var fileLabel = item.file_label || "Материал";
            html += '<ul class="attachments-list"><li class="attach-item"><a class="attach-link" href="' + escapeAttr(fileUrl) + '" target="_blank" rel="noopener noreferrer"><span class="attach-name">' + escapeHtml(fileLabel) + '</span><span class="file-tag">FILE</span></a></li></ul>';
          }

          if (item.item_type === "image" && item.image_url) {
            html += '<figure class="lesson-inline-image"><img src="' + escapeAttr(item.image_url) + '" alt="' + escapeAttr(item.image_alt || "Изображение урока") + '" loading="lazy">' + (item.image_alt ? '<figcaption>' + escapeHtml(item.image_alt) + '</figcaption>' : "") + '</figure>';
          }
        });

        if (html) return '<div class="lesson-block">' + html + '</div>';
      }

      if (block.text_html) return '<div class="lesson-block"><div class="rich-text-content">' + block.text_html + '</div></div>';
      return "";
    }

    async function renderBlocksFlat(blocksToRender) {
      var renderedBlocks = await Promise.all(blocksToRender.map(renderLessonBlock));
      return renderedBlocks.join("");
    }

    if (blocks.length) {
      var groups = [];
      var groupsLoadFailed = false;
      try {
        groups = await fetchLessonBlockGroups(lesson.id);
      } catch (groupError) {
        groupsLoadFailed = true;
        console.warn("Lesson block groups fallback: rendering blocks without accordions", groupError);
      }

      if (groupsLoadFailed || !groups.length) {
        content.innerHTML = await renderBlocksFlat(blocks);
        hydrateVideoDescriptions();
      } else {
        var groupById = {};
        groups.forEach(function (group) {
          groupById[String(group.id)] = group;
        });

        var displayItems = groups.map(function (group, index) {
          return { type: "group", order: group.sort_order || 0, originalIndex: index, data: group };
        }).concat(blocks.filter(function (block) {
          return !block.group_id || !groupById[String(block.group_id)];
        }).map(function (block, index) {
          return { type: "block", order: block.sort_order || 0, originalIndex: groups.length + index, data: block };
        })).sort(function (a, b) {
          if (a.order !== b.order) return a.order - b.order;
          return a.originalIndex - b.originalIndex;
        });

        var groupedHtml = [];
        for (var displayIndex = 0; displayIndex < displayItems.length; displayIndex += 1) {
          var displayItem = displayItems[displayIndex];
          if (displayItem.type === "block") {
            groupedHtml.push(await renderLessonBlock(displayItem.data));
            continue;
          }

          var group = displayItem.data;
          var groupBlocks = blocks.filter(function (block) { return String(block.group_id || "") === String(group.id); });
          var groupBlocksHtml = await renderBlocksFlat(groupBlocks);
          groupedHtml.push([
            '<details class="lesson-block-group">',
            '<summary class="lesson-block-group__summary">',
            '<span class="lesson-block-group__text"><strong>' + escapeHtml(group.title || "Материалы") + '</strong>',
            group.description ? '<small>' + escapeHtml(group.description) + '</small>' : '',
            '</span>',
            '<span class="lesson-block-group__count">' + groupBlocks.length + ' ' + pluralizeRu(groupBlocks.length, ["блок", "блока", "блоков"]) + '</span>',
            '<span class="lesson-block-group__arrow">⌄</span>',
            '</summary>',
            '<div class="lesson-block-group__content">' + groupBlocksHtml + '</div>',
            '</details>'
          ].join(""));
        }
        content.innerHTML = groupedHtml.join("");
        hydrateVideoDescriptions();
      }
    } else if (lesson.content_html) {
      content.innerHTML = '<div class="rich-text-content">' + lesson.content_html + '</div>';
    } else {
      content.textContent = lesson.content_text || "Содержимое урока пока пустое.";
    }

    var videoModel = getVideoRenderModel(lesson.video_url);
    var videoWrap = document.getElementById("videoWrap");
    var frame = document.getElementById("videoFrame");
    var videoLinkCard = document.getElementById("videoLinkCard");
    var videoLinkButton = document.getElementById("videoLinkButton");

  if (videoModel.mode === "embed") {
  // Разрешения для fullscreen / PiP (особенно важно для iOS WebView)
  frame.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
  frame.setAttribute("allowfullscreen", "true");
  frame.setAttribute("playsinline", "true");

  frame.src = videoModel.url;
  videoWrap.hidden = false;

  // Дублируем ссылку “Открыть” как запасной вариант (полезно для iOS/Drive)
  videoLinkButton.href = videoModel.url;
  videoLinkCard.hidden = false;
} else if (videoModel.mode === "link") {
  videoLinkButton.href = videoModel.url;
  videoLinkCard.hidden = false;
} else {
  // Ничего не показываем
  videoWrap.hidden = true;
  videoLinkCard.hidden = true;
  frame.removeAttribute("src");
}

    // ===== Materials rendering (fixed) =====
    var attachmentsWrap = document.getElementById("attachmentsWrap");
    var attachmentsList = document.getElementById("attachmentsList");
    var files = parseAttachments(lesson.attachments);

    if (files.length) {
      attachmentsWrap.hidden = false;
      attachmentsList.innerHTML = files.map(function (f) {
        var tag = getFileTag(f);
        return (
          '<li class="attach-item">' +
            '<a class="attach-link" href="' + escapeAttr(f.url) + '" target="_blank" rel="noopener noreferrer">' +
              '<span class="attach-name">' + escapeHtml(f.name) + '</span>' +
              '<span class="file-tag">' + escapeHtml(tag) + '</span>' +
            '</a>' +
          '</li>'
        );
      }).join("");
    } else {
      attachmentsWrap.hidden = true;
      attachmentsList.innerHTML = "";
    }
    // ======================================

    var completeBtn = document.getElementById("completeBtn");
    if (completed.includes(lesson.lesson_id)) {
      completeBtn.textContent = "Пройдено ✓";
      completeBtn.disabled = true;
    }

    completeBtn.addEventListener("click", async function () {
      await markCompleted(lesson.lesson_id);
      localStorage.setItem(DESIGNER_XP_TOAST_KEY, String(Date.now()));
      completeBtn.textContent = "Пройдено ✓";
      completeBtn.disabled = true;
      setTimeout(function () {
        navigateInternally(getIndexUrlWithCourse());
      }, 250);
    });
  }

  function pluralizeRu(count, forms) {
    var n = Math.abs(Number(count) || 0);
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "");
  }

  function showDashboardLoading() {
    var list = document.getElementById("lessonsContainer");
    var box = document.getElementById("stateBox");
    box.hidden = false;
    box.textContent = "Загрузка уроков...";
    list.innerHTML = [
      '<div class="lesson-card skeleton" aria-hidden="true" style="height:220px"></div>',
      '<div class="lesson-card skeleton" aria-hidden="true" style="height:220px"></div>'
    ].join("");
  }

  function showDashboardError(message) {
    document.getElementById("lessonsContainer").innerHTML = "";
    var box = document.getElementById("stateBox");
    box.hidden = false;
    box.textContent = message || "Ошибка загрузки данных";
  }

  async function init() {
    refreshStorageKeys();
    STARTUP_MODE = detectStartupMode();
    var shouldShowStartupScreen = STARTUP_MODE === "external";
    if (shouldShowStartupScreen && window.StartupScreen && typeof window.StartupScreen.show === "function") {
      window.StartupScreen.show();
    }
    console.log("activeCourseId:", getActiveCourseId());
    var config = getConfig();
    var themeId = "dark_premium";
    var courseSettings = { theme_id: "dark_premium", addon_nutrition_calculator: false, addon_eva_calculator: false, addon_emotion_navigator: false, addon_designer_xp: false, addon_forms_enabled: false, addon_agreement_enabled: false, access_mode: null };
    try {
      courseSettings = await fetchCourseSettings(config);
      themeId = courseSettings.theme_id;
    } catch (error) {
      console.error(error);
    }
    COURSE_ACCESS = await fetchCourseAccessInfo();
    COURSE_SETTINGS = courseSettings;
    if (isPreviewMode()) {
      var previewThemeId = getPreviewThemeId();
      if (previewThemeId) themeId = previewThemeId;
    }
    applyTheme(config, themeId);
    if (globalThis.CourseAppPlatform && typeof globalThis.CourseAppPlatform.whenReady === "function") {
      await globalThis.CourseAppPlatform.whenReady({ telegramTimeoutMs: 1800 });
    }
    initTelegramViewport();
    await initStorage();
    APP_PROFILE = await getProfile();
    if (isNutritionCalculatorEnabled(COURSE_SETTINGS)
      && globalThis.NutritionCalculator
      && typeof globalThis.NutritionCalculator.create === "function") {
      NUTRITION = globalThis.NutritionCalculator.create({
        storage: APP_STORAGE,
        onPlanSaved: function () {
          if (document.body.getAttribute("data-page") === "dashboard") {
            void renderNutritionCard();
          }
        },
        getLessonLink: getNutritionLessonLink
      });
    } else {
      NUTRITION = null;
    }


    var page = document.body.getAttribute("data-page");
    if (page === "dashboard") {
      showDashboardLoading();
    }

    try {
      var entryAccess = await checkCourseEntryAccess();
      if (entryAccess.allowed !== true) {
        if (window.StartupScreen && typeof window.StartupScreen.hide === "function") window.StartupScreen.hide();
        renderCourseEntryAccessDenied(entryAccess);
        return;
      }

      var lessons = await fetchLessons(config);
      LAST_LESSONS = lessons.slice();
      CURRENT_COURSE = await fetchCurrentCourseInfo();
      await saveWebAppAccess();

      var courseAccessResult = await checkCourseAccess();
      if (!courseAccessResult.allowed) {
        if (window.StartupScreen && typeof window.StartupScreen.hide === "function") window.StartupScreen.hide();
        renderCourseEntryAccessDenied(courseAccessResult);
        return;
      }

      var renderCourseInterface = async function () {
        if (page === "dashboard") await fetchCourseForms();
        if (page === "dashboard") await renderDashboard(lessons, config);
        if (page === "lesson") await renderLesson(lessons);
        if (window.StartupScreen && typeof window.StartupScreen.hide === "function") window.StartupScreen.hide();
      };

      try {
        var agreementIsOpen = await ensureAgreementAcceptedBeforeCourse(renderCourseInterface);
        if (agreementIsOpen) return;
      } catch (agreementError) {
        console.warn("MindCore agreement error:", agreementError);
        showAgreementLoadError(function () { window.location.reload(); });
        return;
      }

      await renderCourseInterface();
    } catch (error) {
      if (shouldShowStartupScreen && window.StartupScreen && typeof window.StartupScreen.showError === "function") {
        window.StartupScreen.showError();
        return;
      }
      if (page === "dashboard") {
        showDashboardError(error.message || "Ошибка загрузки данных");
      } else {
        var stateBox = document.getElementById("lessonState");
        stateBox.classList.remove("skeleton");
        stateBox.textContent = error.message || "Не удалось загрузить урок.";
      }
    }
  }
// Делает всю карточку урока кликабельной
document.addEventListener("click", function (e) {
  var link = e.target.closest("a[href]");
  if (!link || link.target || link.hasAttribute("download")) return;

  var targetUrl;
  try {
    targetUrl = new URL(link.getAttribute("href"), window.location.href);
  } catch (error) {
    return;
  }

  if (targetUrl.origin !== window.location.origin) return;
  if (!/\/(?:index|lesson)\.html$/i.test(targetUrl.pathname)) return;
  markInternalNavigation(targetUrl.toString());
}, true);

document.addEventListener("click", function (e) {

  var card = e.target.closest(".lesson-card");
  if (!card) return;

  // если нажали на кнопку — пусть работает как раньше
  if (e.target.closest(".btn")) return;

  var button = card.querySelector(".btn");
  if (button) {
    button.click();
  }

});


  async function refreshPreviewDataWithoutReload() {
    if (!isPreviewMode()) return;

    var config = getConfig();
    var page = document.body.getAttribute("data-page");

    try {
      var themeId = "dark_premium";
      var courseSettings = { theme_id: "dark_premium", addon_nutrition_calculator: false, addon_eva_calculator: false, addon_emotion_navigator: false, addon_designer_xp: false, addon_forms_enabled: false, addon_agreement_enabled: false, access_mode: null };
      try {
        courseSettings = await fetchCourseSettings(config);
        themeId = courseSettings.theme_id;
      } catch (error) {
        console.error(error);
      }
      COURSE_ACCESS = await fetchCourseAccessInfo();
      COURSE_SETTINGS = courseSettings;

      if (isNutritionCalculatorEnabled(COURSE_SETTINGS)
        && !NUTRITION
        && globalThis.NutritionCalculator
        && typeof globalThis.NutritionCalculator.create === "function") {
        NUTRITION = globalThis.NutritionCalculator.create({
          storage: APP_STORAGE,
          onPlanSaved: function () {
            if (document.body.getAttribute("data-page") === "dashboard") {
              void renderNutritionCard();
            }
          },
          getLessonLink: getNutritionLessonLink
        });
      }

      if (!isNutritionCalculatorEnabled(COURSE_SETTINGS)) {
        NUTRITION = null;
      }


      themeId = (previewThemeOverride && (previewThemeOverride.id || previewThemeOverride.theme_id || previewThemeOverride.slug))
        ? normalizeThemeId(previewThemeOverride.id || previewThemeOverride.theme_id || previewThemeOverride.slug)
        : (getPreviewThemeId() || themeId);
      applyTheme(config, themeId);

      var lessons = await fetchLessons(config);
      LAST_LESSONS = lessons.slice();
      CURRENT_COURSE = await fetchCurrentCourseInfo();

      if (page === "dashboard") {
        await renderDashboard(lessons, config);
        return;
      }

      if (page === "lesson") {
        var lessonId = new URLSearchParams(window.location.search).get("id");
        if (lessonId) {
          var lessonExists = lessons.some(function (lesson) {
            return lesson.lesson_id === lessonId;
          });
          if (!lessonExists) {
            var stateBox = document.getElementById("lessonState");
            var main = document.getElementById("lessonMain");
            if (main) main.hidden = true;
            if (stateBox) {
              stateBox.hidden = false;
              stateBox.classList.remove("skeleton");
              stateBox.textContent = "Урок не найден для выбранного курса.";
            }
            return;
          }
        }

        await renderLesson(lessons);
      }
    } catch (error) {
      console.error("[preview] refresh data failed", error);
    }
  }

  function navigatePreviewToLesson(lessonId) {
    if (!lessonId) return;

    var nextId = String(lessonId);
    var currentUrl = new URL(window.location.href);
    var isLessonPage = /\/lesson\.html$/i.test(currentUrl.pathname);
    var currentLessonId = currentUrl.searchParams.get("id");
    var currentCourseId = currentUrl.searchParams.get("course") || getActiveCourseId();

    if (isLessonPage && currentLessonId === nextId) {
      return;
    }

    var targetUrl = new URL(appendPreviewParams("lesson.html"), window.location.href);
    targetUrl.searchParams.set("id", nextId);
    if (currentCourseId) {
      targetUrl.searchParams.set("course", currentCourseId);
    }
    targetUrl.searchParams.set("preview", "1");
    if (previewThemeOverride && (previewThemeOverride.id || previewThemeOverride.theme_id || previewThemeOverride.slug)) {
      targetUrl.searchParams.set("preview_theme", normalizeThemeId(previewThemeOverride.id || previewThemeOverride.theme_id || previewThemeOverride.slug));
    }

    navigateInternally(targetUrl.toString());
  }

  function navigatePreviewToHome() {
    var targetUrl = new URL(appendPreviewParams("index.html"), window.location.href);
    var courseId = getActiveCourseId();
    if (courseId) {
      targetUrl.searchParams.set("course", courseId);
    }
    targetUrl.searchParams.set("preview", "1");
    if (previewThemeOverride && (previewThemeOverride.id || previewThemeOverride.theme_id || previewThemeOverride.slug)) {
      targetUrl.searchParams.set(
        "preview_theme",
        normalizeThemeId(previewThemeOverride.id || previewThemeOverride.theme_id || previewThemeOverride.slug)
      );
    } else {
      var previewThemeId = getPreviewThemeId();
      if (previewThemeId) {
        targetUrl.searchParams.set("preview_theme", previewThemeId);
      }
    }
    navigateInternally(targetUrl.toString());
  }

  window.addEventListener("message", async function (event) {
    if (!isPreviewMode()) return;
    if (event.origin !== window.location.origin) return;
    var data = event && event.data;
    if (!data || !data.type) return;

    if (data.type === "mindcore:apply-preview-theme") {
      var theme = data.theme;
      console.log("[preview] received theme", theme);
      previewThemeOverride = theme || null;
      applyThemeToWebApp(previewThemeOverride);
      return;
    }

    if (data.type === "mindcore:refresh-preview-data") {
      await refreshPreviewDataWithoutReload();
      if (previewThemeOverride) {
        applyThemeToWebApp(previewThemeOverride);
      }
      return;
    }

    if (data.type === "mindcore:navigate-preview") {
      if (data.target === "lesson" && data.lessonId) {
        navigatePreviewToLesson(data.lessonId);
        return;
      }

      if (data.target === "home") {
        navigatePreviewToHome();
      }
    }
  });

  init();
})();
