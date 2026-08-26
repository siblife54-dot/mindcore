export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const rpcErrors: Record<string, number> = {
  student_text_required: 400,
  text_response_not_allowed: 400,
  invalid_review_action: 400,
  review_comment_required: 400,
  homework_course_mismatch: 403,
  course_forbidden: 403,
  course_access_denied: 403,
  homework_not_found: 404,
  submission_not_found: 404,
  homework_disabled: 409,
  submission_pending_review: 409,
  submission_already_accepted: 409,
  submission_not_pending: 409,
  homework_invariant_error: 500,
};

export function rpcErrorResponse(error: { message?: string } | null) {
  const message = error?.message ?? "";
  const code = Object.keys(rpcErrors).find((known) => message.includes(known));
  return code
    ? jsonResponse({ ok: false, error: { code } }, rpcErrors[code])
    : jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
}
