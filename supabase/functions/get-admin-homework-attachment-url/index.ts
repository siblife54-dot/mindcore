import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.879.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.879.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPIRES_IN = 300;
type ErrorCode = "invalid_request" | "invalid_admin_session" | "attachment_not_found" |
  "storage_config_missing" | "storage_signing_failed" | "server_error";
class RequestError extends Error {
  constructor(public code: ErrorCode, public status: number) { super(code); }
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function resolveAdminContext(supabase: SupabaseClient, sessionToken: string) {
  if (!sessionToken || sessionToken.length > 500) throw new RequestError("invalid_admin_session", 401);
  const { data: tokenHash, error: hashError } = await supabase.rpc("hash_admin_session_token", { p_token: sessionToken });
  if (hashError || typeof tokenHash !== "string" || !tokenHash) throw new RequestError("server_error", 500);
  const { data: session, error: sessionError } = await supabase.from("admin_sessions")
    .select("account_id, expires_at, revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (sessionError) throw new RequestError("server_error", 500);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    throw new RequestError("invalid_admin_session", 401);
  }
  const { data: account, error: accountError } = await supabase.from("accounts")
    .select("id, status").eq("id", session.account_id).maybeSingle();
  if (accountError) throw new RequestError("server_error", 500);
  if (!account || account.status !== "active") throw new RequestError("invalid_admin_session", 401);
  return { accountId: account.id };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  try {
    const sessionToken = request.headers.get("X-Admin-Session");
    if (!sessionToken) throw new RequestError("invalid_admin_session", 401);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new RequestError("invalid_request", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.attachment_id !== "string" || !UUID.test(input.attachment_id)) {
      throw new RequestError("invalid_request", 400);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new RequestError("server_error", 500);
    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const context = await resolveAdminContext(supabase, sessionToken);

    // Attachment data is read only after the session resolves a trusted account.
    const attachmentResult = await supabase.from("homework_attachments")
      .select("id, attempt_id, attachment_type, storage_path, original_name, mime_type, size_bytes")
      .eq("id", input.attachment_id).maybeSingle();
    if (attachmentResult.error) throw new RequestError("server_error", 500);
    const attachment = attachmentResult.data;
    if (!attachment) throw new RequestError("attachment_not_found", 404);
    const attemptResult = await supabase.from("homework_attempts").select("id, submission_id")
      .eq("id", attachment.attempt_id).maybeSingle();
    if (attemptResult.error) throw new RequestError("server_error", 500);
    if (!attemptResult.data) throw new RequestError("attachment_not_found", 404);
    const submissionResult = await supabase.from("homework_submissions").select("id, homework_id, product_user_id")
      .eq("id", attemptResult.data.submission_id).maybeSingle();
    if (submissionResult.error) throw new RequestError("server_error", 500);
    if (!submissionResult.data) throw new RequestError("attachment_not_found", 404);
    const homeworkResult = await supabase.from("lesson_homeworks").select("id, lesson_id")
      .eq("id", submissionResult.data.homework_id).maybeSingle();
    if (homeworkResult.error) throw new RequestError("server_error", 500);
    if (!homeworkResult.data) throw new RequestError("attachment_not_found", 404);
    const lessonResult = await supabase.from("lessons").select("id, course_id")
      .eq("id", homeworkResult.data.lesson_id).maybeSingle();
    if (lessonResult.error) throw new RequestError("server_error", 500);
    if (!lessonResult.data) throw new RequestError("attachment_not_found", 404);
    const courseResult = await supabase.from("courses").select("course_id, account_id")
      .eq("course_id", lessonResult.data.course_id).maybeSingle();
    if (courseResult.error) throw new RequestError("server_error", 500);
    const course = courseResult.data;
    if (!course || String(course.account_id) !== String(context.accountId)) {
      throw new RequestError("attachment_not_found", 404);
    }

    const expectedPrefix = `courses/${course.course_id}/students/${submissionResult.data.product_user_id}/homeworks/${homeworkResult.data.id}/attachments/`;
    const objectId = typeof attachment.storage_path === "string"
      ? attachment.storage_path.slice(expectedPrefix.length) : "";
    if (typeof attachment.storage_path !== "string" || !attachment.storage_path.startsWith(expectedPrefix) ||
      !UUID.test(objectId) || attachment.storage_path.startsWith("pending/")) {
      throw new RequestError("server_error", 500);
    }
    const accessKeyId = Deno.env.get("HOMEWORK_S3_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("HOMEWORK_S3_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("HOMEWORK_S3_BUCKET");
    const endpoint = Deno.env.get("HOMEWORK_S3_ENDPOINT");
    const region = Deno.env.get("HOMEWORK_S3_REGION");
    if (!accessKeyId || !secretAccessKey || !bucket || !endpoint || !region) {
      throw new RequestError("storage_config_missing", 500);
    }
    try {
      const s3 = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } });
      const command = new GetObjectCommand({ Bucket: bucket, Key: attachment.storage_path });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: EXPIRES_IN });
      return jsonResponse({ ok: true, attachment: {
        id: attachment.id, url: signedUrl, original_name: attachment.original_name,
        mime_type: attachment.mime_type, size_bytes: attachment.size_bytes,
        attachment_type: attachment.attachment_type, expires_in: EXPIRES_IN,
      } });
    } catch (_error) {
      console.error("Homework attachment GET URL signing failed");
      throw new RequestError("storage_signing_failed", 500);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
    if (error instanceof RequestError) return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
    console.error("Get admin homework attachment URL failed", { error_type: error instanceof Error ? error.name : "UnknownError" });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
