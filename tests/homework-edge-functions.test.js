const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "supabase", "functions");
const read = (fn, file) => fs.readFileSync(path.join(root, fn, file), "utf8");
const submit = read("submit-homework-attempt", "index.ts");
const review = read("review-homework-submission", "index.ts");
const submitHttp = read("submit-homework-attempt", "http.ts");
const reviewHttp = read("review-homework-submission", "http.ts");
const uploadPath = path.join(root, "create-homework-upload-url", "index.ts");
assert(fs.existsSync(uploadPath), "Upload URL function must exist");
const upload = fs.readFileSync(uploadPath, "utf8");

assert(submit.indexOf("resolveStudentContext") < submit.indexOf('supabase.rpc("submit_homework_attempt"'));
assert(submit.includes("p_product_user_id: context.productUserId"));
assert(!submit.includes("input.product_user_id"), "Client product_user_id must never be read");
assert(review.indexOf("resolveAdminContext") < review.indexOf('supabase.rpc("review_homework_submission"'));
assert(review.includes("p_account_id: context.accountId"));
assert(!review.includes("input.account_id"), "Client account_id must never be read");
assert(submit.includes('request.method === "OPTIONS"'));
assert(review.includes('request.method === "OPTIONS"'));
assert(reviewHttp.toLowerCase().includes("x-admin-session"));
for (const header of ["authorization", "x-client-info", "apikey", "content-type"]) assert(reviewHttp.includes(header));
for (const code of ["student_text_required", "text_response_not_allowed", "homework_course_mismatch", "homework_not_found", "homework_disabled", "submission_pending_review", "submission_already_accepted", "homework_invariant_error"]) assert(submitHttp.includes(code));
for (const code of ["invalid_review_action", "review_comment_required", "course_forbidden", "submission_not_found", "submission_not_pending"]) assert(reviewHttp.includes(code));
assert(!submit.match(/console\.error\([^\n]*(platform_auth_data|initData)/));
assert(!review.match(/console\.error\([^\n]*(sessionToken|X-Admin-Session)/));

// Presigned upload URLs are issued only from authenticated, course-scoped server state.
assert(!upload.includes("../_shared/"), "Dashboard-deployed function must be self-contained");
assert(!upload.includes("input.product_user_id"), "Client product_user_id must never be read");
assert(upload.indexOf("resolveStudentContext(supabase") < upload.indexOf('.from("lesson_homeworks")'));
assert(upload.indexOf("resolveStudentContext(supabase") < upload.indexOf("new S3Client"));
assert(upload.includes("`pending/courses/${context.courseId}/students/${context.productUserId}/homeworks/"));
assert(upload.includes("crypto.randomUUID()"));
assert(upload.includes("const EXPIRES_IN = 300"));
for (const mime of ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "text/plain", "application/msword", "application/zip"]) assert(upload.includes(mime));
for (const limit of ["10 * 1024 * 1024", "100 * 1024 * 1024", "25 * 1024 * 1024"]) assert(upload.includes(limit));
assert(upload.includes("Key: storagePath"), "Signing must use the server-generated object key");
assert(upload.includes("ContentType: mimeType"));
assert(upload.includes("getSignedUrl(s3, command, { expiresIn: EXPIRES_IN })"));
const realCourseId = "course_1781255103582";
assert(realCourseId.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(realCourseId));
assert(upload.includes('typeof input.course_id !== "string" || !input.course_id.trim()'), "Non-empty course IDs must be accepted");
assert(!upload.includes("UUID.test(input.course_id)"), "Course IDs are not UUIDs");
assert(upload.includes("const requestedCourseId = input.course_id.trim();"));
assert(upload.includes("courseId: requestedCourseId"));
assert(upload.includes("UUID.test(input.homework_id)"), "Homework IDs must remain UUIDs");
assert(!fs.existsSync(path.join(root, "homework-s3-check", "index.ts")), "Temporary S3 check must be removed");

// Regression coverage for course-level access and synchronized deployment copies.
const authCopies = [
  read("_shared", "homework-auth.ts"),
  read("homework-auth-check", "homework-auth.ts"),
  read("submit-homework-attempt", "homework-auth.ts"),
  read("review-homework-submission", "homework-auth.ts"),
];
for (const auth of authCopies.slice(1)) assert.strictEqual(auth, authCopies[0], "Homework auth copies must remain synchronized");
const auth = authCopies[0];
const membershipCall = auth.indexOf("requireTelegramChannelMembership(", auth.indexOf("export async function resolveStudentContext"));
const webappWrite = auth.indexOf('.from("webapp_users").upsert');
const productWrite = auth.indexOf('.from("product_users").upsert');
assert(auth.includes('.select("access_mode, access_config, access_control_enabled, access_duration_days")'));
assert(auth.includes("getChatMember"), "Telegram membership must be checked server-side");
assert(auth.includes("const telegramUserId = Number(platformUserId)"));
assert(auth.includes("Number.isSafeInteger(telegramUserId)"));
assert(auth.includes("telegramUserId <= 0"));
assert(auth.includes('JSON.stringify({ chat_id: channelId, user_id: telegramUserId })'),
  "Telegram getChatMember must receive a numeric user_id");
assert(!auth.includes("user_id: platformUserId"));
assert(auth.includes('(member.status === "restricted" && member.is_member === true)'));
assert(membershipCall > 0 && membershipCall < webappWrite && membershipCall < productWrite,
  "Course membership must pass before creating users");
assert(auth.indexOf('settings.access_mode === "telegram_channel"') < membershipCall);
assert(auth.includes('settings.access_mode !== "open"'), "Open access must skip the channel call");
assert(auth.includes('HomeworkAuthError("course_access_denied", 403)'));
assert(auth.includes('HomeworkAuthError("invalid_admin_session", 401)'));
assert(auth.includes("!session || session.revoked_at ||"));
assert(auth.includes("new Date(session.expires_at).getTime() <= Date.now()"));
assert(review.includes('input.review_comment ?? null'), "Accept must permit an omitted review comment");
assert(review.includes('input.action === "request_revision"'));
assert(review.includes('code: "review_comment_required"'));
assert(!auth.match(/console\.(?:log|error|warn)\([^\n]*(?:initData|botToken|sessionToken)/));
console.log("Homework Edge Function static checks passed");
