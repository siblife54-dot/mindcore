"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function extractFunction(source, name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert(match, `Function ${name} was not found`);
  const braceStart = source.indexOf("{", match.index);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`Function ${name} is incomplete`);
}

function load(file, names) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const context = vm.createContext({
    URL, URLSearchParams, console,
    window: {
      location: { search: "", hash: "", href: "https://example.test/index.html" },
      APP_CONFIG: { courseId: "configured_default" }
    }
  });
  vm.runInContext(names.map(name => extractFunction(source, name)).join("\n"), context);
  return context;
}

async function run() {
  const resolutionCases = [
    ["?c=1781255103582", "course_1781255103582", true],
    ["?course=course_1781255103582", "course_1781255103582", true],
    ["?course=course_sushka", "course_sushka", true],
    ["?course=legacy-slug&c=1781255103582", "legacy-slug", true],
    ["?c=1781255103582&course=legacy-slug", "legacy-slug", true],
    ["?course=1781255103582", "1781255103582", true],
    ["?course=custom%20course", "custom course", true],
    ["?course=&c=1781255103582", "course_1781255103582", true],
    ["?c=000123", "course_000123", true],
    ["?c=900719925474099312345", "course_900719925474099312345", true],
    ["?c=%31%32%33", "course_123", true],
    ["?c=1781255103582&c=456", "course_1781255103582", true],
    ["?course=first&course=second&c=123", "first", true],
    ["?preview=1&debug=1&c=1781255103582", "course_1781255103582", true],
    ["", "configured_default", false],
    ["?course=", "configured_default", false],
    ["?c=", "configured_default", false],
    ["?c=course_1781255103582", "configured_default", false],
    ["?c=-123", "configured_default", false],
    ["?c=1.23", "configured_default", false],
    ["?c=123abc", "configured_default", false],
    ["?c=%20123%20", "configured_default", false],
    ["?course=legacy&c=invalid", "legacy", true]
  ];

  for (const file of ["app.js", "admin.js"]) {
    const names = ["getConfig", "getActiveCourseId"];
    if (file === "admin.js") names.push("hasCourseInUrl");
    const context = load(file, names);
    for (const [search, expected, hasCourse] of resolutionCases) {
      context.window.location.search = search;
      assert.equal(context.getActiveCourseId(), expected, `${file}: ${search}`);
      if (file === "admin.js") assert.equal(context.hasCourseInUrl(), hasCourse, search);
      assert.equal(context.window.location.search, search, "Resolving a course must not rewrite the URL");
    }
  }

  const context = load("app.js", [
    "getConfig", "getActiveCourseId", "getCourseScopedKey", "normalizeThemeId", "appendTelegramHash",
    "appendPreviewParams", "getIndexUrlWithCourse", "getLessonUrlWithCourse",
    "getTelegramInitData", "checkCourseEntryAccess"
  ]);
  context.WEBAPP_THEMES = [{ id: "light_clean" }];
  context.WEBAPP_THEME_IDS = { light_clean: "theme-light-clean" };
  const telegramHash = "#tgWebAppData=user%3D%257B%2522id%2522%253A42%257D%26hash%3Dfixture&tgWebAppVersion=8.0";
  context.window.location.hash = telegramHash;
  for (const query of ["?c=1781255103582", "?course=course_1781255103582"]) {
    context.window.location.search = query;
    assert.equal(context.getCourseScopedKey("progress"), "progress__course_1781255103582");
    assert.equal(context.getIndexUrlWithCourse(), "./index.html?course=course_1781255103582" + telegramHash);
    assert.equal(context.getLessonUrlWithCourse("lesson one"),
      "./lesson.html?id=lesson%20one&course=course_1781255103582" + telegramHash);
    context.window.location.search = query + "&preview=1&preview_theme=light_clean";
    const previewUrl = new URL(context.getLessonUrlWithCourse("lesson one"), context.window.location.href);
    assert.equal(previewUrl.searchParams.get("course"), "course_1781255103582");
    assert.equal(previewUrl.searchParams.get("id"), "lesson one");
    assert.equal(previewUrl.searchParams.get("preview"), "1");
    assert.equal(previewUrl.searchParams.get("preview_theme"), "light_clean");
    assert.equal(previewUrl.hash, telegramHash);
    assert.equal(context.window.location.hash, telegramHash);
  }

  const authCalls = [];
  let initData = "query_id=fixture&user=%7B%22id%22%3A42%7D&auth_date=1781255103&hash=fixture";
  context.CourseAppPlatform = { getTelegramWebApp: () => ({ initData }) };
  context.COURSE_SETTINGS = { access_mode: "telegram_channel" };
  context.window.getSupabaseClient = () => ({ functions: {
    invoke: async (name, options) => {
      authCalls.push({ name, body: JSON.parse(JSON.stringify(options.body)) });
      return { data: { allowed: true }, error: null };
    }
  } });
  for (const query of ["?c=1781255103582", "?course=course_1781255103582"]) {
    context.window.location.search = query;
    assert.equal((await context.checkCourseEntryAccess()).allowed, true);
    assert.deepEqual(authCalls.at(-1), { name: "check-course-access", body: {
      course_id: "course_1781255103582", telegram_init_data: initData
    } });
  }
  initData = "";
  for (const query of ["?c=1781255103582", "?course=course_1781255103582"]) {
    context.window.location.search = query;
    assert.equal((await context.checkCourseEntryAccess()).reason, "telegram_auth_required");
  }
  assert.equal(authCalls.length, 2, "Missing Telegram authentication must not call the backend");
  console.log("Course URL tests passed: 23 resolution cases in app/admin, navigation, progress keys and Telegram auth payloads");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
