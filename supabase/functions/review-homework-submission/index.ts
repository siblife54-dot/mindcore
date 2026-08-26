import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HomeworkAuthError, resolveAdminContext } from "./homework-auth.ts";
import { corsHeaders, jsonResponse, rpcErrorResponse } from "./http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["accept", "request_revision"]);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);

  let submissionId: string | undefined;
  try {
    const sessionToken = request.headers.get("X-Admin-Session");
    if (!sessionToken) return jsonResponse({ ok: false, error: { code: "invalid_admin_session" } }, 401);

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new HomeworkAuthError("invalid_request", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.submission_id !== "string" || !UUID.test(input.submission_id) ||
      typeof input.action !== "string") {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    if (!ACTIONS.has(input.action)) {
      return jsonResponse({ ok: false, error: { code: "invalid_review_action" } }, 400);
    }
    if (input.review_comment !== undefined && input.review_comment !== null &&
      typeof input.review_comment !== "string") {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    if (input.action === "request_revision" &&
      (typeof input.review_comment !== "string" || !input.review_comment.trim())) {
      return jsonResponse({ ok: false, error: { code: "review_comment_required" } }, 400);
    }
    submissionId = input.submission_id;
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new HomeworkAuthError("server_error", 500);
    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const context = await resolveAdminContext(supabase, sessionToken);
    const { data, error } = await supabase.rpc("review_homework_submission", {
      p_submission_id: input.submission_id,
      p_action: input.action,
      p_review_comment: input.review_comment ?? null,
      p_account_id: context.accountId,
    });
    if (error) {
      console.error("review-homework-submission RPC failed", { error_code: error.code, submission_id: submissionId });
      return rpcErrorResponse(error);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new HomeworkAuthError("server_error", 500);
    return jsonResponse({ ok: true, submission_id: result.submission_id, attempt_id: result.attempt_id, status: result.status, reviewed_at: result.reviewed_at });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
    if (error instanceof HomeworkAuthError) return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
    console.error("review-homework-submission failed", { error_type: error instanceof Error ? error.name : "UnknownError", submission_id: submissionId });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
