import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_COURSE_ID_LENGTH = 200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RenewalOption = {
  id: string;
  title: string;
  days_to_add: number;
  price_minor: number;
  currency: string;
  description: string | null;
  sort_order: number;
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

function normalizeCourseId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const courseId = value.trim();

  if (courseId === "" || courseId.length > MAX_COURSE_ID_LENGTH) {
    return null;
  }

  return courseId;
}

function safeErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Не удалось получить настройки продления" },
    500
  );
}

function notConfigured(courseId: string, reason: string) {
  console.error("Renewal configuration error", {
    course_id: courseId,
    reason,
  });

  return jsonResponse({
    ok: true,
    enabled: false,
    settings: null,
    options: [],
    reason: "not_configured",
  });
}

function isValidOption(value: unknown): value is RenewalOption {
  if (!value || typeof value !== "object") {
    return false;
  }

  const option = value as Record<string, unknown>;

  return (
    typeof option.id === "string" &&
    option.id.trim() !== "" &&
    typeof option.title === "string" &&
    option.title.trim() !== "" &&
    Number.isInteger(option.days_to_add) &&
    (option.days_to_add as number) > 0 &&
    Number.isInteger(option.price_minor) &&
    (option.price_minor as number) >= 0 &&
    typeof option.currency === "string" &&
    /^[A-Z]{3}$/.test(option.currency) &&
    (option.description === null || typeof option.description === "string") &&
    Number.isInteger(option.sort_order)
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let requestBody: unknown;

  try {
    requestBody = await req.json();
  } catch (_error) {
    return jsonResponse(
      { ok: false, error: "Некорректный идентификатор курса" },
      400
    );
  }

  const courseId = normalizeCourseId(
    requestBody && typeof requestBody === "object"
      ? (requestBody as Record<string, unknown>).course_id
      : undefined
  );

  if (!courseId) {
    return jsonResponse(
      { ok: false, error: "Некорректный идентификатор курса" },
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return safeErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: courseSettings, error: courseSettingsError } = await supabase
      .from("course_settings")
      .select("course_id, renewal_enabled")
      .eq("course_id", courseId)
      .maybeSingle();

    if (courseSettingsError) {
      console.error("Renewal configuration load error", {
        course_id: courseId,
        reason: "course_settings_query_failed",
      });
      return safeErrorResponse();
    }

    if (!courseSettings) {
      return jsonResponse({ ok: false, error: "Курс не найден" }, 404);
    }

    if (courseSettings.renewal_enabled !== true) {
      return jsonResponse({
        ok: true,
        enabled: false,
        settings: null,
        options: [],
      });
    }

    const [renewalSettingsResult, optionCountResult] = await Promise.all([
      supabase
        .from("course_renewal_settings")
        .select("show_before_days, support_url, support_label")
        .eq("course_id", courseId)
        .maybeSingle(),
      supabase
        .from("course_renewal_options")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId)
        .eq("is_active", true),
    ]);

    if (renewalSettingsResult.error || optionCountResult.error) {
      console.error("Renewal configuration load error", {
        course_id: courseId,
        reason: "renewal_configuration_query_failed",
      });
      return safeErrorResponse();
    }

    if (!renewalSettingsResult.data) {
      return notConfigured(courseId, "renewal_settings_missing");
    }

    if (optionCountResult.count === null || optionCountResult.count === 0) {
      return notConfigured(courseId, "active_options_missing");
    }

    if (optionCountResult.count > 2) {
      return notConfigured(courseId, "too_many_active_options");
    }

    const { data: options, error: optionsError } = await supabase
      .from("course_renewal_options")
      .select(
        "id, title, days_to_add, price_minor, currency, description, sort_order"
      )
      .eq("course_id", courseId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(2);

    if (optionsError) {
      console.error("Renewal configuration load error", {
        course_id: courseId,
        reason: "renewal_options_query_failed",
      });
      return safeErrorResponse();
    }

    if (
      !options ||
      options.length !== optionCountResult.count ||
      !options.every(isValidOption)
    ) {
      return notConfigured(courseId, "active_options_invalid");
    }

    const settings = renewalSettingsResult.data;

    if (
      !Number.isInteger(settings.show_before_days) ||
      settings.show_before_days < 0 ||
      typeof settings.support_url !== "string" ||
      settings.support_url.trim() === "" ||
      typeof settings.support_label !== "string" ||
      settings.support_label.trim() === ""
    ) {
      return notConfigured(courseId, "renewal_settings_invalid");
    }

    return jsonResponse({
      ok: true,
      enabled: true,
      settings,
      options,
    });
  } catch (_error) {
    console.error("Renewal configuration load error", {
      course_id: courseId,
      reason: "unexpected_error",
    });
    return safeErrorResponse();
  }
});
