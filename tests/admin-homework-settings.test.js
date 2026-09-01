const assert = require("assert");
const fs = require("fs");

const js = fs.readFileSync("admin.js", "utf8");
const html = fs.readFileSync("admin.html", "utf8");

assert(js.includes('/functions/v1/manage-lesson-homework'));
assert(js.includes('body: JSON.stringify({ action: "get", lesson_id: lessonId })'));
assert(js.includes('action: "save", lesson_id: state.selectedLesson.id'));
assert(js.includes("getAdminSessionHeaders()"));
assert(!js.includes('.from("lesson_homeworks")'));
["text", "image", "file", "video"].forEach((value) => assert(js.includes(`value: "${value}"`)));
["independent", "after_submission", "after_approval"].forEach((value) => assert(js.includes(`value: "${value}"`)));
assert(js.includes('String(state.selectedLesson.id) !== String(lessonId)'));
assert(js.includes("state.savedHomeworkSettings = cloneHomeworkSettings(state.homeworkSettings)"));
assert(js.includes('content: ["appearance", "lesson_settings", "content", "connections"]'));
assert(js.includes('management: ["students", "sales"]'));
assert(html.includes('data-admin-tab="lesson_settings"'));
assert(html.includes('id="homeworkSettingsCard"'));

const selectLessonReset = js.slice(js.indexOf("async function selectLessonById"), js.indexOf("async function duplicateLesson"));
assert(selectLessonReset.includes("state.homeworkSettingsLessonId = null"));
const lessonSettingsLifecycle = js.slice(js.indexOf("function setActiveAdminTab"), js.indexOf("function setActiveAdminSection"));
assert(lessonSettingsLifecycle.includes('nextTab === "lesson_settings" && state.selectedLesson'));
assert(lessonSettingsLifecycle.includes("!state.homeworkSettings && !state.homeworkSettingsLoading"));
assert(lessonSettingsLifecycle.includes("loadHomeworkSettings(state.selectedLesson.id)"));

console.log("admin homework settings regression assertions passed");
