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

console.log("admin homework UI tests passed");
