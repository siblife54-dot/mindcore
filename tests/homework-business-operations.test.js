const assert = require("assert");
const fs = require("fs");
const path = require("path");

const migrationName = "20260826120000_add_homework_business_operations.sql";
const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", migrationName), "utf8");

function includes(fragment, message) {
  assert(sql.includes(fragment), message || `Migration must contain: ${fragment}`);
}

// Submission lifecycle and server-owned fields.
includes("v_next_attempt_number := 1", "First submission must create attempt 1");
includes("message = 'submission_pending_review'", "Pending resubmission must be rejected");
includes("message = 'submission_already_accepted'", "Accepted resubmission must be rejected");
includes("max(attempt.attempt_number)", "Attempt number must be calculated server-side");
includes("v_submission.status <> 'revision_requested'", "Only revision_requested can be resubmitted");
includes("set status = 'pending_review'", "Resubmission must return the submission to review");

// Review lifecycle.
includes("message = 'review_comment_required'", "Revision must require a trimmed comment");
includes("when 'accept' then 'accepted'", "Accept must produce accepted");
includes("else 'revision_requested'", "Revision request must produce revision_requested");
includes("v_attempt.status <> 'pending_review'", "Only the latest pending attempt can be reviewed");

// Tenant boundaries, concurrency, and execution privileges.
includes("product_user.course_id = v_lesson.course_id", "Student course must match homework course");
includes("course.account_id = p_account_id", "Reviewer account must own the actual course");
includes("pg_catalog.pg_advisory_xact_lock", "Initial concurrent submissions must be serialized");
includes("for update", "Submission/review operations must use row locks");
includes("security definer\nset search_path = pg_catalog", "Definer functions need a safe search_path");
includes("from public, anon, authenticated", "Public roles must have EXECUTE revoked");
includes("to service_role", "Only service_role should receive EXECUTE");

assert(!/grant execute[\s\S]*?to\s+(?:public|anon|authenticated)\b/i.test(sql),
  "No client-facing role may receive EXECUTE");
assert(!/alter table[\s\S]*?(?:enable|disable|force) row level security/i.test(sql),
  "Migration must not alter Homework RLS");

console.log(`Homework business-operation migration checks passed: ${migrationName}`);
