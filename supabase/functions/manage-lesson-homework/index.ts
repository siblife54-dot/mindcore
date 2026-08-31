import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RESPONSE_TYPES = new Set(["text", "image", "file", "video"]);
const UNLOCK_RULES = new Set(["independent", "after_submission", "after_approval"]);
type ErrorCode = "invalid_request" | "invalid_admin_session" | "lesson_not_found" | "server_error";
type Row = Record<string, unknown>;

class RequestError extends Error {
  constructor(public code: ErrorCode, public status: number) {
    super(code);
    this.name = "RequestError";
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveAdminContext(supabase: SupabaseClient, sessionToken: string) {
  if (!sessionToken || sessionToken.length > 500) {
    throw new RequestError("invalid_admin_session", 401);
  }
  const { data: tokenHash, error: hashError } = await supabase.rpc(
    "hash_admin_session_token",
    { p_token: sessionToken },
  );
  if (hashError || typeof tokenHash !== "string" || !tokenHash) {
    throw new RequestError("server_error", 500);
  }
  const { data: session, error: sessionError } = await supabase
    .from("admin_sessions")
    .select("account_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (sessionError) throw new RequestError("server_error", 500);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    throw new RequestError("invalid_admin_session", 401);
  }
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, status")
    .eq("id", session.account_id)
    .maybeSingle();
  if (accountError) throw new RequestError("server_error", 500);
  if (!account || account.status !== "active") {
    throw new RequestError("invalid_admin_session", 401);
  }
  return { accountId: account.id };
}

function validateHomework(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("invalid_request", 400);
  }
  const homework = value as Row;
  if ("id" in homework || "course_id" in homework || "account_id" in homework) {
    throw new RequestError("invalid_request", 400);
  }
  if (typeof homework.is_enabled !== "boolean" || typeof homework.title !== "string" ||
    typeof homework.description !== "string" || !Array.isArray(homework.allowed_response_types) ||
    typeof homework.unlock_rule !== "string") {
    throw new RequestError("invalid_request", 400);
  }
  const title = homework.title.trim();
  const description = homework.description.trim();
  const responseTypes = homework.allowed_response_types;
  if (!title || Array.from(title).length > 200 || Array.from(description).length > 10_000 ||
    responseTypes.length < 1 || responseTypes.some((item) => typeof item !== "string" || !RESPONSE_TYPES.has(item)) ||
    new Set(responseTypes).size !== responseTypes.length || !UNLOCK_RULES.has(homework.unlock_rule)) {
    throw new RequestError("invalid_request", 400);
  }
  return {
    is_enabled: homework.is_enabled,
    title,
    description,
    allowed_response_types: responseTypes as string[],
    unlock_rule: homework.unlock_rule,
  };
}

function publicHomework(row: Row) {
  return {
    exists: true,
    id: row.id,
    lesson_id: row.lesson_id,
    is_enabled: row.is_enabled,
    title: row.title,
    description: row.description ?? "",
    allowed_response_types: row.allowed_response_types,
    unlock_rule: row.unlock_rule,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  }
  try {
    const sessionToken = request.headers.get("X-Admin-Session");
    if (!sessionToken) throw new RequestError("invalid_admin_session", 401);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestError("invalid_request", 400);
    }
    const input = body as Row;
    if ((input.action !== "get" && input.action !== "save") ||
      !Number.isSafeInteger(input.lesson_id) || Number(input.lesson_id) <= 0 ||
      "account_id" in input || "course_id" in input) {
      throw new RequestError("invalid_request", 400);
    }
    const homeworkInput = input.action === "save" ? validateHomework(input.homework) : null;
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new RequestError("server_error", 500);
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const context = await resolveAdminContext(supabase, sessionToken);

    // Resolve the complete trusted ownership chain before any homework read or write.
    const lessonResult = await supabase.from("lessons").select("id, course_id")
      .eq("id", input.lesson_id as number).maybeSingle();
    if (lessonResult.error) throw new RequestError("server_error", 500);
    if (!lessonResult.data) throw new RequestError("lesson_not_found", 404);
    const courseResult = await supabase.from("courses").select("course_id, account_id")
      .eq("course_id", lessonResult.data.course_id).maybeSingle();
    if (courseResult.error) throw new RequestError("server_error", 500);
    if (!courseResult.data || String(courseResult.data.account_id) !== String(context.accountId)) {
      throw new RequestError("lesson_not_found", 404);
    }

    const fields = "id, lesson_id, is_enabled, title, description, allowed_response_types, unlock_rule";
    if (input.action === "get") {
      const result = await supabase.from("lesson_homeworks").select(fields)
        .eq("lesson_id", input.lesson_id as number).maybeSingle();
      if (result.error) throw new RequestError("server_error", 500);
      if (result.data) return jsonResponse({ ok: true, homework: publicHomework(result.data) });
      return jsonResponse({ ok: true, homework: {
        exists: false,
        lesson_id: input.lesson_id,
        is_enabled: false,
        title: "Домашнее задание",
        description: "",
        allowed_response_types: ["text"],
        unlock_rule: "independent",
      } });
    }

    const result = await supabase.from("lesson_homeworks")
      .upsert({ lesson_id: input.lesson_id, ...homeworkInput }, { onConflict: "lesson_id" })
      .select(fields).single();
    if (result.error || !result.data) throw new RequestError("server_error", 500);
    return jsonResponse({ ok: true, homework: publicHomework(result.data) });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
    }
    if (error instanceof RequestError) {
      return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
    }
    console.error("manage-lesson-homework failed", {
      error_type: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
