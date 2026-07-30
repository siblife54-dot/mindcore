import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_LOGIN_LENGTH = 200;
const MAX_PASSWORD_LENGTH = 500;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSION_CREATION_ATTEMPTS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function loginErrorResponse() {
  return jsonResponse({ ok: false, error: "Не удалось выполнить вход" }, 500);
}

function logError(reason: string, code?: string) {
  console.error("Admin login error", code ? { reason, code } : { reason });
}

function normalizeLogin(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const login = value.trim();
  return login !== "" && login.length <= MAX_LOGIN_LENGTH ? login : null;
}

function validPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PASSWORD_LENGTH
  );
}

function safeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));

  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse(
      { ok: false, error: "Введите корректный логин и пароль" },
      400
    );
  }

  const request =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const login = normalizeLogin(request.login);
  const password = request.password;

  if (!login || !validPassword(password)) {
    return jsonResponse(
      { ok: false, error: "Введите корректный логин и пароль" },
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    logError("supabase_secrets_not_configured");
    return loginErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, login, password, full_name, company_name, tariff, status")
      .eq("login", login)
      .maybeSingle();

    if (accountError) {
      logError("account_query_failed", accountError.code);
      return loginErrorResponse();
    }

    if (
      !account ||
      typeof account.password !== "string" ||
      !safeEqual(password, account.password)
    ) {
      return jsonResponse(
        { ok: false, error: "Неверный логин или пароль" },
        401
      );
    }

    if (account.status !== "active") {
      return jsonResponse({ ok: false, error: "Аккаунт недоступен" }, 403);
    }

    for (let attempt = 0; attempt < MAX_SESSION_CREATION_ATTEMPTS; attempt += 1) {
      const token = generateSessionToken();
      const { data: tokenHash, error: hashError } = await supabase.rpc(
        "hash_admin_session_token",
        { p_token: token }
      );

      if (hashError) {
        logError("token_hash_failed", hashError.code);
        return loginErrorResponse();
      }

      if (typeof tokenHash !== "string" || tokenHash === "") {
        logError("token_hash_invalid");
        return loginErrorResponse();
      }

      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      const { error: sessionError } = await supabase
        .from("admin_sessions")
        .insert({
          account_id: account.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          last_used_at: null,
          revoked_at: null,
        });

      if (!sessionError) {
        return jsonResponse({
          ok: true,
          session: {
            token,
            expires_at: expiresAt,
          },
          account: {
            id: account.id,
            login: account.login,
            full_name: account.full_name,
            company_name: account.company_name,
            tariff: account.tariff,
            status: account.status,
          },
        });
      }

      if (sessionError.code !== "23505") {
        logError("session_insert_failed", sessionError.code);
        return loginErrorResponse();
      }
    }

    logError("session_token_conflict_limit_reached");
    return loginErrorResponse();
  } catch (_error) {
    logError("unexpected_error");
    return loginErrorResponse();
  }
});
