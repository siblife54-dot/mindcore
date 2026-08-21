import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HomeworkAuthError,
  resolveStudentContext,
} from "./homework-auth.ts";
import { corsHeaders, jsonResponse } from "./http.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" ||
      typeof body.course_id !== "string" || !body.course_id.trim() ||
      typeof body.platform !== "string" ||
      typeof body.platform_auth_data !== "string" || !body.platform_auth_data) {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new HomeworkAuthError("server_error", 500);
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const context = await resolveStudentContext(supabase, {
      courseId: body.course_id.trim(),
      platform: body.platform.toLowerCase(),
      platformAuthData: body.platform_auth_data,
    });
    return jsonResponse({
      ok: true,
      platform: context.platform,
      course_id: context.courseId,
      authenticated: true,
    });
  } catch (error) {
    if (error instanceof HomeworkAuthError) {
      return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
    }
    // Never log request bodies, initData, tokens, or database objects.
    console.error("Homework auth check failed", {
      error_type: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
