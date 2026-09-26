const assert = require("assert");
const fs = require("fs");

const js = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("lesson.html", "utf8");

const fetchStart = js.indexOf("async function fetchStudentHomeworks()");
const submitStart = js.indexOf("async function submitStudentHomeworkText(homework, text)");
const rulesStart = js.indexOf("var HOMEWORK_ATTACHMENT_RULES =");
const createUploadStart = js.indexOf("async function createStudentHomeworkUpload(homework, attachment)");
const putUploadStart = js.indexOf("async function uploadStudentHomeworkFile(file, upload)");
const finalizeStart = js.indexOf("async function finalizeStudentHomework(homework, text, attachments)");
const renderStart = js.indexOf("async function renderLessonHomework(lesson, homework, onHomeworkStateChanged)");
const renderEnd = js.indexOf("async function checkCourseEntryAccess()", renderStart);
const renderLessonStart = js.indexOf("async function renderLesson(lessons)");
const renderLessonEnd = js.indexOf("function pluralizeRu", renderLessonStart);
const completionStart = js.indexOf('var completeBtn = document.getElementById("completeBtn")', renderLessonStart);
const completionHandlerStart = js.indexOf('completeBtn.addEventListener("click"', completionStart);
const fetchSource = js.slice(fetchStart, renderStart);
const submitSource = js.slice(submitStart, rulesStart);
const rulesSource = js.slice(rulesStart, createUploadStart);
const createUploadSource = js.slice(createUploadStart, putUploadStart);
const putUploadSource = js.slice(putUploadStart, finalizeStart);
const finalizeSource = js.slice(finalizeStart, renderStart);
const homeworkRenderSource = js.slice(renderStart, renderEnd);
const lessonRenderSource = js.slice(renderLessonStart, renderLessonEnd);

assert(fetchStart >= 0 && submitStart > fetchStart && renderStart > submitStart);
assert(fetchSource.includes('"/functions/v1/get-student-homeworks"'));
assert(fetchSource.includes('platform: "telegram"'));
assert(fetchSource.includes("var telegramInitData = getTelegramInitData()"));
assert(fetchSource.includes("platform_auth_data: telegramInitData"));
assert(fetchSource.includes("if (isPreviewMode() || !telegramInitData) return []"));
assert(homeworkRenderSource.includes("if (isPreviewMode() || !getTelegramInitData() || !homework) return"));
assert(!homeworkRenderSource.includes("fetchStudentHomeworks()"));
assert(!homeworkRenderSource.includes("lesson.lesson_id"));
assert(!js.includes('.from("lesson_homeworks")'));
assert(!js.includes('.from("homework_submissions")'));
assert(!js.includes('.from("homework_attempts")'));
assert(!js.includes('.from("homework_attachments")'));

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

for (const [type, key] of Object.entries({ text: "homework.text", image: "homework.photo", file: "homework.file", video: "homework.video" })) {
  assert(homeworkRenderSource.includes(`${type}: t("${key}")`));
}

assert(homeworkRenderSource.includes("try {"));
assert(homeworkRenderSource.includes("catch (error)"));
assert(homeworkRenderSource.includes("console.warn"));
assert(homeworkRenderSource.includes("submission === null || isRevisionRequested"));
assert(homeworkRenderSource.includes('type === "text" || HOMEWORK_ATTACHMENT_RULES[type]'));
assert(homeworkRenderSource.includes('class="lesson-homework__form"'));
assert(homeworkRenderSource.includes('canSubmitText ? ['));
for (const key of [
  "homework.answerPlaceholder", "homework.pending", "homework.revision", "homework.accepted",
  "homework.statusUnavailable", "homework.empty", "homework.maxFiles", "homework.emptyFile",
  "homework.unsupported", "homework.tooLarge", "homework.sending", "homework.preparing",
  "homework.uploading", "homework.pendingText", "homework.sendError"
]) assert(homeworkRenderSource.includes(`t("${key}"`), `Missing localized ${key}`);
assert(homeworkRenderSource.includes('submissionStatus === "pending_review"'));
assert(homeworkRenderSource.includes('submissionStatus === "accepted"'));
assert(homeworkRenderSource.includes('submissionStatus === "revision_requested"'));
assert(homeworkRenderSource.includes("escapeHtml(String(reviewComment))"));
assert(homeworkRenderSource.includes("escapeHtml(previousStudentText)"));
assert(homeworkRenderSource.includes("submission.latest_attempt.student_text || \"\""));
assert(!homeworkRenderSource.includes("latest_attempt.attachments"));
for (const [type, key] of Object.entries({ image: "homework.addPhoto", file: "homework.addFile", video: "homework.addVideo" })) {
  assert(rulesSource.includes(`${type}: {`));
  assert(rulesSource.includes(`actionKey: "${key}"`));
}
assert(homeworkRenderSource.includes('data-attachment-type="'));
assert(homeworkRenderSource.includes('type="file"'));
assert(homeworkRenderSource.includes(" multiple>"));
assert(homeworkRenderSource.includes("textarea ? textarea.value.trim() : \"\""));
assert(homeworkRenderSource.includes("selectedAttachments.length > 10"));
assert(homeworkRenderSource.includes("selected.file.size <= 0"));
assert(homeworkRenderSource.indexOf("selected.file.size <= 0") < homeworkRenderSource.indexOf("await createStudentHomeworkUpload(homework, attachment)"));
assert(homeworkRenderSource.includes("if (isSubmitting) return"));
assert(homeworkRenderSource.includes("if (textarea) textarea.disabled = disabled"));
assert(homeworkRenderSource.includes("input.disabled = disabled"));
assert(homeworkRenderSource.includes("submitButton.disabled = disabled"));
assert(homeworkRenderSource.includes("form.remove()"));
assert(homeworkRenderSource.includes('submission: { status: "pending_review" }'));
assert(homeworkRenderSource.includes("onHomeworkStateChanged"));
assert(homeworkRenderSource.includes("setFormDisabled(false)"));
assert(!homeworkRenderSource.includes('textarea.value = ""'));

