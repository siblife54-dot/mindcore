const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin.js"), "utf8");

assert.match(html, /data-admin-tab="homework"[^>]*>Домашние задания/);
assert.match(js, /management:\s*\["students", "sales", "homework"\]/);
assert.match(html, /data-admin-tab="students"/);
assert.match(html, /data-admin-tab="sales"/);
assert.match(js, /\/functions\/v1\/get-homework-submissions/);
assert.match(js, /action: "list", course_id: courseId, status: "pending_review"/);
assert.match(js, /action: "detail", course_id: courseId, submission_id: submissionId/);
assert.doesNotMatch(js, /\.from\(["'](?:lesson_homeworks|homework_submissions|homework_attempts|homework_attachments)["']\)/);
assert.match(js, /\/functions\/v1\/get-admin-homework-attachment-url/);
assert.doesNotMatch(js, /storage_path/);
assert.match(js, /reviewHomeworkSubmission\("?accept"?\)|data-homework-review="accept"/);
assert.match(js, /data-homework-review="request_revision"/);
assert.match(js, /if \(!comment\)/);
assert.match(js, /getAdminSessionHeaders\(\)/);
assert.match(js, /if \(state\.homeworkReviewSubmitting/);
assert.match(js, /homeworkSubmissions = state\.homeworkSubmissions\.filter/);
assert.match(js, /updateHomeworkPendingBadge/);
assert.match(js, /Все домашние задания проверены/);
assert.match(js, /result\.ok !== true/);
assert.doesNotMatch(html, />\s*submission_id\s*</);
assert.doesNotMatch(html, />\s*attachment_id\s*</);
assert.match(js, /Number\(attempt\.attempt_number\) > Number\(latest\.attempt_number\)/);
assert.match(js, /Number\(right\.attempt_number\) - Number\(left\.attempt_number\)/,
  "attempt history must be sorted newest first instead of trusting the backend order");
assert.match(js, /Текущая попытка/);
assert.match(js, /previousAttempts\.length \?[^;]*Предыдущие попытки/);
assert.match(js, /attempt\.student_text[^;]*escapeHtml\(attempt\.student_text\)/,
  "student text from every attempt must be escaped and rendered");
assert.match(js, /attempt\.review_comment[^;]*Комментарий эксперта[^;]*escapeHtml\(attempt\.review_comment\)/,
  "old expert comments must be escaped and rendered");
assert.match(js, /function renderHomeworkAttachments\(attempt\)[\s\S]*data-homework-attachment=/,
  "all attempts must share the attachment renderer");
assert.match(js, /renderHomeworkAttempt\(item, false\)/,
  "old attempts must use the read-only attempt renderer");
const attemptRenderer = js.match(/function renderHomeworkAttempt\(attempt, isCurrent\) \{([\s\S]*?)\n  \}/);
assert(attemptRenderer, "attempt renderer must exist");
assert.doesNotMatch(attemptRenderer[1], /data-homework-review|data-homework-revision-toggle/,
  "review controls must not be created inside attempt cards");
assert.doesNotMatch(attemptRenderer[1], /attempt_id|submission_id|attachment_id|storage_path/,
  "internal identifiers must not be rendered in attempt cards");
assert.match(js, /escapeHtml\(file\.original_name \|\| "Файл"\)/,
  "attachment names must be escaped");

const homeworkTabBranch = js.match(/if \(nextTab === "homework"\) \{([\s\S]*?)\n    \}/);
assert(homeworkTabBranch, "homework tab activation branch must exist");
assert.match(homeworkTabBranch[1], /loadHomeworkReviewQueue\(\{ refresh: true \}\)/,
  "opening and reopening homework must always refresh the pending queue");
assert.doesNotMatch(homeworkTabBranch[1], /loadHomeworkReviewQueue\(\)/,
  "homework tab activation must not use the cached queue path");

assert.match(js, /var defaultAdminTab = getDefaultAdminTab\(\);\s*setActiveAdminTab\(defaultAdminTab\);/,
  "startup must resolve the default tab only once");
assert.match(js, /if \(defaultAdminTab !== "homework"\) \{\s*void loadHomeworkReviewQueue\(\)\.catch/,
  "startup badge loading must remain enabled without duplicating the default homework-tab request");
assert.match(js, /homeworkReviewRefreshBtn[\s\S]*loadHomeworkReviewQueue\(\{ refresh: true \}\)/,
  "the manual refresh control must continue to force a queue refresh");

console.log("admin homework UI tests passed");
