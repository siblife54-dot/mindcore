import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type HomeworkAuthErrorCode =
  | "invalid_request"
  | "unsupported_platform"
  | "platform_auth_not_implemented"
  | "invalid_platform_auth"
  | "course_not_found"
  | "course_access_denied"
  | "invalid_admin_session"
  | "server_error";

export class HomeworkAuthError extends Error {
  constructor(public code: HomeworkAuthErrorCode, public status: number) {
    super(code);
    this.name = "HomeworkAuthError";
  }
}

export type AdminContext = { accountId: string | number };

/** Authenticate a plaintext admin token without exposing its hash to callers. */
export async function resolveAdminContext(
  supabase: SupabaseClient,
  sessionToken: string,
): Promise<AdminContext> {
  if (!sessionToken || sessionToken.length > 500) {
    throw new HomeworkAuthError("invalid_admin_session", 401);
  }

  const { data: tokenHash, error: hashError } = await supabase.rpc(
    "hash_admin_session_token",
    { p_token: sessionToken },
  );
  if (hashError || typeof tokenHash !== "string" || !tokenHash) {
    throw new HomeworkAuthError("server_error", 500);
  }

  const { data: session, error: sessionError } = await supabase
    .from("admin_sessions")
    .select("account_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (sessionError) throw new HomeworkAuthError("server_error", 500);
  if (
    !session || session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    throw new HomeworkAuthError("invalid_admin_session", 401);
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, status")
    .eq("id", session.account_id)
    .maybeSingle();
  if (accountError) throw new HomeworkAuthError("server_error", 500);
  if (!account || account.status !== "active") {
    throw new HomeworkAuthError("course_access_denied", 403);
  }
  return { accountId: account.id };
}

/** Authorize a course only after deriving the trusted account from a session. */
export async function requireCourseOwnership(
  supabase: SupabaseClient,
  courseId: string,
  accountId: string | number,
) {
  const { data, error } = await supabase
    .from("courses")
    .select("course_id")
    .eq("course_id", courseId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new HomeworkAuthError("server_error", 500);
  if (!data) throw new HomeworkAuthError("course_access_denied", 403);
  return data;
}

export type VerifiedPlatformUser = {
  platform: "telegram";
  platformUserId: string;
  firstName: string;
  lastName: string;
  username: string;
  photoUrl: string;
};

const MAX_INIT_DATA_AGE_SECONDS = 86_400;
const MAX_INIT_DATA_FUTURE_SKEW_SECONDS = 300;

async function hmacSha256(key: string | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)),
  );
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left.toLowerCase());
  const b = new TextEncoder().encode(right.toLowerCase());
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/** Verify signed Telegram WebApp initData; initDataUnsafe is never accepted. */
export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
): Promise<VerifiedPlatformUser> {
  if (!initData || !botToken) throw new HomeworkAuthError("invalid_platform_auth", 401);
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    throw new HomeworkAuthError("invalid_platform_auth", 401);
  }
  params.delete("hash");
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = await hmacSha256("WebAppData", botToken);
  const expectedHash = toHex(await hmacSha256(secret, checkString));
  if (!safeEqual(expectedHash, receivedHash)) {
    throw new HomeworkAuthError("invalid_platform_auth", 401);
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0 ||
    authDate > now + MAX_INIT_DATA_FUTURE_SKEW_SECONDS ||
    now - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new HomeworkAuthError("invalid_platform_auth", 401);
  }

  try {
    const user = JSON.parse(params.get("user") ?? "null");
    if (!user || !(typeof user.id === "number" || typeof user.id === "string") ||
      !String(user.id).trim()) throw new Error("invalid user");
    return {
      platform: "telegram",
      platformUserId: String(user.id),
      firstName: typeof user.first_name === "string" ? user.first_name : "",
      lastName: typeof user.last_name === "string" ? user.last_name : "",
      username: typeof user.username === "string" ? user.username : "",
      photoUrl: typeof user.photo_url === "string" ? user.photo_url : "",
    };
  } catch (_error) {
    throw new HomeworkAuthError("invalid_platform_auth", 401);
  }
}

export type StudentContext = {
  courseId: string;
  webappUserId: string;
  productUserId: string;
  platform: "telegram";
  platformUserId: string;
};

type TelegramChatMember = { status?: string; is_member?: boolean };

async function requireTelegramChannelMembership(
  botToken: string,
  channelId: string,
  platformUserId: string,
) {
  const telegramUserId = Number(platformUserId);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    throw new HomeworkAuthError("invalid_platform_auth", 401);
  }

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, user_id: telegramUserId }),
    });
  } catch (_error) {
    throw new HomeworkAuthError("server_error", 502);
  }

  let payload: { ok?: boolean; result?: TelegramChatMember };
  try {
    payload = await response.json();
  } catch (_error) {
    throw new HomeworkAuthError("server_error", 502);
  }
  if (!response.ok || payload.ok !== true || !payload.result) {
    throw new HomeworkAuthError("server_error", 502);
  }
  const member = payload.result;
  const allowed = member.status === "creator" || member.status === "administrator" ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member === true);
  if (!allowed) throw new HomeworkAuthError("course_access_denied", 403);
}