// Client rules mirror create-homework-upload-url and remain attachment-type based.
for (const mime of [
  "image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "text/plain", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"
]) assert(rulesSource.includes(`"${mime}"`));
for (const limit of ["10 * 1024 * 1024", "25 * 1024 * 1024", "100 * 1024 * 1024"])
  assert(rulesSource.includes(`maxSize: ${limit}`));
assert(homeworkRenderSource.includes("attachmentType: type"));

// Text-only stays on 5.2; attachments use create -> signed PUT -> finalize.
assert(homeworkRenderSource.includes("if (selectedAttachments.length === 0)"));
assert(homeworkRenderSource.includes("await submitStudentHomeworkText(homework, studentText)"));
assert(homeworkRenderSource.includes("await createStudentHomeworkUpload(homework, attachment)"));
assert(homeworkRenderSource.includes("await uploadStudentHomeworkFile(attachment.file, upload)"));
assert(homeworkRenderSource.includes("await finalizeStudentHomework(homework, studentText, uploadedAttachments)"));
assert(createUploadSource.includes('"/functions/v1/create-homework-upload-url"'));
assert(finalizeSource.includes('"/functions/v1/finalize-homework-attempt"'));
for (const source of [createUploadSource, finalizeSource]) {
  assert(source.includes('platform: "telegram"'));
  assert(source.includes("platform_auth_data: getTelegramInitData()"));
  assert(source.includes("headers: getStudentHomeworkHeaders()"));
}
for (const field of ["attachment_type", "file_name", "mime_type", "size_bytes"])
  assert(createUploadSource.includes(field + ":"));
assert(createUploadSource.includes('upload.method !== "PUT"'));
assert(putUploadSource.includes("fetch(upload.url"));
assert(putUploadSource.includes('method: "PUT"'));
assert(putUploadSource.includes('headers: { "Content-Type": upload.content_type }'));
assert(!putUploadSource.includes("Authorization"));
assert(!putUploadSource.includes("apikey"));
assert(!putUploadSource.includes("getTelegramInitData"));
for (const field of ["storage_path", "attachment_type", "original_name"])
  assert(finalizeSource.includes(field + ":"));
for (const field of ["mime_type", "size_bytes", "product_user_id", "webapp_user_id"])
  assert(!finalizeSource.includes(field + ":"));
assert(finalizeSource.includes('student_text: text || ""'));
for (const stage of ["create_upload_url", "upload", "finalize"])
  assert(homeworkRenderSource.includes(`homeworkStage = "${stage}"`));
const homeworkCall = js.indexOf("void renderLessonHomework(lesson, resolvedHomework", renderLessonStart);
assert(homeworkCall > completionHandlerStart && homeworkCall < renderLessonEnd);
assert(!lessonRenderSource.includes("await renderLessonHomework(lesson"));
assert.strictEqual((lessonRenderSource.match(/fetchStudentHomeworks\(\)/g) || []).length, 1);

const homeworkHost = html.indexOf('id="lessonHomeworkHost"');
assert(homeworkHost > html.indexOf('id="attachmentsWrap"'));
assert(homeworkHost < html.indexOf('class="row-actions"'));
assert(html.slice(homeworkHost, html.indexOf(">", homeworkHost)).includes("hidden"));

console.log("Student Homework UI regression assertions passed");
