const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "supabase", "functions");
const read = (fn, file) => fs.readFileSync(path.join(root, fn, file), "utf8");
const student = read("get-student-homeworks", "index.ts");
const admin = read("get-homework-submissions", "index.ts");
const studentHttp = read("get-student-homeworks", "http.ts");
const adminHttp = read("get-homework-submissions", "http.ts");

// Student reads are authorized first, course-scoped, enabled-only and batched.
assert(student.indexOf("resolveStudentContext") < student.indexOf('.from("lessons")'));
assert(!student.includes("input.product_user_id"));
assert(student.includes('.eq("product_user_id", context.productUserId)'));
assert(student.includes('.eq("course_id", courseId)'));
assert(student.includes('.eq("is_enabled", true)'));
assert(student.includes('.in("homework_id", homeworkIds)'));
assert(student.includes('.in("submission_id", submissionIds)'));
assert(!/for\s*\([^)]*homework[^)]*\)[\s\S]{0,300}await supabase/.test(student), "No per-homework query is allowed");
assert(student.includes("submission: null"));

// Admin identity and ownership precede course-scoped service-role reads.
assert(admin.includes('request.headers.get("X-Admin-Session")'));
assert(admin.indexOf("resolveAdminContext") < admin.indexOf('.from("lessons")'));
assert(admin.indexOf("requireCourseOwnership") < admin.indexOf('.from("lessons")'));
assert(!admin.includes("input.account_id"));
assert(admin.includes('.eq("course_id", courseId)'));
const emptyBoundary = admin.indexOf('if (!homeworkIds.length)');
const submissionQuery = admin.indexOf('.from("homework_submissions")');
assert(emptyBoundary > 0 && emptyBoundary < submissionQuery, "Empty course boundary must return before querying submissions");
assert(admin.includes('action === "detail"\n        ? jsonResponse({ ok: false, error: { code: "submission_not_found" } }, 404)'));
assert(admin.includes(': jsonResponse({ ok: true, submissions: [] })'));
assert(!admin.includes('.in("homework_id", [])'));
assert(admin.includes('query = query.in("homework_id", homeworkIds)'));
assert(admin.includes('query.eq("status", status as string)'));
assert(admin.includes('query.eq("id", input.submission_id as string)'));
assert(admin.includes('.order("attempt_number", { ascending: action === "detail" })'));
assert(admin.includes('.order("created_at", { ascending: true })'));
assert(admin.includes('.order("updated_at", { ascending: false })'));

for (const source of [student, admin]) {
  assert(source.includes('request.method === "OPTIONS"'));
  assert(source.includes('error: { code: "server_error" }'));
  assert(!source.match(/console\.(?:log|error|warn)\([^\n]*(?:platform_auth_data|sessionToken|serviceKey|key)/));
}
for (const header of ["authorization", "x-client-info", "apikey", "content-type"]) {
  assert(studentHttp.includes(header)); assert(adminHttp.includes(header));
}
assert(adminHttp.includes("x-admin-session"));

const sharedAuth = read("_shared", "homework-auth.ts");
for (const fn of ["get-student-homeworks", "get-homework-submissions"])
  assert.strictEqual(read(fn, "homework-auth.ts"), sharedAuth, `${fn} auth helper must be synchronized`);
console.log("Homework read Edge Function static checks passed");

// Private attachment GET URLs preserve authentication order, trusted ownership and short expiry.
const studentAttachment = read("get-student-homework-attachment-url", "index.ts");
const adminAttachment = read("get-admin-homework-attachment-url", "index.ts");
const studentAttachmentRead = studentAttachment.indexOf('.from("homework_attachments")');
const adminAttachmentRead = adminAttachment.indexOf('.from("homework_attachments")');
assert(studentAttachment.indexOf("const context = await resolveStudentContext") < studentAttachmentRead);
assert(!studentAttachment.includes("input.storage_path"));
assert(studentAttachment.includes("String(submission.product_user_id) !== context.productUserId"));
assert(studentAttachment.includes("new GetObjectCommand({ Bucket: bucket, Key: attachment.storage_path })"));
assert(studentAttachment.includes("{ expiresIn: EXPIRES_IN }") && studentAttachment.includes("const EXPIRES_IN = 300"));
assert(adminAttachment.indexOf("const context = await resolveAdminContext") < adminAttachmentRead);
assert(adminAttachment.includes("String(course.account_id) !== String(context.accountId)"));
assert(!adminAttachment.includes("input.storage_path"));
assert(adminAttachment.includes("new GetObjectCommand({ Bucket: bucket, Key: attachment.storage_path })"));
assert(adminAttachment.includes("{ expiresIn: EXPIRES_IN }") && adminAttachment.includes("const EXPIRES_IN = 300"));
