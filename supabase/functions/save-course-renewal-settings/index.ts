import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_SESSION_TOKEN_LENGTH = 500;
const ALLOWED_OPTION_FIELDS = new Set([
  "title",
  "days_to_add",
  "price_minor",
  "currency",
  "description",
  "payment_url",
  "sort_order",
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
  renewal_settings_forbidden: {
    status: 403,
    message: "Нет доступа к этому курсу",
  },
  renewal_course_not_found: { status: 404, message: "Курс не найден" },
};

const validationErrorReasons = new Set([
  "renewal_settings_invalid",
  "renewal_settings_support_url_invalid",
  "renewal_settings_support_label_invalid",
  "renewal_options_invalid",
  "renewal_option_title_invalid",
  "renewal_option_days_invalid",
  "renewal_option_price_invalid",
  "renewal_option_currency_invalid",
  "renewal_option_description_invalid",
  "renewal_option_payment_url_invalid",
  "renewal_option_sort_order_invalid",
  "renewal_option_sort_order_duplicate",
]);

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
    { ok: false, error: "Некорректные настройки продления" },
    400,
  );
}

function serverErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Не удалось сохранить настройки продления" },
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

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (normalized.length > maxLength) return undefined;
  return normalized || null;
}

function findErrorReason(message: string | undefined) {
  if (!message) return null;

  const reasons = [...Object.keys(controlledErrors), ...validationErrorReasons];
  for (const reason of reasons) {
    const pattern = new RegExp(`(^|[^a-z0-9_])${reason}([^a-z0-9_]|$)`, "i");
    if (pattern.test(message)) return reason;
  }

  return null;
}

function logError(courseId: string | null, reason: string, code?: string) {
  console.error(
    "Save course renewal settings error",
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
  if (courseId.length < 1 || courseId.length > 200) {
    return validationErrorResponse();
  }

  if (typeof input.renewal_enabled !== "boolean") {
    return validationErrorResponse();
  }
  const renewalEnabled = input.renewal_enabled;

  if (
    typeof input.show_before_days !== "number" ||
    !Number.isInteger(input.show_before_days) ||
    input.show_before_days < 0 ||
    input.show_before_days > 365
  ) {
    return validationErrorResponse();
  }
  const showBeforeDays = input.show_before_days;

  const supportUrl = optionalString(input.support_url, 2000);
  if (supportUrl === undefined) return validationErrorResponse();

  if (typeof input.support_label !== "string") {
    return validationErrorResponse();
  }
  const supportLabel = input.support_label.trim();
  if (supportLabel.length < 1 || supportLabel.length > 120) {
    return validationErrorResponse();
  }

  if (
    !Array.isArray(input.options) ||
    input.options.length > 2 ||
    (renewalEnabled && input.options.length === 0)
  ) {
    return validationErrorResponse();
  }

  const seenSortOrders = new Set<number>();
  const options: Array<Record<string, unknown>> = [];
  for (const rawOption of input.options) {
    if (
      !rawOption ||
      typeof rawOption !== "object" ||
      Array.isArray(rawOption)
    ) {
      return validationErrorResponse();
    }

    const option = rawOption as Record<string, unknown>;
    if (
      Object.keys(option).some((field) => !ALLOWED_OPTION_FIELDS.has(field))
    ) {
      return validationErrorResponse();
    }

    if (typeof option.title !== "string") return validationErrorResponse();
    const title = option.title.trim();
    if (title.length < 1 || title.length > 120)
      return validationErrorResponse();

    if (
      typeof option.days_to_add !== "number" ||
      !Number.isInteger(option.days_to_add) ||
      option.days_to_add < 1 ||
      option.days_to_add > 3650
    ) {
      return validationErrorResponse();
    }

    if (
      typeof option.price_minor !== "number" ||
      !Number.isInteger(option.price_minor) ||
      option.price_minor < 0 ||
      option.price_minor > 1000000000000
    ) {
      return validationErrorResponse();
    }

    if (typeof option.currency !== "string") return validationErrorResponse();
    const currency = option.currency.trim().toUpperCase();
    if (currency.length !== 3) return validationErrorResponse();

    const description = optionalString(option.description, 2000);
    if (description === undefined) return validationErrorResponse();

    if (typeof option.payment_url !== "string") {
      return validationErrorResponse();
    }
    const paymentUrl = option.payment_url.trim();
    if (paymentUrl.length < 1 || paymentUrl.length > 2000) {
      return validationErrorResponse();
    }

    if (
      typeof option.sort_order !== "number" ||
      !Number.isInteger(option.sort_order) ||
      ![1, 2].includes(option.sort_order) ||
      seenSortOrders.has(option.sort_order)
    ) {
      return validationErrorResponse();
    }
    seenSortOrders.add(option.sort_order);

    options.push({
      title,
      days_to_add: option.days_to_add,
      price_minor: option.price_minor,
      currency,
      description,
      payment_url: paymentUrl,
      sort_order: option.sort_order,
    });
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
      "save_course_renewal_settings_with_session",
      {
        p_session_token: sessionToken,
        p_course_id: courseId,
        p_renewal_enabled: renewalEnabled,
        p_show_before_days: showBeforeDays,
        p_support_url: supportUrl,
        p_support_label: supportLabel,
        p_options: options,
      },
    );

    if (error) {
      const reason = findErrorReason(error.message);
      if (reason && controlledErrors[reason]) {
        const response = controlledErrors[reason];
        logError(courseId, reason, error.code);
        return jsonResponse(
          { ok: false, error: response.message },
          response.status,
        );
      }
      if (reason && validationErrorReasons.has(reason)) {
        logError(courseId, reason, error.code);
        return validationErrorResponse();
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
