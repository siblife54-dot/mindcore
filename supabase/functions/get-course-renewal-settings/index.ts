import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_SESSION_TOKEN_LENGTH = 500;
const MAX_COURSE_ID_LENGTH = 200;

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
  renewal_settings_forbidden: {
    status: 403,
    message: "Нет доступа к этому курсу",
  },
  renewal_course_not_found: { status: 404, message: "Курс не найден" },
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
    { ok: false, error: "Некорректный идентификатор курса" },
    400,
  );
}

function serverErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Не удалось загрузить настройки продления" },
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
    "Get course renewal settings error",
    code
      ? { course_id: courseId, reason, code }
      : { course_id: courseId, reason },
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    logError(courseId, "supabase_secrets_not_configured");
    return serverErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await supabase.rpc(
      "get_course_renewal_settings_with_session",
      {
        p_session_token: sessionToken,
        p_course_id: courseId,
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

    if (!Array.isArray(data) || data.length === 0 || !data[0]) {
      logError(courseId, "rpc_result_invalid");
      return serverErrorResponse();
    }

    const result = data[0];
    return jsonResponse({
      ok: true,
      settings: {
        course_id: result.course_id,
        renewal_enabled: result.renewal_enabled,
        show_before_days: result.show_before_days,
        support_url: result.support_url,
        support_label: result.support_label,
        options: result.options,
      },
    });
  } catch (_error) {
    logError(courseId, "unexpected_error");
    return serverErrorResponse();
  }
});
