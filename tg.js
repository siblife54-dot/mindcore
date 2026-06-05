(function () {
  "use strict";

  var APP_STATE_KEY = "course_app_state_v1";
  var ACTIVE_STORAGE = "local";
  var STORAGE_FAILED = false;
  var SDK_READY_PROMISE = null;

  function getTelegramWebApp() {
    return globalThis.Telegram && globalThis.Telegram.WebApp ? globalThis.Telegram.WebApp : null;
  }

  function getMaxWebApp() {
    return globalThis.WebApp || null;
  }

  function getVkBridge() {
    return globalThis.vkBridge || globalThis.VKBridge || null;
  }

  function detectPlatform() {
    if (getTelegramWebApp()) return "telegram";
    if (getMaxWebApp()) return "max";
    if (getVkBridge()) return "vk";
    return "browser";
  }

  function shouldAttemptTelegramSdkLoad() {
    if (getTelegramWebApp()) return true;
    var marker = String(globalThis.location && (globalThis.location.search + " " + globalThis.location.hash) || "");
    return /tgWebApp/i.test(marker);
  }

  function loadTelegramSdkSafely(timeoutMs) {
    if (getTelegramWebApp() || !shouldAttemptTelegramSdkLoad()) return Promise.resolve();
    if (SDK_READY_PROMISE) return SDK_READY_PROMISE;

    SDK_READY_PROMISE = new Promise(function (resolve) {
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        resolve();
      }

      try {
        var existing = document.querySelector('script[data-telegram-web-app-sdk="1"], script[src="https://telegram.org/js/telegram-web-app.js"]');
        var script = existing || document.createElement("script");
        if (!existing) {
          script.src = "https://telegram.org/js/telegram-web-app.js";
          script.async = true;
          script.dataset.telegramWebAppSdk = "1";
          document.head.appendChild(script);
        }
        script.addEventListener("load", done, { once: true });
        script.addEventListener("error", function () {
          console.warn("Telegram WebApp SDK unavailable; continuing in browser-compatible mode.");
          done();
        }, { once: true });
        setTimeout(done, timeoutMs || 1800);
      } catch (error) {
        console.warn("Telegram WebApp SDK load skipped:", error);
        done();
      }
    });

    return SDK_READY_PROMISE;
  }

  async function whenReady(options) {
    options = options || {};
    await loadTelegramSdkSafely(options.telegramTimeoutMs);
    return detectPlatform();
  }

  function normalizeUser(platform, user) {
    user = user || {};
    var firstName = user.first_name || user.firstName || user.firstNameNative || "";
    var lastName = user.last_name || user.lastName || user.lastNameNative || "";
    var username = user.username || user.screen_name || user.nickname || "";
    var photoUrl = user.photo_url || user.photoUrl || user.photo_200 || user.avatar_url || "";
    var userId = user.id != null ? user.id : (user.user_id != null ? user.user_id : null);

    return {
      platform: platform,
      userId: userId,
      firstName: firstName,
      lastName: lastName,
      username: username,
      photoUrl: photoUrl
    };
  }

  function toLegacyProfile(profile) {
    var firstName = profile.firstName || "";
    var lastName = profile.lastName || "";
    var fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    return {
      platform: profile.platform,
      userId: profile.userId,
      id: profile.userId,
      firstName: firstName,
      lastName: lastName,
      fullName: fullName,
      username: profile.username || "",
      photoUrl: profile.photoUrl || "",
      avatarUrl: profile.photoUrl || "",
      hasAvatar: Boolean(profile.photoUrl),
      isTelegram: profile.platform === "telegram"
    };
  }

  async function getUserProfile() {
    var platform = detectPlatform();

    if (platform === "telegram") {
      var tg = getTelegramWebApp();
      return normalizeUser("telegram", tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null);
    }

    if (platform === "max") {
      var max = getMaxWebApp();
      return normalizeUser("max", max && max.initDataUnsafe ? max.initDataUnsafe.user : null);
    }

    if (platform === "vk") {
      var bridge = getVkBridge();
      if (bridge && typeof bridge.send === "function") {
        try {
          var user = await bridge.send("VKWebAppGetUserInfo");
          return normalizeUser("vk", user);
        } catch (error) {
          console.warn("VK user info unavailable:", error);
        }
      }
      return normalizeUser("vk", null);
    }

    return normalizeUser("browser", null);
  }

  function getTelegramUserProfile() {
    var tg = getTelegramWebApp();
    return toLegacyProfile(normalizeUser("telegram", tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null));
  }

  function detectTelegramWebApp() {
    return Boolean(getTelegramWebApp());
  }

  function getDefaultAppState() {
    return {
      completedLessons: [],
      kbju: {},
      calculatorInputs: {},
      lastOpenedLesson: null,
      updatedAt: ""
    };
  }

  function normalizeAppState(rawState) {
    var defaults = getDefaultAppState();
    var state = rawState && typeof rawState === "object" && !Array.isArray(rawState) ? rawState : {};
    return {
      completedLessons: Array.isArray(state.completedLessons) ? Array.from(new Set(state.completedLessons.filter(Boolean))) : defaults.completedLessons,
      kbju: state.kbju && typeof state.kbju === "object" && !Array.isArray(state.kbju) ? state.kbju : defaults.kbju,
      calculatorInputs: state.calculatorInputs && typeof state.calculatorInputs === "object" && !Array.isArray(state.calculatorInputs) ? state.calculatorInputs : defaults.calculatorInputs,
      lastOpenedLesson: state.lastOpenedLesson == null ? defaults.lastOpenedLesson : state.lastOpenedLesson,
      updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : defaults.updatedAt
    };
  }

  function parseAppState(raw) {
    if (!raw) return getDefaultAppState();
    try {
      return normalizeAppState(JSON.parse(raw));
    } catch (error) {
      return getDefaultAppState();
    }
  }

  function getLocalStorageAdapter() {
    return {
      type: "local",
      async getItem(key) {
        try { return localStorage.getItem(key); } catch (error) { return null; }
      },
      async setItem(key, value) {
        try { localStorage.setItem(key, value); } catch (error) { console.warn("localStorage set failed:", error); }
      },
      async removeItem(key) {
        try { localStorage.removeItem(key); } catch (error) { console.warn("localStorage remove failed:", error); }
      }
    };
  }

  function cloudCall(method, key, value) {
    return new Promise(function (resolve, reject) {
      try {
        var tg = getTelegramWebApp();
        var cloud = tg && tg.CloudStorage;
        if (!cloud || typeof cloud[method] !== "function") {
          reject(new Error("CloudStorage unavailable"));
          return;
        }

        var callback = function (error, result) {
          if (error) {
            reject(typeof error === "string" ? new Error(error) : error);
            return;
          }
          resolve(result);
        };

        if (method === "setItem") {
          cloud.setItem(key, value, callback);
          return;
        }
        cloud[method](key, callback);
      } catch (err) {
        reject(err);
      }
    });
  }

  function getCloudStorageAdapter() {
    return {
      type: "telegram-cloud",
      async getItem(key) { return cloudCall("getItem", key); },
      async setItem(key, value) { return cloudCall("setItem", key, value); },
      async removeItem(key) { return cloudCall("removeItem", key); }
    };
  }

  function vkCall(method, params) {
    var bridge = getVkBridge();
    if (!bridge || typeof bridge.send !== "function") {
      return Promise.reject(new Error("VK Bridge unavailable"));
    }
    return bridge.send(method, params || {});
  }

  function getVkStorageAdapter() {
    return {
      type: "vk-storage",
      async getItem(key) {
        var result = await vkCall("VKWebAppStorageGet", { keys: [key] });
        var keys = result && Array.isArray(result.keys) ? result.keys : [];
        var entry = keys.find(function (item) { return item && item.key === key; });
        return entry ? entry.value : null;
      },
      async setItem(key, value) {
        await vkCall("VKWebAppStorageSet", { key: key, value: value });
      },
      async removeItem(key) {
        await vkCall("VKWebAppStorageSet", { key: key, value: "" });
      }
    };
  }

  function makeSafeKeyValueStorage(primary, fallback) {
    return {
      get type() { return ACTIVE_STORAGE; },
      get cloudFailed() { return STORAGE_FAILED; },
      get platform() { return detectPlatform(); },
      async getItem(key) {
        try {
          return await primary.getItem(key);
        } catch (error) {
          ACTIVE_STORAGE = fallback.type;
          STORAGE_FAILED = true;
          return fallback.getItem(key);
        }
      },
      async setItem(key, value) {
        try {
          return await primary.setItem(key, value);
        } catch (error) {
          ACTIVE_STORAGE = fallback.type;
          STORAGE_FAILED = true;
          return fallback.setItem(key, value);
        }
      },
      async removeItem(key) {
        try {
          return await primary.removeItem(key);
        } catch (error) {
          ACTIVE_STORAGE = fallback.type;
          STORAGE_FAILED = true;
          return fallback.removeItem(key);
        }
      }
    };
  }

  function withAppStateMethods(storage, options) {
    var stateKey = options && options.appStateKey ? options.appStateKey : APP_STATE_KEY;
    return Object.assign(storage, {
      appStateKey: stateKey,
      async loadAppState() {
        return parseAppState(await storage.getItem(stateKey));
      },
      async saveAppState(state) {
        var normalized = normalizeAppState(state);
        normalized.updatedAt = normalized.updatedAt || new Date().toISOString();
        await storage.setItem(stateKey, JSON.stringify(normalized));
        return normalized;
      },
      async updateAppState(partialState) {
        var current = await this.loadAppState();
        var next = normalizeAppState(Object.assign({}, current, partialState || {}));
        next.updatedAt = new Date().toISOString();
        await storage.setItem(stateKey, JSON.stringify(next));
        return next;
      }
    });
  }

  async function getAppStorage(options) {
    options = options || {};
    var local = getLocalStorageAdapter();
    var platform = detectPlatform();
    var primary = local;

    if (platform === "telegram" && getTelegramWebApp() && getTelegramWebApp().CloudStorage) {
      primary = getCloudStorageAdapter();
    } else if (platform === "vk" && getVkBridge()) {
      primary = getVkStorageAdapter();
    }

    if (primary !== local) {
      try {
        await primary.getItem(options.appStateKey || APP_STATE_KEY);
        ACTIVE_STORAGE = primary.type;
        STORAGE_FAILED = false;
        return withAppStateMethods(makeSafeKeyValueStorage(primary, local), options);
      } catch (error) {
        ACTIVE_STORAGE = "local";
        STORAGE_FAILED = true;
        return withAppStateMethods(makeSafeKeyValueStorage(local, local), options);
      }
    }

    ACTIVE_STORAGE = "local";
    STORAGE_FAILED = false;
    return withAppStateMethods(makeSafeKeyValueStorage(local, local), options);
  }

  globalThis.CourseAppPlatform = {
    APP_STATE_KEY: APP_STATE_KEY,
    detectPlatform: detectPlatform,
    detectTelegramWebApp: detectTelegramWebApp,
    getTelegramWebApp: getTelegramWebApp,
    whenReady: whenReady,
    getUserProfile: getUserProfile,
    getTelegramUserProfile: getTelegramUserProfile,
    getAppStorage: getAppStorage,
    getDefaultAppState: getDefaultAppState,
    normalizeAppState: normalizeAppState
  };
})();
