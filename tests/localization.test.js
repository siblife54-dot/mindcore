"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function loadI18n() {
  const context = { Intl, Date, Number, String, console, document: { documentElement: { lang: "ru" } } };
  context.globalThis = context;
  vm.createContext(context);
  ["locales/ru.js", "locales/tr.js", "localization.js"].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context));
  return context.MindCoreI18n;
}

const i18n = loadI18n();
assert.equal(i18n.getLanguage(), "ru", "Russian must be the default language");
assert.equal(i18n.t("common.back"), "Назад");
i18n.setLanguage("tr");
assert.equal(i18n.getLanguage(), "tr", "A course may select Turkish");
assert.equal(i18n.t("course.greeting", { name: "Ada" }), "Merhaba, Ada!", "Parameters must be interpolated");
assert.equal(i18n.t("date.invalid"), "Некорректная дата", "Missing Turkish strings must fall back to Russian");
i18n.setLanguage("ru");
assert.equal(i18n.t("common.back"), "Назад", "Loading another course must replace, not retain, its language");
assert.equal(i18n.normalizeLanguage("de"), "ru", "Unsupported settings must safely fall back to Russian");
assert.match(i18n.formatDate(new Date(2026, 8, 26), { month: "long" }), /сентябр/i);
i18n.setLanguage("tr");
assert.equal(i18n.t("startup.checking"), "Erişim kontrol ediliyor…");
assert.equal(i18n.t("dashboard.progress", { completed: 2, total: 5 }), "Tamamlanan: 2/5");
assert.equal(i18n.t("lesson.day", { number: 3 }), "3. Gün");
assert.equal(i18n.t("forms.otherRequired", { label: "Açıklama" }), "«Açıklama» alanını doldurun veya seçimi kaldırın.");
assert.equal(i18n.t("homework.uploading", { current: 1, total: 3 }), "Yükleniyor: 1/3...");
assert.equal(i18n.t("renewal.days", { count: 30 }), "+30 gün erişim");
i18n.setLanguage("ru");
assert.equal(i18n.t("homework.pending"), "На проверке", "A second Russian course must restore Russian UI strings");
const sourceFiles = ["app.js", "startup-screen.js", "agreement-screen.js", "renewal-screen.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const usedKeys = [...sourceFiles.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)].map((match) => match[1]);
const localeContext = { globalThis: null };
localeContext.globalThis = localeContext;
vm.createContext(localeContext);
vm.runInContext(fs.readFileSync(path.join(root, "locales/ru.js"), "utf8"), localeContext);
vm.runInContext(fs.readFileSync(path.join(root, "locales/tr.js"), "utf8"), localeContext);
for (const key of new Set(usedKeys)) {
  assert.ok(Object.hasOwn(localeContext.MindCoreLocales.ru, key), `Missing Russian translation: ${key}`);
  assert.ok(Object.hasOwn(localeContext.MindCoreLocales.tr, key), `Missing Turkish translation: ${key}`);
}
const migration = fs.readFileSync(path.join(root, "migrations/20260926120000_add_language_to_course_settings.sql"), "utf8");
assert.match(migration, /language text not null default 'ru'/i);
assert.match(migration, /check \(language in \('ru', 'tr'\)\)/i);
console.log("localization tests passed");
