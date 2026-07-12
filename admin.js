(function () {
  "use strict";

  var state = {
    lessons: [],
    selectedLesson: null,
    selectedThemeId: "dark_premium",
    blocks: [],
    blockGroups: [],
    blockItemsByBlockId: {},
    quills: {},
    activeSectionId: null,
    activeSectionTab: "text",
    dnd: {
      draggedBlockId: null,
      dropTargetBlockId: null,
      dropPosition: null,
      originalOrder: null,
      dropHappened: false
    },
    lessonDnd: {
      draggedLessonId: null,
      originalOrder: null,
      dropHappened: false
    },
    activeAdminTab: "content",
    activeStudentsTab: "list",
    students: [],
    studentsLoading: false,
    studentsError: null,
    studentsLoaded: false,
    studentsSearch: "",
    studentsStatusFilter: "all",
    selectedStudentKey: null,
    studentAccessDrafts: {},
    studentFormAnswers: {},
    courseAccessSettings: null,
    savedCourseAccessSettings: null,
    courseAccessSaving: false
  };
  state.savedThemeId = "dark_premium";
  var tooltipState = {
    activeTrigger: null,
    popover: null,
    closeTimer: null
  };
  var ALLOWED_PREVIEW_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var MAX_PREVIEW_FILE_SIZE = 5 * 1024 * 1024;
  var ALLOWED_LESSON_FILE_MIME_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "application/x-zip-compressed", "application/vnd.rar", "application/x-rar-compressed", "image/png", "image/jpeg", "image/webp"];
  var ALLOWED_LESSON_FILE_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "rar", "png", "jpg", "jpeg", "webp"];
  var MAX_LESSON_FILE_SIZE = 10 * 1024 * 1024;
  var currentAccountId = null;
  var currentAccount = null;
  var TARIFF_LIMITS = {
    trial: { label: "Пробный", courses: 1, lessonsPerCourse: 3 },
    basic: { label: "Basic", courses: 2, lessonsPerCourse: 30 },
    pro: { label: "Pro", courses: 5, lessonsPerCourse: 100 }
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
  var WEBAPP_THEMES = Array.isArray(window.APP_THEME_PRESETS) && window.APP_THEME_PRESETS.length ? window.APP_THEME_PRESETS.slice() : [
    { id: "dark_premium", name: "Dark Premium", description: "Тёмно-синий фон с фиолетовым акцентом" },
    { id: "light_clean", name: "Light Clean", description: "Светлый минимализм" },
    { id: "fitness_power", name: "Fitness Power", description: "Тёмный зелёный фитнес-стиль" },
    { id: "soft_women", name: "Soft Women", description: "Светлый нюд/розовый стиль" },
    { id: "business_black", name: "Business Black", description: "Графит/чёрный/золото" },
    { id: "wow_glass", name: "Wow Glass", description: "Премиальный glass-стиль с живым свечением" },
    { id: "matcha_aesthetic", title: "Matcha Aesthetic", name: "Matcha Aesthetic", description: "Нежный розово-зелёный стиль с акцентом матча", className: "theme-matcha-aesthetic", previewTokens: { bg: "#FFFDF8", card: "#FFFFFF", card2: "#FFF4F7", text: "#332522", muted: "#8C6F66", accent: "#FF5F93", accent2: "#9FD267", border: "rgba(255, 95, 147, 0.22)" } },
    { id: "emerald_gold", title: "Emerald Gold", name: "Emerald Gold", description: "Глубокий изумрудный стиль с золотым премиум-акцентом", className: "theme-emerald-gold", badge: "Premium", previewTokens: { bg: "#033F47", card: "rgba(3, 67, 74, 0.84)", card2: "rgba(5, 86, 92, 0.76)", text: "#F8F1D9", muted: "#B8C7B0", accent: "#D4A017", accent2: "#0FA3B1", border: "rgba(212, 160, 23, 0.28)" } }
  ];
  var ACTIVATION_BOT_URL = "https://t.me/mindcore_miniapp_bot?start=activate";
  var currentPreviewTheme = null;
  var currentPreviewThemeId = null;
  var isPreviewIframeLoadBound = false;
  var isMobilePreviewLoadBound = false;

  function isMobileViewport() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  }

  function isMobilePreviewOpen() {
    var modal = document.getElementById("mobilePreviewModal");
    return Boolean(modal && !modal.hidden && modal.classList.contains("is-open"));
  }

  function getDesktopPreviewIframe() {
    return document.querySelector("#live-preview-iframe")
      || document.querySelector("[data-live-preview-iframe]")
      || document.querySelector("#previewIframe");
  }

  function getMobilePreviewIframe() {
    return document.getElementById("mobilePreviewIframe");
  }


  
  function getPreviewUrl(previewThemeId) {
    var url = new URL("index.html", window.location.href);
    url.searchParams.set("preview", "1");
    var courseId = getActiveCourseId();
    if (courseId) {
      url.searchParams.set("course", courseId);
    }
    var normalizedPreviewThemeId = normalizeThemeId(previewThemeId);
    if (normalizedPreviewThemeId) {
      url.searchParams.set("preview_theme", normalizedPreviewThemeId);
    }
    return url.toString();
  }

  function getPreviewIframe() {
    if (isMobileViewport() && isMobilePreviewOpen()) {
      return getMobilePreviewIframe() || getDesktopPreviewIframe();
    }
    return getDesktopPreviewIframe();
  }

  function getPreviewScreenState() {
    var iframe = getPreviewIframe();
    var fallback = { page: "index", lessonId: null };
    if (!iframe) return fallback;
    var rawSrc = iframe.getAttribute("src") || "";
    if (!rawSrc) return fallback;
    try {
      var srcUrl = new URL(rawSrc, window.location.href);
      var isLessonPage = /\/lesson\.html$/i.test(srcUrl.pathname);
      return { page: isLessonPage ? "lesson" : "index", lessonId: srcUrl.searchParams.get("id") };
    } catch (error) {
      return fallback;
    }
  }

  function setPreviewIframeUrlForScreen(screenState, previewThemeId) {
    var iframe = getPreviewIframe();
    if (!iframe) return;
    var normalizedPreviewThemeId = normalizeThemeId(previewThemeId || currentPreviewThemeId || state.selectedThemeId);
    var nextUrl;
    if (screenState && screenState.page === "lesson" && screenState.lessonId) {
      nextUrl = new URL("lesson.html", window.location.href);
      nextUrl.searchParams.set("id", String(screenState.lessonId));
      nextUrl.searchParams.set("preview", "1");
      nextUrl.searchParams.set("preview_theme", normalizedPreviewThemeId);
      var courseId = getActiveCourseId();
      if (courseId) nextUrl.searchParams.set("course", courseId);
    } else {
      nextUrl = new URL(getPreviewUrl(normalizedPreviewThemeId), window.location.href);
    }
    iframe.setAttribute("src", nextUrl.toString());
  }

  function updatePreviewThemeInCurrentUrl(themeId) {
    var iframe = getPreviewIframe();
    if (!iframe) return;

    var normalizedThemeId = normalizeThemeId(themeId || currentPreviewThemeId || state.selectedThemeId);
    var currentUrl;

    try {
      currentUrl = iframe.contentWindow && iframe.contentWindow.location && iframe.contentWindow.location.href
        ? new URL(iframe.contentWindow.location.href)
        : new URL(iframe.getAttribute("src") || iframe.src, window.location.origin);
    } catch (error) {
      currentUrl = new URL(iframe.getAttribute("src") || iframe.src || getPreviewUrl(normalizedThemeId), window.location.origin);
    }

    currentUrl.searchParams.set("preview", "1");
    currentUrl.searchParams.set("preview_theme", normalizedThemeId);
    var courseId = getActiveCourseId();
    if (courseId) currentUrl.searchParams.set("course", courseId);

    iframe.src = currentUrl.toString();
  }

  function sendPreviewMessage(message) {
    var iframe = getPreviewIframe();
    if (!iframe || !iframe.contentWindow) {
      console.warn("[preview] iframe not ready", message);
      return;
    }
    iframe.contentWindow.postMessage(message, window.location.origin);
  }

  function applyCurrentPreviewTheme() {
    if (!currentPreviewTheme) return;

    sendPreviewMessage({
      type: "mindcore:apply-preview-theme",
      theme: currentPreviewTheme
    });
  }

  function refreshPreviewData() {
    sendPreviewMessage({
      type: "mindcore:refresh-preview-data"
    });
    setTimeout(function () {
      applyCurrentPreviewTheme();
    }, 100);
  }

  function navigatePreviewToLesson(lessonId) {
    if (!lessonId) return;
    setPreviewIframeUrlForScreen({ page: "lesson", lessonId: String(lessonId) }, currentPreviewThemeId || state.selectedThemeId);
    sendPreviewMessage({
      type: "mindcore:navigate-preview",
      target: "lesson",
      lessonId: String(lessonId)
    });
  }

  function initPreviewIframe() {
    var iframe = getPreviewIframe();
    if (!iframe) return;
    setPreviewIframeUrlForScreen({ page: "index", lessonId: null }, currentPreviewThemeId || state.selectedThemeId);
    if (!isPreviewIframeLoadBound) {
      iframe.addEventListener("load", function () {
        setTimeout(function () {
          applyCurrentPreviewTheme();
        }, 100);
      });
      isPreviewIframeLoadBound = true;
    }
  }

  function openMobilePreviewModal() {
    if (!isMobileViewport()) return;
    var modal = document.getElementById("mobilePreviewModal");
    var button = document.getElementById("mobilePreviewToggleBtn");
    var mobileIframe = getMobilePreviewIframe();
    var desktopIframe = getDesktopPreviewIframe();
    if (!modal || !button || !mobileIframe || !desktopIframe) return;

    var src = desktopIframe.getAttribute("src") || desktopIframe.src || getPreviewUrl(currentPreviewThemeId || state.selectedThemeId);
    if (src) mobileIframe.setAttribute("src", src);

    modal.hidden = false;
    modal.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-mobile-preview-open");

    setTimeout(function () {
      applyCurrentPreviewTheme();
    }, 80);

    if (!isMobilePreviewLoadBound) {
      mobileIframe.addEventListener("load", function () {
        applyCurrentPreviewTheme();
      });
      isMobilePreviewLoadBound = true;
    }
  }

  function closeMobilePreviewModal() {
    var modal = document.getElementById("mobilePreviewModal");
    var button = document.getElementById("mobilePreviewToggleBtn");
    if (!modal || modal.hidden) return;

    modal.classList.remove("is-open");
    modal.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-mobile-preview-open");
  }

