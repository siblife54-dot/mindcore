const assert = require("assert");
const fs = require("fs");

const js = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("lesson.html", "utf8");

const fetchStart = js.indexOf("async function fetchStudentHomeworks()");
const renderStart = js.indexOf("async function renderLessonHomework(lesson)");
const renderEnd = js.indexOf("async function checkCourseEntryAccess()", renderStart);
const renderLessonStart = js.indexOf("async function renderLesson(lessons)");
const renderLessonEnd = js.indexOf("function pluralizeRu", renderLessonStart);
const completionStart = js.indexOf('var completeBtn = document.getElementById("completeBtn")', renderLessonStart);
const completionHandlerStart = js.indexOf('completeBtn.addEventListener("click"', completionStart);
const fetchSource = js.slice(fetchStart, renderStart);
const homeworkRenderSource = js.slice(renderStart, renderEnd);
const lessonRenderSource = js.slice(renderLessonStart, renderLessonEnd);

assert(fetchStart >= 0 && renderStart > fetchStart);
assert(fetchSource.includes('"/functions/v1/get-student-homeworks"'));
assert(fetchSource.includes('platform: "telegram"'));
assert(fetchSource.includes("var telegramInitData = getTelegramInitData()"));
assert(fetchSource.includes("platform_auth_data: telegramInitData"));
assert(fetchSource.includes("if (isPreviewMode() || !telegramInitData) return []"));
assert(homeworkRenderSource.includes("if (isPreviewMode() || !getTelegramInitData()) return"));
assert(homeworkRenderSource.includes("String(item.lesson_id) === String(lesson.id)"));
assert(!homeworkRenderSource.includes("lesson.lesson_id"));
assert(!js.includes('.from("lesson_homeworks")'));

for (const [type, label] of Object.entries({ text: "Текст", image: "Фото", file: "Файл", video: "Видео" })) {
  assert(homeworkRenderSource.includes(`${type}: "${label}"`));
}

assert(homeworkRenderSource.includes("try {"));
assert(homeworkRenderSource.includes("catch (error)"));
assert(homeworkRenderSource.includes("console.warn"));
const homeworkCall = js.indexOf("void renderLessonHomework(lesson)", renderLessonStart);
assert(homeworkCall > completionHandlerStart && homeworkCall < renderLessonEnd);
assert(!lessonRenderSource.includes("await renderLessonHomework(lesson)"));

const homeworkHost = html.indexOf('id="lessonHomeworkHost"');
assert(homeworkHost > html.indexOf('id="attachmentsWrap"'));
assert(homeworkHost < html.indexOf('class="row-actions"'));
assert(html.slice(homeworkHost, html.indexOf(">", homeworkHost)).includes("hidden"));

console.log("Student Homework UI regression assertions passed");
