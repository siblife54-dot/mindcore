import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.879.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.879.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPIRES_IN = 300;
type ErrorCode = "invalid_request" | "invalid_platform_auth" | "course_access_denied" |
  "product_access_inactive" | "product_access_expired" | "attachment_not_found" |
  "storage_config_missing" | "storage_signing_failed" | "server_error";
class RequestError extends Error {
  constructor(public code: ErrorCode, public status: number) { super(code); }
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const MAX_INIT_DATA_AGE_SECONDS = 86_400;
const MAX_INIT_DATA_FUTURE_SKEW_SECONDS = 300;
async function hmacSha256(key: string | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}
function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left.toLowerCase());
  const b = new TextEncoder().encode(right.toLowerCase());
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
async function verifyTelegramInitData(initData: string, botToken: string) {
  if (!initData || !botToken) throw new RequestError("invalid_platform_auth", 401);
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) throw new RequestError("invalid_platform_auth", 401);
  params.delete("hash");
  const checkString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = await hmacSha256("WebAppData", botToken);
  if (!safeEqual(toHex(await hmacSha256(secret, checkString)), receivedHash)) {
    throw new RequestError("invalid_platform_auth", 401);
  }
  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0 || authDate > now + MAX_INIT_DATA_FUTURE_SKEW_SECONDS ||
    now - authDate > MAX_INIT_DATA_AGE_SECONDS) throw new RequestError("invalid_platform_auth", 401);
  try {
    const user = JSON.parse(params.get("user") ?? "null");
    if (!user || !(typeof user.id === "number" || typeof user.id === "string") || !String(user.id).trim()) throw new Error();
    return {
      platformUserId: String(user.id), firstName: typeof user.first_name === "string" ? user.first_name : "",
      lastName: typeof user.last_name === "string" ? user.last_name : "",
      username: typeof user.username === "string" ? user.username : "",
      photoUrl: typeof user.photo_url === "string" ? user.photo_url : "",
    };
  } catch (_error) { throw new RequestError("invalid_platform_auth", 401); }
}

async function requireTelegramChannelMembership(botToken: string, channelId: string, platformUserId: string) {
  const telegramUserId = Number(platformUserId);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) throw new RequestError("invalid_platform_auth", 401);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, user_id: telegramUserId }),
    });
  } catch (_error) { throw new RequestError("server_error", 502); }
  let payload: { ok?: boolean; result?: { status?: string; is_member?: boolean } };
  try { payload = await response.json(); } catch (_error) { throw new RequestError("server_error", 502); }
  const member = payload.result;
  if (!response.ok || payload.ok !== true || !member) throw new RequestError("server_error", 502);
  if (!(member.status === "creator" || member.status === "administrator" || member.status === "member" ||
    (member.status === "restricted" && member.is_member === true))) throw new RequestError("course_access_denied", 403);
}

