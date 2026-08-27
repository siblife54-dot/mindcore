import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HomeworkAuthError, resolveStudentContext } from "./homework-auth.ts";
import { corsHeaders, jsonResponse } from "./http.ts";

type Row = Record<string, any>;
const fail = (error: unknown): Response => {
  if (error instanceof SyntaxError) return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
  if (error instanceof HomeworkAuthError) return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
  console.error("get-student-homeworks failed", { error_type: error instanceof Error ? error.name : "UnknownError" });
  return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new HomeworkAuthError("invalid_request", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.course_id !== "string" || !input.course_id.trim() ||
      typeof input.platform !== "string" || typeof input.platform_auth_data !== "string" || !input.platform_auth_data) {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new HomeworkAuthError("server_error", 500);
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const courseId = input.course_id.trim();

    // Authentication and course access deliberately precede every Homework read.
    const context = await resolveStudentContext(supabase, {
      courseId,
      platform: input.platform.toLowerCase(),
      platformAuthData: input.platform_auth_data,
    });
    if (context.courseId !== courseId) throw new HomeworkAuthError("course_access_denied", 403);

    const lessonsResult = await supabase.from("lessons").select("id").eq("course_id", courseId);
    if (lessonsResult.error) throw new HomeworkAuthError("server_error", 500);
    const lessonIds = (lessonsResult.data ?? []).map((row: Row) => row.id);
    if (!lessonIds.length) return jsonResponse({ ok: true, homeworks: [] });

    const homeworkResult = await supabase.from("lesson_homeworks")
      .select("id, lesson_id, title, description, allowed_response_types, unlock_rule")
      .in("lesson_id", lessonIds).eq("is_enabled", true).order("lesson_id", { ascending: true });
    if (homeworkResult.error) throw new HomeworkAuthError("server_error", 500);
    const homeworks: Row[] = homeworkResult.data ?? [];
    const homeworkIds = homeworks.map((row) => row.id);
    if (!homeworkIds.length) return jsonResponse({ ok: true, homeworks: [] });

    // The trusted student id comes exclusively from resolveStudentContext.
    const submissionResult = await supabase.from("homework_submissions")
      .select("id, homework_id, status, created_at, updated_at")
      .in("homework_id", homeworkIds).eq("product_user_id", context.productUserId);
    if (submissionResult.error) throw new HomeworkAuthError("server_error", 500);
    const submissions: Row[] = submissionResult.data ?? [];
    const submissionIds = submissions.map((row) => row.id);
    let attempts: Row[] = [];
    if (submissionIds.length) {
      const attemptResult = await supabase.from("homework_attempts")
        .select("id, submission_id, attempt_number, student_text, status, review_comment, submitted_at, reviewed_at")
        .in("submission_id", submissionIds).order("attempt_number", { ascending: false });
      if (attemptResult.error) throw new HomeworkAuthError("server_error", 500);
      attempts = attemptResult.data ?? [];
    }
    const latestBySubmission = new Map<string, Row>();
    for (const attempt of attempts) if (!latestBySubmission.has(attempt.submission_id)) latestBySubmission.set(attempt.submission_id, attempt);
    const submissionByHomework = new Map(submissions.map((row) => [row.homework_id, row]));

    return jsonResponse({ ok: true, homeworks: homeworks.map((homework) => {
      const submission = submissionByHomework.get(homework.id);
      if (!submission) return { ...homework, submission: null }; // null consistently means not submitted.
      const { homework_id: _homeworkId, ...publicSubmission } = submission;
      const latest = latestBySubmission.get(submission.id);
      if (!latest) throw new HomeworkAuthError("server_error", 500);
      const { submission_id: _submissionId, ...latest_attempt } = latest;
      return { ...homework, submission: { ...publicSubmission, latest_attempt } };
    }) });
  } catch (error) {
    return fail(error);
  }
});
