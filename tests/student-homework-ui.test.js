const assert = require("assert");
const fs = require("fs");

const js = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("lesson.html", "utf8");

const fetchStart = js.indexOf("async function fetchStudentHomeworks()");
const submitStart = js.indexOf("async function submitStudentHomeworkText(homework, text)");
const renderStart = js.indexOf("async function renderLessonHomework(lesson)");
const renderEnd = js.indexOf("async function checkCourseEntryAccess()", renderStart);
const renderLessonStart = js.indexOf("async function renderLesson(lessons)");
const renderLessonEnd = js.indexOf("function pluralizeRu", renderLessonStart);
const completionStart = js.indexOf('var completeBtn = document.getElementById("completeBtn")', renderLessonStart);
const completionHandlerStart = js.indexOf('completeBtn.addEventListener("click"', completionStart);
const fetchSource = js.slice(fetchStart, renderStart);
const submitSource = js.slice(submitStart, renderStart);
const homeworkRenderSource = js.slice(renderStart, renderEnd);
const lessonRenderSource = js.slice(renderLessonStart, renderLessonEnd);

assert(fetchStart >= 0 && submitStart > fetchStart && renderStart > submitStart);
assert(fetchSource.includes('"/functions/v1/get-student-homeworks"'));
assert(fetchSource.includes('platform: "telegram"'));
assert(fetchSource.includes("var telegramInitData = getTelegramInitData()"));
assert(fetchSource.includes("platform_auth_data: telegramInitData"));
assert(fetchSource.includes("if (isPreviewMode() || !telegramInitData) return []"));
assert(homeworkRenderSource.includes("if (isPreviewMode() || !getTelegramInitData()) return"));
assert(homeworkRenderSource.includes("String(item.lesson_id) === String(lesson.id)"));
assert(!homeworkRenderSource.includes("lesson.lesson_id"));
assert(!js.includes('.from("lesson_homeworks")'));
assert(!js.includes('.from("homework_submissions")'));

assert(submitSource.includes('"/functions/v1/submit-homework-attempt"'));
for (const field of ["course_id", "platform", "platform_auth_data", "homework_id", "student_text"]) {
  assert(submitSource.includes(field + ":"));
}
assert(submitSource.includes('platform: "telegram"'));
assert(submitSource.includes("course_id: getActiveCourseId()"));
assert(submitSource.includes("platform_auth_data: getTelegramInitData()"));
assert(submitSource.includes("homework_id: homework.id"));
assert(!submitSource.includes("product_user_id"));
assert(!submitSource.includes("webapp_user_id"));
assert(!submitSource.includes("submission_id"));
assert(!submitSource.includes("attempt_id"));

for (const [type, label] of Object.entries({ text: "Текст", image: "Фото", file: "Файл", video: "Видео" })) {
  assert(homeworkRenderSource.includes(`${type}: "${label}"`));
}

assert(homeworkRenderSource.includes("try {"));
assert(homeworkRenderSource.includes("catch (error)"));
assert(homeworkRenderSource.includes("console.warn"));
assert(homeworkRenderSource.includes('responseTypes.includes("text") && homework.submission === null'));
assert(homeworkRenderSource.includes('class="lesson-homework__form"'));
assert(homeworkRenderSource.includes('placeholder="Напишите ответ..."'));
assert(homeworkRenderSource.includes("textarea.value.trim()"));
assert(homeworkRenderSource.includes("Напишите ответ перед отправкой."));
assert(homeworkRenderSource.includes("if (isSubmitting) return"));
assert(homeworkRenderSource.includes("textarea.disabled = true"));
assert(homeworkRenderSource.includes("submitButton.disabled = true"));
assert(homeworkRenderSource.includes('submitButton.textContent = "Отправляем..."'));
assert(homeworkRenderSource.includes("Домашнее задание отправлено на проверку"));
assert(homeworkRenderSource.includes("textarea.disabled = false"));
assert(homeworkRenderSource.includes("submitButton.disabled = false"));
assert(homeworkRenderSource.includes("Не удалось отправить домашнее задание. Попробуйте ещё раз."));
assert(!homeworkRenderSource.includes('textarea.value = ""'));
const homeworkCall = js.indexOf("void renderLessonHomework(lesson)", renderLessonStart);
assert(homeworkCall > completionHandlerStart && homeworkCall < renderLessonEnd);
assert(!lessonRenderSource.includes("await renderLessonHomework(lesson)"));

const homeworkHost = html.indexOf('id="lessonHomeworkHost"');
assert(homeworkHost > html.indexOf('id="attachmentsWrap"'));
assert(homeworkHost < html.indexOf('class="row-actions"'));
assert(html.slice(homeworkHost, html.indexOf(">", homeworkHost)).includes("hidden"));

console.log("Student Homework UI regression assertions passed");
