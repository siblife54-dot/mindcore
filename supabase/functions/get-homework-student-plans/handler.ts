import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HomeworkAuthError, requireCourseOwnership, resolveAdminContext } from "../_shared/homework-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-session, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Plan = { code: string; label: string; chat_id: string };
type Dependencies = { createSupabase: () => SupabaseClient; fetchTelegram: typeof fetch };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parsePlans(value: unknown): Plan[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 3) return null;
  const codes = new Set(), chats = new Set();
  const plans: Plan[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
      Object.keys(item).some((key) => !["code", "label", "chat_id"].includes(key)) ||
      typeof item.code !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.code) ||
      typeof item.label !== "string" || !item.label.trim() || item.label.length > 100 ||
      typeof item.chat_id !== "string" || !/^-[1-9]\d{1,19}$/.test(item.chat_id) ||
      codes.has(item.code) || chats.has(item.chat_id)) return null;
    codes.add(item.code); chats.add(item.chat_id);
    plans.push({ code: item.code, label: item.label.trim(), chat_id: item.chat_id });
  }
  return plans;
}

// The transport always targets Telegram; neither URLs nor tokens come from the caller.
async function membership(fetchTelegram: typeof fetch, token: string, chatId: string, userId: string) {
  try {
    const response = await fetchTelegram(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok !== true || !payload.result) return "error";
    const { status, is_member: isMember } = payload.result;
    if (["creator", "administrator", "member"].includes(status)) return "member";
    if (status === "restricted" && typeof isMember === "boolean") return isMember ? "member" : "absent";
    if (status === "left" || status === "kicked") return "absent";
    return "error";
  } catch {
    // Telegram errors can contain the request URL (and token). Never echo or log them.
    return "error";
  }
}

export async function handleRequest(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: { code: "invalid_request" } }, 405);
  try {
    const sessionToken = request.headers.get("X-Admin-Session");
    if (!sessionToken) throw new HomeworkAuthError("invalid_admin_session", 401);
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["course_id", "product_user_id"].includes(key)) ||
      typeof input.course_id !== "string" || !input.course_id.trim() || input.course_id.length > 200 ||
      typeof input.product_user_id !== "string" || !UUID.test(input.product_user_id)) {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    const courseId = input.course_id.trim();
    const supabase = deps.createSupabase();
    const admin = await resolveAdminContext(supabase, sessionToken);
    await requireCourseOwnership(supabase, courseId, admin.accountId);
    const settings = await supabase.from("course_settings").select("telegram_plan_detection_enabled")
      .eq("course_id", courseId).maybeSingle();
    if (settings.error) throw new HomeworkAuthError("server_error", 500);
    const base = { course_id: courseId, product_user_id: input.product_user_id };
    if (settings.data?.telegram_plan_detection_enabled !== true) {
      return json({ ok: true, ...base, status: "disabled", plans: [], ambiguous: false });
    }

    const student = await supabase.from("product_users").select("id, webapp_user_id")
      .eq("id", input.product_user_id).eq("course_id", courseId).maybeSingle();
    if (student.error) throw new HomeworkAuthError("server_error", 500);
    if (!student.data) return json({ ok: false, error: { code: "student_not_found" } }, 404);
    const profile = await supabase.from("webapp_users").select("platform, platform_user_id, telegram_id")
      .eq("id", student.data.webapp_user_id).maybeSingle();
    if (profile.error) throw new HomeworkAuthError("server_error", 500);
    const userId = String(profile.data?.platform_user_id ?? "");
    if (profile.data?.platform !== "telegram" || !/^[1-9]\d*$/.test(userId) ||
      !Number.isSafeInteger(Number(userId)) ||
      (profile.data.telegram_id != null && String(profile.data.telegram_id) !== userId)) {
      return json({ ok: true, ...base, status: "identity_unavailable", plans: [], ambiguous: false });
    }
    const integration = await supabase.from("course_integrations").select("telegram_plan_channels")
      .eq("course_id", courseId).maybeSingle();
    if (integration.error) throw new HomeworkAuthError("server_error", 500);
    const channels = parsePlans(integration.data?.telegram_plan_channels);
    if (!channels) return json({ ok: false, error: { code: "configuration_error" } }, 409);
    const token = await supabase.rpc("get_course_telegram_bot_token", { p_course_id: courseId });
    if (token.error || typeof token.data !== "string" || !token.data.trim()) {
      throw new HomeworkAuthError("server_error", 500);
    }
    const checks = await Promise.all(channels.map((plan) =>
      membership(deps.fetchTelegram, token.data, plan.chat_id, userId)));
    const plans = channels.filter((_, index) => checks[index] === "member")
      .map(({ code, label }) => ({ code, label }));
    const complete = !checks.includes("error");
    return json({ ok: true, ...base,
      status: !complete ? "telegram_error" : plans.length > 1 ? "ambiguous" : plans.length ? "detected" : "no_membership",
      plans, ambiguous: plans.length > 1, complete, checked_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: { code: "invalid_request" } }, 400);
    if (error instanceof HomeworkAuthError) return json({ ok: false, error: { code: error.code } }, error.status);
    return json({ ok: false, error: { code: "server_error" } }, 500);
  }
}
