import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_SESSION_TOKEN_LENGTH = 500;
const MAX_INTERNAL_COMMENT_LENGTH = 2000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const controlledErrors: Record<string, { status: number; message: string }> = {
  admin_session_token_required: {
    status: 401,
    message: "Требуется вход в административную панель",
  },
  admin_session_invalid: {
    status: 401,
    message: "Сессия недействительна. Войдите снова",
  },
  admin_session_revoked: {
    status: 401,
    message: "Сессия завершена. Войдите снова",
  },
  admin_session_expired: {
    status: 401,
    message: "Сессия истекла. Войдите снова",
  },
  admin_account_inactive: { status: 403, message: "Аккаунт недоступен" },
  renewal_request_forbidden: {
    status: 403,
    message: "Нет доступа к этой заявке",
  },
  renewal_request_not_found: {
    status: 404,
    message: "Заявка на продление не найдена",
  },
  renewal_product_user_not_found: {
    status: 404,
    message: "Пользователь курса не найден",
  },
  renewal_request_cancelled: {
    status: 409,
    message: "Отменённую заявку нельзя подтвердить",
  },
  renewal_request_invalid_status: {
    status: 409,
    message: "Заявка находится в неподходящем статусе",
  },
  renewal_request_invalid_days: {
    status: 409,
    message: "В заявке указано некорректное количество дней",
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authorizationErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Требуется вход в административную панель" },
    401,
  );
}

function validationErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Некорректные данные подтверждения" },
    400,
  );
}

function serverErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Не удалось подтвердить продление доступа" },
    500,
  );
}

function getSessionToken(authorization: string | null) {
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  return token !== "" && token.length <= MAX_SESSION_TOKEN_LENGTH
    ? token
    : null;
}

function findControlledError(message: string | undefined) {
  if (!message) return null;

  for (const [reason, response] of Object.entries(controlledErrors)) {
    const pattern = new RegExp(`(^|[^a-z0-9_])${reason}([^a-z0-9_]|$)`, "i");
    if (pattern.test(message)) return { reason, ...response };
  }

  return null;
}

function logError(requestId: string | null, reason: string, code?: string) {
  console.error(
    "Confirm renewal request error",
    code
      ? { request_id: requestId, reason, code }
      : { request_id: requestId, reason },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const sessionToken = getSessionToken(req.headers.get("Authorization"));
  if (!sessionToken) return authorizationErrorResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch (_error) {
    return validationErrorResponse();
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return validationErrorResponse();
  }

  const input = body as Record<string, unknown>;
  if (typeof input.request_id !== "string") return validationErrorResponse();

  const requestId = input.request_id.trim();
  if (!UUID_PATTERN.test(requestId)) return validationErrorResponse();

  let internalComment: string | null = null;
  if (input.internal_comment !== undefined && input.internal_comment !== null) {
    if (typeof input.internal_comment !== "string") {
      return validationErrorResponse();
    }

    const comment = input.internal_comment.trim();
    if (comment.length > MAX_INTERNAL_COMMENT_LENGTH) {
      return validationErrorResponse();
    }
    internalComment = comment === "" ? null : comment;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    logError(requestId, "supabase_secrets_not_configured");
    return serverErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await supabase.rpc(
      "confirm_access_renewal_request_with_session",
      {
        p_request_id: requestId,
        p_session_token: sessionToken,
        p_internal_comment: internalComment,
      },
    );

    if (error) {
      const controlledError = findControlledError(error.message);
      if (controlledError) {
        logError(requestId, controlledError.reason, error.code);
        return jsonResponse(
          { ok: false, error: controlledError.message },
          controlledError.status,
        );
      }

      logError(requestId, "rpc_failed", error.code);
      return serverErrorResponse();
    }

    if (!Array.isArray(data) || data.length === 0 || !data[0]) {
      logError(requestId, "rpc_result_invalid");
      return serverErrorResponse();
    }

    const result = data[0];
    return jsonResponse({
      ok: true,
      request: {
        id: result.request_id,
        status: result.request_status,
        product_user_id: result.product_user_id,
        previous_access_expires_at: result.previous_access_expires_at,
        new_access_expires_at: result.new_access_expires_at,
        previous_status: result.previous_status,
        new_status: result.new_status,
        confirmed_at: result.confirmed_at,
        already_confirmed: result.already_confirmed,
      },
    });
  } catch (_error) {
    logError(requestId, "unexpected_error");
    return serverErrorResponse();
  }
});
