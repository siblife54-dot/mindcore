import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_SESSION_TOKEN_LENGTH = 500;
const MAX_COURSE_ID_LENGTH = 200;
const ALLOWED_STATUSES = new Set([
  "pending_payment",
  "confirmed",
  "payment_not_found",
  "cancelled",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-admin-session, x-client-info, apikey, content-type",
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
    message: "Нет доступа к этому курсу",
  },
  renewal_course_not_found: { status: 404, message: "Курс не найден" },
  renewal_request_status_invalid: {
    status: 400,
    message: "Некорректный статус заявки",
  },
  renewal_request_limit_invalid: {
    status: 400,
    message: "Некорректный лимит заявок",
  },
  renewal_request_offset_invalid: {
    status: 400,
    message: "Некорректное смещение",
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
    { ok: false, error: "Некорректные параметры загрузки заявок" },
    400,
  );
}

function serverErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Не удалось загрузить заявки на продление" },
    500,
  );
}

function getSessionToken(sessionHeader: string | null) {
  if (!sessionHeader) return null;

  const token = sessionHeader.trim();
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

function logError(courseId: string | null, reason: string, code?: string) {
  console.error(
    "Get renewal requests error",
    code ? { course_id: courseId, reason, code } : { course_id: courseId, reason },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const sessionToken = getSessionToken(req.headers.get("X-Admin-Session"));
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
  if (typeof input.course_id !== "string") return validationErrorResponse();

  const courseId = input.course_id.trim();
  if (courseId === "" || courseId.length > MAX_COURSE_ID_LENGTH) {
    return validationErrorResponse();
  }

  let status: string | null = null;
  if (input.status !== undefined && input.status !== null) {
    if (typeof input.status !== "string") return validationErrorResponse();
    status = input.status.trim() || null;
    if (status !== null && !ALLOWED_STATUSES.has(status)) {
      return validationErrorResponse();
    }
  }

  const limit = input.limit === undefined ? 100 : input.limit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200
  ) {
    return validationErrorResponse();
  }

  const offset = input.offset === undefined ? 0 : input.offset;
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
    return validationErrorResponse();
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    logError(courseId, "supabase_secrets_not_configured");
    return serverErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await supabase.rpc(
      "get_access_renewal_requests_with_session",
      {
        p_session_token: sessionToken,
        p_course_id: courseId,
        p_status: status,
        p_limit: limit,
        p_offset: offset,
      },
    );

    if (error) {
      const controlledError = findControlledError(error.message);
      if (controlledError) {
        logError(courseId, controlledError.reason, error.code);
        return jsonResponse(
          { ok: false, error: controlledError.message },
          controlledError.status,
        );
      }

      logError(courseId, "rpc_failed", error.code);
      return serverErrorResponse();
    }

    if (!Array.isArray(data)) {
      logError(courseId, "rpc_result_invalid");
      return serverErrorResponse();
    }

    const requests = data.map((request) => ({
      id: request.id,
      request_number: request.request_number,
      course_id: request.course_id,
      product_user_id: request.product_user_id,
      renewal_option_id: request.renewal_option_id,
      status: request.status,
      days_to_add_snapshot: request.days_to_add_snapshot,
      price_minor_snapshot: request.price_minor_snapshot,
      currency_snapshot: request.currency_snapshot,
      access_expires_at_before: request.access_expires_at_before,
      estimated_access_expires_at: request.estimated_access_expires_at,
      created_at: request.created_at,
      confirmed_at: request.confirmed_at,
      cancelled_at: request.cancelled_at,
      internal_comment: request.internal_comment,
      user_display_name: request.user_display_name,
      product_user_status: request.product_user_status,
      product_user_access_expires_at: request.product_user_access_expires_at,
    }));

    return jsonResponse({ ok: true, requests });
  } catch (_error) {
    logError(courseId, "unexpected_error");
    return serverErrorResponse();
  }
});
