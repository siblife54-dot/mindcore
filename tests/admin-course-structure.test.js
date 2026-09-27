const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin.js"), "utf8");

assert.match(html, /<h2>Структура курса<\/h2>/);
assert.match(html, /name="courseStructure" value="classic"/);
assert.match(html, /name="courseStructure" value="grouped"/);
assert.match(html, /id="lessonStartsGroupInput"/);
assert.match(html, /id="lessonGroupTitleInput"[^>]*Modül 1 - Diyafram/);
assert.match(js, /select\("course_structure"\)\.eq\("course_id", getActiveCourseId\(\)\)/);
assert.match(js, /update\(\{ course_structure: courseStructure \}\)\.eq\("course_id", getActiveCourseId\(\)\)/);
assert.match(js, /state\.courseStructure = await fetchCourseStructure\(\)/);
assert.match(js, /state\.courseStructure === "grouped"[\s\S]*payload\.group_title = startsGroup \? groupTitle : null/);

const saveLesson = js.match(/async function saveLesson\(\) \{([\s\S]*?)\n  \}\n\n  async function deleteLesson/);
assert(saveLesson, "saveLesson must exist");
assert.match(saveLesson[1], /if \(state\.courseStructure === "grouped"\)/);
assert.doesNotMatch(saveLesson[1], /else\s*\{[^}]*group_title/,
  "classic mode must not overwrite stored group titles");
assert.match(js, /function renderLessonGroupFields\(\)[\s\S]*fields\.hidden = !isGrouped/);

const saveStructure = js.match(/async function saveCourseStructure\(\) \{([\s\S]*?)\n  \}/);
assert(saveStructure, "saveCourseStructure must exist");
assert.match(saveStructure[1], /refreshPreviewData\(\)/,
  "saving the structure must refresh the WebApp preview");

console.log("admin course structure tests passed");
