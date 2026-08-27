import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HomeworkAuthError, requireCourseOwnership, resolveAdminContext } from "./homework-auth.ts";
import { corsHeaders, jsonResponse } from "./http.ts";

type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["pending_review", "revision_requested", "accepted", "all"]);
const fields = {
  attempt: "id, submission_id, attempt_number, student_text, status, review_comment, submitted_at, reviewed_at",
  student: "id, webapp_user_id",
  profile: "id, display_name, first_name, last_name, username, avatar_url",
};

function publicAttempt(row: Row) { const { submission_id: _id, ...result } = row; return result; }

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  try {
    const sessionToken = request.headers.get("X-Admin-Session");
    if (!sessionToken) return jsonResponse({ ok: false, error: { code: "invalid_admin_session" } }, 401);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new HomeworkAuthError("invalid_request", 400);
    const input = body as Record<string, unknown>;
    const action = input.action ?? "list";
    if ((action !== "list" && action !== "detail") || typeof input.course_id !== "string" || !input.course_id.trim()) {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    const status = input.status ?? "pending_review";
    if (action === "list" && (typeof status !== "string" || !STATUSES.has(status))) throw new HomeworkAuthError("invalid_request", 400);
    if (action === "detail" && (typeof input.submission_id !== "string" || !UUID.test(input.submission_id))) {
      throw new HomeworkAuthError("invalid_request", 400);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new HomeworkAuthError("server_error", 500);
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const courseId = input.course_id.trim();

    const context = await resolveAdminContext(supabase, sessionToken);
    await requireCourseOwnership(supabase, courseId, context.accountId);

    // Resolve the course boundary first; every later submission is constrained by these ids.
    const lessonResult = await supabase.from("lessons").select("id, title, day_number").eq("course_id", courseId);
    if (lessonResult.error) throw new HomeworkAuthError("server_error", 500);
    const lessons: Row[] = lessonResult.data ?? [];
    const lessonIds = lessons.map((row) => row.id);
    let homeworks: Row[] = [];
    if (lessonIds.length) {
      const result = await supabase.from("lesson_homeworks").select("id, lesson_id, title").in("lesson_id", lessonIds);
      if (result.error) throw new HomeworkAuthError("server_error", 500);
      homeworks = result.data ?? [];
    }
    const homeworkIds = homeworks.map((row) => row.id);
    let query = supabase.from("homework_submissions").select("id, homework_id, product_user_id, status, created_at, updated_at");
    query = homeworkIds.length ? query.in("homework_id", homeworkIds) : query.in("homework_id", []);
    if (action === "detail") query = query.eq("id", input.submission_id as string);
    else if (status !== "all") query = query.eq("status", status as string);
    query = action === "list" && status === "pending_review"
      ? query.order("created_at", { ascending: true })
      : query.order("updated_at", { ascending: false });
    const submissionResult = await query;
    if (submissionResult.error) throw new HomeworkAuthError("server_error", 500);
    const submissions: Row[] = submissionResult.data ?? [];
    if (action === "detail" && !submissions.length) return jsonResponse({ ok: false, error: { code: "submission_not_found" } }, 404);
    if (!submissions.length) return jsonResponse({ ok: true, submissions: [] });

    const submissionIds = submissions.map((row) => row.id);
    const productUserIds = [...new Set(submissions.map((row) => row.product_user_id))];
    const [attemptResult, studentResult] = await Promise.all([
      supabase.from("homework_attempts").select(fields.attempt).in("submission_id", submissionIds)
        .order("attempt_number", { ascending: action === "detail" }),
      supabase.from("product_users").select(fields.student).in("id", productUserIds).eq("course_id", courseId),
    ]);
    if (attemptResult.error || studentResult.error) throw new HomeworkAuthError("server_error", 500);
    const students: Row[] = studentResult.data ?? [];
    const webappIds = students.map((row) => row.webapp_user_id);
    const profileResult = await supabase.from("webapp_users").select(fields.profile).in("id", webappIds);
    if (profileResult.error) throw new HomeworkAuthError("server_error", 500);

    const lessonById = new Map(lessons.map((row) => [row.id, row]));
    const homeworkById = new Map(homeworks.map((row) => [row.id, row]));
    const studentById = new Map(students.map((row) => [row.id, row]));
    const profileById = new Map((profileResult.data ?? []).map((row: Row) => [row.id, row]));
    const attemptsBySubmission = new Map<string, Row[]>();
    for (const attempt of attemptResult.data ?? []) {
      const list = attemptsBySubmission.get(attempt.submission_id) ?? [];
      list.push(attempt); attemptsBySubmission.set(attempt.submission_id, list);
    }
    const decorate = (submission: Row) => {
      const homework = homeworkById.get(submission.homework_id)!;
      const lesson = lessonById.get(homework.lesson_id)!;
      const productUser = studentById.get(submission.product_user_id)!;
      const profile = profileById.get(productUser.webapp_user_id) ?? {};
      const student = { product_user_id: productUser.id, webapp_user_id: productUser.webapp_user_id,
        display_name: profile.display_name ?? "", first_name: profile.first_name ?? "", last_name: profile.last_name ?? "",
        username: profile.username ?? "", avatar_url: profile.avatar_url ?? "" };
      const base = { submission_id: submission.id, status: submission.status, created_at: submission.created_at,
        updated_at: submission.updated_at, homework: { id: homework.id, lesson_id: homework.lesson_id, title: homework.title },
        lesson: { id: lesson.id, title: lesson.title, day_number: lesson.day_number }, student };
      return { base, attempts: attemptsBySubmission.get(submission.id) ?? [] };
    };
    if (action === "detail") {
      const item = decorate(submissions[0]);
      return jsonResponse({ ok: true, submission: { submission_id: item.base.submission_id, status: item.base.status,
        created_at: item.base.created_at, updated_at: item.base.updated_at }, homework: item.base.homework,
        lesson: item.base.lesson, student: item.base.student, attempts: item.attempts.map(publicAttempt) });
    }
    return jsonResponse({ ok: true, submissions: submissions.map((submission) => {
      const item = decorate(submission);
      const latest = item.attempts[0];
      if (!latest) throw new HomeworkAuthError("server_error", 500);
      return { ...item.base, latest_attempt: publicAttempt(latest) };
    }) });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
    if (error instanceof HomeworkAuthError) return jsonResponse({ ok: false, error: { code: error.code } }, error.status);
    console.error("get-homework-submissions failed", { error_type: error instanceof Error ? error.name : "UnknownError" });
    return jsonResponse({ ok: false, error: { code: "server_error" } }, 500);
  }
});
