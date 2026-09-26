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
const migration = fs.readFileSync(path.join(root, "migrations/20260926120000_add_language_to_course_settings.sql"), "utf8");
assert.match(migration, /language text not null default 'ru'/i);
assert.match(migration, /check \(language in \('ru', 'tr'\)\)/i);
console.log("localization tests passed");
