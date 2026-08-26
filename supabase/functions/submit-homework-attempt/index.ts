import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HomeworkAuthError, resolveStudentContext } from "./homework-auth.ts";
import { corsHeaders, jsonResponse, rpcErrorResponse } from "./http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);

  let homeworkId: string | undefined;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new HomeworkAuthError("invalid_request", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.course_id !== "string" || !input.course_id.trim() ||
      typeof input.platform !== "string" ||
      typeof input.platform_auth_data !== "string" || !input.platform_auth_data ||
      typeof input.homework_id !== "string" || !UUID.test(input.homework_id) ||
      typeof input.student_text !== "string") {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    homeworkId = input.homework_id;
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new HomeworkAuthError("server_error", 500);
    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const requestedCourseId = input.course_id.trim();
    const context = await resolveStudentContext(supabase, {
      courseId: requestedCourseId,
      platform: input.platform.toLowerCase(),
      platformAuthData: input.platform_auth_data,
    });
    if (context.courseId !== requestedCourseId) {
      return jsonResponse({ ok: false, error: { code: "homework_course_mismatch" } }, 403);
    }

    const { data, error } = await supabase.rpc("submit_homework_attempt", {
      p_homework_id: homeworkId,
      p_product_user_id: context.productUserId,
      p_student_text: input.student_text,
    });
    if (error) {
      console.error("submit-homework-attempt RPC failed", { error_code: error.code, homework_id: homeworkId });
      return rpcErrorResponse(error);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new HomeworkAuthError("server_error", 500);
    return jsonResponse({ ok: true, submission_id: result.submission_id, attempt_id: result.attempt_id, attempt_number: result.attempt_number, status: result.status });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
    if (error instanceof HomeworkAuthError) return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
    console.error("submit-homework-attempt failed", { error_type: error instanceof Error ? error.name : "UnknownError", homework_id: homeworkId });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
