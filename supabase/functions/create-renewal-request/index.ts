import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_COURSE_ID_LENGTH = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = ["pending_payment", "payment_not_found"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function safeErrorResponse() {
  return jsonResponse(
    { ok: false, error: "Не удалось создать заявку на продление" },
    500
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isUuid(value: unknown): value is string {
  return isNonEmptyString(value) && UUID_PATTERN.test(value);
}

function requestPayload(request: Record<string, unknown>) {
  return {
    course_id: (request.course_id as string).trim(),
    product_user_id: (request.product_user_id as string).trim(),
    renewal_option_id: (request.renewal_option_id as string).trim(),
  };
}

function publicRequest(request: Record<string, unknown>) {
  return {
    id: request.id,
    request_number: request.request_number,
    status: request.status,
    estimated_access_expires_at: request.estimated_access_expires_at,
  };
}

function estimatedExpiry(accessExpiresAt: unknown, daysToAdd: number, now: Date) {
  let base = now;

  if (typeof accessExpiresAt === "string" && accessExpiresAt !== "") {
    const currentExpiry = new Date(accessExpiresAt);
    if (!Number.isNaN(currentExpiry.getTime()) && currentExpiry > now) {
      base = currentExpiry;
    }
  }

  const result = new Date(base.getTime());
  result.setUTCDate(result.getUTCDate() + daysToAdd);
  return result.toISOString();
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
    return jsonResponse({ ok: false, error: "Некорректные данные заявки" }, 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !isNonEmptyString((body as Record<string, unknown>).course_id) ||
    (body as Record<string, unknown>).course_id.toString().trim().length >
      MAX_COURSE_ID_LENGTH ||
    !isUuid((body as Record<string, unknown>).product_user_id) ||
    !isUuid((body as Record<string, unknown>).renewal_option_id)
  ) {
    return jsonResponse({ ok: false, error: "Некорректные данные заявки" }, 400);
  }

  const { course_id, product_user_id, renewal_option_id } = requestPayload(
    body as Record<string, unknown>
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return safeErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const logFailure = (reason: string) =>
    console.error("Renewal request error", {
      course_id,
      renewal_option_id,
      reason,
    });

  const loadOpenRequest = async () =>
    await supabase
      .from("access_renewal_requests")
      .select(
        "id, request_number, renewal_option_id, status, estimated_access_expires_at, payment_url_snapshot"
      )
      .eq("course_id", course_id)
      .eq("product_user_id", product_user_id)
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  try {
    const { data: course, error: courseError } = await supabase
      .from("course_settings")
      .select("course_id, renewal_enabled")
      .eq("course_id", course_id)
      .maybeSingle();

    if (courseError) {
      logFailure("course_query_failed");
      return safeErrorResponse();
    }
    if (!course) {
      return jsonResponse({ ok: false, error: "Курс не найден" }, 404);
    }
    if (course.renewal_enabled !== true) {
      return jsonResponse(
        { ok: false, error: "Продление доступа недоступно" },
        409
      );
    }

    const { data: renewalSettings, error: settingsError } = await supabase
      .from("course_renewal_settings")
      .select("course_id")
      .eq("course_id", course.course_id)
      .maybeSingle();

    if (settingsError) {
      logFailure("renewal_settings_query_failed");
      return safeErrorResponse();
    }
    if (!renewalSettings) {
      return jsonResponse(
        { ok: false, error: "Продление доступа пока не настроено" },
        409
      );
    }

    const { data: productUser, error: productUserError } = await supabase
      .from("product_users")
      .select(
        "id, course_id, webapp_user_id, user_display_name, course_title, access_expires_at, status, contact_phone, contact_email"
      )
      .eq("id", product_user_id)
      .eq("course_id", course.course_id)
      .maybeSingle();

    if (productUserError) {
      logFailure("product_user_query_failed");
      return safeErrorResponse();
    }
    if (!productUser) {
      return jsonResponse(
        { ok: false, error: "Пользователь курса не найден" },
        404
      );
    }

    let webappUser = null;
    if (productUser.webapp_user_id) {
      const webappResult = await supabase
        .from("webapp_users")
        .select(
          "display_name, first_name, last_name, platform, platform_user_id, telegram_id, username"
        )
        .eq("id", productUser.webapp_user_id)
        .maybeSingle();

      if (webappResult.error) {
        logFailure("webapp_user_query_failed");
      } else {
        webappUser = webappResult.data;
      }
    }

    const { data: option, error: optionError } = await supabase
      .from("course_renewal_options")
      .select(
        "id, title, days_to_add, price_minor, currency, description, payment_url, sort_order"
      )
      .eq("id", renewal_option_id)
      .eq("course_id", course.course_id)
      .eq("is_active", true)
      .maybeSingle();

    if (optionError) {
      logFailure("renewal_option_query_failed");
      return safeErrorResponse();
    }
    if (!option) {
      return jsonResponse(
        { ok: false, error: "Вариант продления не найден" },
        404
      );
    }

    if (
      !Number.isInteger(option.days_to_add) ||
      option.days_to_add <= 0 ||
      !Number.isInteger(option.price_minor) ||
      option.price_minor < 0 ||
      typeof option.currency !== "string" ||
      option.currency.length !== 3 ||
      !isNonEmptyString(option.title) ||
      !isNonEmptyString(option.payment_url)
    ) {
      logFailure("renewal_option_invalid");
      return jsonResponse(
        { ok: false, error: "Вариант продления настроен некорректно" },
        409
      );
    }

    const openResult = await loadOpenRequest();
    if (openResult.error) {
      logFailure("open_request_query_failed");
      return safeErrorResponse();
    }
    if (openResult.data) {
      if (openResult.data.renewal_option_id !== option.id) {
        return jsonResponse(
          {
            ok: false,
            error:
              "У вас уже есть незавершённая заявка на другой вариант продления",
          },
          409
        );
      }

      return jsonResponse({
        ok: true,
        created: false,
        request: publicRequest(openResult.data),
        payment_url: openResult.data.payment_url_snapshot,
      });
    }

    const estimatedAccessExpiresAt = estimatedExpiry(
      productUser.access_expires_at,
      option.days_to_add,
      new Date()
    );
    const courseTitle =
      isNonEmptyString(productUser.course_title)
        ? productUser.course_title
        : course.course_id;

    const { data: createdRequest, error: insertError } = await supabase
      .from("access_renewal_requests")
      .insert({
        course_id: course.course_id,
        product_user_id: productUser.id,
        renewal_option_id: option.id,
        status: "pending_payment",
        user_display_name_snapshot:
          webappUser?.display_name || productUser.user_display_name || null,
        user_first_name_snapshot: webappUser?.first_name || null,
        user_last_name_snapshot: webappUser?.last_name || null,
        platform_snapshot: webappUser?.platform || null,
        platform_user_id_snapshot: webappUser?.platform_user_id || null,
        telegram_id_snapshot: webappUser?.telegram_id || null,
        username_snapshot: webappUser?.username || null,
        contact_phone_snapshot: productUser.contact_phone || null,
        contact_email_snapshot: productUser.contact_email || null,
        course_title_snapshot: courseTitle,
        option_title_snapshot: option.title,
        days_to_add_snapshot: option.days_to_add,
        price_minor_snapshot: option.price_minor,
        currency_snapshot: option.currency,
        option_description_snapshot: option.description,
        payment_url_snapshot: option.payment_url,
        access_expires_at_before: productUser.access_expires_at || null,
        estimated_access_expires_at: estimatedAccessExpiresAt,
        access_expires_at_after: null,
      })
      .select("id, request_number, status, estimated_access_expires_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const concurrentRequest = await loadOpenRequest();
        if (!concurrentRequest.error && concurrentRequest.data) {
          if (concurrentRequest.data.renewal_option_id !== option.id) {
            return jsonResponse(
              {
                ok: false,
                error:
                  "У вас уже есть незавершённая заявка на другой вариант продления",
              },
              409
            );
          }

          return jsonResponse({
            ok: true,
            created: false,
            request: publicRequest(concurrentRequest.data),
            payment_url: concurrentRequest.data.payment_url_snapshot,
          });
        }
      }

      logFailure(
        insertError.code === "23505"
          ? "conflicting_request_reload_failed"
          : "request_insert_failed"
      );
      return safeErrorResponse();
    }

    return jsonResponse(
      {
        ok: true,
        created: true,
        request: publicRequest(createdRequest),
        payment_url: option.payment_url,
      },
      201
    );
  } catch (_error) {
    logFailure("unexpected_error");
    return safeErrorResponse();
  }
});
