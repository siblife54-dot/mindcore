import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_INIT_DATA_AGE_SECONDS = 86400;
const MAX_INIT_DATA_FUTURE_SKEW_SECONDS = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TelegramInitDataValidation =
  | { ok: true; telegramUserId: number }
  | { ok: false; reason: "telegram_auth_expired" | "telegram_user_not_found" };

type TelegramChatMember = {
  status?: string;
  is_member?: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  return Array.from(view)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

async function hmacSha256(key: string | Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data))
  );
}

async function validateTelegramInitData(
  telegramInitData: string,
  botToken: string
): Promise<TelegramInitDataValidation> {
  const params = new URLSearchParams(telegramInitData);
  const receivedHash = params.get("hash");

  if (!receivedHash) {
    return { ok: false, reason: "telegram_user_not_found" };
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256("WebAppData", botToken);
  const calculatedHash = bytesToHex(await hmacSha256(secretKey, dataCheckString));

  if (!safeEqual(calculatedHash, receivedHash)) {
    return { ok: false, reason: "telegram_user_not_found" };
  }

  const authDateValue = params.get("auth_date");
  const authDate = authDateValue ? Number(authDateValue) : NaN;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    authDate > nowSeconds + MAX_INIT_DATA_FUTURE_SKEW_SECONDS ||
    nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS
  ) {
    return { ok: false, reason: "telegram_auth_expired" };
  }

  const userValue = params.get("user");

  if (!userValue) {
    return { ok: false, reason: "telegram_user_not_found" };
  }

  try {
    const user = JSON.parse(userValue);
    const telegramUserId = user?.id;

    if (typeof telegramUserId !== "number") {
      return { ok: false, reason: "telegram_user_not_found" };
    }

    return { ok: true, telegramUserId };
  } catch (_error) {
    return { ok: false, reason: "telegram_user_not_found" };
  }
}

async function checkTelegramChannelMember(
  botToken: string,
  channelId: string,
  telegramUserId: number
) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getChatMember`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: channelId,
        user_id: telegramUserId,
      }),
    }
  );
  const data = await response.json();

  if (!response.ok || !data.ok) {
    return {
      ok: false as const,
      httpStatus: response.status,
      description: data?.description,
    };
  }

  const member = data.result as TelegramChatMember;
  const allowed =
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member === true);

  return { ok: true as const, allowed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ allowed: false, reason: "method_not_allowed" }, 405);
  }

  try {
    const { course_id, telegram_init_data } = await req.json();

    if (!course_id) {
      return jsonResponse({ allowed: false, reason: "course_id_required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { allowed: false, reason: "supabase_secrets_not_configured" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: courseSettings, error: settingsError } = await supabase
      .from("course_settings")
      .select("access_mode, access_config")
      .eq("course_id", course_id)
      .maybeSingle();

    if (settingsError) {
      console.error("Course settings load error", {
        course_id,
        error: settingsError.message,
      });
      return jsonResponse(
        { allowed: false, reason: "course_settings_load_error" },
        500
      );
    }

    if (!courseSettings) {
      return jsonResponse(
        { allowed: false, reason: "course_settings_not_found" },
        404
      );
    }

    if (courseSettings.access_mode === "open") {
      return jsonResponse({ allowed: true, reason: "open_access" });
    }

    if (courseSettings.access_mode !== "telegram_channel") {
      return jsonResponse(
        { allowed: false, reason: "unsupported_access_mode" },
        400
      );
    }

    const channelId = courseSettings.access_config?.channel_id;

    if (typeof channelId !== "string" || channelId.trim() === "") {
      return jsonResponse(
        { allowed: false, reason: "telegram_channel_not_configured" },
        500
      );
    }

    if (typeof telegram_init_data !== "string" || telegram_init_data === "") {
      return jsonResponse(
        { allowed: false, reason: "telegram_auth_required" },
        401
      );
    }

    const { data: botToken, error: tokenError } = await supabase.rpc(
      "get_course_telegram_bot_token",
      {
        p_course_id: course_id,
      }
    );

    if (tokenError) {
      console.error("Telegram bot token load error", {
        course_id,
        error: tokenError.message,
      });
    }

    if (tokenError || typeof botToken !== "string" || botToken === "") {
      return jsonResponse(
        { allowed: false, reason: "telegram_bot_token_not_configured" },
        500
      );
    }

    const validation = await validateTelegramInitData(
      telegram_init_data,
      botToken
    );

    if (!validation.ok) {
      return jsonResponse({ allowed: false, reason: validation.reason }, 401);
    }

    const membership = await checkTelegramChannelMember(
      botToken,
      channelId.trim(),
      validation.telegramUserId
    );

    if (!membership.ok) {
      console.error("Telegram API error", {
        course_id,
        description: membership.description,
        httpStatus: membership.httpStatus,
      });

      return jsonResponse(
        { allowed: false, reason: "telegram_api_error" },
        502
      );
    }

    if (membership.allowed) {
      return jsonResponse({
        allowed: true,
        reason: "telegram_channel_member",
        platform: "telegram",
      });
    }

    return jsonResponse({
      allowed: false,
      reason: "not_telegram_channel_member",
      platform: "telegram",
    });
  } catch (error) {
    console.error("Check course access internal error", {
      error_type: error instanceof Error ? error.name : "UnknownError",
    });

    return jsonResponse(
      { allowed: false, reason: "internal_error" },
      500
    );
  }
});
