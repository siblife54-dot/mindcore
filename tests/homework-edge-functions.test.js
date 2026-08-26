const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "supabase", "functions");
const read = (fn, file) => fs.readFileSync(path.join(root, fn, file), "utf8");
const submit = read("submit-homework-attempt", "index.ts");
const review = read("review-homework-submission", "index.ts");
const submitHttp = read("submit-homework-attempt", "http.ts");
const reviewHttp = read("review-homework-submission", "http.ts");

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
console.log("Homework Edge Function static checks passed");
