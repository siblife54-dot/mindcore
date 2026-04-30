(function () {
  "use strict";

  var state = {
    lessons: [],
    selectedLesson: null,
    selectedThemeId: "dark_premium",
    blocks: [],
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
    activeAdminTab: "content"
  };
  state.savedThemeId = "dark_premium";
  var tooltipState = {
    activeTrigger: null,
    popover: null
  };
  var ALLOWED_PREVIEW_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var MAX_PREVIEW_FILE_SIZE = 5 * 1024 * 1024;
  var WEBAPP_THEME_IDS = {
    dark_premium: "theme-dark-premium",
    light_clean: "theme-light-clean",
    fitness_power: "theme-fitness-power",
    soft_women: "theme-soft-women",
    business_black: "theme-business-black",
    wow_glass: "theme-wow-glass"
  };
  var WEBAPP_THEMES = [
    { id: "dark_premium", name: "Dark Premium", description: "Тёмно-синий фон с фиолетовым акцентом" },
    { id: "light_clean", name: "Light Clean", description: "Светлый минимализм" },
    { id: "fitness_power", name: "Fitness Power", description: "Тёмный зелёный фитнес-стиль" },
    { id: "soft_women", name: "Soft Women", description: "Светлый нюд/розовый стиль" },
    { id: "business_black", name: "Business Black", description: "Графит/чёрный/золото" },
    { id: "wow_glass", name: "Wow Glass", description: "Премиальный glass-стиль с живым свечением" }
  ];



  function getDefaultAdminTab() {
    try {
      var stored = window.localStorage.getItem("admin_active_tab");
      if (stored === "appearance" || stored === "content" || stored === "connections") {
        return stored;
      }
    } catch (error) {}
    return "appearance";
  }

  function setActiveAdminTab(tabId) {
    var nextTab = (tabId === "content" || tabId === "connections") ? tabId : "appearance";
    state.activeAdminTab = nextTab;

    document.querySelectorAll(".admin-top-tab").forEach(function (btn) {
      var isActive = btn.getAttribute("data-admin-tab") === nextTab;
      btn.classList.toggle("is-active", isActive);
    });

    document.querySelectorAll(".admin-tab-panel").forEach(function (panel) {
      var isActive = panel.getAttribute("data-admin-panel") === nextTab;
      panel.hidden = !isActive;
    });

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
    return window.location.origin + window.location.pathname + "?course=" + encodeURIComponent(getActiveCourseId());
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
    if (webAppInput && data.telegram_webapp_url) webAppInput.value = data.telegram_webapp_url;

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
    var webappUrl = String((urlInput && urlInput.value) || "").trim();

    if (!botToken) {
      setTelegramStatus("Введите Bot Token", true);
      return;
    }
    if (!webappUrl) {
      setTelegramStatus("Введите WebApp URL", true);
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

  function normalizeThemeId(themeId) {
    var value = String(themeId || "").trim();
    if (WEBAPP_THEME_IDS[value]) return value;
    return "dark_premium";
  }

  function renderThemeCards() {
    var container = document.getElementById("themeCards");
    if (!container) return;

    container.innerHTML = WEBAPP_THEMES.map(function (theme) {
      var isActive = state.selectedThemeId === theme.id;
      return [
        '<article class="admin-theme-item' + (isActive ? ' is-active' : '') + '" data-theme-id="' + theme.id + '">',
        '<div class="admin-theme-preview ' + WEBAPP_THEME_IDS[theme.id] + '">',
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
        '<h3>' + escapeHtml(theme.name) + '</h3>',
        '<p>' + escapeHtml(theme.description) + '</p>',
        isActive
          ? '<div class="admin-theme-status">Выбрано</div>'
          : '<button class="btn btn-primary admin-theme-choose-btn" type="button" data-theme-id="' + theme.id + '">Выбрать</button>',
        '</article>'
      ].join("");
    }).join("");
  }

  function getPreviewThemeTokens(themeId) {
    var tokensByTheme = {
      dark_premium: { bg: "#0E1B2B", card: "#12243A", card2: "#172E4A", text: "#F8FAFC", muted: "#94A3B8", accent: "#8B5CF6", border: "rgba(139, 92, 246, 0.22)", isDark: true },
      light_clean: { bg: "#F6F7FB", card: "#FFFFFF", card2: "#F1F5F9", text: "#111827", muted: "#64748B", accent: "#2563EB", border: "rgba(15, 23, 42, 0.10)", isDark: false },
      fitness_power: { bg: "#031812", card: "#041F18", card2: "#062720", text: "#F2FFF8", muted: "#9AC7B8", accent: "#67F08F", border: "rgba(122, 219, 173, 0.22)", isDark: true },
      soft_women: { bg: "#FFF7F2", card: "#FFFFFF", card2: "#FFEDE5", text: "#3B2520", muted: "#9A6B60", accent: "#DB5F87", border: "rgba(219, 95, 135, 0.22)", isDark: false },
      business_black: { bg: "#080808", card: "#141414", card2: "#1F1F1F", text: "#F8F5EC", muted: "#A8A29E", accent: "#D4AF37", border: "rgba(212, 175, 55, 0.24)", isDark: true },
      wow_glass: { bg: "#04111f", card: "rgba(8, 20, 34, 0.72)", card2: "rgba(10, 34, 56, 0.68)", text: "#eef7ff", muted: "#9bb8d1", accent: "#5ff2ff", border: "rgba(255, 255, 255, 0.16)", isDark: true }
    };
    return tokensByTheme[normalizeThemeId(themeId)] || tokensByTheme.dark_premium;
  }

  function renderThemePreview(themeId) {
    var container = document.getElementById("adminThemePreview");
    if (!container) return;
    var normalizedThemeId = normalizeThemeId(themeId);
    var t = getPreviewThemeTokens(normalizedThemeId);
    var bgStyle = normalizedThemeId === "wow_glass"
      ? "radial-gradient(circle at 20% 20%, rgba(95,242,255,0.16), transparent 28%),radial-gradient(circle at 80% 30%, rgba(255,184,77,0.14), transparent 24%),linear-gradient(135deg, #04111f, #0a2238 60%, #06101a)"
      : t.bg;
    var btnStyle = normalizedThemeId === "wow_glass"
      ? "background:linear-gradient(90deg,#5ff2ff,#87fbff);color:#03212a;"
      : "background:" + t.accent + ";" + (t.isDark ? "color:#07111d;" : "color:#ffffff;");

    container.innerHTML = [
      '<div class="admin-theme-preview-phone" style="background:', bgStyle, ';color:', t.text, ';border-color:', t.border, ';">',
      '<div class="admin-theme-preview-header" style="background:', t.card, ';border-color:', t.border, ';">Курс эксперта</div>',
      '<div class="admin-theme-preview-progress" style="background:', t.card, ';border-color:', t.border, ';"><strong>3 из 10 уроков</strong><span><i style="background:', t.accent, ';"></i></span></div>',
      '<article class="admin-theme-preview-card" style="background:', t.card2, ';border-color:', t.border, ';">',
      '<p>День 1</p><h4>Введение</h4><div><button class="admin-theme-preview-button" style="', btnStyle, '">Открыть</button><span class="admin-theme-preview-badge" style="background:', t.card, ';color:', t.muted, ';">Пройдено</span></div></article>',
      '<article class="admin-theme-preview-card" style="background:', t.card2, ';border-color:', t.border, ';">',
      '<p>День 2</p><h4>Практика</h4><div><button class="admin-theme-preview-button" style="', btnStyle, '">Открыть</button></div></article>',
      '</div>'
    ].join("");
  }

  function renderThemeDirtyState() {
    var dirtyNode = document.getElementById("themeDirtyStatus");
    if (dirtyNode) dirtyNode.hidden = state.selectedThemeId === state.savedThemeId;
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
    renderThemeCards();
    renderThemePreview(state.selectedThemeId);
    renderThemeDirtyState();
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
      throw new Error("Не удалось загрузить секции урока");
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
      alert("Ошибка загрузки данных секции");
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

  function extractKinescopeVideoId(value) {
    var input = String(value || "").trim();
    if (!input) return "";

    var srcMatch = input.match(/<iframe[\s\S]*?\ssrc\s*=\s*["']([^"']+)["']/i);
    var candidate = srcMatch && srcMatch[1] ? srcMatch[1].trim() : input;
    if (!candidate) return "";

    var directIdPattern = /^[A-Za-z0-9_-]{6,}$/;
    if (directIdPattern.test(candidate) && candidate.indexOf("http") !== 0) {
      return candidate;
    }

    if (candidate.indexOf("//") === 0) {
      candidate = "https:" + candidate;
    }

    var url;
    try {
      url = new URL(candidate);
    } catch (error) {
      return "";
    }

    var host = (url.hostname || "").toLowerCase();
    if (host !== "kinescope.io" && host !== "www.kinescope.io") {
      return "";
    }

    var pathParts = (url.pathname || "")
      .split("/")
      .filter(Boolean);
    if (!pathParts.length) return "";

    var videoId = pathParts[0] === "embed" ? pathParts[1] : pathParts[0];
    if (!videoId || !directIdPattern.test(videoId)) {
      return "";
    }

    return videoId;
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
      return "Секция содержит видео и файлы для скачивания.";
    }

    if (images.length && (videos.length || files.length)) {
      return "Секция содержит изображения и медиа-контент.";
    }

    if (videos.length) {
      return "Секция с видеоматериалом.";
    }

    if (files.length) {
      return "Секция с прикреплёнными файлами.";
    }

    if (images.length) {
      return "Секция с изображениями.";
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
    var textPreview = shortenText(stripHtml((getTextItem(blockId) || {}).text_html || ""), 160);
    var videos = getVideoItems(blockId);
    var files = getFileItems(blockId);
    var images = getImageItems(blockId);

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

    if (!badges.length) {
      badges.push("Пустая секция");
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
      lines.push({ type: "text", label: "Текстовый блок" });
    }

    videos.forEach(function () {
      lines.push({ type: "video", label: "Видео Kinescope" });
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
        '<p class="admin-section-empty-state__title">Секция пока пустая</p>',
        '<button class="admin-btn-ghost edit-block-btn" data-block-id="' + blockId + '" type="button">Редактировать</button>',
        '</div>'
      ].join("");
    }

    var visible = items.slice(0, limit);
    var hiddenCount = items.length - visible.length;

    return [
      '<div class="admin-content-mini-list">',
      visible.map(function (item) {
        return [
          '<div class="admin-content-mini-list__row">',
          '<span class="admin-content-mini-list__dot"></span>',
          '<span>' + escapeHtml(item.label) + '</span>',
          '</div>'
        ].join("");
      }).join(""),
      hiddenCount > 0 ? '<div class="admin-content-mini-list__more">+ ещё ' + hiddenCount + '</div>' : "",
      '</div>'
    ].join("");
  }

  function openSectionTab(blockId, tabName, options) {
    if (!blockId) return;

    state.activeSectionId = String(blockId);
    state.activeSectionTab = tabName || "text";
    state.quills = {};

    renderBlocksList();
    renderPreview();
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
    return true;
  }

  function renderEditor() {
    var empty = document.getElementById("editorEmpty");
    var panel = document.getElementById("editorPanel");

    if (!state.selectedLesson) {
      empty.hidden = false;
      panel.hidden = true;
      renderPreview();
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

    renderLessonPreviewUploader();
    renderBlocksList();
    renderPreview();
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

    previewBox.innerHTML = '<img src="' + escapeAttr(state.selectedLesson.preview_image_url) + '" alt="Превью урока">';
    removeBtn.hidden = false;
  }

  function renderBlocksList() {
    closeTooltip();
    var blocksList = document.getElementById("blocksList");

    if (!state.blocks.length) {
      blocksList.innerHTML = '<div class="admin-empty">У этого урока пока нет секций</div>';
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
        '<h4>Секция ' + (index + 1) + '</h4>',
        '<p class="admin-section-summary' + (summary === "Пока контент не добавлен." ? ' admin-section-summary--empty' : '') + '">' + escapeHtml(summary) + '</p>',
        shouldShowBadges ? [
        '<div class="admin-content-badges">',
        badges.map(function (badge) {
          return '<span class="admin-content-badge">' + escapeHtml(badge) + '</span>';
        }).join(""),
        '</div>',
        ].join("") : "",
        '</div>',
        '<div class="admin-inline-actions">',
        '<button class="admin-btn-ghost block-drag-handle" data-block-id="' + block.id + '" draggable="true" type="button" title="Перетащить секцию" aria-label="Перетащить секцию">⋮⋮</button>',
        '<button class="admin-btn-ghost edit-block-btn" data-block-id="' + block.id + '" type="button">Редактировать</button>',
        '<button class="admin-btn-ghost duplicate-block-btn" data-block-id="' + block.id + '" type="button" title="Дублировать секцию" aria-label="Дублировать секцию">⧉</button>',
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
    return [
      '<div class="admin-block-editor-inline" id="blockEditor-' + blockId + '">',
      '<div class="admin-tabs">',
      '<button class="admin-tab-btn' + (state.activeSectionTab === 'text' ? ' active' : '') + '" type="button" data-section-tab="text" data-block-id="' + blockId + '">Текст</button>',
      '<button class="admin-tab-btn' + (state.activeSectionTab === 'video' ? ' active' : '') + '" type="button" data-section-tab="video" data-block-id="' + blockId + '">Видео</button>',
      '<button class="admin-tab-btn' + (state.activeSectionTab === 'file' ? ' active' : '') + '" type="button" data-section-tab="file" data-block-id="' + blockId + '">Файлы</button>',
      '<button class="admin-tab-btn' + (state.activeSectionTab === 'image' ? ' active' : '') + '" type="button" data-section-tab="image" data-block-id="' + blockId + '">Картинка</button>',
      '<button class="admin-btn-ghost close-inline-editor-btn" type="button">Закрыть</button>',
      '</div>',
      renderSectionTabContent(blockId),
      '</div>'
    ].join("");
  }

  function renderSectionTabContent(blockId) {
    if (state.activeSectionTab === "video") return renderVideoTab(blockId);
    if (state.activeSectionTab === "file") return renderFileTab(blockId);
    if (state.activeSectionTab === "image") return renderImageTab(blockId);
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
    return [
      '<button class="admin-tooltip-trigger' + extraClass + '" type="button"',
      ' aria-label="' + escapeAttr(data.ariaLabel || "Открыть подсказку") + '"',
      ' data-tooltip-title="' + escapeAttr(data.title || "Подсказка") + '"',
      ' data-tooltip-content="' + escapeAttr(data.content || "") + '"',
      '>' + escapeHtml(label) + '</button>'
    ].join("");
  }

  function renderVideoTab(blockId) {
    var videos = getVideoItems(blockId);
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
          "1. Загрузите видео в Kinescope",
          "2. Откройте видео",
          "3. Скопируйте ссылку или embed-код",
          "4. Вставьте сюда",
          "",
          "Система сама определит ID видео."
        ].join("\n")
      }),
      '</div>',
      '</div>',
      '<div class="admin-section-form" id="videoForm-' + blockId + '">',
      '<label>Ссылка или ID видео Kinescope',
      '<input class="video-id-input" data-block-id="' + blockId + '" type="text" placeholder="https://kinescope.io/embed/..." />',
      '</label>',
      '<p class="admin-hint">Поддерживаются ссылка на видео, embed-ссылка, iframe-код или ID.</p>',
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
    if (!videos.length) {
      return '<div class="admin-empty">Видео не добавлено</div>';
    }

    return videos.map(function (video) {
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
    if (!files.length) {
      return '<div class="admin-empty">Файлы не добавлены</div>';
    }

    return files.map(function (file) {
      return [
        '<div class="admin-mini-card">',
        '<p><strong>' + escapeHtml(file.file_label || "Без названия") + '</strong></p>',
        '<p>ID: ' + escapeHtml(file.file_id || "") + '</p>',
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

  function renderPreview() {
    var container = document.getElementById("previewContainer");
    if (!container) return;

    if (!state.selectedLesson) {
      container.innerHTML = '<div class="preview-placeholder">Выберите урок, чтобы увидеть предпросмотр.</div>';
      return;
    }

    var title = document.getElementById("titleInput") ? document.getElementById("titleInput").value.trim() : (state.selectedLesson.title || "");
    var subtitle = document.getElementById("subtitleInput") ? document.getElementById("subtitleInput").value.trim() : (state.selectedLesson.subtitle || "");
    var previewImageUrl = state.selectedLesson.preview_image_url || "";

    var blocksHtml = state.blocks.map(function (block, index) {
      var textItem = getTextItem(block.id);
      var textHtml = textItem && stripHtml(textItem.text_html) ? textItem.text_html : "";
      var videos = getVideoItems(block.id);
      var files = getFileItems(block.id);
      var images = getImageItems(block.id);

      var contentParts = [];

      if (textHtml) {
        contentParts.push('<div class="preview-text"><div class="rich-text-content">' + textHtml + '</div></div>');
      }

      if (videos.length) {
        contentParts.push(videos.map(function (video) {
          return '<div class="preview-video">▶ Видео добавлено (ID: ' + escapeHtml(video.video_id || "") + ')</div>';
        }).join(""));
      }

      if (files.length) {
        contentParts.push([
          '<div class="preview-files">',
          files.map(function (file) {
            return '<button class="preview-file-btn" type="button">📎 ' + escapeHtml(file.file_label || "Файл") + '</button>';
          }).join(""),
          '</div>'
        ].join(""));
      }

      if (images.length) {
        contentParts.push(images.map(function (image) {
          return [
            '<figure class="preview-inline-image">',
            '<img src="' + escapeAttr(image.image_url || "") + '" alt="' + escapeAttr(image.image_alt || "Изображение секции") + '">',
            image.image_alt ? '<figcaption>' + escapeHtml(image.image_alt) + '</figcaption>' : "",
            '</figure>'
          ].join("");
        }).join(""));
      }

      if (!contentParts.length) {
        contentParts.push('<div class="preview-placeholder">Контент секции пока пуст.</div>');
      }

      return [
        '<section class="preview-block">',
        '<h5>Секция ' + (index + 1) + '</h5>',
        contentParts.join(""),
        '</section>'
      ].join("");
    }).join("");

    container.innerHTML = [
      '<h4 class="preview-lesson-title">' + escapeHtml(title || "Без названия") + '</h4>',
      '<p class="preview-lesson-subtitle">' + escapeHtml(subtitle || "Подзаголовок пока не добавлен") + '</p>',
      previewImageUrl
        ? '<div class="preview-lesson-image"><img src="' + escapeAttr(previewImageUrl) + '" alt="Превью урока"></div>'
        : "",
      blocksHtml || '<div class="preview-placeholder" style="margin-top: 14px;">Добавьте первую секцию, чтобы увидеть содержание урока.</div>'
    ].join("");
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
    renderPreview();
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
      renderPreview();
    });
    state.quills[String(blockId)] = quill;
  }

  async function selectLessonById(lessonDbId) {
    var lesson = state.lessons.find(function (item) {
      return String(item.id) === String(lessonDbId);
    });

    if (!lesson) return;

    state.selectedLesson = lesson;
    state.quills = {};
    state.activeSectionId = null;
    state.activeSectionTab = "text";

    state.blocks = await fetchLessonBlocks(lesson.id);
    var blockIds = state.blocks.map(function (block) { return block.id; });
    var allItems = await fetchItemsForBlocks(blockIds);
    setItemsByBlock(allItems);

    renderLessonsList();
    renderEditor();
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
    var oldToNewBlockId = {};

    var sortedSourceBlocks = sourceBlocks.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    for (var i = 0; i < sortedSourceBlocks.length; i += 1) {
      var sourceBlock = sortedSourceBlocks[i];
      var newBlockPayload = cloneRecord(sourceBlock, ["id", "created_at", "updated_at", "lesson_id"]);
      newBlockPayload.lesson_id = insertedLesson.id;

      var blockInsert = await client
        .from("lesson_blocks")
        .insert(newBlockPayload)
        .select()
        .single();

      if (blockInsert.error) {
        console.error(blockInsert.error);
        alert("Урок создан, но не удалось скопировать секции полностью");
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
        alert("Урок и секции созданы, но часть материалов не скопирована");
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
        alert("Ошибка дублирования секции");
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
      alert("Ошибка дублирования секции");
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
        alert("Секция создана, но не все материалы удалось скопировать");
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
        title: "Новый урок",
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
    alert("Урок сохранён");
  }

  async function deleteLesson() {
    if (!state.selectedLesson) return;

    var client = getClient();
    if (!client) return;

    var lessonToDelete = state.selectedLesson;
    var confirmed = window.confirm(
      "Удалить урок полностью? Будут удалены все секции, текст, видео и файлы этого урока. Это действие нельзя отменить."
    );
    if (!confirmed) return;

    var lessonBlocksResult = await client
      .from("lesson_blocks")
      .select("id")
      .eq("lesson_id", lessonToDelete.id);

    if (lessonBlocksResult.error) {
      console.error(lessonBlocksResult.error);
      alert("Не удалось получить секции урока перед удалением");
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
      alert("Не удалось удалить секции урока");
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
      state.quills = {};
      state.activeSectionId = null;
      state.activeSectionTab = "text";
      renderLessonsList();
      renderEditor();
    }

    alert("Урок удалён");
  }

  async function createBlock() {
    if (!state.selectedLesson) return;

    var client = getClient();
    if (!client) return;

    var nextOrder = state.blocks.length
      ? Math.max.apply(null, state.blocks.map(function (block) { return block.sort_order || 0; })) + 1
      : 1;

    var newBlockPayload = {
      lesson_id: state.selectedLesson.id,
      sort_order: nextOrder,
      block_type: "section"
    };

    var result = await client
      .from("lesson_blocks")
      .insert(newBlockPayload)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания секции: " + result.error.message);
      return;
    }

    state.blocks.push(result.data);
    state.blocks.sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    state.blockItemsByBlockId[String(result.data.id)] = [];
    state.activeSectionId = null;
    state.activeSectionTab = "text";

    renderEditor();
  }

  async function swapBlocks(blockId, direction) {
    var currentIndex = state.blocks.findIndex(function (block) {
      return String(block.id) === String(blockId);
    });
    if (currentIndex < 0) return;

    var swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= state.blocks.length) return;

    var currentBlock = state.blocks[currentIndex];
    var targetBlock = state.blocks[swapIndex];

    var client = getClient();
    if (!client) return;

    var currentOrder = currentBlock.sort_order || currentIndex + 1;
    var targetOrder = targetBlock.sort_order || swapIndex + 1;

    var firstUpdate = await client
      .from("lesson_blocks")
      .update({ sort_order: targetOrder })
      .eq("id", currentBlock.id);

    if (firstUpdate.error) {
      console.error(firstUpdate.error);
      alert("Ошибка перемещения секции");
      return;
    }

    var secondUpdate = await client
      .from("lesson_blocks")
      .update({ sort_order: currentOrder })
      .eq("id", targetBlock.id);

    if (secondUpdate.error) {
      console.error(secondUpdate.error);
      alert("Ошибка перемещения секции");
      return;
    }

    currentBlock.sort_order = targetOrder;
    targetBlock.sort_order = currentOrder;
    state.blocks.sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    renderEditor();
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
        title.textContent = "Секция " + (index + 1);
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
        alert("Ошибка сохранения нового порядка секций");
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
    renderPreview();
  }

  async function deleteBlock(blockId) {
    var client = getClient();
    if (!client) return;

    var confirmDelete = window.confirm("Удалить секцию и все её материалы?");
    if (!confirmDelete) return;

    var deleteItemsResult = await client
      .from("lesson_block_items")
      .delete()
      .eq("block_id", blockId);

    if (deleteItemsResult.error) {
      console.error(deleteItemsResult.error);
      alert("Ошибка удаления материалов секции!");
      return;
    }

    var deleteBlockResult = await client
      .from("lesson_blocks")
      .delete()
      .eq("id", blockId);

    if (deleteBlockResult.error) {
      console.error(deleteBlockResult.error);
      alert("Ошибка удаления секции");
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
      alert("Ошибка сохранения текста секции");
      return;
    }

    var key = String(blockId);
    state.blockItemsByBlockId[key] = getItems(blockId).map(function (item) {
      return String(item.id) === String(result.data.id) ? result.data : item;
    });

    renderBlocksList();
    renderPreview();
    alert("Текст секции сохранён");
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
    renderPreview();
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
    renderPreview();
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
      alert("Ошибка сохранения картинки в секции");
      return null;
    }

    getItems(blockId).push(result.data);
    renderBlocksList();
    renderPreview();
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
    renderPreview();
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
      renderPreview();
      alert("Превью урока загружено");
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
      '<p class="admin-tooltip-popover__body"></p>'
    ].join("");
    document.body.appendChild(popover);
    tooltipState.popover = popover;
    return popover;
  }

  function positionTooltip(trigger, popover) {
    if (!trigger || !popover) return;

    var triggerRect = trigger.getBoundingClientRect();
    var popoverRect = popover.getBoundingClientRect();
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    var gap = 10;

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

  function closeTooltip() {
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
    if (tooltipState.activeTrigger && tooltipState.activeTrigger !== trigger) {
      closeTooltip();
    }

    var popover = ensureTooltipPopover();
    var title = trigger.getAttribute("data-tooltip-title") || "Подсказка";
    var content = trigger.getAttribute("data-tooltip-content") || "";

    var titleNode = popover.querySelector(".admin-tooltip-popover__title");
    var bodyNode = popover.querySelector(".admin-tooltip-popover__body");
    if (titleNode) titleNode.textContent = title;
    if (bodyNode) bodyNode.textContent = content;

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
      closeTooltip();
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
        return;
      }

      closeTooltip();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
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
    document.querySelectorAll(".admin-top-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveAdminTab(btn.getAttribute("data-admin-tab"));
      });
    });
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
        renderThemeCards();
        renderThemePreview(state.selectedThemeId);
        renderThemeDirtyState();
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

    document.getElementById("addBlockBtn").addEventListener("click", function () {
      void createBlock();
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
        renderPreview();
      });
    });

    document.getElementById("blocksList").addEventListener("click", function (event) {
      var editBlockBtn = event.target.closest(".edit-block-btn");
      if (editBlockBtn) {
        openSectionTab(editBlockBtn.getAttribute("data-block-id"), "text");
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
        if (!videoInput) return;

        var videoValue = videoInput.value.trim();
        if (!videoValue) {
          alert("Введите ссылку или ID видео Kinescope");
          return;
        }

        var videoId = extractKinescopeVideoId(videoValue);
        if (!videoId) {
          alert("Не удалось определить ID видео. Вставьте ссылку Kinescope или ID видео.");
          return;
        }

        void createVideoItem(videoBlockId, videoId).then(function (createdItem) {
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

        if (!fileLabelInput || !fileLinkInput) return;

        var fileLabel = fileLabelInput.value.trim();
        var fileLinkValue = fileLinkInput.value.trim();
        var fileId = extractGoogleDriveFileId(fileLinkValue);

        if (!fileLabel || !fileLinkValue) {
          alert("Заполните название файла и ссылку Google Drive");
          return;
        }

        if (!fileId) {
          alert("Не удалось определить ID файла. Вставьте ссылку Google Drive на файл.");
          return;
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

  async function init() {
    console.log("activeCourseId:", getActiveCourseId());
    document.getElementById("adminCourseLabel").textContent = getActiveCourseId() || "Без course_id";

    initTooltips();
    bindEvents();
    setActiveAdminTab(getDefaultAdminTab());
    renderConnectionScreen();
    await loadTelegramIntegration();
    state.selectedThemeId = await fetchCourseThemeId();
    state.savedThemeId = state.selectedThemeId;
    renderThemeCards();
    renderThemePreview(state.selectedThemeId);
    renderThemeDirtyState();

    state.lessons = (await fetchLessons()).map(function (lesson) {
      if (typeof lesson.preview_image_url === "undefined") {
        lesson.preview_image_url = null;
      }
      return lesson;
    });
    renderLessonsList();
    renderPreview();

    if (state.lessons.length) {
      await selectLessonById(state.lessons[0].id);
    }
  }

  init().catch(function (error) {
    console.error(error);
    var empty = document.getElementById("editorEmpty");
    empty.hidden = false;
    empty.textContent = error.message || "Ошибка загрузки админки";
  });
})();