export async function resolveStudentContext(
  supabase: SupabaseClient,
  input: { courseId: string; platform: string; platformAuthData: string },
): Promise<StudentContext> {
  if (input.platform === "vk" || input.platform === "max") {
    throw new HomeworkAuthError("platform_auth_not_implemented", 501);
  }
  if (input.platform !== "telegram") {
    throw new HomeworkAuthError("unsupported_platform", 400);
  }

  const { data: course, error: courseError } = await supabase
    .from("courses").select("course_id, title")
    .eq("course_id", input.courseId).maybeSingle();
  if (courseError) throw new HomeworkAuthError("server_error", 500);
  if (!course) throw new HomeworkAuthError("course_not_found", 404);

  const { data: botToken, error: tokenError } = await supabase.rpc(
    "get_course_telegram_bot_token",
    { p_course_id: input.courseId },
  );
  if (tokenError || typeof botToken !== "string" || !botToken) {
    throw new HomeworkAuthError("server_error", 500);
  }
  const identity = await verifyTelegramInitData(input.platformAuthData, botToken);

  const { data: settings, error: settingsError } = await supabase
    .from("course_settings")
    .select("access_mode, access_config, access_control_enabled, access_duration_days")
    .eq("course_id", input.courseId).maybeSingle();
  if (settingsError) throw new HomeworkAuthError("server_error", 500);
  if (!settings) throw new HomeworkAuthError("course_not_found", 404);
  if (settings.access_mode === "telegram_channel") {
    const channelId = settings.access_config?.channel_id;
    if (typeof channelId !== "string" || !channelId.trim()) {
      throw new HomeworkAuthError("server_error", 500);
    }
    await requireTelegramChannelMembership(
      botToken,
      channelId,
      identity.platformUserId,
    );
  } else if (settings.access_mode !== "open") {
    throw new HomeworkAuthError("course_access_denied", 403);
  }

  const now = new Date();
  const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(" ") ||
    identity.username || `Telegram ${identity.platformUserId}`;

  const { error: userUpsertError } = await supabase.from("webapp_users").upsert({
    platform: "telegram",
    platform_user_id: identity.platformUserId,
    telegram_id: identity.platformUserId,
    first_name: identity.firstName,
    last_name: identity.lastName,
    username: identity.username,
    display_name: displayName,
    avatar_url: identity.photoUrl,
    last_seen_at: now.toISOString(),
    metadata: { source: "homework_auth" },
  }, { onConflict: "platform,platform_user_id" });
  if (userUpsertError) throw new HomeworkAuthError("server_error", 500);
  const { data: webappUser, error: userError } = await supabase
    .from("webapp_users").select("id")
    .eq("platform", "telegram").eq("platform_user_id", identity.platformUserId)
    .maybeSingle();
  if (userError || !webappUser) throw new HomeworkAuthError("server_error", 500);

  let { data: productUser, error: productError } = await supabase
    .from("product_users").select("id, status, access_expires_at")
    .eq("course_id", input.courseId).eq("webapp_user_id", webappUser.id)
    .maybeSingle();
  if (productError) throw new HomeworkAuthError("server_error", 500);

  if (!productUser) {
    const duration = Number(settings.access_duration_days);
    const expiresAt = settings.access_control_enabled === true
      ? new Date(now.getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 120) * 86_400_000).toISOString()
      : null;
    const { error: insertError } = await supabase.from("product_users").upsert({
      course_id: input.courseId,
      webapp_user_id: webappUser.id,
      course_title: course.title ?? "",
      user_display_name: displayName,
      status: "active",
      access_started_at: now.toISOString(),
      access_expires_at: expiresAt,
      last_seen_at: now.toISOString(),
      metadata: { source: "homework_auth", platform: "telegram" },
    }, { onConflict: "course_id,webapp_user_id", ignoreDuplicates: true });
    if (insertError) throw new HomeworkAuthError("server_error", 500);
    const result = await supabase.from("product_users")
      .select("id, status, access_expires_at")
      .eq("course_id", input.courseId).eq("webapp_user_id", webappUser.id).maybeSingle();
    productUser = result.data;
    productError = result.error;
    if (productError || !productUser) throw new HomeworkAuthError("server_error", 500);
  }

  if (productUser.status !== "active" ||
    (settings.access_control_enabled === true &&
      (!productUser.access_expires_at || new Date(productUser.access_expires_at).getTime() <= now.getTime()))) {
    throw new HomeworkAuthError("course_access_denied", 403);
  }
  return {
    courseId: input.courseId,
    webappUserId: webappUser.id,
    productUserId: productUser.id,
    platform: "telegram",
    platformUserId: identity.platformUserId,
  };
}
