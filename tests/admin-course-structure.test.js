const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin.css"), "utf8");

assert.match(html, /<h2>Структура курса<\/h2>/);
assert.match(html, /name="courseStructure" value="classic"/);
assert.match(html, /name="courseStructure" value="grouped"/);
assert.match(html, /admin-course-structure-card/);
assert.match(css, /\.admin-form \.admin-course-structure-option input \{[^}]*width: 16px;[^}]*height: 16px;[^}]*min-height: 0;/s);
assert.match(css, /\.admin-course-structure-form \{[^}]*max-width: 680px;/s);
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

const duplicateLesson = js.match(/async function duplicateLesson\(lessonDbId\) \{([\s\S]*?)\n  \}\n\n  async function duplicateBlock/);
assert(duplicateLesson, "duplicateLesson must exist");
assert.match(duplicateLesson[1], /cloneRecord\(sourceLesson, \[[\s\S]*?"group_title"[\s\S]*?\]\)/,
  "duplicating a lesson must exclude group_title from the copied record");
assert.doesNotMatch(duplicateLesson[1], /nextLessonPayload\.group_title\s*=/,
  "duplicating a lesson must not restore the source group title");

const deleteLesson = js.match(/async function deleteLesson\(\) \{([\s\S]*?)\n  \}\n\n  function/);
assert(deleteLesson, "deleteLesson must exist");
assert.match(deleteLesson[1], /String\(lessonToDelete\.group_title \|\| ""\)\.trim\(\)/,
  "the section warning must only be added for a non-empty group title");
assert.match(deleteLesson[1], /Этот урок начинает раздел, поэтому после удаления заголовок раздела исчезнет\./);
assert.match(deleteLesson[1], /Чтобы сохранить раздел, назначьте следующий урок его началом\./);
assert.doesNotMatch(deleteLesson[1], /update\([^)]*group_title|group_title[^;]*update\(/,
  "deleting a section start must not transfer group_title automatically");

console.log("admin course structure tests passed");