function getDefaultAdminTab() {
    try {
      var stored = window.localStorage.getItem("admin_active_tab");
      if (stored === "appearance" || stored === "lesson_settings" || stored === "content" || stored === "students" || stored === "connections") {
        return stored;
      }
    } catch (error) {}
    return "appearance";
  }

  function getDefaultStudentsTab() {
    try {
      var stored = window.localStorage.getItem("admin_students_active_tab");
      if (stored === "list" || stored === "access_settings") {
        return stored;
      }
    } catch (error) {}
    return "list";
  }

  function setActiveStudentsTab(tabId) {
    var nextTab = tabId === "access_settings" ? "access_settings" : "list";
    state.activeStudentsTab = nextTab;

    document.querySelectorAll("[data-students-tab]").forEach(function (btn) {
      var isActive = btn.getAttribute("data-students-tab") === nextTab;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    document.querySelectorAll("[data-students-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-students-panel") !== nextTab;
    });

    if (nextTab === "list" && state.activeAdminTab === "students" && !state.studentsLoading && !state.studentsLoaded) {
      void loadCourseStudents(getActiveCourseId()).catch(function () {});
    }

    try {
      window.localStorage.setItem("admin_students_active_tab", nextTab);
    } catch (error) {}
  }

  function setActiveAdminTab(tabId) {
    var nextTab = (tabId === "lesson_settings" || tabId === "content" || tabId === "students" || tabId === "connections") ? tabId : "appearance";
    state.activeAdminTab = nextTab;

    var isStudentsTab = nextTab === "students";
    var layout = document.querySelector(".admin-layout");
    if (layout) {
      layout.classList.toggle("admin-layout--students", isStudentsTab);
      layout.setAttribute("data-admin-layout-mode", isStudentsTab ? "students" : "default");
    }

    var livePreviewColumn = document.querySelector(".admin-live-preview-column");
    if (livePreviewColumn) {
      livePreviewColumn.setAttribute("aria-hidden", isStudentsTab ? "true" : "false");
    }

    var mobilePreviewToggleBtn = document.getElementById("mobilePreviewToggleBtn");
    if (mobilePreviewToggleBtn) {
      mobilePreviewToggleBtn.hidden = isStudentsTab;
      mobilePreviewToggleBtn.setAttribute("aria-hidden", isStudentsTab ? "true" : "false");
      if (isStudentsTab) {
        closeMobilePreviewModal();
      }
      mobilePreviewToggleBtn.addEventListener("click", function () {
        openMobilePreviewModal();
      });
    }

    document.querySelectorAll("[data-mobile-preview-close=\"true\"]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeMobilePreviewModal();
      });
    });

    document.querySelectorAll(".admin-top-tab").forEach(function (btn) {
      var isActive = btn.getAttribute("data-admin-tab") === nextTab;
      btn.classList.toggle("is-active", isActive);
    });

    document.querySelectorAll(".admin-tab-panel").forEach(function (panel) {
      var panelId = panel.getAttribute("data-admin-panel");
      var isContentPanel = panelId === "content";
      var isActive = isContentPanel
        ? (nextTab === "lesson_settings" || nextTab === "content")
        : panelId === nextTab;
      panel.hidden = !isActive;
    });

    updateLessonEditorPanelsVisibility();

    if (nextTab === "students") {
      setActiveStudentsTab(state.activeStudentsTab || getDefaultStudentsTab());
    }

    try {
      window.localStorage.setItem("admin_active_tab", nextTab);
    } catch (error) {}
  }

  function getCurrentWebAppUrl() {
    var origin = window.location.origin || "";
    var pathname = window.location.pathname || "/";

    var basePath = pathname;
    if (/\.[^/]+$/.test(basePath)) {
      basePath = basePath.replace(/[^/]*$/, "");
    }
    if (!basePath.endsWith("/")) {
      basePath += "/";
    }

    return origin + basePath;
  }

  function getTelegramWebAppUrl() {
    return getCurrentWebAppUrl() + "index.html?course=" + encodeURIComponent(getActiveCourseId());
  }

  function setTelegramStatus(message, isError) {
    var node = document.getElementById("telegramConnectionStatus");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
    node.classList.toggle("is-error", Boolean(isError));
    node.classList.toggle("is-success", Boolean(message) && !isError);
  }

  function renderTelegramConnectedState(integration) {
    var badge = document.getElementById("telegramConnectionBadge");
    if (badge) {
      badge.textContent = "Подключен";
      badge.classList.add("is-ready");
    }
    setTelegramStatus([
      "✅ Telegram подключен",
      "Бот: @" + (integration.telegram_bot_username || "—"),
      "Кнопка: " + (integration.telegram_button_title || "—"),
      "Ссылка: " + (integration.telegram_webapp_url || "—")
    ].join("\n"), false);
  }


  function getStudentAccessState(student) {
    var productUser = student && student.productUser ? student.productUser : student || {};
    var status = String(productUser.status || "").toLowerCase();
    var expiresAt = productUser.access_expires_at ? new Date(productUser.access_expires_at) : null;
    var isExpiredByDate = expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now();

    if (status === "blocked") return "blocked";
    if (status === "expired" || isExpiredByDate) return "expired";
    if (status === "completed") return "completed";
    if (status === "active") return "active";
    return status || "unknown";
  }

  function getStudentStatusLabel(student) {
    var stateName = getStudentAccessState(student);
    var labels = {
      active: "Активен",
      expired: "Истёк доступ",
      blocked: "Заблокирован",
      completed: "Завершил"
    };
    return labels[stateName] || stateName || "—";
  }

  function formatStudentDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatStudentDetailDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }


  function normalizeAccessDateInput(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function getStudentAccessOriginal(student) {
    var productUser = student && student.productUser ? student.productUser : {};
    return {
      isOpen: String(productUser.status || "").toLowerCase() !== "blocked",
      date: normalizeAccessDateInput(productUser.access_expires_at)
    };
  }

  function getStudentAccessDraft(student) {
    var key = getStudentKey(student);
    var original = getStudentAccessOriginal(student);
    var draft = key && state.studentAccessDrafts ? state.studentAccessDrafts[key] : null;
    if (!draft) return { isOpen: original.isOpen, date: original.date, dirty: false, saving: false, message: "", error: "" };
    return {
      isOpen: typeof draft.isOpen === "boolean" ? draft.isOpen : original.isOpen,
      date: typeof draft.date === "string" ? draft.date : original.date,
      dirty: Boolean(draft.dirty),
      saving: Boolean(draft.saving),
      message: draft.message || "",
      error: draft.error || ""
    };
  }

  function setStudentAccessDraft(studentKey, patch) {
    if (!studentKey) return;
    var student = (state.students || []).find(function (item) { return getStudentKey(item) === studentKey; });
    if (!student) return;
    var current = getStudentAccessDraft(student);
    var next = Object.assign({}, current, patch || {});
    var original = getStudentAccessOriginal(student);
    next.dirty = next.isOpen !== original.isOpen || next.date !== original.date;
    if (!next.dirty && !next.saving && !next.message && !next.error) {
      delete state.studentAccessDrafts[studentKey];
      return;
    }
    state.studentAccessDrafts[studentKey] = next;
  }

  function getAccessDateHint(dateValue) {
    if (!dateValue) return "Доступ без даты окончания";
    var selected = new Date(dateValue + "T23:59:59");
    if (Number.isNaN(selected.getTime())) return "Доступ без даты окончания";
    var now = new Date();
    var diffDays = Math.ceil((selected.getTime() - now.getTime()) / 86400000);
    if (diffDays >= 0) return "Осталось: " + diffDays + " " + getRussianDaysLabel(diffDays);
    var pastDays = Math.abs(diffDays);
    return "Истёк " + pastDays + " " + getRussianDaysLabel(pastDays) + " назад";
  }

  function getRussianDaysLabel(value) {
    var number = Math.abs(Number(value) || 0);
    var lastTwo = number % 100;
    var last = number % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "дней";
    if (last === 1) return "день";
    if (last >= 2 && last <= 4) return "дня";
    return "дней";
  }

  function serializeAccessExpiresAt(dateValue) {
    if (!dateValue) return null;
    var parts = String(dateValue).split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (part) { return !Number.isFinite(part); })) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).toISOString();
  }

  function getStudentKey(student) {
    var productUser = student && student.productUser ? student.productUser : {};
    return String(productUser.id || productUser.webapp_user_id || "");
  }

  function getStudentDisplayName(student) {
    var productUser = student && student.productUser ? student.productUser : {};
    var webappUser = student && student.webappUser ? student.webappUser : {};
    return productUser.user_display_name || webappUser.display_name || [webappUser.first_name, webappUser.last_name].filter(Boolean).join(" ") || "—";
  }

  function getStudentUsername(student) {
    var webappUser = student && student.webappUser ? student.webappUser : {};
    return webappUser.username ? "@" + String(webappUser.username).replace(/^@/, "") : "—";
  }

  function getStudentPlatformLabel(student) {
    var webappUser = student && student.webappUser ? student.webappUser : {};
    return webappUser.platform || "—";
  }

  function mergeProductUserWithWebAppUser(productUser, webappUsersById) {
    var webappUser = webappUsersById[String(productUser.webapp_user_id)] || null;
    return { productUser: productUser, webappUser: webappUser };
  }

  async function loadCourseStudents(courseId) {
    var client = getClient();
    if (!client) throw new Error("Supabase client not initialized");
    if (!courseId) throw new Error("Курс не выбран");

    state.studentsLoading = true;
    state.studentsError = null;
    state.studentsLoaded = false;
    state.studentAccessDrafts = {};
    renderStudentsSection();

    try {
      var productResult = await client
        .from("product_users")
        .select("id,course_id,webapp_user_id,user_display_name,status,access_started_at,access_expires_at,created_at,updated_at,last_seen_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });

      if (productResult.error) throw productResult.error;

      var productUsers = productResult.data || [];
      var userIds = productUsers
        .map(function (student) { return student.webapp_user_id; })
        .filter(function (id, index, list) { return id && list.indexOf(id) === index; });
      var webappUsersById = {};

      if (userIds.length) {
        var usersResult = await client
          .from("webapp_users")
          .select("id,platform,platform_user_id,telegram_id,vk_id,max_id,first_name,last_name,username,display_name,avatar_url,last_seen_at")
          .in("id", userIds);

        if (usersResult.error) throw usersResult.error;
        (usersResult.data || []).forEach(function (user) {
          webappUsersById[String(user.id)] = user;
        });
      }

      state.students = productUsers.map(function (productUser) {
        return mergeProductUserWithWebAppUser(productUser, webappUsersById);
      });
      state.studentsLoaded = true;
    } catch (error) {
      console.warn("Не удалось загрузить учеников курса", error);
      state.students = [];
      state.studentsError = "Не удалось загрузить учеников. Попробуйте обновить страницу.";
      state.studentsLoaded = true;
      throw error;
    } finally {
      state.studentsLoading = false;
      renderStudentsSection();
    }

    return state.students;
  }

  function getStudentSearchText(student) {
    var productUser = student.productUser || {};
    var webappUser = student.webappUser || {};
    return [
      productUser.user_display_name,
      webappUser.display_name,
      webappUser.username,
      webappUser.platform_user_id,
      webappUser.telegram_id,
      webappUser.vk_id,
      webappUser.max_id
    ].join(" ").toLowerCase();
  }

  function filterStudents(students) {
    var query = String(state.studentsSearch || "").trim().toLowerCase();
    var statusFilter = state.studentsStatusFilter || "all";
    return (students || []).filter(function (student) {
      var matchesSearch = !query || getStudentSearchText(student).indexOf(query) !== -1;
      var matchesStatus = statusFilter === "all" || getStudentAccessState(student) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  function getStudentsCountLabel(count) {
    var value = Math.abs(Number(count) || 0);
    var lastTwo = value % 100;
    var last = value % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return count + " учеников";
    if (last === 1) return count + " ученик";
    if (last >= 2 && last <= 4) return count + " ученика";
    return count + " учеников";
  }

  function renderStudentsMetrics(students) {
    var container = document.getElementById("studentsMetrics");
    var countBadge = document.getElementById("studentsCountBadge");
    if (countBadge) {
      countBadge.textContent = state.studentsLoading ? "Обновляется автоматически" : getStudentsCountLabel((students || []).length);
    }
    if (!container) return;
    var totals = { total: students.length, active: 0, expired: 0, blocked: 0 };
    students.forEach(function (student) {
      var accessState = getStudentAccessState(student);
      if (accessState === "active") totals.active += 1;
      if (accessState === "expired") totals.expired += 1;
      if (accessState === "blocked") totals.blocked += 1;
    });
    var cards = [
      ["Всего учеников", totals.total],
      ["Активных", totals.active],
      ["Доступ истёк", totals.expired],
      ["Заблокированных", totals.blocked]
    ];
    container.innerHTML = cards.map(function (card) {
      return '<article class="admin-students-metric"><span>' + escapeHtml(card[0]) + '</span><strong>' + escapeHtml(card[1]) + '</strong></article>';
    }).join("");
  }


  function getStudentFormsState(student) {
    var productUser = student && student.productUser ? student.productUser : {};
    var key = productUser.id ? String(productUser.id) : "";
    return state.studentFormAnswers[key] || { loading: false, loaded: false, error: null, forms: [], answersByFormId: {} };
  }

  function flattenFormAnswerValue(value, items) {
    if (Array.isArray(value)) {
      value.forEach(function (item) { if (String(item || "").trim()) items.push(String(item).trim()); });
      return;
    }
    if (value && typeof value === "object") {
      if (Array.isArray(value.selected)) {
        value.selected.forEach(function (item) { if (String(item || "").trim()) items.push(String(item).trim()); });
      }
      if (String(value.other || "").trim()) items.push(String(value.other).trim());
      return;
    }
    if (String(value || "").trim()) items.push(String(value).trim());
  }

  function getAnswerSummaryItems(answer) {
    var summary = answer && answer.summary;
    if (Array.isArray(summary)) {
      var arrayItems = [];
      summary.forEach(function (item) { flattenFormAnswerValue(item, arrayItems); });
      return arrayItems;
    }
    if (typeof summary === "string" && summary.trim()) {
      try {
        var parsed = JSON.parse(summary);
        if (Array.isArray(parsed)) {
          var parsedItems = [];
          parsed.forEach(function (item) { flattenFormAnswerValue(item, parsedItems); });
          return parsedItems;
        }
      } catch (error) {
        return [summary.trim()];
      }
      return [summary.trim()];
    }
    var answersJson = answer && answer.answers_json;
    if (typeof answersJson === "string") {
      try { answersJson = JSON.parse(answersJson); } catch (error) { answersJson = null; }
    }
    if (answersJson && typeof answersJson === "object") {
      var items = [];
      Object.keys(answersJson).forEach(function (key) { flattenFormAnswerValue(answersJson[key], items); });
      return items;
    }
    return [];
  }

  function StudentFormsSections(student) {
    var formsState = getStudentFormsState(student);
    if (formsState.loading || !formsState.loaded) {
      return '<article class="admin-student-details-section"><span class="admin-student-details-section-icon" aria-hidden="true">⌁</span><span><strong>Формы</strong><em>Загружаем ответы…</em></span></article>';
    }
    if (formsState.error) {
      return '<article class="admin-student-details-section"><span class="admin-student-details-section-icon" aria-hidden="true">⌁</span><span><strong>Формы</strong><em>Не удалось загрузить ответы</em></span></article>';
    }
    if (!formsState.forms.length) return '';
    return formsState.forms.map(function (form) {
      var answer = formsState.answersByFormId[String(form.id)] || null;
      var items = getAnswerSummaryItems(answer);
      var submittedAt = answer && (answer.submitted_at || answer.updated_at || answer.created_at);
      var body = answer
        ? (items.length ? '<ul>' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join("") + '</ul>' : '<em>Ответ сохранён</em>') + '<em>Заполнено: ' + escapeHtml(formatStudentDate(submittedAt)) + '</em>'
        : '<em>Пока не заполнена</em>';
      return '<article class="admin-student-details-section"><span class="admin-student-details-section-icon" aria-hidden="true">⌁</span><span><strong>' + escapeHtml(form.title || "Форма") + '</strong>' + body + '</span></article>';
    }).join("");
  }

  function StudentDetailsCard(student) {
    if (!student) return "";
    var productUser = student.productUser || {};
    var webappUser = student.webappUser || {};
    var name = getStudentDisplayName(student);
    var username = getStudentUsername(student);
    var platform = getStudentPlatformLabel(student);
    var avatarUrl = webappUser.avatar_url || "";
    var initials = name === "—" ? "?" : name.split(" ").filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
    var lastSeen = productUser.last_seen_at || webappUser.last_seen_at;
    var formSectionsHtml = StudentFormsSections(student);
    var sections = [
      ["✓", "Домашние задания", "Пока нет данных"],
      ["↗", "Аналитика", "Будет доступна позже"]
    ];
    return [
      '<article class="admin-student-details-panel" aria-label="Карточка ученика">',
      '<button class="admin-student-details-close" type="button" data-student-details-close aria-label="Закрыть карточку">×</button>',
      '<header class="admin-student-details-header">',
      '<div class="admin-student-details-avatar">' + (avatarUrl ? '<img src="' + escapeAttr(avatarUrl) + '" alt="">' : escapeHtml(initials)) + '</div>',
      '<div class="admin-student-details-title"><span>' + escapeHtml(platform) + '</span><h3>' + escapeHtml(name) + '</h3><p>' + escapeHtml(username) + '</p><span class="admin-student-status admin-student-status--' + escapeAttr(getStudentAccessState(student)) + '">● ' + escapeHtml(getStudentStatusLabel(student)) + '</span></div>',
      '</header>',
      '<dl class="admin-student-details-dates">',
      '<div><dt>Первый вход</dt><dd>' + escapeHtml(formatStudentDetailDate(productUser.created_at)) + '</dd></div>',
      '<div><dt>Последний вход</dt><dd>' + escapeHtml(formatStudentDetailDate(lastSeen)) + '</dd></div>',
      '<div><dt>Доступ с</dt><dd>' + escapeHtml(formatStudentDetailDate(productUser.access_started_at)) + '</dd></div>',
      '<div><dt>Доступ до</dt><dd>' + escapeHtml(formatStudentDetailDate(productUser.access_expires_at)) + '</dd></div>',
      '</dl>',
      StudentAccessControl(student),
      '<div class="admin-student-details-sections">' + formSectionsHtml + sections.map(function (section) { return '<article class="admin-student-details-section"><span class="admin-student-details-section-icon" aria-hidden="true">' + escapeHtml(section[0]) + '</span><span><strong>' + escapeHtml(section[1]) + '</strong><em>' + escapeHtml(section[2]) + '</em></span></article>'; }).join("") + '</div>',
      '</article>'
    ].join("");
  }


  function StudentAccessControl(student) {
    var studentKey = getStudentKey(student);
    var draft = getStudentAccessDraft(student);
    var switchId = "student-access-switch-" + studentKey.replace(/[^a-zA-Z0-9_-]/g, "-");
    var dateId = "student-access-date-" + studentKey.replace(/[^a-zA-Z0-9_-]/g, "-");
    return [
      '<section class="admin-student-access-control" data-student-access-control data-student-key="' + escapeAttr(studentKey) + '">',
      '<div class="admin-student-access-control__head"><span>Управление доступом</span></div>',
      '<div class="admin-student-access-control__grid">',
      '<label class="admin-student-access-switch" for="' + escapeAttr(switchId) + '">',
      '<input id="' + escapeAttr(switchId) + '" type="checkbox" data-student-access-status' + (draft.isOpen ? ' checked' : '') + (draft.saving ? ' disabled' : '') + ' />',
      '<span class="admin-student-access-switch__track" aria-hidden="true"><span></span></span>',
      '<strong>' + escapeHtml(draft.isOpen ? "Доступ открыт" : "Доступ заблокирован") + '</strong>',
      '</label>',
      '<label class="admin-student-access-date" for="' + escapeAttr(dateId) + '">',
      '<span>Доступ до</span>',
      '<input id="' + escapeAttr(dateId) + '" type="date" data-student-access-date value="' + escapeAttr(draft.date) + '"' + (draft.saving ? ' disabled' : '') + ' />',
      '</label>',
      '</div>',
      '<p class="admin-student-access-hint">' + escapeHtml(getAccessDateHint(draft.date)) + (draft.date ? '' : ' · Без ограничения по дате') + '</p>',
      (draft.dirty || draft.saving ? '<div class="admin-student-access-actions"><button class="admin-btn-ghost" type="button" data-student-access-cancel' + (draft.saving ? ' disabled' : '') + '>Отменить</button><button class="admin-btn-ghost admin-student-access-save" type="button" data-student-access-save' + (draft.saving ? ' disabled' : '') + '>' + (draft.saving ? 'Сохраняем…' : 'Сохранить') + '</button></div>' : ''),
      (draft.message || draft.error ? '<p class="admin-student-access-message' + (draft.error ? ' is-error' : ' is-success') + '">' + escapeHtml(draft.error || draft.message) + '</p>' : ''),
      '</section>'
    ].join("");
  }

  async function saveStudentAccess(studentKey) {
    var client = getClient();
    var courseId = getActiveCourseId();
    var student = (state.students || []).find(function (item) { return getStudentKey(item) === studentKey; });
    if (!client || !courseId || !student || !student.productUser || !student.productUser.id) return;
    var draft = getStudentAccessDraft(student);
    setStudentAccessDraft(studentKey, { saving: true, message: "", error: "" });
    renderStudentsSection();
    var payload = {
      status: draft.isOpen ? "active" : "blocked",
      access_expires_at: serializeAccessExpiresAt(draft.date),
      updated_at: new Date().toISOString()
    };
    try {
      var result = await client
        .from("product_users")
        .update(payload)
        .eq("id", student.productUser.id)
        .eq("course_id", courseId)
        .select("id,course_id,webapp_user_id,user_display_name,status,access_started_at,access_expires_at,created_at,updated_at,last_seen_at")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Запись ученика не найдена в текущем курсе.");
      student.productUser = result.data;
      state.studentAccessDrafts[studentKey] = { isOpen: payload.status !== "blocked", date: normalizeAccessDateInput(payload.access_expires_at), dirty: false, saving: false, message: "Изменения сохранены", error: "" };
      renderStudentsSection();
    } catch (error) {
      console.warn("Не удалось сохранить доступ ученика", error);
      setStudentAccessDraft(studentKey, { saving: false, error: "Не удалось сохранить изменения. Попробуйте ещё раз.", message: "" });
      renderStudentsSection();
    }
  }

  async function loadStudentFormAnswers(student) {
    var client = getClient();
    var courseId = getActiveCourseId();
    var productUser = student && student.productUser ? student.productUser : {};
    var productUserId = productUser.id;
    if (!client || !courseId || !productUserId) return;
    var key = String(productUserId);
    state.studentFormAnswers[key] = { loading: true, loaded: false, error: null, forms: [], answersByFormId: {} };
    renderStudentsSection();
    try {
      var formsResult = await client
        .from("course_forms")
        .select("*")
        .eq("course_id", courseId)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });
      if (formsResult.error) throw formsResult.error;
      var forms = formsResult.data || [];
      var answersByFormId = {};
      if (forms.length) {
        var answersResult = await client
          .from("course_form_answers")
          .select("*")
          .eq("course_id", courseId)
          .eq("product_user_id", productUserId);
        if (answersResult.error) throw answersResult.error;
        (answersResult.data || []).forEach(function (answer) {
          if (answer && answer.form_id && !answersByFormId[String(answer.form_id)]) answersByFormId[String(answer.form_id)] = answer;
        });
      }
      state.studentFormAnswers[key] = { loading: false, loaded: true, error: null, forms: forms, answersByFormId: answersByFormId };
    } catch (error) {
      console.warn("Не удалось загрузить ответы форм ученика", error);
      state.studentFormAnswers[key] = { loading: false, loaded: true, error: error, forms: [], answersByFormId: {} };
    }
    renderStudentsSection();
  }

  function ensureSelectedStudentFormsLoaded() {
    if (!state.selectedStudentKey) return;
    var student = (state.students || []).find(function (item) { return getStudentKey(item) === state.selectedStudentKey; });
    var productUserId = student && student.productUser && student.productUser.id;
    if (!student || !productUserId) return;
    var existing = state.studentFormAnswers[String(productUserId)];
    if (!existing || (!existing.loading && !existing.loaded)) void loadStudentFormAnswers(student);
  }

  function renderStudentsSection() {
    renderStudentsMetrics(state.students || []);
    var stateNode = document.getElementById("studentsState");
    var tableWrap = document.querySelector(".admin-students-table-wrap");
    var tbody = document.getElementById("studentsTableBody");
    if (!stateNode || !tableWrap || !tbody) return;

    if (state.studentsLoading) {
      stateNode.textContent = "Загружаем учеников...";
      stateNode.hidden = false;
      tableWrap.hidden = true;
      tbody.innerHTML = "";
      state.selectedStudentKey = null;
      return;
    }

    if (state.studentsError) {
      stateNode.textContent = state.studentsError;
      stateNode.hidden = false;
      tableWrap.hidden = true;
      tbody.innerHTML = "";
      state.selectedStudentKey = null;
      return;
    }

    var filteredStudents = filterStudents(state.students || []);
    if (!filteredStudents.length) {
      stateNode.textContent = state.students.length ? "По выбранным условиям ученики не найдены." : "Пока нет учеников. Они появятся здесь после первого входа в WebApp.";
      stateNode.hidden = false;
      tableWrap.hidden = true;
      tbody.innerHTML = "";
      state.selectedStudentKey = null;
      return;
    }

    stateNode.hidden = true;
    tableWrap.hidden = false;
    if (!filteredStudents.some(function (student) { return getStudentKey(student) === state.selectedStudentKey; })) state.selectedStudentKey = null;
    ensureSelectedStudentFormsLoaded();
    tbody.innerHTML = filteredStudents.map(function (student) {
      var productUser = student.productUser || {};
      var webappUser = student.webappUser || {};
      var name = getStudentDisplayName(student);
      var username = getStudentUsername(student);
      var lastSeen = productUser.last_seen_at || webappUser.last_seen_at;
      var studentKey = getStudentKey(student);
      var isSelected = studentKey === state.selectedStudentKey;
      var detailsId = 'student-details-' + studentKey.replace(/[^a-zA-Z0-9_-]/g, '-');
      return [
        '<tr class="admin-students-row' + (isSelected ? ' is-selected' : '') + '" data-student-key="' + escapeAttr(studentKey) + '" tabindex="0" aria-expanded="' + (isSelected ? 'true' : 'false') + '"' + (isSelected ? ' aria-controls="' + escapeAttr(detailsId) + '"' : '') + '>',
        '<td><span class="admin-student-row-title"><span class="admin-student-row-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M6 4l4 4-4 4" /></svg></span><strong>' + escapeHtml(name) + '</strong></span></td>',
        '<td>' + escapeHtml(webappUser.platform || "—") + '</td>',
        '<td>' + escapeHtml(username) + '</td>',
        '<td><span class="admin-student-status admin-student-status--' + escapeAttr(getStudentAccessState(student)) + '">' + escapeHtml(getStudentStatusLabel(student)) + '</span></td>',
        '<td>' + escapeHtml(formatStudentDate(productUser.access_started_at)) + '</td>',
        '<td>' + escapeHtml(formatStudentDate(productUser.access_expires_at)) + '</td>',
        '<td>' + escapeHtml(formatStudentDate(lastSeen)) + '</td>',
        '</tr>',
        isSelected ? '<tr id="' + escapeAttr(detailsId) + '" class="admin-student-details-row"><td colspan="7"><div class="admin-student-details-accordion">' + StudentDetailsCard(student) + '</div></td></tr>' : ''
      ].join("");
    }).join("");
  }

  function renderConnectionScreen() {
    var input = document.getElementById("telegramWebAppUrl");
    var buttonTitleInput = document.getElementById("telegramButtonTitle");
    var badge = document.getElementById("telegramConnectionBadge");
    if (input && !input.value) input.value = getTelegramWebAppUrl();
    if (buttonTitleInput && !buttonTitleInput.value.trim()) buttonTitleInput.value = "Открыть курс";
    if (badge) {
      badge.textContent = "Не подключен";
      badge.classList.remove("is-ready");
    }
    setTelegramStatus("", false);
  }

  async function loadTelegramIntegration() {
    var client = getClient();
    var config = getConfig();
    if (!client) return;

    var result = await client
      .from("course_integrations")
      .select("telegram_connected,telegram_bot_username,telegram_button_title,telegram_webapp_url")
      .eq("course_id", getActiveCourseId())
      .maybeSingle();

    if (result.error) {
      console.error(result.error);
      return;
    }

    var data = result.data;
    if (!data || !data.telegram_connected) return;

    var webAppInput = document.getElementById("telegramWebAppUrl");
    if (webAppInput) webAppInput.value = getTelegramWebAppUrl();

    var buttonTitleInput = document.getElementById("telegramButtonTitle");
    if (buttonTitleInput && data.telegram_button_title) buttonTitleInput.value = data.telegram_button_title;

    renderTelegramConnectedState(data);
  }

  function parseErrorMessage(value) {
    if (!value) return "";
    if (typeof value === "string") return value;

    if (typeof value.error === "string" && value.error.trim()) return value.error;
    if (typeof value.message === "string" && value.message.trim()) return value.message;

    return "";
  }

  async function getInvokeErrorMessage(response) {
    if (!response) return "";

    var dataErrorMessage = parseErrorMessage(response.data);
    if (dataErrorMessage) return dataErrorMessage;

    var errorMessage = parseErrorMessage(response.error);
    if (errorMessage && errorMessage !== "Edge Function returned a non-2xx status code") {
      return errorMessage;
    }

    var context = response.error && response.error.context;
    if (context && typeof context.json === "function") {
      try {
        var body = await context.json();
        var bodyMessage = parseErrorMessage(body);
        if (bodyMessage) return bodyMessage;
      } catch (parseError) {
        console.warn("Failed to parse error context body", parseError);
      }
    }

    if (errorMessage) return errorMessage;
    return "";
  }

  async function connectTelegram() {
    var client = getClient();
    var config = getConfig();
    if (!client) throw new Error("Supabase client not initialized");

    var tokenInput = document.getElementById("telegramBotToken");
    var titleInput = document.getElementById("telegramButtonTitle");
    var urlInput = document.getElementById("telegramWebAppUrl");
    var connectBtn = document.getElementById("connectTelegramBtn");

    var botToken = String((tokenInput && tokenInput.value) || "").trim();
    var buttonTitle = String((titleInput && titleInput.value) || "").trim() || "Открыть курс";
    var webappUrl = getTelegramWebAppUrl();
    if (urlInput) urlInput.value = webappUrl;

    if (!botToken) {
      setTelegramStatus("Введите Bot Token", true);
      return;
    }
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "Подключаем...";
    }
    setTelegramStatus("", false);

    try {
      var response = await client.functions.invoke("connect-telegram", {
        body: {
          course_id: getActiveCourseId(),
          bot_token: botToken,
          button_title: buttonTitle,
          webapp_url: webappUrl
        }
      });

      if (response.error) {
        var invokeErrorMessage = await getInvokeErrorMessage(response);
        throw new Error(invokeErrorMessage || "Ошибка подключения Telegram");
      }

      var payload = response.data || {};
      if (!payload.ok) {
        throw new Error(payload.error || payload.message || "Ошибка подключения Telegram");
      }

      if (tokenInput) tokenInput.value = "";
      renderTelegramConnectedState({
        telegram_bot_username: payload.username,
        telegram_button_title: buttonTitle,
        telegram_webapp_url: webappUrl
      });
    } catch (error) {
      var message = error && error.message ? error.message : "Ошибка подключения Telegram";
      setTelegramStatus(message, true);
    } finally {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = "Подключить Telegram";
      }
    }
  }
  function generateLessonId() {
    var randomSuffix = Math.random().toString(36).slice(2, 6);
    return "lesson_" + Date.now() + "_" + randomSuffix;
  }

  function cloneRecord(record, excludedKeys) {
    var next = Object.assign({}, record || {});
    (excludedKeys || []).forEach(function (key) {
      delete next[key];
    });
    return next;
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getDuplicateTitle(baseTitle, existingTitles) {
    var cleanBaseTitle = String(baseTitle || "").trim();
    if (!cleanBaseTitle) return "Урок (копия)";

    var escaped = escapeRegExp(cleanBaseTitle);
    var copyPattern = new RegExp("^" + escaped + " \\(копия(?: (\\d+))?\\)$");
    var hasFirstCopy = false;
    var maxCopyIndex = 1;

    (existingTitles || []).forEach(function (title) {
      var value = String(title || "").trim();
      if (!value) return;

      if (value === cleanBaseTitle + " (копия)") {
        hasFirstCopy = true;
        maxCopyIndex = Math.max(maxCopyIndex, 1);
        return;
      }

      var match = value.match(copyPattern);
      if (!match) return;
      hasFirstCopy = true;
      var index = Number(match[1]);
      if (Number.isFinite(index) && index > maxCopyIndex) {
        maxCopyIndex = index;
      }
    });

    if (!hasFirstCopy) {
      return cleanBaseTitle + " (копия)";
    }

    return cleanBaseTitle + " (копия " + (maxCopyIndex + 1) + ")";
  }

  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function getActiveCourseId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("course") || getConfig().courseId;
  }

  function getClient() {
    return window.getSupabaseClient();
  }

  function getCurrentAccountId() {
    if (!currentAccountId) throw new Error("Аккаунт не инициализирован");
    return currentAccountId;
  }

  function getCurrentTariffLimit() {
    var tariff = currentAccount && currentAccount.tariff ? currentAccount.tariff : "trial";
    return TARIFF_LIMITS[tariff] || TARIFF_LIMITS.trial;
  }

  function hasCourseInUrl() {
    var params = new URLSearchParams(window.location.search);
    return Boolean(params.get("course"));
  }

  function generateCourseId(value) {
    var normalized = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (normalized) return normalized;
    return "course_" + Date.now();
  }

  function getBasePath() {
    var pathname = window.location.pathname || "/admin.html";
    var basePath = pathname.replace(/[^/]*$/, "");
    return basePath || "/";
  }

  function buildCourseAdminUrl(courseId) {
    return getBasePath() + "admin.html?course=" + encodeURIComponent(courseId);
  }

  function buildStudentCourseUrl(courseId) {
    return (window.location.origin || "") + getBasePath() + "index.html?course=" + encodeURIComponent(courseId);
  }

  function getCourseStatusLabel(status) {
    var statusMap = {
      active: "Активен",
      trial: "Пробный период",
      blocked: "Отключён",
      disabled: "Отключён",
      draft: "Черновик"
    };
    var key = String(status || "").toLowerCase();
    return statusMap[key] || "Активен";
  }

  async function fetchMyCourses() {
    var client = getClient();
    var result = await client
      .from("courses")
      .select("*")
      .eq("account_id", getCurrentAccountId())
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  function resolveCoursePrimaryId(course) {
    return course && (course.course_id || course.id);
  }

  function renderMyCourses(courses) {
    var list = document.getElementById("coursesList");
    if (!list) return;
    if (!courses.length) {
      list.innerHTML = '<div class="admin-empty">Курсов пока нет. Создайте первый курс.</div>';
      return;
    }
    list.innerHTML = courses.map(function (course) {
      var primaryId = resolveCoursePrimaryId(course);
      return [
        '<article class="admin-course-card">',
        '<div class="admin-course-card__head">',
        '<h3>' + escapeHtml(course.title || "Без названия") + '</h3>',
        '<span class="admin-course-card__status">' + escapeHtml(getCourseStatusLabel(course.status)) + '</span>',
        '</div>',
        '<div class="admin-course-card__actions">',
        '<a class="btn btn-primary" href="' + buildCourseAdminUrl(primaryId) + '">Открыть</a>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderTariffLimitState(courses) {
    var list = Array.isArray(courses) ? courses : [];
    var limit = getCurrentTariffLimit();
    var badge = document.getElementById("tariffBadge");
    var createBtn = document.getElementById("createCourseBtn");
    var notice = document.getElementById("tariffLimitNotice");
    var isLimitReached = list.length >= limit.courses;

    if (badge) badge.textContent = "Тариф: " + limit.label;
    if (createBtn) createBtn.disabled = isLimitReached;
    if (notice) {
      notice.hidden = !isLimitReached;
      notice.innerHTML = isLimitReached
        ? [
            "<strong>Вы достигли лимита тарифа</strong>",
            "<div>На вашем тарифе доступно курсов: " + limit.courses + ".</div>",
            "<div>Чтобы расширить лимит, активируйте более высокий тариф.</div>",
            '<a class="btn btn-primary" href="' + ACTIVATION_BOT_URL + '" target="_blank" rel="noopener noreferrer">Активировать доступ</a>'
          ].join("")
        : "";
    }
  }

  function showTariffLimitMessage(message) {
    var answer = window.confirm(message + "\n\nНаписать в Telegram для активации доступа?");
    if (answer) {
      window.open(ACTIVATION_BOT_URL, "_blank", "noopener,noreferrer");
    }
  }

  async function createCourseFromPrompt() {
    var client = getClient();
    var limit = getCurrentTariffLimit();
    var courses = await fetchMyCourses();
    if (courses.length >= limit.courses) {
      alert("На вашем тарифе доступно курсов: " + limit.courses + ". Активируйте более высокий тариф.");
      return;
    }
    var title = window.prompt("Название курса");
    if (!title || !title.trim()) return;
    var courseId = generateCourseId(title.trim());
    // TODO: enforce tariff course limits by account.tariff later
    var insertResult = await client
      .from("courses")
      .insert({
        account_id: getCurrentAccountId(),
        course_id: courseId,
        title: title.trim(),
        status: "active"
      })
      .select("*")
      .single();
    if (insertResult.error) throw insertResult.error;
    var courseRow = insertResult.data || {};
    var actualCourseId = resolveCoursePrimaryId(courseRow) || courseId;

    var settingsResult = await client
      .from("course_settings")
      .upsert({
        course_id: actualCourseId,
        theme_id: "dark_premium"
      }, { onConflict: "course_id" });
    if (settingsResult.error) throw settingsResult.error;

    var lessonResult = await client
      .from("lessons")
      .insert({
        lesson_id: "lesson_" + Date.now(),
        course_id: actualCourseId,
        title: "Новый модуль",
        subtitle: "",
        day_number: 1
      });
    if (lessonResult.error) throw lessonResult.error;

    try {
      window.localStorage.setItem("admin_active_tab", "appearance");
    } catch (error) {}
    window.location.href = buildCourseAdminUrl(actualCourseId);
  }

  async function initCoursesDashboard() {
    showCoursesDashboard();
    var courses = await fetchMyCourses();
    renderTariffLimitState(courses);
    renderMyCourses(courses);

    var createBtn = document.getElementById("createCourseBtn");
    if (createBtn) {
      createBtn.addEventListener("click", async function () {
        try {
          await createCourseFromPrompt();
        } catch (error) {
          alert(error.message || "Ошибка создания курса");
        }
      });
    }

  }

  function hideAllAdminScreens() {
    var authGate = document.getElementById("adminAuthGate");
    var dashboard = document.getElementById("coursesDashboard");
    var layout = document.querySelector(".admin-layout");
    if (authGate) authGate.hidden = true;
    if (dashboard) dashboard.hidden = true;
    if (layout) layout.hidden = true;
  }

  function showAuthGate() {
    hideAllAdminScreens();
    var authGate = document.getElementById("adminAuthGate");
    if (authGate) authGate.hidden = false;
  }

  function showCoursesDashboard() {
    hideAllAdminScreens();
    var dashboard = document.getElementById("coursesDashboard");
    if (dashboard) dashboard.hidden = false;
  }

  function showCourseEditor() {
    hideAllAdminScreens();
    var layout = document.querySelector(".admin-layout");
    if (layout) layout.hidden = false;
  }

  function showAdminError(message) {
    hideAllAdminScreens();
    var root = document.body;
    if (!root) return;

    var existing = document.getElementById("adminErrorScreen");
    if (existing) existing.remove();

    var section = document.createElement("section");
    section.id = "adminErrorScreen";
    section.className = "admin-courses-dashboard";
    section.innerHTML = [
      '<div class="admin-courses-dashboard__inner">',
      "<h1>Не удалось загрузить кабинет</h1>",
      '<p class="admin-hint">' + escapeHtml(message || "Ошибка загрузки админки") + "</p>",
      '<a class="btn btn-primary" href="admin.html">Вернуться в кабинет</a>',
      "</div>"
    ].join("");
    root.appendChild(section);
  }

  var LOCAL_ACCOUNT_ID_KEY = "mindcore_account_id";
  var LOCAL_ACCOUNT_LOGIN_KEY = "mindcore_account_login";

  function getStoredLocalAccountId() {
    try {
      return window.localStorage.getItem(LOCAL_ACCOUNT_ID_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeLocalAccountId(accountId) {
    try {
      window.localStorage.setItem(LOCAL_ACCOUNT_ID_KEY, String(accountId));
    } catch (error) {}
  }

  function clearLocalAccountId() {
    try {
      window.localStorage.removeItem(LOCAL_ACCOUNT_ID_KEY);
    } catch (error) {}
  }

  function storeLocalAccountLogin(login) {
    try {
      window.localStorage.setItem(LOCAL_ACCOUNT_LOGIN_KEY, String(login || ""));
    } catch (error) {}
  }

  function clearStoredAuth() {
    clearLocalAccountId();
    try {
      window.localStorage.removeItem(LOCAL_ACCOUNT_LOGIN_KEY);
    } catch (error) {}
  }

  async function getStoredAccount() {
    var client = getClient();
    var storedId = getStoredLocalAccountId();
    if (!storedId) return null;
    var existing = await client.from("accounts").select("*").eq("id", storedId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.id) return existing.data;
    clearStoredAuth();
    return null;
  }

  function setAuthStatus(message, isError) {
    var statusNode = document.getElementById("authLoginStatusText");
    if (!statusNode) return;
    statusNode.textContent = message || "";
    statusNode.hidden = !message;
    statusNode.classList.toggle("is-error", Boolean(isError));
  }

  function bindLoginForm() {
    var submitBtn = document.getElementById("authLoginSubmitBtn");
    var loginInput = document.getElementById("authLoginInput");
    var passwordInput = document.getElementById("authPasswordInput");
    if (!submitBtn || !loginInput || !passwordInput) return;

    async function handleLogin() {
      var login = String(loginInput.value || "").trim();
      var password = String(passwordInput.value || "");
      if (!login || !password) {
        setAuthStatus("Введите логин и пароль", true);
        return;
      }
      submitBtn.disabled = true;
      setAuthStatus("", false);
      try {
        var client = getClient();
        var result = await client.from("accounts").select("*").eq("login", login).limit(1).maybeSingle();
        if (result.error) throw result.error;
        var account = result.data;
        if (!account || String(account.password || "") !== password) {
          setAuthStatus("Неверный логин или пароль", true);
          return;
        }
        storeLocalAccountId(account.id);
        storeLocalAccountLogin(account.login || login);
        currentAccount = account;
        console.log("currentAccount:", currentAccount);
        console.log("currentTariffLimit:", getCurrentTariffLimit());
        window.location.href = "admin.html" + window.location.search;
      } catch (error) {
        setAuthStatus((error && error.message) || "Ошибка входа", true);
      } finally {
        submitBtn.disabled = false;
      }
    }

    submitBtn.addEventListener("click", handleLogin);
    passwordInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") handleLogin();
    });
  }

  async function verifyCourseAccess() {

    if (!hasCourseInUrl()) return;
    var client = getClient();
    var courseId = getActiveCourseId();
    var bySlug = await client.from("courses").select("account_id").eq("course_id", courseId).maybeSingle();
    if (bySlug.error) throw bySlug.error;
    var course = bySlug.data;
    if (!course) {
      var byId = await client.from("courses").select("account_id").eq("id", courseId).maybeSingle();
      if (byId.error) throw byId.error;
      course = byId.data;
    }
    if (!course || Number(course.account_id) !== Number(getCurrentAccountId())) {
      throw new Error("У вас нет доступа к этому курсу");
    }
  }

  function normalizeThemeId(themeId) {
    var value = String(themeId || "").trim();
    if (WEBAPP_THEME_IDS[value]) return value;
    return "dark_premium";
  }

  function getThemePresetById(themeId) {
    var normalizedThemeId = normalizeThemeId(themeId);
    for (var i = 0; i < WEBAPP_THEMES.length; i += 1) {
      if (WEBAPP_THEMES[i].id === normalizedThemeId) return WEBAPP_THEMES[i];
    }
    return null;
  }

  function applyThemeToLivePreview(theme) {
    currentPreviewTheme = theme || null;
    if (!currentPreviewTheme) return;
    console.log("[preview] sending theme", currentPreviewTheme);
    applyCurrentPreviewTheme();
  }

  function renderThemeCards() {
    var container = document.getElementById("themeCards");
    if (!container) return;

    container.innerHTML = WEBAPP_THEMES.map(function (theme) {
      var isActive = state.selectedThemeId === theme.id;
      return [
        '<article class="admin-theme-item' + (isActive ? ' is-active' : '') + '" data-theme-id="' + theme.id + '">',
        '<div class="admin-theme-preview ' + (theme.className || WEBAPP_THEME_IDS[theme.id]) + '">',
          '<div class="admin-theme-preview__screen">',
            '<div class="admin-theme-preview__header"></div>',
            '<div class="admin-theme-preview__progress-track"><span class="admin-theme-preview__progress"></span></div>',
            '<div class="admin-theme-preview__lesson">',
              '<div class="admin-theme-preview__lesson-title"></div>',
              '<div class="admin-theme-preview__lesson-subtitle"></div>',
            '</div>',
            '<div class="admin-theme-preview__cta">Открыть</div>',
          '</div>',
        '</div>',
        '<div class="admin-theme-title-row"><h3>' + escapeHtml(theme.name) + '</h3>' + (theme.badge ? '<span class="admin-theme-badge">' + escapeHtml(theme.badge) + '</span>' : '') + '</div>',
        '<p>' + escapeHtml(theme.description) + '</p>',
        isActive
          ? '<div class="admin-theme-status">Выбрано</div>'
          : '<button class="btn btn-primary admin-theme-choose-btn" type="button" data-theme-id="' + theme.id + '">Выбрать</button>',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderThemeDirtyState() {
    var dirtyNode = document.getElementById("themeDirtyStatus");
    if (dirtyNode) dirtyNode.hidden = state.selectedThemeId === state.savedThemeId;
  }


  function getDefaultCourseAccessSettings() {
    return {
      access_control_enabled: false,
      access_duration_days: null,
      access_expired_title: "",
      access_expired_text: "",
      access_expired_button_text: "",
      access_expired_button_url: ""
    };
  }

  function normalizeCourseAccessSettings(settings) {
    var source = settings || {};
    var duration = source.access_duration_days;
    var parsedDuration = duration === null || typeof duration === "undefined" || duration === "" ? null : Number(duration);
    return {
      access_control_enabled: Boolean(source.access_control_enabled),
      access_duration_days: Number.isFinite(parsedDuration) && parsedDuration > 0 ? Math.floor(parsedDuration) : null,
      access_expired_title: source.access_expired_title || "",
      access_expired_text: source.access_expired_text || "",
      access_expired_button_text: source.access_expired_button_text || "",
      access_expired_button_url: source.access_expired_button_url || ""
    };
  }

  function getCourseAccessDraftFromInputs() {
    var enabled = document.getElementById("accessControlEnabledInput");
    var duration = document.getElementById("accessDurationDaysInput");
    var title = document.getElementById("accessExpiredTitleInput");
    var text = document.getElementById("accessExpiredTextInput");
    var buttonText = document.getElementById("accessExpiredButtonTextInput");
    var buttonUrl = document.getElementById("accessExpiredButtonUrlInput");
    return normalizeCourseAccessSettings({
      access_control_enabled: enabled && enabled.checked,
      access_duration_days: duration && duration.value ? duration.value : null,
      access_expired_title: title ? title.value : "",
      access_expired_text: text ? text.value : "",
      access_expired_button_text: buttonText ? buttonText.value : "",
      access_expired_button_url: buttonUrl ? buttonUrl.value : ""
    });
  }

  function isCourseAccessDirty() {
    return JSON.stringify(normalizeCourseAccessSettings(state.courseAccessSettings)) !== JSON.stringify(normalizeCourseAccessSettings(state.savedCourseAccessSettings));
  }

  function setCourseAccessStatus(message, type) {
    var node = document.getElementById("courseAccessStatus");
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || "";
    node.classList.toggle("is-error", type === "error");
    node.classList.toggle("is-success", type === "success");
  }

  function renderCourseAccessSettings() {
    var settings = normalizeCourseAccessSettings(state.courseAccessSettings || getDefaultCourseAccessSettings());
    var enabled = document.getElementById("accessControlEnabledInput");
    var duration = document.getElementById("accessDurationDaysInput");
    var title = document.getElementById("accessExpiredTitleInput");
    var text = document.getElementById("accessExpiredTextInput");
    var buttonText = document.getElementById("accessExpiredButtonTextInput");
    var buttonUrl = document.getElementById("accessExpiredButtonUrlInput");
    var fields = document.getElementById("courseAccessFields");
    var hint = document.getElementById("courseAccessDisabledHint");
    var actions = document.getElementById("courseAccessActions");
    var saveBtn = document.getElementById("saveCourseAccessBtn");

    if (enabled) enabled.checked = settings.access_control_enabled;
    if (duration) duration.value = settings.access_duration_days || "";
    if (title) title.value = settings.access_expired_title;
    if (text) text.value = settings.access_expired_text;
    if (buttonText) buttonText.value = settings.access_expired_button_text;
    if (buttonUrl) buttonUrl.value = settings.access_expired_button_url;
    if (fields) fields.classList.toggle("is-muted", !settings.access_control_enabled);
    if (hint) hint.hidden = settings.access_control_enabled;
    if (actions) actions.hidden = !isCourseAccessDirty();
    if (saveBtn) saveBtn.disabled = state.courseAccessSaving || !isCourseAccessDirty();
  }

  function updateCourseAccessDraft() {
    state.courseAccessSettings = getCourseAccessDraftFromInputs();
    setCourseAccessStatus("", "");
    renderCourseAccessSettings();
  }

  async function fetchCourseAccessSettings() {
    var client = getClient();
    if (!client) throw new Error("Supabase client not initialized");
    var result = await client
      .from("course_settings")
      .select("access_control_enabled, access_duration_days, access_expired_title, access_expired_text, access_expired_button_text, access_expired_button_url")
      .eq("course_id", getActiveCourseId())
      .maybeSingle();
    if (result.error) throw result.error;
    return normalizeCourseAccessSettings(result.data || getDefaultCourseAccessSettings());
  }

  async function saveCourseAccessSettings() {
    var client = getClient();
    if (!client) throw new Error("Supabase client not initialized");
    var courseId = getActiveCourseId();
    var payload = normalizeCourseAccessSettings(state.courseAccessSettings);
    state.courseAccessSaving = true;
    renderCourseAccessSettings();
    var result = await client
      .from("course_settings")
      .update(payload)
      .eq("course_id", courseId)
      .select("access_control_enabled, access_duration_days, access_expired_title, access_expired_text, access_expired_button_text, access_expired_button_url")
      .maybeSingle();
    state.courseAccessSaving = false;
    if (result.error) {
      console.warn("Не удалось сохранить настройки доступа курса:", result.error);
      setCourseAccessStatus("Не удалось сохранить настройки доступа. Попробуйте ещё раз.", "error");
      renderCourseAccessSettings();
      return;
    }
    state.courseAccessSettings = normalizeCourseAccessSettings(result.data || payload);
    state.savedCourseAccessSettings = normalizeCourseAccessSettings(state.courseAccessSettings);
    setCourseAccessStatus("Настройки доступа сохранены", "success");
    renderCourseAccessSettings();
  }

  async function fetchCourseThemeId() {
    var client = getClient();
    var config = getConfig();
    if (!client) throw new Error("Supabase client not initialized");

    var result = await client
      .from("course_settings")
      .select("theme_id")
      .eq("course_id", getActiveCourseId())
      .maybeSingle();

    if (result.error) {
      console.error(result.error);
      return "dark_premium";
    }

    var themeId = normalizeThemeId(result.data && result.data.theme_id);
    if (result.data) {
      return themeId;
    }

    var createResult = await client
      .from("course_settings")
      .upsert({
        course_id: getActiveCourseId(),
        theme_id: "dark_premium"
      }, { onConflict: "course_id" })
      .select("theme_id")
      .maybeSingle();

    if (createResult.error) {
      console.warn("Не удалось создать course_settings со значением по умолчанию:", createResult.error);
      return "dark_premium";
    }

    return normalizeThemeId(createResult.data && createResult.data.theme_id);
  }

  async function saveCourseThemeId(themeId) {
    var client = getClient();
    var config = getConfig();
    if (!client) throw new Error("Supabase client not initialized");

    var normalized = normalizeThemeId(themeId);
    var result = await client
      .from("course_settings")
      .upsert({
        course_id: getActiveCourseId(),
        theme_id: normalized
      }, { onConflict: "course_id" })
      .select("theme_id")
      .maybeSingle();

    if (result.error) {
      console.error(result.error);
      throw new Error("Не удалось сохранить тему курса");
    }

    state.selectedThemeId = normalizeThemeId(result.data && result.data.theme_id);
    state.savedThemeId = state.selectedThemeId;
    currentPreviewThemeId = state.selectedThemeId;
    var selectedTheme = getThemePresetById(state.selectedThemeId);
    renderThemeCards();
    renderThemeDirtyState();
    applyThemeToLivePreview(selectedTheme);
    refreshPreviewData();
    applyCurrentPreviewTheme();
  }

  async function fetchLessons() {
    var client = getClient();
    var config = getConfig();
    if (!client) throw new Error("Supabase client not initialized");

    var result = await client
      .from("lessons")
      .select("*")
      .eq("course_id", getActiveCourseId())
      .order("day_number", { ascending: true });

    if (result.error) {
      console.error(result.error);
      throw new Error("Не удалось загрузить уроки");
    }

    return result.data || [];
  }

  async function fetchLessonBlocks(lessonDbId) {
    var client = getClient();
    if (!client) throw new Error("Supabase client not initialized");

    var result = await client
      .from("lesson_blocks")
      .select("*")
      .eq("lesson_id", lessonDbId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error(result.error);
      throw new Error("Не удалось загрузить материалы урока");
    }

    return result.data || [];
  }

  async function fetchLessonBlockGroups(lessonDbId) {
    var client = getClient();
    if (!client || !lessonDbId) return [];

    var result = await client
      .from("lesson_block_groups")
      .select("*")
      .eq("lesson_id", lessonDbId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error(result.error);
      alert("Не удалось загрузить группы материалов");
      return [];
    }

    return result.data || [];
  }

  async function fetchItemsForBlocks(blockIds) {
    var client = getClient();
    if (!client || !blockIds.length) return [];

    var result = await client
      .from("lesson_block_items")
      .select("*")
      .in("block_id", blockIds)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error(result.error);
      alert("Ошибка загрузки данных материала");
      return [];
    }

    return result.data || [];
  }

  function setItemsByBlock(items) {
    state.blockItemsByBlockId = {};
    state.blocks.forEach(function (block) {
      state.blockItemsByBlockId[String(block.id)] = [];
    });

    items.forEach(function (item) {
      var key = String(item.block_id);
      if (!state.blockItemsByBlockId[key]) {
        state.blockItemsByBlockId[key] = [];
      }
      state.blockItemsByBlockId[key].push(item);
    });
  }

  function getItems(blockId) {
    return state.blockItemsByBlockId[String(blockId)] || [];
  }

  function getBlockGroup(block) {
    if (!block || !block.group_id) return null;
    return state.blockGroups.find(function (group) {
      return String(group.id) === String(block.group_id);
    }) || null;
  }

  function getMaterialPrimaryType(blockId) {
    var items = getItems(blockId);
    if (!items.length) return "text";

    var firstType = String(items[0].item_type || "").trim();
    if (["text", "video", "image", "file"].indexOf(firstType) >= 0) {
      return firstType;
    }
    return "text";
  }

  function getMaterialTypes(blockId) {
    var map = {};
    getItems(blockId).forEach(function (item) {
      if (!item || !item.item_type) return;
      map[item.item_type] = true;
    });
    return Object.keys(map);
  }

  function isMixedMaterial(blockId) {
    return getMaterialTypes(blockId).length > 1;
  }

  function getTextItem(blockId) {
    return getItems(blockId).find(function (item) {
      return item.item_type === "text";
    }) || null;
  }

  function getVideoItems(blockId) {
    return getItems(blockId).filter(function (item) {
      return item.item_type === "video";
    });
  }

  function getBlockById(blockId) {
    return state.blocks.find(function (block) {
      return String(block.id) === String(blockId);
    }) || null;
  }

  function getFileItems(blockId) {
    return getItems(blockId).filter(function (item) {
      return item.item_type === "file";
    });
  }

  function getImageItems(blockId) {
    return getItems(blockId).filter(function (item) {
      return item.item_type === "image" && item.image_url;
    });
  }

  function getNextBlockItemOrder(blockId) {
    var items = getItems(blockId);
    if (!items.length) return 1;

    return Math.max.apply(null, items.map(function (item) {
      return item.sort_order || 0;
    })) + 1;
  }

  function getActiveBlock() {
    if (!state.activeSectionId) return null;
    return state.blocks.find(function (block) {
      return String(block.id) === String(state.activeSectionId);
    }) || null;
  }

  function stripHtml(html) {
    if (!html) return "";
    var container = document.createElement("div");
    container.innerHTML = html;
    return (container.textContent || container.innerText || "").replace(/\s+/g, " ").trim();
  }

  function shortenText(value, maxLength) {
    if (!value) return "";
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength).trim() + "…";
  }

  function extractGoogleDriveFileId(value) {
    var input = String(value || "").trim();
    if (!input) return "";

    var directIdPattern = /^[A-Za-z0-9_-]{10,}$/;
    if (directIdPattern.test(input) && input.indexOf("http") !== 0) {
      return input;
    }

    var url;
    try {
      url = new URL(input);
    } catch (error) {
      return "";
    }

    var host = (url.hostname || "").toLowerCase();
    if (host !== "drive.google.com" && host !== "www.drive.google.com") {
      return "";
    }

    var pathMatch = (url.pathname || "").match(/\/file\/d\/([^/]+)/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    var queryId = url.searchParams.get("id");
    if (queryId) {
      return queryId;
    }

    return "";
  }

  function parseVideoInputToEmbedUrl(value) {
    var input = String(value || "").trim();
    if (!input) return { embedUrl: null, error: "invalid" };

    var srcMatch = input.match(/<iframe[\s\S]*?\ssrc\s*=\s*["']([^"']+)["']/i);
    var candidate = srcMatch && srcMatch[1] ? srcMatch[1].trim() : input;
    if (!candidate) return { embedUrl: null, error: "invalid" };

    var kinescopeIdPattern = /^[A-Za-z0-9_-]{6,}$/;
    if (kinescopeIdPattern.test(candidate) && candidate.indexOf("http") !== 0) {
      return { embedUrl: "https://kinescope.io/embed/" + candidate, error: null };
    }

    if (candidate.indexOf("//") === 0) {
      candidate = "https:" + candidate;
    }

    var url;
    try {
      url = new URL(candidate);
    } catch (error) {
      return { embedUrl: null, error: "invalid" };
    }

    var host = (url.hostname || "").toLowerCase();
    var pathParts = (url.pathname || "").split("/").filter(Boolean);

    if ((host === "youtube.com" || host === "www.youtube.com" || host === "youtu.be" || host === "vkvideo.ru" || host === "www.vkvideo.ru" || host === "vk.com" || host === "www.vk.com" || host === "disk.yandex.ru" || host === "yadi.sk")) {
      return { embedUrl: null, error: "unsupported" };
    }

    if ((host === "vimeo.com" || host === "www.vimeo.com") && pathParts[0]) {
      return { embedUrl: "https://player.vimeo.com/video/" + pathParts[0], error: null };
    }

    if ((host === "player.vimeo.com") && pathParts[0] === "video" && pathParts[1]) {
      return { embedUrl: "https://player.vimeo.com/video/" + pathParts[1], error: null };
    }

    if (host === "kinescope.io" || host === "www.kinescope.io") {
      if (!pathParts.length) return { embedUrl: null, error: "invalid" };
      var videoId = pathParts[0] === "embed" ? pathParts[1] : pathParts[0];
      if (!videoId || !kinescopeIdPattern.test(videoId)) return { embedUrl: null, error: "invalid" };
      return { embedUrl: "https://kinescope.io/embed/" + videoId, error: null };
    }

    if ((host === "rutube.ru" || host === "www.rutube.ru") && pathParts[0] === "video" && pathParts[1]) {
      return { embedUrl: "https://rutube.ru/play/embed/" + pathParts[1].replace(/\/$/, ""), error: null };
    }

    if (host === "drive.google.com") {
      var driveMatch = (url.pathname || "").match(/\/file\/d\/([^/]+)/);
      if (driveMatch && driveMatch[1]) {
        return { embedUrl: "https://drive.google.com/file/d/" + driveMatch[1] + "/preview", error: null };
      }
    }

    return { embedUrl: null, error: "invalid" };
  }


  function getSectionSummary(blockId) {
    var textItem = getTextItem(blockId);
    var videos = getVideoItems(blockId);
    var files = getFileItems(blockId);
    var images = getImageItems(blockId);
    var textPreview = shortenText(stripHtml(textItem ? textItem.text_html : ""), 160);

    if (textPreview) {
      return textPreview;
    }

    if (videos.length && files.length) {
      return "Материал содержит видео и файлы для скачивания.";
    }

    if (images.length && (videos.length || files.length)) {
      return "Материал содержит изображения и медиа-контент.";
    }

    if (videos.length) {
      return "Материал с видеоматериалом.";
    }

    if (files.length) {
      return "Материал с прикреплёнными файлами.";
    }

    if (images.length) {
      return "Материал с изображениями.";
    }

    return "Пока контент не добавлен.";
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

  function getContentBadges(blockId) {
    var badges = [];
    var types = getMaterialTypes(blockId);
    var textPreview = shortenText(stripHtml((getTextItem(blockId) || {}).text_html || ""), 160);
    var videos = getVideoItems(blockId);
    var files = getFileItems(blockId);
    var images = getImageItems(blockId);
    var primaryType = getMaterialPrimaryType(blockId);

    if (types.length === 1) {
      if (primaryType === "text" && textPreview) badges.push("Текст");
      if (primaryType === "video" && videos.length) badges.push("Видео");
      if (primaryType === "file" && files.length) badges.push("Файл");
      if (primaryType === "image" && images.length) badges.push("Картинка");
    } else {
      if (textPreview) {
        badges.push("Текст");
      }
      if (videos.length) {
        badges.push("Видео: " + videos.length);
      }
      if (files.length) {
        var fileNames = files.slice(0, 2).map(function (item) {
          return item.file_label || "Без названия";
        }).join(", ");
        badges.push("Файлы: " + fileNames + (files.length > 2 ? " +" + (files.length - 2) : ""));
      }
      if (images.length) {
        badges.push("Картинки: " + images.length);
      }
    }

    if (!badges.length) {
      badges.push("Материал пустой");
    }

    return badges;
  }

  function getSectionContentList(blockId) {
    var lines = [];
    var textItem = getTextItem(blockId);
    var textValue = stripHtml(textItem ? textItem.text_html : "");
    var videos = getVideoItems(blockId);
    var files = getFileItems(blockId);
    var images = getImageItems(blockId);

    if (textValue) {
      lines.push({ type: "text", label: "Текст" });
    }

    videos.forEach(function () {
      lines.push({ type: "video", label: "Видео" });
    });

    files.forEach(function (item) {
      lines.push({ type: "file", label: "Файл: " + (item.file_label || "Без названия") });
    });

    images.forEach(function (item) {
      lines.push({ type: "image", label: "Картинка: " + (item.image_alt || "Без подписи") });
    });

    return lines;
  }

  function renderSectionContentList(blockId) {
    var items = getSectionContentList(blockId);
    var limit = 4;

    if (!items.length) {
      return [
        '<div class="admin-section-empty-state">',
        '<p class="admin-section-empty-state__title">Материал пока пустой</p>',
        '<button class="admin-btn-ghost edit-block-btn" data-block-id="' + blockId + '" type="button">Открыть</button>',
        '</div>'
      ].join("");
    }

    var visible = items.slice(0, limit);
    var hiddenCount = items.length - visible.length;

    return [
      '<div class="admin-content-mini-list">',
      visible.map(function (item) {
        return '<span class="admin-content-mini-tag">' + escapeHtml(item.label) + '</span>';
      }).join(""),
      hiddenCount > 0 ? '<span class="admin-content-mini-list__more">+ ещё ' + hiddenCount + '</span>' : "",
      '</div>'
    ].join("");
  }

  function openSectionTab(blockId, tabName, options) {
    if (!blockId) return;

    state.activeSectionId = String(blockId);
    state.activeSectionTab = tabName || "text";
    state.quills = {};

    renderBlocksList();
    refreshPreviewData();
  }

  function renderLessonsList() {
    var lessonsList = document.getElementById("lessonsList");
    var selectedId = state.selectedLesson ? state.selectedLesson.id : null;

    lessonsList.innerHTML = state.lessons.map(function (lesson) {
      var isActive = selectedId === lesson.id;
      return [
        '<article class="admin-lesson-item' + (isActive ? ' active' : '') + '" data-lesson-db-id="' + lesson.id + '">',
        '<button class="admin-lesson-select" data-lesson-select-id="' + lesson.id + '" type="button">',
        '<strong>' + escapeHtml(lesson.title || "Без названия") + '</strong>',
        '<span>' + escapeHtml(getLessonDisplayLabel(lesson)) + '</span>',
        '</button>',
        '<button class="admin-btn-ghost duplicate-lesson-btn" data-lesson-db-id="' + lesson.id + '" type="button" title="Дублировать урок" aria-label="Дублировать урок">⧉</button>',
        '<button class="admin-btn-ghost lesson-drag-handle" data-lesson-db-id="' + lesson.id + '" draggable="true" type="button" title="Перетащить урок" aria-label="Перетащить урок">⋮⋮</button>',
        '</article>'
      ].join("");
    }).join("");
  }

  function resetLessonDragState() {
    state.lessonDnd.draggedLessonId = null;
    state.lessonDnd.originalOrder = null;
    state.lessonDnd.dropHappened = false;
  }

  function clearLessonDragClasses() {
    var cards = document.querySelectorAll("#lessonsList .admin-lesson-item");
    cards.forEach(function (card) {
      card.classList.remove("is-dragging");
      card.classList.remove("drag-over-top");
      card.classList.remove("drag-over-bottom");
    });
  }

  function getReorderedLessons() {
    var cards = Array.prototype.slice.call(document.querySelectorAll("#lessonsList .admin-lesson-item[data-lesson-db-id]"));
    if (!cards.length) return null;

    var byId = {};
    state.lessons.forEach(function (lesson) {
      byId[String(lesson.id)] = lesson;
    });

    var ordered = cards.map(function (card) {
      return byId[String(card.getAttribute("data-lesson-db-id"))];
    }).filter(Boolean);

    if (ordered.length !== state.lessons.length) return null;
    return ordered;
  }

  async function saveLessonsOrder(orderedLessons) {
    if (!orderedLessons || !orderedLessons.length) return false;
    var client = getClient();
    if (!client) return false;

    var selectedLessonId = state.selectedLesson ? String(state.selectedLesson.id) : null;
    var hasSortOrderField = orderedLessons.some(function (lesson) {
      return Object.prototype.hasOwnProperty.call(lesson, "sort_order");
    });

    var updates = orderedLessons.map(function (lesson, index) {
      var nextOrder = index + 1;
      var shouldUpdate = (lesson.day_number || 0) !== nextOrder;
      if (!shouldUpdate && hasSortOrderField) {
        shouldUpdate = (lesson.sort_order || 0) !== nextOrder;
      }

      return {
        lesson: lesson,
        nextOrder: nextOrder,
        shouldUpdate: shouldUpdate
      };
    }).filter(function (entry) {
      return entry.shouldUpdate;
    });

    for (var i = 0; i < updates.length; i += 1) {
      var entry = updates[i];
      var payload = { day_number: entry.nextOrder };
      if (hasSortOrderField) {
        payload.sort_order = entry.nextOrder;
      }

      var updateResult = await client
        .from("lessons")
        .update(payload)
        .eq("id", entry.lesson.id);

      if (updateResult.error) {
        console.error(updateResult.error);
        alert("Ошибка сохранения порядка уроков");
        return false;
      }
    }

    state.lessons = orderedLessons.map(function (lesson, index) {
      var nextLesson = Object.assign({}, lesson, { day_number: index + 1 });
      if (hasSortOrderField) {
        nextLesson.sort_order = index + 1;
      }
      return nextLesson;
    });

    if (selectedLessonId) {
      state.selectedLesson = state.lessons.find(function (lesson) {
        return String(lesson.id) === selectedLessonId;
      }) || state.selectedLesson;
    }

    renderLessonsList();
    renderEditor();
    refreshPreviewData();
    return true;
  }


  function updateLessonEditorPanelsVisibility() {
    var settingsPanel = document.querySelector(".lesson-settings-panel");
    var materialsPanel = document.querySelector(".lesson-materials-panel");
    var isLessonSettings = state.activeAdminTab === "lesson_settings";

    if (settingsPanel) settingsPanel.hidden = !isLessonSettings;
    if (materialsPanel) materialsPanel.hidden = isLessonSettings;
  }

  function renderEditor() {
    var empty = document.getElementById("editorEmpty");
    var panel = document.getElementById("editorPanel");

    if (!state.selectedLesson) {
      empty.hidden = false;
      panel.hidden = true;
        return;
    }

    empty.hidden = true;
    panel.hidden = false;

    var lesson = state.selectedLesson;

    document.getElementById("editorLessonTitle").textContent = lesson.title || "Урок";
    document.getElementById("dayNumberInput").value = lesson.day_number || "";
    document.getElementById("lessonLabelInput").value = lesson.lesson_label || "";
    document.getElementById("titleInput").value = lesson.title || "";
    document.getElementById("subtitleInput").value = lesson.subtitle || "";

    updateLessonEditorPanelsVisibility();
    renderLessonPreviewUploader();
    renderBlockGroupsManager();
    renderBlocksList();
    refreshPreviewData();
  }

  function renderLessonPreviewUploader() {
    var previewBox = document.getElementById("lessonPreviewBox");
    var removeBtn = document.getElementById("removeLessonPreviewBtn");
    if (!previewBox || !removeBtn) return;

    if (!state.selectedLesson || !state.selectedLesson.preview_image_url) {
      previewBox.innerHTML = '<div class="admin-lesson-preview-box__placeholder">Превью пока не загружено</div>';
      removeBtn.hidden = true;
      return;
    }

    previewBox.innerHTML = '<img src="' + escapeAttr(state.selectedLesson.preview_image_url) + '" alt="Превью модуля">';
    removeBtn.hidden = false;
  }


  function getLessonDisplayOrderItems() {
    var items = state.blockGroups.map(function (group, index) {
      return { type: "group", id: String(group.id), sort_order: group.sort_order || 0, originalIndex: index, data: group };
    }).concat(state.blocks.filter(function (block) {
      return !block.group_id;
    }).map(function (block, index) {
      return { type: "block", id: String(block.id), sort_order: block.sort_order || 0, originalIndex: state.blockGroups.length + index, data: block };
    }));

    return items.sort(function (a, b) {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.originalIndex - b.originalIndex;
    });
  }

  function getDisplayOrderBadge(entity) {
    return '<span class="admin-content-badge">Общий порядок: ' + escapeHtml(entity && entity.sort_order ? entity.sort_order : 0) + '</span>';
  }

  function renderBlockGroupsManager() {
    var host = document.getElementById("blockGroupsManager");
    if (!host) return;

    if (!state.selectedLesson) {
      host.innerHTML = "";
      return;
    }

    var displayItems = getLessonDisplayOrderItems();

    host.innerHTML = [
      '<div class="admin-groups-header">',
      '<div><h4>Верхний уровень урока</h4><p class="admin-hint">Группы и материалы без группы находятся в одном общем порядке. Материалы внутри группы сортируются отдельно внутри своей группы.</p></div>',
      '<button id="addBlockGroupBtn" class="admin-btn-ghost" type="button">Добавить группу материалов</button>',
      '</div>',
      displayItems.length ? displayItems.map(function (item) {
        if (item.type === "block") {
          var block = item.data;
          return [
            '<article class="admin-group-item admin-group-item--block" data-block-id="' + block.id + '">',
            '<div><strong>Материал без группы</strong>',
            '<p>' + escapeHtml(getSectionSummary(block.id)) + '</p>',
            '<span class="admin-content-badge">Без группы</span> ',
            getDisplayOrderBadge(block) + '</div>',
            '<div class="admin-inline-actions">',
            '<button class="admin-btn-ghost move-block-btn" data-dir="up" data-block-id="' + block.id + '" type="button">↑</button>',
            '<button class="admin-btn-ghost move-block-btn" data-dir="down" data-block-id="' + block.id + '" type="button">↓</button>',
            '</div>',
            '</article>'
          ].join("");
        }
        var group = item.data;
        var count = state.blocks.filter(function (block) { return String(block.group_id || "") === String(group.id); }).length;
        return [
          '<article class="admin-group-item" data-group-id="' + group.id + '">',
          '<div><strong>Группа: ' + escapeHtml(group.title || "Без названия") + '</strong>',
          group.description ? '<p>' + escapeHtml(group.description) + '</p>' : '',
          getDisplayOrderBadge(group) + ' ',
          '<span class="admin-content-badge">Материалов: ' + count + '</span></div>',
          '<div class="admin-inline-actions">',
          '<button class="admin-btn-ghost move-group-btn" data-dir="up" data-group-id="' + group.id + '" type="button">↑</button>',
          '<button class="admin-btn-ghost move-group-btn" data-dir="down" data-group-id="' + group.id + '" type="button">↓</button>',
          '<button class="admin-btn-ghost edit-group-btn" data-group-id="' + group.id + '" type="button">Редактировать</button>',
          '<button class="admin-btn-ghost delete-group-btn" data-group-id="' + group.id + '" type="button">Удалить</button>',
          '</div>',
          '</article>'
        ].join("");
      }).join("") : '<div class="admin-empty">На верхнем уровне пока нет групп или материалов без группы</div>'
    ].join("");
  }

  function renderGroupSelect(block) {
    var value = block && block.group_id ? String(block.group_id) : "";
    return [
      '<label class="admin-block-group-select">Группа материалов',
      '<select class="block-group-select" data-block-id="' + block.id + '">',
      '<option value="">Без группы</option>',
      state.blockGroups.map(function (group) {
        return '<option value="' + escapeAttr(group.id) + '"' + (String(group.id) === value ? ' selected' : '') + '>' + escapeHtml(group.title || "Без названия") + '</option>';
      }).join(""),
      '</select>',
      '</label>'
    ].join("");
  }

  function renderBlocksList() {
    closeTooltip();
    var blocksList = document.getElementById("blocksList");

    if (!state.blocks.length) {
      blocksList.innerHTML = '<div class="admin-empty">У этого урока пока нет материалов</div>';
      return;
    }

    blocksList.innerHTML = state.blocks.map(function (block, index) {
      var isActive = String(state.activeSectionId) === String(block.id);
      var sectionItems = getSectionContentList(block.id);
      var isEmptySection = !sectionItems.length;
      var summary = getSectionSummary(block.id);
      var badges = getContentBadges(block.id);
      var shouldShowBadges = !(isActive && isEmptySection);

      return [
        '<article class="admin-block-item' + (isActive ? ' active' : '') + '" data-block-id="' + block.id + '">',
        '<div class="admin-block-head">',
        '<div>',
        '<h4>Материал ' + (index + 1) + '</h4>',
        '<p class="admin-section-summary' + (summary === "Пока контент не добавлен." ? ' admin-section-summary--empty' : '') + '">' + escapeHtml(summary) + '</p>',
        getBlockGroup(block) ? '<span class="admin-content-badge">Группа: ' + escapeHtml(getBlockGroup(block).title || "Без названия") + '</span>' : '<span class="admin-content-badge">Без группы</span>' + getDisplayOrderBadge(block),
        shouldShowBadges ? [
        '<div class="admin-content-badges">',
        badges.map(function (badge) {
          return '<span class="admin-content-badge">' + escapeHtml(badge) + '</span>';
        }).join(""),
        '</div>',
        ].join("") : "",
        '</div>',
        '<div class="admin-inline-actions">',
        '<button class="admin-btn-ghost block-drag-handle" data-block-id="' + block.id + '" draggable="true" type="button" title="Перетащить материал" aria-label="Перетащить материал">⋮⋮</button>',
        '<button class="admin-btn-ghost edit-block-btn" data-block-id="' + block.id + '" type="button">Редактировать</button>',
        '<button class="admin-btn-ghost duplicate-block-btn" data-block-id="' + block.id + '" type="button" title="Дублировать материал" aria-label="Дублировать материал">⧉</button>',
        '<button class="admin-btn-ghost move-block-btn" data-dir="up" data-block-id="' + block.id + '" type="button">↑</button>',
        '<button class="admin-btn-ghost move-block-btn" data-dir="down" data-block-id="' + block.id + '" type="button">↓</button>',
        '<button class="admin-btn-ghost delete-block-btn" data-block-id="' + block.id + '" type="button">Удалить</button>',
        '</div>',
        '</div>',
        renderSectionContentList(block.id),
        isActive ? renderSectionEditor(block.id) : "",
        '</article>'
      ].join("");
    }).join("");

    var activeBlock = getActiveBlock();
    if (activeBlock && state.activeSectionTab === "text") {
      initQuillForActiveSection(activeBlock.id);
    }
  }

  function renderSectionEditor(blockId) {
    var isMixed = isMixedMaterial(blockId);
    var primaryType = getMaterialPrimaryType(blockId);
    var effectiveTab = isMixed ? (state.activeSectionTab || "text") : primaryType;
    var titleByType = {
      text: "Редактирование текста",
      video: "Редактирование видео",
      file: "Редактирование файла",
      image: "Редактирование картинки"
    };

    return [
      '<div class="admin-block-editor-inline" id="blockEditor-' + blockId + '">',
      renderGroupSelect(getActiveBlock()),
      '<div class="admin-tabs' + (isMixed ? '' : ' admin-tabs--single') + '">',
      isMixed ? [
      '<button class="admin-tab-btn' + (effectiveTab === 'text' ? ' active' : '') + '" type="button" data-section-tab="text" data-block-id="' + blockId + '">Текст</button>',
      '<button class="admin-tab-btn' + (effectiveTab === 'video' ? ' active' : '') + '" type="button" data-section-tab="video" data-block-id="' + blockId + '">Видео</button>',
      '<button class="admin-tab-btn' + (effectiveTab === 'file' ? ' active' : '') + '" type="button" data-section-tab="file" data-block-id="' + blockId + '">Файлы</button>',
      '<button class="admin-tab-btn' + (effectiveTab === 'image' ? ' active' : '') + '" type="button" data-section-tab="image" data-block-id="' + blockId + '">Картинка</button>'
      ].join("") : ('<h5 class="admin-tabs-title">' + titleByType[effectiveTab] + '</h5>'),
      '<button class="admin-btn-ghost close-inline-editor-btn" type="button">Закрыть</button>',
      '</div>',
      renderSectionTabContent(blockId, effectiveTab),
      '</div>'
    ].join("");
  }

  function renderSectionTabContent(blockId, tabName) {
    var activeTab = tabName || state.activeSectionTab;
    if (activeTab === "video") return renderVideoTab(blockId);
    if (activeTab === "file") return renderFileTab(blockId);
    if (activeTab === "image") return renderImageTab(blockId);
    return renderTextTab(blockId);
  }

  function renderTextTab(blockId) {
    var textItem = getTextItem(blockId);
    return [
      '<section class="admin-tab-panel">',
      '<h5>Текст</h5>',
      '<div id="quillEditor-' + blockId + '" class="admin-quill" data-quill-block-id="' + blockId + '" data-initial-html="' + escapeAttr(textItem ? textItem.text_html || '<p></p>' : '<p></p>') + '"></div>',
      '<div class="admin-form" style="margin-top:12px;">',
      '<button class="btn btn-primary save-text-btn" data-block-id="' + blockId + '" type="button">Сохранить текст</button>',
      '</div>',
      '</section>'
    ].join("");
  }

  function renderTooltipTrigger(options) {
    var data = options || {};
    var label = data.label || "?";
    var extraClass = data.className ? " " + data.className : "";
    var extraAttrs = "";
    if (data.extraDataAttrs) {
      Object.keys(data.extraDataAttrs).forEach(function (key) {
        var attrValue = data.extraDataAttrs[key];
        if (attrValue === undefined || attrValue === null || attrValue === false) return;
        extraAttrs += ' data-' + key + '="' + escapeAttr(String(attrValue)) + '"';
      });
    }
    return [
      '<button class="admin-tooltip-trigger' + extraClass + '" type="button"',
      ' aria-label="' + escapeAttr(data.ariaLabel || "Открыть подсказку") + '"',
      ' data-tooltip-title="' + escapeAttr(data.title || "Подсказка") + '"',
      ' data-tooltip-content="' + escapeAttr(data.content || "") + '"',
      extraAttrs,
      '>' + escapeHtml(label) + '</button>'
    ].join("");
  }

  function renderVideoTab(blockId) {
    var videos = getVideoItems(blockId);
    var block = getBlockById(blockId);
    var videoDescription = block ? String(block.video_description || "") : "";
    return [
      '<section class="admin-tab-panel">',
      '<div class="admin-panel-head">',
      '<h5>Видео</h5>',
      '<div class="admin-panel-actions">',
      renderTooltipTrigger({
        ariaLabel: "Подсказка: как добавить видео",
        title: "Как добавить видео?",
        label: "Как добавить видео ?",
        className: "admin-tooltip-trigger--link",
        content: [
          "1. Загрузите видео на одну из поддерживаемых платформ",
          "2. Скопируйте ссылку на видео",
          "3. Вставьте её сюда",
          "4. Система автоматически определит платформу"
        ].join("\n"),
        extraDataAttrs: {
          "tooltip-kinescope-help": "true"
        }
      }),
      '</div>',
      '</div>',
      '<div class="admin-section-form" id="videoForm-' + blockId + '">',
      '<label>Ссылка на видео',
      '<input class="video-id-input" data-block-id="' + blockId + '" type="text" placeholder="https://..." />',
      '</label>',
      '<label>Описание под видео',
      '<textarea class="video-description-input" data-block-id="' + blockId + '" rows="4" placeholder="Короткий текст, который будет показан под видео. Можно оставить пустым.">' + escapeHtml(videoDescription) + '</textarea>',
      '</label>',
      '<p class="admin-hint">Короткий текст, который будет показан под видео. Можно оставить пустым.</p>',
      '<p class="admin-hint">Поддерживаются:<br><strong class="admin-hint__brand">Kinescope</strong>, Vimeo, Rutube и Google Drive.</p>',
      '<p class="admin-hint admin-hint--kinescope">Kinescope рекомендуется для курсов:<br>без рекламы, лучше работает в Telegram и поддерживает защиту видео.</p>',
      '<button class="btn btn-primary save-video-btn" data-block-id="' + blockId + '" type="button">Сохранить видео</button>',
      '</div>',
      '<div class="admin-mini-cards">',
      renderVideoCards(videos),
      '</div>',
      '</section>'
    ].join("");
  }

  function renderFileTab(blockId) {
    var files = getFileItems(blockId);
    return [
      '<section class="admin-tab-panel">',
      '<div class="admin-panel-head">',
      '<h5>Файлы</h5>',
      '<div class="admin-panel-actions">',
      renderTooltipTrigger({
        ariaLabel: "Подсказка: как добавить файл",
        title: "Как добавить файл?",
        label: "Как добавить файл ?",
        className: "admin-tooltip-trigger--link",
        content: [
          "Как добавить файл?",
          "1. Загрузите файл на Google Drive",
          "2. Откройте доступ по ссылке",
          "3. Скопируйте ссылку на файл",
          "4. Вставьте её сюда",
          "",
          "Система сама определит ID файла."
        ].join("\n")
      }),
      '</div>',
      '</div>',
      '<div class="admin-section-form" id="fileForm-' + blockId + '">',
      '<label>Название файла',
      '<input class="file-label-input" data-block-id="' + blockId + '" type="text" placeholder="Например: Чеклист.pdf" />',
      '</label>',
      '<label>Ссылка на файл Google Drive',
      '<input class="file-link-input" data-block-id="' + blockId + '" type="text" placeholder="https://drive.google.com/file/d/.../view" />',
      '</label>',
      '<p class="admin-hint admin-image-upload-hint">Или загрузите файл с компьютера (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ZIP, RAR, PNG, JPG, JPEG, WEBP), до 10 MB.</p>',
      '<label>Загрузить файл',
      '<input class="file-upload-input" data-block-id="' + blockId + '" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.png,.jpg,.jpeg,.webp" />',
      '</label>',
      '<button class="btn btn-primary save-file-btn" data-block-id="' + blockId + '" type="button">Сохранить файл</button>',
      '</div>',
      '<div class="admin-mini-cards">',
      renderFileCards(files),
      '</div>',
      '</section>'
    ].join("");
  }

  function renderImageTab(blockId) {
    var images = getImageItems(blockId);
    return [
      '<section class="admin-tab-panel">',
      '<div class="admin-panel-head">',
      '<h5>Картинка</h5>',
      '<div class="admin-panel-actions"></div>',
      '</div>',
      '<div class="admin-section-form" id="imageForm-' + blockId + '">',
      '<p class="admin-hint admin-image-upload-hint">Рекомендуемый формат: JPG или PNG.<br>Лучше использовать ширину от 1200 px.<br>Горизонтальные, квадратные и вертикальные изображения поддерживаются.<br>Можно загружать JPG, PNG или WEBP размером до 5 MB.</p>',
      '<label>Файл изображения',
      '<input class="image-file-input" data-block-id="' + blockId + '" type="file" accept="image/png,image/jpeg,image/webp" />',
      '</label>',
      '<label>Подпись (необязательно)',
      '<input class="image-alt-input" data-block-id="' + blockId + '" type="text" placeholder="Например: Схема питания на неделю" />',
      '</label>',
      '<button class="btn btn-primary save-image-btn" data-block-id="' + blockId + '" type="button">Загрузить картинку</button>',
      '</div>',
      '<div class="admin-mini-cards">',
      renderImageCards(images),
      '</div>',
      '</section>'
    ].join("");
  }

  function renderVideoCards(videos) {
    var validVideos = videos.filter(function (video) {
      return String(video.video_id || "").trim();
    });
    if (!validVideos.length) {
      return '<div class="admin-empty">Видео не добавлено</div>';
    }

    return validVideos.map(function (video) {
      return [
        '<div class="admin-mini-card">',
        '<p><strong>Видео</strong></p>',
        '<p>ID: ' + escapeHtml(video.video_id || "") + '</p>',
        '<button class="admin-btn-ghost delete-item-btn" data-item-id="' + video.id + '" type="button">Удалить</button>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderFileCards(files) {
    var validFiles = files.filter(function (file) {
      return String(file.file_id || "").trim();
    });
    if (!validFiles.length) {
      return '<div class="admin-empty">Файлы не добавлены</div>';
    }

    return validFiles.map(function (file) {
      var isUrlFile = /^https?:\/\//i.test(String(file.file_id || "").trim());
      return [
        '<div class="admin-mini-card">',
        '<p><strong>' + escapeHtml(file.file_label || "Без названия") + '</strong></p>',
        isUrlFile ? '<p>Файл загружен</p>' : '<p>ID: ' + escapeHtml(file.file_id || "") + '</p>',
        isUrlFile ? '<a class="admin-btn-ghost" href="' + escapeAttr(file.file_id || "") + '" target="_blank" rel="noopener noreferrer">Открыть</a>' : "",
        '<button class="admin-btn-ghost delete-item-btn" data-item-id="' + file.id + '" type="button">Удалить</button>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderImageCards(images) {
    if (!images.length) {
      return '<div class="admin-empty">Картинки не добавлены</div>';
    }

    return images.map(function (image) {
      return [
        '<div class="admin-mini-card admin-mini-card--image">',
        '<div class="admin-mini-card__image-wrap"><img src="' + escapeAttr(image.image_url || "") + '" alt="' + escapeAttr(image.image_alt || "Изображение урока") + '"></div>',
        image.image_alt ? '<p><strong>' + escapeHtml(image.image_alt) + '</strong></p>' : '<p><strong>Без подписи</strong></p>',
        '<button class="admin-btn-ghost delete-item-btn" data-item-id="' + image.id + '" type="button">Удалить</button>',
        '</div>'
      ].join("");
    }).join("");
  }

  function validateImageFile(file) {
    if (!file) {
      return { isValid: false, message: "Файл не выбран" };
    }
    if (ALLOWED_PREVIEW_MIME_TYPES.indexOf(file.type) === -1) {
      return { isValid: false, message: "Можно загружать только JPG, PNG или WEBP" };
    }
    if (file.size > MAX_PREVIEW_FILE_SIZE) {
      return { isValid: false, message: "Файл слишком большой. Максимум 5 MB" };
    }
    return { isValid: true, message: "" };
  }

  function sanitizeFileName(fileName) {
    return String(fileName || "preview")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function getFileExtension(fileName) {
    var match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/i);
    return match ? match[1] : "";
  }

  function validateLessonFile(file) {
    if (!file) return { isValid: false, message: "Файл не выбран" };
    var extension = getFileExtension(file.name);
    if (ALLOWED_LESSON_FILE_MIME_TYPES.indexOf(file.type) === -1 && ALLOWED_LESSON_FILE_EXTENSIONS.indexOf(extension) === -1) {
      return { isValid: false, message: "Неподдерживаемый формат файла." };
    }
    if (file.size > MAX_LESSON_FILE_SIZE) {
      return { isValid: false, message: "Файл слишком большой. Максимальный размер — 10 MB." };
    }
    return { isValid: true, message: "" };
  }

  async function saveLessonPreviewUrl(lessonId, url) {
    var client = getClient();
    if (!client) return null;

    var result = await client
      .from("lessons")
      .update({ preview_image_url: url || null })
      .eq("id", lessonId)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      throw new Error("Не удалось сохранить превью урока");
    }

    return result.data;
  }

  function extractStoragePathFromPublicUrl(publicUrl, bucketName) {
    if (!publicUrl) return null;
    var marker = "/storage/v1/object/public/" + (bucketName || "lesson-previews") + "/";
    var markerIndex = publicUrl.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
  }

  async function uploadLessonPreview(file) {
    if (!state.selectedLesson) {
      throw new Error("Сначала выберите урок");
    }

    var validation = validateImageFile(file);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }

    var client = getClient();
    var config = getConfig();
    if (!client) throw new Error("Supabase client not initialized");

    var folderCourseId = getActiveCourseId() || state.selectedLesson.course_id || "course";
    var folderLessonId = state.selectedLesson.lesson_id || String(state.selectedLesson.id);
    var safeName = sanitizeFileName(file.name || "preview-image");
    var filePath = folderCourseId + "/" + folderLessonId + "/" + Date.now() + "-" + safeName;

    var uploadResult = await client.storage
      .from("lesson-previews")
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadResult.error) {
      console.error(uploadResult.error);
      throw new Error("Ошибка загрузки файла в Storage");
    }

    var publicResult = client.storage.from("lesson-previews").getPublicUrl(filePath);
    var publicUrl = publicResult && publicResult.data ? publicResult.data.publicUrl : "";
    if (!publicUrl) {
      throw new Error("Не удалось получить public URL файла");
    }

    return { publicUrl: publicUrl, filePath: filePath };
  }

  async function uploadSectionImage(blockId, file) {
    if (!state.selectedLesson) {
      throw new Error("Сначала выберите урок");
    }

    var validation = validateImageFile(file);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }

    var client = getClient();
    var config = getConfig();
    if (!client) throw new Error("Supabase client not initialized");

    var folderCourseId = getActiveCourseId() || state.selectedLesson.course_id || "course";
    var folderLessonId = state.selectedLesson.lesson_id || String(state.selectedLesson.id);
    var safeName = sanitizeFileName(file.name || "lesson-image");
    var filePath = folderCourseId + "/" + folderLessonId + "/" + String(blockId) + "/" + Date.now() + "_" + safeName;

    var uploadResult = await client.storage
      .from("lesson-images")
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadResult.error) {
      console.error(uploadResult.error);
      throw new Error("Ошибка загрузки картинки в Storage");
    }

    var publicResult = client.storage.from("lesson-images").getPublicUrl(filePath);
    var publicUrl = publicResult && publicResult.data ? publicResult.data.publicUrl : "";
    if (!publicUrl) {
      throw new Error("Не удалось получить public URL картинки");
    }

    return { publicUrl: publicUrl, filePath: filePath };
  }

  async function uploadLessonFile(blockId, file) {
    if (!state.selectedLesson) throw new Error("Сначала выберите урок");
    var validation = validateLessonFile(file);
    if (!validation.isValid) throw new Error(validation.message);

    var client = getClient();
    if (!client) throw new Error("Supabase client not initialized");

    var folderCourseId = getActiveCourseId() || state.selectedLesson.course_id || "course";
    var folderLessonId = state.selectedLesson.lesson_id || String(state.selectedLesson.id);
    var safeName = sanitizeFileName(file.name || "lesson-file");
    var filePath = folderCourseId + "/" + folderLessonId + "/" + Date.now() + "-" + safeName;

    var uploadResult = await client.storage
      .from("course-files")
      .upload(filePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });

    if (uploadResult.error) {
      console.error(uploadResult.error);
      throw new Error("Ошибка загрузки файла в Storage");
    }

    var publicResult = client.storage.from("course-files").getPublicUrl(filePath);
    var publicUrl = publicResult && publicResult.data ? publicResult.data.publicUrl : "";
    if (!publicUrl) throw new Error("Не удалось получить public URL файла");

    return { publicUrl: publicUrl, filePath: filePath, originalName: file.name || "" };
  }

  async function clearLessonPreview() {
    if (!state.selectedLesson) return;

    var previousUrl = state.selectedLesson.preview_image_url || "";
    var savedLesson = await saveLessonPreviewUrl(state.selectedLesson.id, null);
    state.selectedLesson = savedLesson;
    state.lessons = state.lessons.map(function (lesson) {
      return String(lesson.id) === String(savedLesson.id) ? savedLesson : lesson;
    });

    var storagePath = extractStoragePathFromPublicUrl(previousUrl);
    if (storagePath) {
      var client = getClient();
      if (client) {
        var removeResult = await client.storage.from("lesson-previews").remove([storagePath]);
        if (removeResult.error) {
          console.warn("Не удалось удалить файл из Storage:", removeResult.error.message);
        }
      }
    }

    renderLessonsList();
    renderLessonPreviewUploader();
    refreshPreviewData();
  }

  function initQuillForActiveSection(blockId) {
    if (!window.Quill) return;

    var container = document.querySelector('[data-quill-block-id="' + blockId + '"]');
    if (!container || state.quills[String(blockId)]) return;

    var quill = new window.Quill("#" + container.id, {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "blockquote"],
          ["clean"]
        ]
      }
    });

    quill.root.innerHTML = container.getAttribute("data-initial-html") || "<p></p>";
    quill.on("text-change", function () {
      });
    state.quills[String(blockId)] = quill;
  }

  async function selectLessonById(lessonDbId, options) {
    options = options || {};
    var lesson = state.lessons.find(function (item) {
      return String(item.id) === String(lessonDbId);
    });

    if (!lesson) return;

    state.selectedLesson = lesson;
    state.quills = {};
    state.activeSectionId = null;
    state.activeSectionTab = "text";

    state.blocks = await fetchLessonBlocks(lesson.id);
    state.blockGroups = await fetchLessonBlockGroups(lesson.id);
    var blockIds = state.blocks.map(function (block) { return block.id; });
    var allItems = await fetchItemsForBlocks(blockIds);
    setItemsByBlock(allItems);

    renderLessonsList();
    renderEditor();
    if (options.navigatePreview !== false) {
      navigatePreviewToLesson(lesson.lesson_id || lesson.id);
    }
  }

  async function duplicateLesson(lessonDbId) {
    var sourceLesson = state.lessons.find(function (lesson) {
      return String(lesson.id) === String(lessonDbId);
    });

    if (!sourceLesson) return;

    var client = getClient();
    if (!client) return;

    var sourceBlocks = await fetchLessonBlocks(sourceLesson.id);
    var sourceBlockIds = sourceBlocks.map(function (block) {
      return block.id;
    });
    var sourceItems = await fetchItemsForBlocks(sourceBlockIds);
    var sourceGroups = await fetchLessonBlockGroups(sourceLesson.id);

    var nextDayNumber = state.lessons.length
      ? Math.max.apply(null, state.lessons.map(function (lesson) {
        return lesson.day_number || 0;
      })) + 1
      : 1;

    var nextLessonPayload = cloneRecord(sourceLesson, [
      "id",
      "created_at",
      "updated_at",
      "day_number",
      "lesson_id"
    ]);

    nextLessonPayload.day_number = nextDayNumber;
    nextLessonPayload.lesson_id = generateLessonId();
    nextLessonPayload.title = getDuplicateTitle(
      sourceLesson.title || "Урок",
      state.lessons.map(function (lesson) {
        return lesson.title;
      })
    );

    var lessonInsert = await client
      .from("lessons")
      .insert(nextLessonPayload)
      .select()
      .single();

    if (lessonInsert.error) {
      console.error(lessonInsert.error);
      alert("Ошибка дублирования урока");
      return;
    }

    var insertedLesson = lessonInsert.data;
    var oldToNewGroupId = {};
    var sortedSourceGroups = sourceGroups.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    for (var groupIndex = 0; groupIndex < sortedSourceGroups.length; groupIndex += 1) {
      var sourceGroup = sortedSourceGroups[groupIndex];
      var newGroupPayload = cloneRecord(sourceGroup, ["id", "created_at", "updated_at", "lesson_id"]);
      newGroupPayload.lesson_id = insertedLesson.id;
      newGroupPayload.course_id = getActiveCourseId();

      var groupInsert = await client
        .from("lesson_block_groups")
        .insert(newGroupPayload)
        .select()
        .single();

      if (groupInsert.error) {
        console.error(groupInsert.error);
        alert("Урок создан, но не удалось скопировать группы материалов полностью");
        break;
      }

      oldToNewGroupId[String(sourceGroup.id)] = groupInsert.data.id;
    }

    var oldToNewBlockId = {};

    var sortedSourceBlocks = sourceBlocks.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    for (var i = 0; i < sortedSourceBlocks.length; i += 1) {
      var sourceBlock = sortedSourceBlocks[i];
      var newBlockPayload = cloneRecord(sourceBlock, ["id", "created_at", "updated_at", "lesson_id"]);
      newBlockPayload.lesson_id = insertedLesson.id;
      newBlockPayload.group_id = sourceBlock.group_id ? (oldToNewGroupId[String(sourceBlock.group_id)] || null) : null;

      var blockInsert = await client
        .from("lesson_blocks")
        .insert(newBlockPayload)
        .select()
        .single();

      if (blockInsert.error) {
        console.error(blockInsert.error);
        alert("Урок создан, но не удалось скопировать материалы полностью");
        break;
      }

      oldToNewBlockId[String(sourceBlock.id)] = blockInsert.data.id;
    }

    var sortedSourceItems = sourceItems.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    for (var j = 0; j < sortedSourceItems.length; j += 1) {
      var sourceItem = sortedSourceItems[j];
      var mappedBlockId = oldToNewBlockId[String(sourceItem.block_id)];
      if (!mappedBlockId) continue;

      var newItemPayload = cloneRecord(sourceItem, ["id", "created_at", "updated_at", "block_id"]);
      newItemPayload.block_id = mappedBlockId;

      var itemInsert = await client
        .from("lesson_block_items")
        .insert(newItemPayload);

      if (itemInsert.error) {
        console.error(itemInsert.error);
        alert("Урок и материалы созданы, но часть материалов не скопирована");
        break;
      }
    }

    state.lessons.push(insertedLesson);
    state.lessons.sort(function (a, b) {
      return (a.day_number || 0) - (b.day_number || 0);
    });

    renderLessonsList();
    await selectLessonById(insertedLesson.id);
  }

  async function duplicateBlock(blockId) {
    if (!state.selectedLesson) return;

    var sourceIndex = state.blocks.findIndex(function (block) {
      return String(block.id) === String(blockId);
    });
    if (sourceIndex < 0) return;

    var sourceBlock = state.blocks[sourceIndex];
    var sourceItems = getItems(blockId).slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    var client = getClient();
    if (!client) return;

    for (var i = sourceIndex + 1; i < state.blocks.length; i += 1) {
      var blockToShift = state.blocks[i];
      var newSortOrder = (blockToShift.sort_order || (i + 1)) + 1;

      var shiftResult = await client
        .from("lesson_blocks")
        .update({ sort_order: newSortOrder })
        .eq("id", blockToShift.id);

      if (shiftResult.error) {
        console.error(shiftResult.error);
        alert("Ошибка дублирования материала");
        return;
      }

      blockToShift.sort_order = newSortOrder;
    }

    var copiedBlockPayload = cloneRecord(sourceBlock, ["id", "created_at", "updated_at"]);
    copiedBlockPayload.lesson_id = state.selectedLesson.id;
    copiedBlockPayload.sort_order = (sourceBlock.sort_order || (sourceIndex + 1)) + 1;
    if (String(sourceBlock.title || "").trim()) {
      copiedBlockPayload.title = getDuplicateTitle(sourceBlock.title, state.blocks.map(function (block) {
        return block.title;
      }));
    }

    var blockInsert = await client
      .from("lesson_blocks")
      .insert(copiedBlockPayload)
      .select()
      .single();

    if (blockInsert.error) {
      console.error(blockInsert.error);
      alert("Ошибка дублирования материала");
      return;
    }

    var duplicatedBlock = blockInsert.data;
    var duplicatedItems = [];

    for (var j = 0; j < sourceItems.length; j += 1) {
      var sourceItem = sourceItems[j];
      var copiedItemPayload = cloneRecord(sourceItem, ["id", "created_at", "updated_at", "block_id"]);
      copiedItemPayload.block_id = duplicatedBlock.id;

      var itemInsert = await client
        .from("lesson_block_items")
        .insert(copiedItemPayload)
        .select()
        .single();

      if (itemInsert.error) {
        console.error(itemInsert.error);
        alert("Материал создана, но не все материалы удалось скопировать");
        continue;
      }

      duplicatedItems.push(itemInsert.data);
    }

    state.blocks.splice(sourceIndex + 1, 0, duplicatedBlock);
    state.blockItemsByBlockId[String(duplicatedBlock.id)] = duplicatedItems;
    state.activeSectionId = String(duplicatedBlock.id);
    state.activeSectionTab = "text";
    state.quills = {};

    renderEditor();
  }

  async function createLesson() {
    var client = getClient();
    var config = getConfig();
    if (!client) return;
    var limit = getCurrentTariffLimit();
    if (state.lessons.length >= limit.lessonsPerCourse) {
      showTariffLimitMessage(
        "Вы достигли лимита пробного тарифа\nНа пробном тарифе доступно " + limit.lessonsPerCourse + " урока в курсе. Чтобы добавить больше уроков и полноценно запустить курс — активируйте доступ."
      );
      return;
    }

    var nextDay = state.lessons.length
      ? Math.max.apply(null, state.lessons.map(function (lesson) { return lesson.day_number || 0; })) + 1
      : 1;

    var result = await client
      .from("lessons")
      .insert({
        course_id: getActiveCourseId(),
        lesson_id: generateLessonId(),
        day_number: nextDay,
        lesson_label: "",
        title: "Новый модуль",
        subtitle: "",
        preview_image_url: null
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания урока");
      return;
    }

    state.lessons.push(result.data);
    state.lessons.sort(function (a, b) {
      return (a.day_number || 0) - (b.day_number || 0);
    });

    renderLessonsList();
    await selectLessonById(result.data.id);
  }

  async function saveLesson() {
    if (!state.selectedLesson) return;

    var client = getClient();
    if (!client) return;

    var payload = {
      title: document.getElementById("titleInput").value.trim(),
      subtitle: document.getElementById("subtitleInput").value.trim(),
      day_number: Number(document.getElementById("dayNumberInput").value) || null,
      lesson_label: document.getElementById("lessonLabelInput").value.trim()
    };

    if (!state.selectedLesson.lesson_id) {
      payload.lesson_id = generateLessonId();
    }

    var result = await client
      .from("lessons")
      .update(payload)
      .eq("id", state.selectedLesson.id)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения урока");
      return;
    }

    state.selectedLesson = result.data;
    state.lessons = state.lessons.map(function (lesson) {
      return String(lesson.id) === String(result.data.id) ? result.data : lesson;
    }).sort(function (a, b) {
      return (a.day_number || 0) - (b.day_number || 0);
    });

    renderLessonsList();
    renderEditor();
    refreshPreviewData();
    alert("Урок сохранён");
  }

  async function deleteLesson() {
    if (!state.selectedLesson) return;

    var client = getClient();
    if (!client) return;

    var lessonToDelete = state.selectedLesson;
    var confirmed = window.confirm(
      "Удалить модуль полностью? Будут удалены все материалы, текст, видео и файлы этого модуля. Это действие нельзя отменить."
    );
    if (!confirmed) return;

    var lessonBlocksResult = await client
      .from("lesson_blocks")
      .select("id")
      .eq("lesson_id", lessonToDelete.id);

    if (lessonBlocksResult.error) {
      console.error(lessonBlocksResult.error);
      alert("Не удалось получить материалы урока перед удалением");
      return;
    }

    var blockIds = (lessonBlocksResult.data || []).map(function (block) {
      return block.id;
    });

    if (blockIds.length) {
      var deleteItemsResult = await client
        .from("lesson_block_items")
        .delete()
        .in("block_id", blockIds);

      if (deleteItemsResult.error) {
        console.error(deleteItemsResult.error);
        alert("Не удалось удалить материалы урока");
        return;
      }
    }

    var deleteBlocksResult = await client
      .from("lesson_blocks")
      .delete()
      .eq("lesson_id", lessonToDelete.id);

    if (deleteBlocksResult.error) {
      console.error(deleteBlocksResult.error);
      alert("Не удалось удалить материалы урока");
      return;
    }

    var deleteGroupsResult = await client
      .from("lesson_block_groups")
      .delete()
      .eq("lesson_id", lessonToDelete.id);

    if (deleteGroupsResult.error) {
      console.error(deleteGroupsResult.error);
      alert("Не удалось удалить группы материалов урока");
      return;
    }

    var deleteLessonResult = await client
      .from("lessons")
      .delete()
      .eq("id", lessonToDelete.id);

    if (deleteLessonResult.error) {
      console.error(deleteLessonResult.error);
      alert("Не удалось удалить урок");
      return;
    }

    var storagePath = extractStoragePathFromPublicUrl(lessonToDelete.preview_image_url || "");
    if (storagePath) {
      var removePreviewResult = await client.storage.from("lesson-previews").remove([storagePath]);
      if (removePreviewResult.error) {
        console.warn("Не удалось удалить preview из Storage:", removePreviewResult.error.message);
      }
    }

    state.lessons = state.lessons.filter(function (lesson) {
      return String(lesson.id) !== String(lessonToDelete.id);
    });

    if (state.lessons.length) {
      await selectLessonById(state.lessons[0].id);
    } else {
      state.selectedLesson = null;
      state.blocks = [];
      state.blockItemsByBlockId = {};
      state.blockGroups = [];
      state.quills = {};
      state.activeSectionId = null;
      state.activeSectionTab = "text";
      renderLessonsList();
      renderEditor();
    }

    alert("Урок удалён");
  }

  async function createMaterial(type) {
    if (!state.selectedLesson) {
      alert("Сначала выберите урок");
      return;
    }

    var client = getClient();
    if (!client) return;

    var topLevelOrders = getLessonDisplayOrderItems().map(function (item) { return item.data.sort_order || 0; });
    var nextOrder = topLevelOrders.length ? Math.max.apply(null, topLevelOrders) + 1 : 1;

    var newBlockPayload = {
      lesson_id: state.selectedLesson.id,
      sort_order: nextOrder,
      block_type: "section",
      group_id: null
    };

    if (type === "video") {
      newBlockPayload.video_description = null;
    }

    var result = await client
      .from("lesson_blocks")
      .insert(newBlockPayload)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания материала: " + result.error.message);
      return;
    }

    var createdBlock = result.data;
    var materialType = ["text", "video", "image", "file"].indexOf(type) >= 0 ? type : "text";
    var itemPayload = {
      block_id: createdBlock.id,
      sort_order: 1,
      item_type: materialType
    };
    if (materialType === "text") itemPayload.text_html = "<p></p>";
    if (materialType === "video") itemPayload.video_id = null;
    if (materialType === "file") {
      itemPayload.file_label = null;
      itemPayload.file_id = null;
    }
    if (materialType === "image") {
      itemPayload.image_url = null;
      itemPayload.image_alt = null;
    }

    var createdItem = null;
    var itemInsertResult = await client
      .from("lesson_block_items")
      .insert(itemPayload)
      .select()
      .single();

    if (itemInsertResult.error) {
      console.warn("Не удалось создать материал сразу, будет создан при сохранении:", itemInsertResult.error);
    } else {
      createdItem = itemInsertResult.data;
    }

    state.blocks.push(createdBlock);
    state.blocks.sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    state.blockItemsByBlockId[String(createdBlock.id)] = createdItem ? [createdItem] : [];
    state.activeSectionId = String(createdBlock.id);
    state.activeSectionTab = materialType;
    state.quills = {};

    renderBlocksList();
    refreshPreviewData();
  }

  async function updateDisplayOrderItem(item, sortOrder) {
    var client = getClient();
    if (!client) return false;
    var table = item.type === "group" ? "lesson_block_groups" : "lesson_blocks";
    var result = await client
      .from(table)
      .update({ sort_order: sortOrder })
      .eq("id", item.data.id);

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения общего порядка отображения");
      return false;
    }

    item.data.sort_order = sortOrder;
    return true;
  }

  async function normalizeLessonDisplayOrder(displayItems) {
    var items = displayItems || getLessonDisplayOrderItems();
    for (var i = 0; i < items.length; i += 1) {
      var nextOrder = i + 1;
      if ((items[i].data.sort_order || 0) !== nextOrder) {
        if (!(await updateDisplayOrderItem(items[i], nextOrder))) return false;
      }
    }
    state.blocks.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    state.blockGroups.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    return true;
  }

  async function swapDisplayOrderItem(itemType, itemId, direction) {
    var displayItems = getLessonDisplayOrderItems();
    var currentIndex = displayItems.findIndex(function (item) {
      return item.type === itemType && String(item.id) === String(itemId);
    });
    if (currentIndex < 0) return false;

    var swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= displayItems.length) return false;

    var moved = displayItems.splice(currentIndex, 1)[0];
    displayItems.splice(swapIndex, 0, moved);

    if (!(await normalizeLessonDisplayOrder(displayItems))) return false;
    renderEditor();
    return true;
  }

  async function swapBlockWithinMaterials(blockId, direction) {
    var sourceBlock = state.blocks.find(function (block) { return String(block.id) === String(blockId); });
    if (!sourceBlock) return;
    var scopedBlocks = state.blocks.filter(function (block) {
      return String(block.group_id || "") === String(sourceBlock.group_id || "");
    }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    var currentIndex = scopedBlocks.findIndex(function (block) {
      return String(block.id) === String(blockId);
    });
    if (currentIndex < 0) return;

    var swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= scopedBlocks.length) return;

    var currentBlock = scopedBlocks[currentIndex];
    var targetBlock = scopedBlocks[swapIndex];
    var currentItem = { type: "block", id: String(currentBlock.id), data: currentBlock };
    var targetItem = { type: "block", id: String(targetBlock.id), data: targetBlock };
    var currentOrder = currentBlock.sort_order || currentIndex + 1;
    var targetOrder = targetBlock.sort_order || swapIndex + 1;

    if (!(await updateDisplayOrderItem(currentItem, targetOrder))) return;
    if (!(await updateDisplayOrderItem(targetItem, currentOrder))) return;

    state.blocks.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    renderEditor();
  }

  async function swapBlocks(blockId, direction) {
    var block = state.blocks.find(function (item) { return String(item.id) === String(blockId); });
    if (!block) return;
    if (!block.group_id && state.blockGroups.length) {
      await swapDisplayOrderItem("block", blockId, direction);
      return;
    }
    await swapBlockWithinMaterials(blockId, direction);
  }

  async function swapBlockGroup(groupId, direction) {
    await swapDisplayOrderItem("group", groupId, direction);
  }

  function resetDragAndDropState() {
    state.dnd.draggedBlockId = null;
    state.dnd.dropTargetBlockId = null;
    state.dnd.dropPosition = null;
    state.dnd.originalOrder = null;
    state.dnd.dropHappened = false;
  }

  function clearDragOverClasses() {
    var cards = document.querySelectorAll(".admin-block-item");
    cards.forEach(function (card) {
      card.classList.remove("drag-over-top");
      card.classList.remove("drag-over-bottom");
    });
  }

  function getBlocksFromDomOrder() {
    var cards = Array.prototype.slice.call(document.querySelectorAll("#blocksList .admin-block-item[data-block-id]"));
    if (!cards.length) return null;

    var byId = {};
    state.blocks.forEach(function (block) {
      byId[String(block.id)] = block;
    });

    var ordered = cards.map(function (card) {
      return byId[String(card.getAttribute("data-block-id"))];
    }).filter(Boolean);

    if (ordered.length !== state.blocks.length) return null;
    return ordered;
  }

  function refreshBlockIndicesInDom() {
    var cards = document.querySelectorAll("#blocksList .admin-block-item");
    cards.forEach(function (card, index) {
      var title = card.querySelector(".admin-block-head h4");
      if (title) {
        title.textContent = "Материал " + (index + 1);
      }
    });
  }

  async function saveBlocksOrder(orderedBlocks, options) {
    if (!orderedBlocks || !orderedBlocks.length) return;
    var shouldRerender = !(options && options.skipRerender);

    var client = getClient();
    if (!client) return;

    var updates = orderedBlocks.map(function (block, index) {
      return {
        id: block.id,
        newOrder: index + 1,
        oldOrder: block.sort_order || 0
      };
    }).filter(function (entry) {
      return entry.newOrder !== entry.oldOrder;
    });

    for (var i = 0; i < updates.length; i += 1) {
      var updateEntry = updates[i];
      var updateResult = await client
        .from("lesson_blocks")
        .update({ sort_order: updateEntry.newOrder })
        .eq("id", updateEntry.id);

      if (updateResult.error) {
        console.error(updateResult.error);
        alert("Ошибка сохранения нового порядка материалов");
        return;
      }
    }

    state.blocks = orderedBlocks.map(function (block, index) {
      return Object.assign({}, block, { sort_order: index + 1 });
    });

    if (shouldRerender) {
      renderBlocksList();
    } else {
      refreshBlockIndicesInDom();
    }
    refreshPreviewData();
  }

  async function saveBlockGroupSelection(blockId, groupId) {
    var client = getClient();
    if (!client) return;
    var normalizedGroupId = groupId || null;
    var payload = { group_id: normalizedGroupId };
    if (normalizedGroupId) {
      var groupBlocks = state.blocks.filter(function (block) {
        return String(block.group_id || "") === String(normalizedGroupId) && String(block.id) !== String(blockId);
      });
      payload.sort_order = groupBlocks.length ? Math.max.apply(null, groupBlocks.map(function (block) { return block.sort_order || 0; })) + 1 : 1;
    } else {
      var topLevelOrders = getLessonDisplayOrderItems().filter(function (item) {
        return !(item.type === "block" && String(item.id) === String(blockId));
      }).map(function (item) { return item.data.sort_order || 0; });
      payload.sort_order = topLevelOrders.length ? Math.max.apply(null, topLevelOrders) + 1 : 1;
    }

    var result = await client
      .from("lesson_blocks")
      .update(payload)
      .eq("id", blockId)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Не удалось сохранить группу материала");
      return;
    }

    state.blocks = state.blocks.map(function (block) {
      return String(block.id) === String(blockId) ? result.data : block;
    });
    if (!normalizedGroupId) {
      await normalizeLessonDisplayOrder();
    }
    renderEditor();
    refreshPreviewData();
  }

  async function upsertBlockGroup(groupId) {
    if (!state.selectedLesson) return;
    var existing = state.blockGroups.find(function (group) { return String(group.id) === String(groupId); }) || {};
    var title = window.prompt("Название группы", existing.title || "");
    if (title === null) return;
    title = title.trim();
    if (!title) { alert("Введите название группы"); return; }
    var description = window.prompt("Описание группы (необязательно)", existing.description || "");
    if (description === null) return;
    var topLevelOrders = getLessonDisplayOrderItems().filter(function (item) {
      return !(item.type === "group" && String(item.id) === String(groupId));
    }).map(function (item) { return item.data.sort_order || 0; });
    var defaultOrder = existing.sort_order || (topLevelOrders.length ? Math.max.apply(null, topLevelOrders) + 1 : 1);
    var sortOrderValue = window.prompt("Порядок отображения", String(defaultOrder));
    if (sortOrderValue === null) return;
    var sortOrder = Number(sortOrderValue) || defaultOrder;
    var payload = {
      course_id: getActiveCourseId(),
      lesson_id: state.selectedLesson.id,
      title: title,
      description: description.trim() || null,
      sort_order: sortOrder
    };
    var client = getClient();
    if (!client) return;
    var query = groupId ? client.from("lesson_block_groups").update(payload).eq("id", groupId) : client.from("lesson_block_groups").insert(payload);
    var result = await query.select().single();
    if (result.error) { console.error(result.error); alert("Не удалось сохранить группу"); return; }
    if (groupId) {
      state.blockGroups = state.blockGroups.map(function (group) { return String(group.id) === String(groupId) ? result.data : group; });
    } else {
      state.blockGroups.push(result.data);
    }
    state.blockGroups.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    await normalizeLessonDisplayOrder();
    renderEditor();
  }

  async function deleteBlockGroup(groupId) {
    if (!window.confirm("Удалить группу? Материалы не удалятся и перейдут в «Без группы».")) return;
    var client = getClient();
    if (!client) return;
    var result = await client.from("lesson_block_groups").delete().eq("id", groupId);
    if (result.error) { console.error(result.error); alert("Не удалось удалить группу"); return; }
    state.blockGroups = state.blockGroups.filter(function (group) { return String(group.id) !== String(groupId); });
    state.blocks = state.blocks.map(function (block) {
      return String(block.group_id || "") === String(groupId) ? Object.assign({}, block, { group_id: null }) : block;
    });
    renderEditor();
  }

  async function deleteBlock(blockId) {
    var client = getClient();
    if (!client) return;

    var confirmDelete = window.confirm("Удалить материал и его содержимое?");
    if (!confirmDelete) return;

    var deleteItemsResult = await client
      .from("lesson_block_items")
      .delete()
      .eq("block_id", blockId);

    if (deleteItemsResult.error) {
      console.error(deleteItemsResult.error);
      alert("Ошибка удаления контента материала!");
      return;
    }

    var deleteBlockResult = await client
      .from("lesson_blocks")
      .delete()
      .eq("id", blockId);

    if (deleteBlockResult.error) {
      console.error(deleteBlockResult.error);
      alert("Ошибка удаления материала");
      return;
    }

    state.blocks = state.blocks.filter(function (block) {
      return String(block.id) !== String(blockId);
    });
    delete state.blockItemsByBlockId[String(blockId)];
    delete state.quills[String(blockId)];

    if (String(state.activeSectionId) === String(blockId)) {
      state.activeSectionId = null;
      state.activeSectionTab = "text";
    }

    renderEditor();
  }

  async function ensureTextItem(blockId) {
    var existing = getTextItem(blockId);
    if (existing) return existing;

    var client = getClient();
    if (!client) return null;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: 1,
        item_type: "text",
        text_html: "<p></p>"
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания текстового содержимого");
      return null;
    }

    var key = String(blockId);
    if (!state.blockItemsByBlockId[key]) {
      state.blockItemsByBlockId[key] = [];
    }
    state.blockItemsByBlockId[key].push(result.data);
    return result.data;
  }

  async function saveTextItem(blockId) {
    var quill = state.quills[String(blockId)];
    if (!quill) return;

    var textItem = await ensureTextItem(blockId);
    if (!textItem) return;

    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .update({ text_html: quill.root.innerHTML })
      .eq("id", textItem.id)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения текста материала");
      return;
    }

    var key = String(blockId);
    state.blockItemsByBlockId[key] = getItems(blockId).map(function (item) {
      return String(item.id) === String(result.data.id) ? result.data : item;
    });

    renderBlocksList();
    refreshPreviewData();
    alert("Текст сохранён");
  }

  async function saveVideoDescription(blockId, description) {
    var client = getClient();
    if (!client) return false;

    var normalizedDescription = String(description || "");
    var payload = { video_description: normalizedDescription.trim() ? normalizedDescription : null };
    var result = await client
      .from("lesson_blocks")
      .update(payload)
      .eq("id", blockId)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения описания видео");
      return false;
    }

    var block = getBlockById(blockId);
    if (block) block.video_description = result.data.video_description;
    return true;
  }

  async function createVideoItem(blockId, videoId) {
    if (!videoId) return null;

    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: getNextBlockItemOrder(blockId),
        item_type: "video",
        video_id: videoId
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания видео");
      return null;
    }

    getItems(blockId).push(result.data);
    renderBlocksList();
    refreshPreviewData();
    return result.data;
  }

  async function createFileItem(blockId, fileLabel, fileId) {
    if (!fileLabel || !fileId) return;

    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: getNextBlockItemOrder(blockId),
        item_type: "file",
        file_label: fileLabel,
        file_id: fileId
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания файла");
      return;
    }

    getItems(blockId).push(result.data);
    renderBlocksList();
    refreshPreviewData();
  }

  async function createImageItem(blockId, imageUrl, imageAlt) {
    if (!imageUrl) return null;

    var client = getClient();
    if (!client) return null;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: getNextBlockItemOrder(blockId),
        item_type: "image",
        image_url: imageUrl,
        image_alt: imageAlt || null
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения картинки в материале");
      return null;
    }

    getItems(blockId).push(result.data);
    renderBlocksList();
    refreshPreviewData();
    return result.data;
  }

  async function deleteItem(itemId) {
    var client = getClient();
    if (!client) return;

    var itemToDelete = null;
    Object.keys(state.blockItemsByBlockId).forEach(function (key) {
      var found = (state.blockItemsByBlockId[key] || []).find(function (item) {
        return String(item.id) === String(itemId);
      });
      if (found) itemToDelete = found;
    });

    var result = await client
      .from("lesson_block_items")
      .delete()
      .eq("id", itemId);

    if (result.error) {
      console.error(result.error);
      alert("Ошибка удаления");
      return;
    }

    Object.keys(state.blockItemsByBlockId).forEach(function (key) {
      state.blockItemsByBlockId[key] = state.blockItemsByBlockId[key].filter(function (item) {
        return String(item.id) !== String(itemId);
      });
    });

    if (itemToDelete && itemToDelete.item_type === "image" && itemToDelete.image_url) {
      var storagePath = extractStoragePathFromPublicUrl(itemToDelete.image_url, "lesson-images");
      if (storagePath) {
        var removeResult = await client.storage.from("lesson-images").remove([storagePath]);
        if (removeResult.error) {
          console.warn("Не удалось удалить картинку из Storage:", removeResult.error.message);
        }
      }
    }

    renderBlocksList();
    refreshPreviewData();
  }

  async function handleLessonPreviewUpload(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file || !state.selectedLesson) return;

    try {
      var uploadResult = await uploadLessonPreview(file);
      var savedLesson = await saveLessonPreviewUrl(state.selectedLesson.id, uploadResult.publicUrl);

      state.selectedLesson = savedLesson;
      state.lessons = state.lessons.map(function (lesson) {
        return String(lesson.id) === String(savedLesson.id) ? savedLesson : lesson;
      });

      renderLessonsList();
      renderLessonPreviewUploader();
        refreshPreviewData();
      alert("Превью модуля загружено");
    } catch (error) {
      console.error(error);
      alert(error && error.message ? error.message : "Не удалось загрузить превью");
    } finally {
      event.target.value = "";
    }
  }

  function isTouchTooltipMode() {
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }

  function ensureTooltipPopover() {
    if (tooltipState.popover) return tooltipState.popover;

    var popover = document.createElement("div");
    popover.className = "admin-tooltip-popover";
    popover.hidden = true;
    popover.setAttribute("role", "tooltip");
    popover.innerHTML = [
      '<p class="admin-tooltip-popover__title"></p>',
      '<p class="admin-tooltip-popover__body"></p>',
      '<button class="admin-tooltip-popover__kinescope-link" type="button" hidden>Как загрузить видео в Kinescope?</button>'
    ].join("");
    document.body.appendChild(popover);
    tooltipState.popover = popover;
    return popover;
  }

  function ensureKinescopeHelpModal() {
    var existing = document.getElementById("kinescopeHelpModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "kinescopeHelpModal";
    modal.className = "admin-kinescope-modal";
    modal.hidden = true;
    modal.innerHTML = [
      '<div class="admin-kinescope-modal__backdrop" data-kinescope-close="true"></div>',
      '<div class="admin-kinescope-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="kinescopeHelpTitle">',
      '<h3 id="kinescopeHelpTitle" class="admin-kinescope-modal__title">Kinescope — загрузка видео</h3>',
      '<div class="admin-kinescope-modal__content">',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">1. Перейдите на сайт:<br><a href="https://kinescope.ru" target="_blank" rel="noopener noreferrer">https://kinescope.ru</a></p></section>',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">2. Нажмите “Начать бесплатно”</p><img class="admin-kinescope-step__image" src="assets/images/k1.jpg" alt="Шаг 2: кнопка Начать бесплатно в Kinescope" loading="lazy"></section>',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">3. Пройдите регистрацию или авторизацию через Google или VK</p><img class="admin-kinescope-step__image" src="assets/images/k2.jpg" alt="Шаг 3: регистрация или вход в Kinescope" loading="lazy"></section>',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">4. Ответьте на краткий опрос<br><span class="admin-kinescope-step__subtext">(ответы не важны)</span></p><img class="admin-kinescope-step__image" src="assets/images/k3.jpg" alt="Шаг 4: опрос при регистрации в Kinescope" loading="lazy"></section>',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">5. Загрузите видео в Kinescope</p><img class="admin-kinescope-step__image" src="assets/images/k4.jpg" alt="Шаг 5: загрузка видео в Kinescope" loading="lazy"></section>',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">6. Скопируйте ссылку на видео</p><img class="admin-kinescope-step__image" src="assets/images/k5.jpg" alt="Шаг 6: копирование ссылки на видео в Kinescope" loading="lazy"></section>',
      '<section class="admin-kinescope-step"><p class="admin-kinescope-step__text">7. Вставьте ссылку в редакторе контента WebApp</p><img class="admin-kinescope-step__image" src="assets/images/k6.jpg" alt="Шаг 7: вставка ссылки в редакторе WebApp" loading="lazy"></section>',
      '<p class="admin-kinescope-modal__note">Kinescope рекомендуется для курсов: без рекламы, защита видео и лучшая работа в Telegram.</p>',
      '</div>',
      '<div class="admin-kinescope-modal__actions"><button class="btn btn-primary" type="button" data-kinescope-close="true">Понятно</button></div>',
      '</div>'
    ].join("");
    document.body.appendChild(modal);
    return modal;
  }

  function openKinescopeHelpModal() {
    var modal = ensureKinescopeHelpModal();
    modal.hidden = false;
    requestAnimationFrame(function () {
      modal.classList.add("is-open");
    });
  }

  function closeKinescopeHelpModal() {
    var modal = document.getElementById("kinescopeHelpModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    setTimeout(function () {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
      }
    }, 180);
  }

  function ensureTelegramBotHelpModal() {
    var existing = document.getElementById("telegramBotHelpModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "telegramBotHelpModal";
    modal.className = "admin-telegram-help-modal";
    modal.hidden = true;
    modal.innerHTML = [
      '<div class="admin-telegram-help-modal__backdrop" data-telegram-help-close="true"></div>',
      '<div class="admin-telegram-help-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="telegramBotHelpTitle">',
      '<div class="admin-telegram-help-modal__head">',
      '<h3 id="telegramBotHelpTitle" class="admin-telegram-help-modal__title">Как создать Telegram-бота и подключить кабинет</h3>',
      '<button class="admin-telegram-help-modal__close" type="button" aria-label="Закрыть" data-telegram-help-close="true">×</button>',
      '</div>',
      '<p class="admin-telegram-help-modal__subtitle">Следуйте шагам ниже. Это займёт 3–5 минут.</p>',
      '<div class="admin-telegram-help-modal__content">',
      '<section class="admin-telegram-help-step">',
      '<span class="admin-telegram-help-step__badge">Шаг 1</span><h4>Откройте BotFather</h4>',
      '<p>Перейдите в Telegram и откройте @BotFather. Нажмите на кнопку открытия Mini App BotFather.</p>',
      '<img class="admin-telegram-help-step__image" src="assets/images/bf0.jpg" alt="Шаг 1: открытие BotFather в Telegram" loading="lazy">',
      '</section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 2</span><h4>Создайте нового бота</h4><p>В BotFather нажмите Create a New Bot.</p><img class="admin-telegram-help-step__image" src="assets/images/bf1.jpg" alt="Шаг 2: Create a New Bot в BotFather" loading="lazy"></section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 3</span><h4>Заполните данные бота</h4><p>Введите название бота — его будут видеть ученики. Затем укажите username бота. Username должен заканчиваться на bot.</p><div class="admin-telegram-help-step__examples"><p><strong>Название:</strong> “Курс Анны”</p><p><strong>Username:</strong> “anna_course_bot”</p></div><img class="admin-telegram-help-step__image" src="assets/images/bf2.jpg" alt="Шаг 3: заполнение названия и username бота" loading="lazy"></section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 4</span><h4>Скопируйте API Token</h4><p>После создания бота BotFather покажет API Token. Скопируйте его и вставьте в поле Bot Token в админке.</p><div class="admin-telegram-help-modal__warning">Не публикуйте API Token и не отправляйте его посторонним. Он даёт доступ к управлению ботом.</div><img class="admin-telegram-help-step__image" src="assets/images/bf3.jpg" alt="Шаг 4: копирование API Token бота" loading="lazy"></section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 5</span><h4>Подключите Mini App к боту</h4><p>После вставки Bot Token и названия кнопки нажмите Подключить Telegram. Сервис автоматически добавит кнопку с кабинетом курса в вашего бота.</p><img class="admin-telegram-help-step__image" src="assets/images/bf4.jpg" alt="Шаг 5: подключение Mini App к Telegram-боту" loading="lazy"></section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 6</span><h4>Перейдите в созданного бота</h4><p>Откройте созданного бота, чтобы проверить, как всё выглядит для ученика.</p><img class="admin-telegram-help-step__image" src="assets/images/bf5.jpg" alt="Шаг 6: переход в созданного Telegram-бота" loading="lazy"></section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 7</span><h4>Скопируйте название бота</h4><p>Если нужно отправить ссылку ученикам, скопируйте username бота. Обычно он выглядит так: @anna_course_bot.</p><img class="admin-telegram-help-step__image" src="assets/images/bf6.jpg" alt="Шаг 7: копирование username бота" loading="lazy"></section>',
      '<section class="admin-telegram-help-step"><span class="admin-telegram-help-step__badge">Шаг 8</span><h4>Откройте кабинет ученика</h4><p>В созданном боте нажмите кнопку кабинета курса. Должен открыться ваш WebApp с уроками.</p><img class="admin-telegram-help-step__image" src="assets/images/bf7.jpg" alt="Шаг 8: открытие кабинета ученика в WebApp" loading="lazy"></section>',
      '</div>',
      '<div class="admin-telegram-help-modal__actions"><button class="btn btn-secondary" type="button" data-telegram-open-botfather="true">Открыть BotFather</button><button class="btn btn-primary" type="button" data-telegram-help-close="true">Понятно</button></div>',
      '</div>'
    ].join("");
    document.body.appendChild(modal);
    return modal;
  }

  function openTelegramBotHelpModal() {
    var modal = ensureTelegramBotHelpModal();
    modal.hidden = false;
    requestAnimationFrame(function () {
      modal.classList.add("is-open");
    });
  }

  function closeTelegramBotHelpModal() {
    var modal = document.getElementById("telegramBotHelpModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    setTimeout(function () {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
      }
    }, 180);
  }

  function positionTooltip(trigger, popover) {
    if (!trigger || !popover) return;

    var triggerRect = trigger.getBoundingClientRect();
    var popoverRect = popover.getBoundingClientRect();
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    var gap = 4;

    var left = triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2;
    left = Math.max(8, Math.min(left, viewportWidth - popoverRect.width - 8));

    var top = triggerRect.top - popoverRect.height - gap;
    if (top < 8) {
      top = triggerRect.bottom + gap;
    }
    if (top + popoverRect.height > viewportHeight - 8) {
      top = Math.max(8, viewportHeight - popoverRect.height - 8);
    }

    popover.style.left = left + "px";
    popover.style.top = top + "px";
  }



  function cancelTooltipClose() {
    if (!tooltipState.closeTimer) return;
    clearTimeout(tooltipState.closeTimer);
    tooltipState.closeTimer = null;
  }

  function scheduleTooltipClose() {
    cancelTooltipClose();
    tooltipState.closeTimer = setTimeout(function () {
      closeTooltip();
    }, 200);
  }

  function closeTooltip() {
    cancelTooltipClose();

    var popover = tooltipState.popover;
    var trigger = tooltipState.activeTrigger;

    if (trigger) {
      trigger.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }

    tooltipState.activeTrigger = null;

    if (!popover) return;
    popover.classList.remove("is-open");
    popover.hidden = true;
  }

  function openTooltip(trigger) {
    if (!trigger) return;
    cancelTooltipClose();
    if (tooltipState.activeTrigger && tooltipState.activeTrigger !== trigger) {
      closeTooltip();
    }

    var popover = ensureTooltipPopover();
    var title = trigger.getAttribute("data-tooltip-title") || "Подсказка";
    var content = trigger.getAttribute("data-tooltip-content") || "";
    var hasKinescopeHelp = trigger.getAttribute("data-tooltip-kinescope-help") === "true";

    var titleNode = popover.querySelector(".admin-tooltip-popover__title");
    var bodyNode = popover.querySelector(".admin-tooltip-popover__body");
    var kinescopeLinkNode = popover.querySelector(".admin-tooltip-popover__kinescope-link");
    if (titleNode) titleNode.textContent = title;
    if (bodyNode) bodyNode.textContent = content;
    if (kinescopeLinkNode) kinescopeLinkNode.hidden = !hasKinescopeHelp;

    popover.hidden = false;
    positionTooltip(trigger, popover);
    requestAnimationFrame(function () {
      popover.classList.add("is-open");
    });

    tooltipState.activeTrigger = trigger;
    trigger.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function initTooltips() {
    document.addEventListener("mouseover", function (event) {
      if (isTouchTooltipMode()) return;
      var trigger = event.target.closest(".admin-tooltip-trigger");
      if (!trigger) return;
      openTooltip(trigger);
    });

    document.addEventListener("mouseout", function (event) {
      if (isTouchTooltipMode()) return;
      var trigger = event.target.closest(".admin-tooltip-trigger");
      if (!trigger || trigger !== tooltipState.activeTrigger) return;

      var related = event.relatedTarget;
      var popover = tooltipState.popover;
      if (related && (trigger.contains(related) || (popover && popover.contains(related)))) {
        return;
      }
      scheduleTooltipClose();
    });

    document.addEventListener("mouseover", function (event) {
      if (isTouchTooltipMode()) return;
      var popover = tooltipState.popover;
      if (popover && event.target.closest(".admin-tooltip-popover")) {
        cancelTooltipClose();
      }
    });

    document.addEventListener("mouseout", function (event) {
      if (isTouchTooltipMode()) return;
      var popover = tooltipState.popover;
      if (!popover || !event.target.closest(".admin-tooltip-popover")) return;

      var related = event.relatedTarget;
      var trigger = tooltipState.activeTrigger;
      if (related && ((trigger && trigger.contains(related)) || popover.contains(related))) {
        return;
      }
      scheduleTooltipClose();
    });

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest(".admin-tooltip-trigger");
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();

        if (tooltipState.activeTrigger === trigger) {
          closeTooltip();
        } else {
          openTooltip(trigger);
        }
        return;
      }

      if (tooltipState.popover && event.target.closest(".admin-tooltip-popover")) {
        var kinescopeHelpLink = event.target.closest(".admin-tooltip-popover__kinescope-link");
        if (kinescopeHelpLink) {
          event.preventDefault();
          event.stopPropagation();
          openKinescopeHelpModal();
        }
        return;
      }

      var modalClose = event.target.closest("[data-kinescope-close='true']");
      if (modalClose) {
        event.preventDefault();
        closeKinescopeHelpModal();
        return;
      }

      var telegramHelpTrigger = event.target.closest("#telegramBotHelpTrigger");
      if (telegramHelpTrigger) {
        event.preventDefault();
        openTelegramBotHelpModal();
        return;
      }

      var telegramHelpClose = event.target.closest("[data-telegram-help-close='true']");
      if (telegramHelpClose) {
        event.preventDefault();
        closeTelegramBotHelpModal();
        return;
      }

      var openBotFatherBtn = event.target.closest("[data-telegram-open-botfather='true']");
      if (openBotFatherBtn) {
        event.preventDefault();
        window.open("https://t.me/BotFather", "_blank");
        return;
      }

      closeTooltip();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeKinescopeHelpModal();
        closeTelegramBotHelpModal();
        closeMobilePreviewModal();
        closeTooltip();
      }
    });

    window.addEventListener("resize", function () {
      if (!tooltipState.activeTrigger || !tooltipState.popover || tooltipState.popover.hidden) return;
      positionTooltip(tooltipState.activeTrigger, tooltipState.popover);
    });

    window.addEventListener("scroll", function () {
      if (!tooltipState.activeTrigger || !tooltipState.popover || tooltipState.popover.hidden) return;
      positionTooltip(tooltipState.activeTrigger, tooltipState.popover);
    }, true);
  }

  function bindEvents() {
    var mobilePreviewToggleBtn = document.getElementById("mobilePreviewToggleBtn");
    if (mobilePreviewToggleBtn) {
      mobilePreviewToggleBtn.addEventListener("click", function () {
        openMobilePreviewModal();
      });
    }

    document.querySelectorAll("[data-mobile-preview-close=\"true\"]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeMobilePreviewModal();
      });
    });

    document.querySelectorAll(".admin-top-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveAdminTab(btn.getAttribute("data-admin-tab"));
      });
    });

    document.querySelectorAll("[data-students-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveStudentsTab(btn.getAttribute("data-students-tab"));
      });
    });
    var studentsSearchInput = document.getElementById("studentsSearchInput");
    if (studentsSearchInput) {
      studentsSearchInput.addEventListener("input", function () {
        state.studentsSearch = studentsSearchInput.value || "";
        renderStudentsSection();
      });
    }

    var studentsStatusFilter = document.getElementById("studentsStatusFilter");
    if (studentsStatusFilter) {
      studentsStatusFilter.addEventListener("change", function () {
        state.studentsStatusFilter = studentsStatusFilter.value || "all";
        renderStudentsSection();
      });
    }

    var studentsTableBody = document.getElementById("studentsTableBody");
    if (studentsTableBody) {
      studentsTableBody.addEventListener("click", function (event) {
        var accessControl = event.target.closest("[data-student-access-control]");
        if (accessControl) {
          var accessStudentKey = accessControl.getAttribute("data-student-key");
          if (event.target.closest("[data-student-access-cancel]")) {
            delete state.studentAccessDrafts[accessStudentKey];
            renderStudentsSection();
          } else if (event.target.closest("[data-student-access-save]")) {
            void saveStudentAccess(accessStudentKey);
          }
          return;
        }
        if (event.target.closest("[data-student-details-close]")) {
          state.selectedStudentKey = null;
          renderStudentsSection();
          return;
        }
        var row = event.target.closest("[data-student-key]");
        if (!row) return;
        var studentKey = row.getAttribute("data-student-key");
        state.selectedStudentKey = state.selectedStudentKey === studentKey ? null : studentKey;
        renderStudentsSection();
        ensureSelectedStudentFormsLoaded();
      });
      studentsTableBody.addEventListener("change", function (event) {
        var accessControl = event.target.closest("[data-student-access-control]");
        if (!accessControl) return;
        var accessStudentKey = accessControl.getAttribute("data-student-key");
        if (event.target.matches("[data-student-access-status]")) {
          setStudentAccessDraft(accessStudentKey, { isOpen: event.target.checked, message: "", error: "" });
          renderStudentsSection();
        } else if (event.target.matches("[data-student-access-date]")) {
          setStudentAccessDraft(accessStudentKey, { date: event.target.value || "", message: "", error: "" });
          renderStudentsSection();
        }
      });
      studentsTableBody.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var row = event.target.closest("[data-student-key]");
        if (!row) return;
        event.preventDefault();
        if (event.target.closest("[data-student-details-close]")) {
          state.selectedStudentKey = null;
          renderStudentsSection();
          return;
        }
        var studentKey = row.getAttribute("data-student-key");
        state.selectedStudentKey = state.selectedStudentKey === studentKey ? null : studentKey;
        renderStudentsSection();
        ensureSelectedStudentFormsLoaded();
      });
    }


    [
      "accessControlEnabledInput",
      "accessDurationDaysInput",
      "accessExpiredTitleInput",
      "accessExpiredTextInput",
      "accessExpiredButtonTextInput",
      "accessExpiredButtonUrlInput"
    ].forEach(function (inputId) {
      var input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener(inputId === "accessControlEnabledInput" ? "change" : "input", updateCourseAccessDraft);
    });

    var cancelCourseAccessBtn = document.getElementById("cancelCourseAccessBtn");
    if (cancelCourseAccessBtn) {
      cancelCourseAccessBtn.addEventListener("click", function () {
        state.courseAccessSettings = normalizeCourseAccessSettings(state.savedCourseAccessSettings);
        setCourseAccessStatus("", "");
        renderCourseAccessSettings();
      });
    }

    var saveCourseAccessBtn = document.getElementById("saveCourseAccessBtn");
    if (saveCourseAccessBtn) {
      saveCourseAccessBtn.addEventListener("click", function () {
        void saveCourseAccessSettings();
      });
    }

    var connectTelegramBtn = document.getElementById("connectTelegramBtn");
    if (connectTelegramBtn) {
      connectTelegramBtn.addEventListener("click", function () {
        void connectTelegram();
      });
    }

    var themeCards = document.getElementById("themeCards");
    if (themeCards) {
      themeCards.addEventListener("click", function (event) {
        var themeBtn = event.target.closest(".admin-theme-choose-btn, .admin-theme-item");
        if (!themeBtn) return;
        var themeCard = themeBtn.closest(".admin-theme-item");
        var themeId = (themeBtn.getAttribute("data-theme-id") || (themeCard && themeCard.getAttribute("data-theme-id")));
        if (!themeId || themeId === state.selectedThemeId) return;
        state.selectedThemeId = normalizeThemeId(themeId);
        currentPreviewThemeId = state.selectedThemeId;
        renderThemeCards();
        renderThemeDirtyState();
        updatePreviewThemeInCurrentUrl(currentPreviewThemeId);
        applyThemeToLivePreview(getThemePresetById(state.selectedThemeId));
      });
    }

    var saveThemeBtn = document.getElementById("saveThemeBtn");
    if (saveThemeBtn) {
      saveThemeBtn.addEventListener("click", function () {
        void saveCourseThemeId(state.selectedThemeId).then(function () {
          alert("Дизайн сохранён");
        }).catch(function (error) {
          console.error(error);
          alert(error && error.message ? error.message : "Не удалось сохранить тему");
        });
      });
    }

    document.getElementById("lessonsList").addEventListener("click", function (event) {
      if (event.target.closest(".lesson-drag-handle")) return;
      if (event.target.closest(".duplicate-lesson-btn")) return;
      var lessonButton = event.target.closest("[data-lesson-select-id]");
      if (!lessonButton) {
        lessonButton = event.target.closest(".admin-lesson-item[data-lesson-db-id]");
      }
      if (!lessonButton) return;

      var lessonDbId = lessonButton.getAttribute("data-lesson-select-id")
        || lessonButton.getAttribute("data-lesson-db-id");
      void selectLessonById(lessonDbId);
    });

    document.getElementById("lessonsList").addEventListener("click", function (event) {
      var duplicateLessonBtn = event.target.closest(".duplicate-lesson-btn");
      if (!duplicateLessonBtn) return;
      event.stopPropagation();
      void duplicateLesson(duplicateLessonBtn.getAttribute("data-lesson-db-id"));
    });

    document.getElementById("lessonsList").addEventListener("dragstart", function (event) {
      var handle = event.target.closest(".lesson-drag-handle");
      if (!handle) return;

      var lessonId = handle.getAttribute("data-lesson-db-id");
      if (!lessonId) return;

      state.lessonDnd.draggedLessonId = lessonId;
      state.lessonDnd.originalOrder = state.lessons.slice();
      state.lessonDnd.dropHappened = false;

      var list = document.getElementById("lessonsList");
      if (list) {
        list.classList.add("is-sorting");
      }

      var card = handle.closest(".admin-lesson-item");
      if (card) {
        card.classList.add("is-dragging");
      }

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(lessonId));
      }
    });

    document.getElementById("lessonsList").addEventListener("dragover", function (event) {
      if (!state.lessonDnd.draggedLessonId) return;
      event.preventDefault();

      var list = document.getElementById("lessonsList");
      if (!list) return;

      var targetCard = event.target.closest(".admin-lesson-item");
      var draggedCard = list.querySelector('.admin-lesson-item[data-lesson-db-id="' + state.lessonDnd.draggedLessonId + '"]');
      if (!targetCard || !draggedCard) return;

      var targetLessonId = targetCard.getAttribute("data-lesson-db-id");
      if (!targetLessonId || String(targetLessonId) === String(state.lessonDnd.draggedLessonId)) return;

      clearLessonDragClasses();
      draggedCard.classList.add("is-dragging");

      var rect = targetCard.getBoundingClientRect();
      var isTopHalf = event.clientY < rect.top + rect.height / 2;
      targetCard.classList.add(isTopHalf ? "drag-over-top" : "drag-over-bottom");

      var beforeNode = isTopHalf ? targetCard : targetCard.nextElementSibling;
      if (beforeNode !== draggedCard) {
        list.insertBefore(draggedCard, beforeNode);
      }
    });

    document.getElementById("lessonsList").addEventListener("drop", function (event) {
      if (!state.lessonDnd.draggedLessonId) return;
      event.preventDefault();
      state.lessonDnd.dropHappened = true;

      var reorderedLessons = getReorderedLessons();
      clearLessonDragClasses();

      var list = document.getElementById("lessonsList");
      if (list) {
        list.classList.remove("is-sorting");
      }

      if (!reorderedLessons) {
        if (state.lessonDnd.originalOrder) {
          state.lessons = state.lessonDnd.originalOrder.slice();
          renderLessonsList();
        }
        resetLessonDragState();
        return;
      }

      void saveLessonsOrder(reorderedLessons).finally(function () {
        resetLessonDragState();
      });
    });

    document.getElementById("lessonsList").addEventListener("dragend", function () {
      var list = document.getElementById("lessonsList");
      if (list) {
        list.classList.remove("is-sorting");
      }

      if (state.lessonDnd.draggedLessonId && !state.lessonDnd.dropHappened && state.lessonDnd.originalOrder) {
        state.lessons = state.lessonDnd.originalOrder.slice();
        renderLessonsList();
      }

      clearLessonDragClasses();
      resetLessonDragState();
    });

    document.getElementById("addLessonBtn").addEventListener("click", function () {
      void createLesson();
    });

    document.getElementById("saveLessonBtn").addEventListener("click", function () {
      void saveLesson();
    });

    document.getElementById("deleteLessonBtn").addEventListener("click", function () {
      void deleteLesson().catch(function (error) {
        console.error(error);
        alert(error && error.message ? error.message : "Не удалось удалить урок");
      });
    });

    document.getElementById("blockGroupsManager").addEventListener("click", function (event) {
      var addBtn = event.target.closest("#addBlockGroupBtn");
      if (addBtn) { void upsertBlockGroup(null); return; }
      var moveGroupBtn = event.target.closest(".move-group-btn");
      if (moveGroupBtn) { void swapBlockGroup(moveGroupBtn.getAttribute("data-group-id"), moveGroupBtn.getAttribute("data-dir")); return; }
      var editBtn = event.target.closest(".edit-group-btn");
      if (editBtn) { void upsertBlockGroup(editBtn.getAttribute("data-group-id")); return; }
      var deleteBtn = event.target.closest(".delete-group-btn");
      if (deleteBtn) { void deleteBlockGroup(deleteBtn.getAttribute("data-group-id")); }
    });

    document.querySelectorAll(".add-material-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        void createMaterial(btn.getAttribute("data-material-type") || "text");
      });
    });


    document.getElementById("uploadLessonPreviewBtn").addEventListener("click", function () {
      if (!state.selectedLesson) {
        alert("Сначала выберите урок");
        return;
      }
      var input = document.getElementById("lessonPreviewFileInput");
      if (input) input.click();
    });

    document.getElementById("lessonPreviewFileInput").addEventListener("change", function (event) {
      void handleLessonPreviewUpload(event);
    });

    document.getElementById("removeLessonPreviewBtn").addEventListener("click", function () {
      if (!state.selectedLesson || !state.selectedLesson.preview_image_url) return;

      var confirmed = window.confirm("Удалить превью урока?");
      if (!confirmed) return;

      void clearLessonPreview().then(function () {
        alert("Превью удалено");
      }).catch(function (error) {
        console.error(error);
        alert(error && error.message ? error.message : "Не удалось удалить превью");
      });
    });

    ["titleInput", "subtitleInput", "dayNumberInput", "lessonLabelInput"].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", function () {
        if (id === "titleInput") {
          document.getElementById("editorLessonTitle").textContent = input.value.trim() || "Урок";
        }
          });
    });

    document.getElementById("blocksList").addEventListener("click", async function (event) {
      var groupSelect = event.target.closest(".block-group-select");
      if (groupSelect) {
        void saveBlockGroupSelection(groupSelect.getAttribute("data-block-id"), groupSelect.value);
        return;
      }

      var editBlockBtn = event.target.closest(".edit-block-btn");
      if (editBlockBtn) {
        var blockId = editBlockBtn.getAttribute("data-block-id");
        var tab = isMixedMaterial(blockId) ? "text" : getMaterialPrimaryType(blockId);
        openSectionTab(blockId, tab);
        return;
      }

      var closeEditorBtn = event.target.closest(".close-inline-editor-btn");
      if (closeEditorBtn) {
        state.activeSectionId = null;
        state.activeSectionTab = "text";
        state.quills = {};
        renderBlocksList();
        return;
      }

      var tabBtn = event.target.closest(".admin-tab-btn[data-section-tab]");
      if (tabBtn) {
        openSectionTab(
          tabBtn.getAttribute("data-block-id") || state.activeSectionId,
          tabBtn.getAttribute("data-section-tab") || "text"
        );
        return;
      }

      var duplicateBlockBtn = event.target.closest(".duplicate-block-btn");
      if (duplicateBlockBtn) {
        void duplicateBlock(duplicateBlockBtn.getAttribute("data-block-id"));
        return;
      }

      var moveBtn = event.target.closest(".move-block-btn");
      if (moveBtn) {
        void swapBlocks(moveBtn.getAttribute("data-block-id"), moveBtn.getAttribute("data-dir"));
        return;
      }

      var deleteBlockBtn = event.target.closest(".delete-block-btn");
      if (deleteBlockBtn) {
        void deleteBlock(deleteBlockBtn.getAttribute("data-block-id"));
        return;
      }

      var saveTextBtn = event.target.closest(".save-text-btn");
      if (saveTextBtn) {
        void saveTextItem(saveTextBtn.getAttribute("data-block-id"));
        return;
      }

      var saveVideoBtn = event.target.closest(".save-video-btn");
      if (saveVideoBtn) {
        var videoBlockId = saveVideoBtn.getAttribute("data-block-id");
        var videoInput = document.querySelector('.video-id-input[data-block-id="' + videoBlockId + '"]');
        var descriptionInput = document.querySelector('.video-description-input[data-block-id="' + videoBlockId + '"]');
        if (!videoInput) return;

        var videoValue = videoInput.value.trim();
        var descriptionValue = descriptionInput ? descriptionInput.value : "";
        var descriptionSaved = await saveVideoDescription(videoBlockId, descriptionValue);
        if (!descriptionSaved) return;

        if (!videoValue) {
          if (getVideoItems(videoBlockId).some(function (item) { return String(item.video_id || "").trim(); })) {
            renderBlocksList();
            refreshPreviewData();
            alert("Описание видео сохранено");
            return;
          }
          alert("Введите ссылку на видео");
          return;
        }

        var videoParseResult = parseVideoInputToEmbedUrl(videoValue);
        if (!videoParseResult.embedUrl) {
          if (videoParseResult.error === "unsupported") {
            alert("Эта видео-платформа сейчас не поддерживается.");
            return;
          }
          alert("Не удалось определить ссылку на видео. Поддерживаются Kinescope, Vimeo, Rutube и Google Drive.");
          return;
        }

        void createVideoItem(videoBlockId, videoParseResult.embedUrl).then(function (createdItem) {
          if (!createdItem) return;
          videoInput.value = "";
        });
        return;
      }

      var saveFileBtn = event.target.closest(".save-file-btn");
      if (saveFileBtn) {
        var fileBlockId = saveFileBtn.getAttribute("data-block-id");
        var fileLabelInput = document.querySelector('.file-label-input[data-block-id="' + fileBlockId + '"]');
        var fileLinkInput = document.querySelector('.file-link-input[data-block-id="' + fileBlockId + '"]');
        var fileUploadInput = document.querySelector('.file-upload-input[data-block-id="' + fileBlockId + '"]');

        if (!fileLabelInput || !fileLinkInput) return;

        var fileLabel = fileLabelInput.value.trim();
        var fileLinkValue = fileLinkInput.value.trim();
        var selectedFile = fileUploadInput && fileUploadInput.files ? fileUploadInput.files[0] : null;

        if (!fileLinkValue && !selectedFile) {
          alert("Укажите ссылку на файл или загрузите файл с компьютера.");
          return;
        }

        if (selectedFile) {
          void uploadLessonFile(fileBlockId, selectedFile).then(function (uploadResult) {
            var nextFileLabel = fileLabel || uploadResult.originalName || "Файл";
            return createFileItem(fileBlockId, nextFileLabel, uploadResult.publicUrl).then(function () {
              fileLabelInput.value = "";
              fileLinkInput.value = "";
              if (fileUploadInput) fileUploadInput.value = "";
              alert("Файл загружен");
            });
          }).catch(function (error) {
            console.error(error);
            alert(error && error.message ? error.message : "Не удалось загрузить файл");
          });
          return;
        }

        var fileId = fileLinkValue;
        if (!/^https?:\/\//i.test(fileLinkValue)) {
          var parsedFileId = extractGoogleDriveFileId(fileLinkValue);
          if (!parsedFileId) {
            alert("Не удалось определить ID файла. Вставьте ссылку Google Drive или корректный ID.");
            return;
          }
          fileId = parsedFileId;
        }

        if (!fileLabel) {
          fileLabel = "Файл";
        }

        fileLabelInput.value = "";
        fileLinkInput.value = "";
        void createFileItem(fileBlockId, fileLabel, fileId);
        return;
      }

      var saveImageBtn = event.target.closest(".save-image-btn");
      if (saveImageBtn) {
        var imageBlockId = saveImageBtn.getAttribute("data-block-id");
        var imageFileInput = document.querySelector('.image-file-input[data-block-id="' + imageBlockId + '"]');
        var imageAltInput = document.querySelector('.image-alt-input[data-block-id="' + imageBlockId + '"]');
        var imageFile = imageFileInput && imageFileInput.files ? imageFileInput.files[0] : null;
        var imageAlt = imageAltInput ? imageAltInput.value.trim() : "";

        if (!imageFile) {
          alert("Выберите файл картинки перед загрузкой");
          return;
        }

        void uploadSectionImage(imageBlockId, imageFile).then(function (uploadResult) {
          return createImageItem(imageBlockId, uploadResult.publicUrl, imageAlt).then(function (createdItem) {
            if (!createdItem) return;
            if (imageFileInput) imageFileInput.value = "";
            if (imageAltInput) imageAltInput.value = "";
            alert("Картинка загружена");
          });
        }).catch(function (error) {
          console.error(error);
          alert(error && error.message ? error.message : "Не удалось загрузить картинку");
        });
        return;
      }

      var deleteItemBtn = event.target.closest(".delete-item-btn");
      if (deleteItemBtn) {
        void deleteItem(deleteItemBtn.getAttribute("data-item-id"));
      }
    });

    document.getElementById("blocksList").addEventListener("dragstart", function (event) {
      var handle = event.target.closest(".block-drag-handle");
      if (!handle) return;

      var blockId = handle.getAttribute("data-block-id");
      if (!blockId) return;

      state.dnd.draggedBlockId = blockId;
      state.dnd.originalOrder = state.blocks.slice();
      state.dnd.dropHappened = false;

      var list = document.getElementById("blocksList");
      if (list) {
        list.classList.add("is-sorting");
      }

      var card = handle.closest(".admin-block-item");
      if (card) {
        card.classList.add("is-dragging");
      }

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(blockId));
      }
    });

    document.getElementById("blocksList").addEventListener("dragover", function (event) {
      if (!state.dnd.draggedBlockId) return;
      event.preventDefault();

      var list = document.getElementById("blocksList");
      if (!list) return;

      var targetCard = event.target.closest(".admin-block-item");
      var draggedCard = list.querySelector('.admin-block-item[data-block-id="' + state.dnd.draggedBlockId + '"]');
      if (!targetCard || !draggedCard) return;

      var targetBlockId = targetCard.getAttribute("data-block-id");
      if (!targetBlockId || String(targetBlockId) === String(state.dnd.draggedBlockId)) return;
      var rect = targetCard.getBoundingClientRect();
      var isTopHalf = event.clientY < rect.top + rect.height / 2;
      var beforeNode = isTopHalf ? targetCard : targetCard.nextElementSibling;
      if (beforeNode !== draggedCard) {
        list.insertBefore(draggedCard, beforeNode);
        refreshBlockIndicesInDom();
      }

      state.dnd.dropTargetBlockId = targetBlockId;
      state.dnd.dropPosition = isTopHalf ? "before" : "after";
    });

    document.getElementById("blocksList").addEventListener("drop", function (event) {
      if (!state.dnd.draggedBlockId) return;
      event.preventDefault();

      state.dnd.dropHappened = true;
      var reordered = getBlocksFromDomOrder();

      clearDragOverClasses();
      var draggingCard = document.querySelector(".admin-block-item.is-dragging");
      if (draggingCard) {
        draggingCard.classList.remove("is-dragging");
      }
      var list = document.getElementById("blocksList");
      if (list) {
        list.classList.remove("is-sorting");
      }

      if (!reordered) {
        resetDragAndDropState();
        return;
      }

      void saveBlocksOrder(reordered, { skipRerender: true }).finally(function () {
        resetDragAndDropState();
      });
    });

    document.getElementById("blocksList").addEventListener("dragend", function () {
      var list = document.getElementById("blocksList");
      var draggingCard = document.querySelector(".admin-block-item.is-dragging");
      if (draggingCard) {
        draggingCard.classList.remove("is-dragging");
      }

      if (list) {
        list.classList.remove("is-sorting");
      }

      if (state.dnd.draggedBlockId && !state.dnd.dropHappened && state.dnd.originalOrder) {
        state.blocks = state.dnd.originalOrder.slice();
        renderBlocksList();
      }

      clearDragOverClasses();
      resetDragAndDropState();
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function isDebugMode() {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }

  function bindLogout() {
    var logoutButtons = document.querySelectorAll(".js-logout-btn");
    if (!logoutButtons.length) return;
    logoutButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        clearStoredAuth();
        window.location.href = "admin.html";
      });
    });
  }

  async function initCourseEditor() {
    console.log("activeCourseId:", getActiveCourseId());
    var adminCourseLabel = document.getElementById("adminCourseLabel");
    if (adminCourseLabel) {
      if (isDebugMode()) {
        adminCourseLabel.hidden = false;
        adminCourseLabel.textContent = getActiveCourseId() || "Курс не выбран";
      } else {
        adminCourseLabel.hidden = true;
      }
    }

    initTooltips();
    bindEvents();
    initPreviewIframe();
    state.activeStudentsTab = getDefaultStudentsTab();
    setActiveStudentsTab(state.activeStudentsTab);
    setActiveAdminTab(getDefaultAdminTab());
    renderConnectionScreen();
    await loadTelegramIntegration();
    state.courseAccessSettings = await fetchCourseAccessSettings();
    state.savedCourseAccessSettings = normalizeCourseAccessSettings(state.courseAccessSettings);
    renderCourseAccessSettings();
    state.selectedThemeId = await fetchCourseThemeId();
    state.savedThemeId = state.selectedThemeId;
    currentPreviewThemeId = state.selectedThemeId;
    currentPreviewTheme = getThemePresetById(state.selectedThemeId);
    setPreviewIframeUrlForScreen({ page: "index", lessonId: null }, currentPreviewThemeId);
    renderThemeCards();
    renderThemeDirtyState();
    applyCurrentPreviewTheme();
    refreshPreviewData();

    state.lessons = (await fetchLessons()).map(function (lesson) {
      if (typeof lesson.preview_image_url === "undefined") {
        lesson.preview_image_url = null;
      }
      return lesson;
    });
    renderLessonsList();
    refreshPreviewData();

    if (state.lessons.length) {
      await selectLessonById(state.lessons[0].id, { navigatePreview: false });
    }
  }

  async function init() {
    hideAllAdminScreens();
    try {
      var account = await getStoredAccount();
      if (!account) {
        showAuthGate();
        bindLoginForm();
        return;
      }
      currentAccountId = account.id;
      currentAccount = account;
      console.log("currentAccount:", currentAccount);
      console.log("currentTariffLimit:", getCurrentTariffLimit());
      bindLogout();

      if (!hasCourseInUrl()) {
        await initCoursesDashboard();
        return;
      }

      await verifyCourseAccess();
      showCourseEditor();
      await initCourseEditor();
    } catch (error) {
      console.error(error);
      showAdminError((error && error.message) || "Ошибка загрузки админки");
    }
  }

  init();
})();