// Authentication and course authorization finish before any Homework or S3 operation.
async function resolveStudentContext(supabase: SupabaseClient, input: { courseId: string; platform: string; platformAuthData: string }) {
  if (input.platform !== "telegram") throw new RequestError("invalid_request", 400);
  const { data: course, error: courseError } = await supabase.from("courses").select("course_id, title")
    .eq("course_id", input.courseId).maybeSingle();
  if (courseError) throw new RequestError("server_error", 500);
  if (!course) throw new RequestError("course_access_denied", 403);
  const { data: botToken, error: tokenError } = await supabase.rpc("get_course_telegram_bot_token", { p_course_id: input.courseId });
  if (tokenError || typeof botToken !== "string" || !botToken) throw new RequestError("server_error", 500);

  // Required order: signature, auth_date and trusted Telegram user are validated here first.
  const identity = await verifyTelegramInitData(input.platformAuthData, botToken);
  const { data: settings, error: settingsError } = await supabase.from("course_settings")
    .select("access_mode, access_config, access_control_enabled, access_duration_days")
    .eq("course_id", input.courseId).maybeSingle();
  if (settingsError || !settings) throw new RequestError("server_error", 500);
  if (settings.access_mode === "telegram_channel") {
    const channelId = settings.access_config?.channel_id;
    if (typeof channelId !== "string" || !channelId.trim()) throw new RequestError("server_error", 500);
    await requireTelegramChannelMembership(botToken, channelId, identity.platformUserId);
  } else if (settings.access_mode !== "open") throw new RequestError("course_access_denied", 403);

  // Only after course access succeeds may trusted application users be resolved.
  const now = new Date();
  const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || identity.username || `Telegram ${identity.platformUserId}`;
  const { error: upsertError } = await supabase.from("webapp_users").upsert({
    platform: "telegram", platform_user_id: identity.platformUserId, telegram_id: identity.platformUserId,
    first_name: identity.firstName, last_name: identity.lastName, username: identity.username,
    display_name: displayName, avatar_url: identity.photoUrl, last_seen_at: now.toISOString(), metadata: { source: "homework_auth" },
  }, { onConflict: "platform,platform_user_id" });
  if (upsertError) throw new RequestError("server_error", 500);
  const { data: webappUser, error: userError } = await supabase.from("webapp_users").select("id")
    .eq("platform", "telegram").eq("platform_user_id", identity.platformUserId).maybeSingle();
  if (userError || !webappUser) throw new RequestError("server_error", 500);
  let { data: productUser, error: productError } = await supabase.from("product_users").select("id, status, access_expires_at")
    .eq("course_id", input.courseId).eq("webapp_user_id", webappUser.id).maybeSingle();
  if (productError) throw new RequestError("server_error", 500);
  if (!productUser) {
    const duration = Number(settings.access_duration_days);
    const expiresAt = settings.access_control_enabled === true
      ? new Date(now.getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 120) * 86_400_000).toISOString() : null;
    const { error: insertError } = await supabase.from("product_users").upsert({
      course_id: input.courseId, webapp_user_id: webappUser.id, course_title: course.title ?? "", user_display_name: displayName,
      status: "active", access_started_at: now.toISOString(), access_expires_at: expiresAt, last_seen_at: now.toISOString(),
      metadata: { source: "homework_auth", platform: "telegram" },
    }, { onConflict: "course_id,webapp_user_id", ignoreDuplicates: true });
    if (insertError) throw new RequestError("server_error", 500);
    const result = await supabase.from("product_users").select("id, status, access_expires_at")
      .eq("course_id", input.courseId).eq("webapp_user_id", webappUser.id).maybeSingle();
    productUser = result.data; productError = result.error;
    if (productError || !productUser) throw new RequestError("server_error", 500);
  }
  if (productUser.status !== "active") throw new RequestError("product_access_inactive", 403);
  if (settings.access_control_enabled === true && (!productUser.access_expires_at ||
    new Date(productUser.access_expires_at).getTime() <= now.getTime())) throw new RequestError("product_access_expired", 403);
  return { courseId: input.courseId, productUserId: String(productUser.id) };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new RequestError("invalid_request", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.course_id !== "string" || !input.course_id.trim() || input.platform !== "telegram" ||
      typeof input.platform_auth_data !== "string" || !input.platform_auth_data ||
      typeof input.attachment_id !== "string" || !UUID.test(input.attachment_id)) {
      throw new RequestError("invalid_request", 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new RequestError("server_error", 500);
    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const context = await resolveStudentContext(supabase, {
      courseId: input.course_id.trim(), platform: input.platform, platformAuthData: input.platform_auth_data,
    });

    // Attachment data is read only after the Telegram identity and course access are trusted.
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
    const submission = submissionResult.data;
    if (!submission || String(submission.product_user_id) !== context.productUserId) {
      throw new RequestError("attachment_not_found", 404);
    }
    const homeworkResult = await supabase.from("lesson_homeworks").select("id, lesson_id")
      .eq("id", submission.homework_id).maybeSingle();
    if (homeworkResult.error) throw new RequestError("server_error", 500);
    if (!homeworkResult.data) throw new RequestError("attachment_not_found", 404);
    const lessonResult = await supabase.from("lessons").select("id, course_id")
      .eq("id", homeworkResult.data.lesson_id).maybeSingle();
    if (lessonResult.error) throw new RequestError("server_error", 500);
    if (!lessonResult.data || lessonResult.data.course_id !== context.courseId) {
      throw new RequestError("attachment_not_found", 404);
    }

    const expectedPrefix = `courses/${context.courseId}/students/${context.productUserId}/homeworks/`;
    const expectedAttachmentPrefix = `${expectedPrefix}${homeworkResult.data.id}/attachments/`;
    const objectId = typeof attachment.storage_path === "string"
      ? attachment.storage_path.slice(expectedAttachmentPrefix.length) : "";
    if (typeof attachment.storage_path !== "string" || !attachment.storage_path.startsWith(expectedAttachmentPrefix) ||
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
    console.error("Get student homework attachment URL failed", { error_type: error instanceof Error ? error.name : "UnknownError" });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
