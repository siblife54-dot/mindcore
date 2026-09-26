(function (root) {
  "use strict";
  var DEFAULT_LANGUAGE = "ru";
  var SUPPORTED_LANGUAGES = ["ru", "tr"];
  var currentLanguage = DEFAULT_LANGUAGE;
  var locales = root.MindCoreLocales || {};

  function normalizeLanguage(language) {
    var value = String(language || "").trim().toLowerCase();
    return SUPPORTED_LANGUAGES.indexOf(value) === -1 ? DEFAULT_LANGUAGE : value;
  }
  function setLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    if (root.document && root.document.documentElement) root.document.documentElement.lang = currentLanguage;
    return currentLanguage;
  }
  function interpolate(value, parameters) {
    return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
      return parameters && Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : match;
    });
  }
  function translate(key, parameters) {
    var selected = locales[currentLanguage] || {};
    var fallback = locales[DEFAULT_LANGUAGE] || {};
    var value = Object.prototype.hasOwnProperty.call(selected, key) ? selected[key] : fallback[key];
    return interpolate(typeof value === "undefined" ? key : value, parameters);
  }
  function formatDate(value, options) {
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return translate("date.invalid");
    return new Intl.DateTimeFormat(currentLanguage === "tr" ? "tr-TR" : "ru-RU", options || { dateStyle: "medium" }).format(date);
  }
  root.MindCoreI18n = {
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES: SUPPORTED_LANGUAGES.slice(),
    normalizeLanguage: normalizeLanguage,
    setLanguage: setLanguage,
    getLanguage: function () { return currentLanguage; },
    t: translate,
    formatDate: formatDate
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
