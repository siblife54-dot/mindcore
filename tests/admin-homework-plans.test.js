"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
const exposed = source.replace("  init();\n})();", `  globalThis.ui = {
  state, homeworkPlans, configureHomeworkPlans, homeworkPlanBadge, queueHomeworkPlans,
  renderHomeworkReviewQueue, renderHomeworkReviewDetail, loadHomeworkReviewQueue,
  loadHomeworkReviewDetail, fetchCourseAccessSettings, clearAdminSession
};\n})();`);
assert.notEqual(exposed, source);
const tick = () => new Promise((resolve) => setImmediate(resolve));
let count = 0;

function fixture() {
  let now = 1000, enabled = true;
  const calls = [], timers = new Map(), badges = [];
  const nodes = Object.fromEntries(["homeworkReviewState", "homeworkReviewQueue", "homeworkReviewDetail", "homeworkPendingBadge"]
    .map((id) => [id, { innerHTML: "", textContent: "", hidden: true, setAttribute() {} }]));
  const storage = new Map([["mindcore_admin_session_token", "admin-session"]]);
  const window = {
    location: { search: "?course=course-a" }, APP_CONFIG: { supabaseUrl: "https://backend.test", supabaseAnonKey: "public-key" },
    localStorage: { getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key) },
    getSupabaseClient: () => ({ from(table) {
      assert.equal(table, "course_settings");
      const query = { select(fields) { assert(fields.includes("telegram_plan_detection_enabled")); return query; },
        eq() { return query; }, async maybeSingle() { return { data: { telegram_plan_detection_enabled: enabled }, error: null }; } };
      return query;
    } }),
  };
  let respond = async (body) => ({ ok: true, ...body, status: "detected", plans: [{ code: "TEMEL", label: "TEMEL" }], complete: true });
  window.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    if (url.endsWith("get-homework-student-plans")) {
      assert.deepEqual(Object.keys(body).sort(), ["course_id", "product_user_id"]);
      assert.equal(options.headers["X-Admin-Session"], "admin-session");
      const result = await respond(body, options);
      return { ok: true, json: async () => result };
    }
    assert(url.endsWith("get-homework-submissions"));
    return { ok: true, json: async () => body.action === "list"
      ? { ok: true, submissions: [submission("same"), submission("same")] }
      : { ok: true, submission: { submission_id: "work" }, student: { product_user_id: "same", display_name: "Ada" }, attempts: [] } };
  };
  const context = vm.createContext({ window, document: {
    getElementById: (id) => nodes[id] || null,
    querySelectorAll: (selector) => selector === "[data-homework-plan]" ? badges : [],
  }, URLSearchParams, AbortController, console, Intl,
  Date: class extends Date { static now() { return now; } },
  setTimeout: (fn) => { const key = {}; timers.set(key, fn); return key; }, clearTimeout: (key) => timers.delete(key) });
  vm.runInContext(exposed, context);
  return { ui: context.ui, nodes, calls, badges, timers, window,
    setEnabled(value) { enabled = value; }, respond(fn) { respond = fn; }, advance(ms) { now += ms; },
    async idle() { for (let i = 0; i < 30 && (context.ui.homeworkPlans.active || context.ui.homeworkPlans.queue.length); i++) await tick();
      assert.equal(context.ui.homeworkPlans.active, 0); assert.equal(timers.size, 0); },
  };
}

function submission(id) { return { submission_id: "work-" + id, student: { product_user_id: id, display_name: "Ada" }, latest_attempt: {} }; }

(async () => {
  // Exercise the existing settings read, list/detail loaders and actual renderers.
  for (const [code, label] of [["TEMEL", "TEMEL"], ["YAKIN", "YAKIN"], ["OZEL", "ÖZEL"]]) {
    const f = fixture();
    f.respond(async (body) => ({ ok: true, ...body, status: "detected", complete: true, plans: [{ code, label: code }] }));
    await f.ui.fetchCourseAccessSettings();
    await f.ui.loadHomeworkReviewQueue(); await f.idle();
    f.ui.renderHomeworkReviewQueue();
    assert(f.nodes.homeworkReviewQueue.innerHTML.includes(">" + label + "</span>"));
    f.ui.state.activeAdminTab = "homework";
    await f.ui.loadHomeworkReviewDetail("work"); await f.idle(); f.ui.renderHomeworkReviewDetail();
    assert(f.nodes.homeworkReviewDetail.innerHTML.includes(">" + label + "</span>"));
    assert.equal(f.calls.filter((call) => call.url.endsWith("student-plans")).length, 1, "List duplicates and detail share one lookup");
    for (let i = 0; i < 4; i++) { f.ui.renderHomeworkReviewQueue(); f.ui.renderHomeworkReviewDetail(); }
    assert.equal(f.calls.filter((call) => call.url.endsWith("student-plans")).length, 1, "Renders never issue requests"); count++;
  }
  for (const flag of [false, undefined, "true"]) {
    const f = fixture(); f.setEnabled(flag); await f.ui.fetchCourseAccessSettings();
    await f.ui.loadHomeworkReviewQueue();
    assert.equal(f.ui.homeworkPlanBadge({ product_user_id: "same" }), "");
    assert(!f.nodes.homeworkReviewQueue.innerHTML.includes("data-homework-plan"));
    assert.equal(f.calls.filter((call) => call.url.endsWith("student-plans")).length, 0); count++;
  }
  for (const [result, label] of [
    [{ status: "ambiguous", complete: true }, "Несколько тарифов"],
    [{ status: "no_membership", complete: true }, "Тариф не определён"],
    [{ status: "identity_unavailable" }, "Telegram не подтверждён"],
    [{ status: "telegram_error", complete: false }, "Ошибка проверки"],
    [{ status: "detected", complete: false, plans: [{ code: "TEMEL" }] }, "Ошибка проверки"],
    [{ status: "detected", plans: [{ code: "TEMEL" }] }, "Ошибка проверки"],
    [{ status: "detected", complete: true, plans: [null] }, "Ошибка проверки"],
    [{ status: "disabled" }, ""],
  ]) {
    const f = fixture(); f.ui.configureHomeworkPlans("course-a", true);
    f.respond(async (body) => ({ ok: true, ...body, ...result }));
    f.ui.queueHomeworkPlans([{ product_user_id: "one" }]); await f.idle();
    const badge = f.ui.homeworkPlanBadge({ product_user_id: "one" });
    assert(label ? badge.includes(label) : badge.includes(" hidden")); count++;
  }
  // Bounded concurrency; queued work is cancelled on course switch, stale responses ignored.
  const f = fixture(), pending = [];
  f.ui.configureHomeworkPlans("course-a", true);
  f.respond((body) => new Promise((resolve) => pending.push(() => resolve({ ok: true, ...body, status: "detected", complete: true, plans: [{ code: "TEMEL" }] }))));
  f.ui.queueHomeworkPlans([1, 2, 3, 4, 5].map((id) => ({ product_user_id: String(id) })));
  assert.equal(pending.length, 3); assert.equal(f.ui.homeworkPlans.queue.length, 2);
  pending.shift()(); await tick(); assert.equal(f.calls.length, 4);
  const oldBadge = { textContent: "TEMEL", hidden: false, getAttribute: () => "1" }; f.badges.push(oldBadge);
  f.window.location.search = "?course=course-b"; f.ui.configureHomeworkPlans("course-b", false);
  assert.equal(oldBadge.hidden, true); assert.equal(f.ui.homeworkPlanBadge({ product_user_id: "1" }), "");
  pending.splice(0).forEach((resolve) => resolve()); await f.idle();
  assert.equal(f.calls.length, 4, "Old queued students must not start after switch"); assert.equal(f.ui.homeworkPlans.cache.size, 0); count++;
  f.ui.configureHomeworkPlans("course-b", true);
  f.ui.queueHomeworkPlans([{ product_user_id: "1" }]);
  assert.equal(f.calls.length, 5, "The same student ID in another course needs its own lookup");
  pending.shift()(); await f.idle();
  assert(f.ui.homeworkPlanBadge({ product_user_id: "1" }).includes("TEMEL")); count++;

  const cached = fixture(); cached.ui.configureHomeworkPlans("course-a", true);
  cached.ui.queueHomeworkPlans([{ product_user_id: "one" }]); await cached.idle();
  cached.ui.queueHomeworkPlans([{ product_user_id: "one" }]); assert.equal(cached.calls.length, 1);
  cached.advance(300001); cached.ui.queueHomeworkPlans([{ product_user_id: "one" }]); await cached.idle();
  assert.equal(cached.calls.length, 2, "Expired results are refreshed on load"); count++;

  const broken = fixture(); await broken.ui.fetchCourseAccessSettings();
  broken.respond(async () => { throw new Error("network failure"); });
  await broken.ui.loadHomeworkReviewQueue(); await broken.idle();
  assert.equal(broken.ui.state.homeworkQueueError, null);
  broken.ui.state.activeAdminTab = "homework"; await broken.ui.loadHomeworkReviewDetail("work");
  assert.equal(broken.ui.state.homeworkDetailError, null);
  assert(broken.ui.homeworkPlanBadge({ product_user_id: "same" }).includes("Ошибка проверки")); count++;

  const timedOut = fixture(); timedOut.ui.configureHomeworkPlans("course-a", true);
  timedOut.respond((body, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout")))));
  timedOut.ui.queueHomeworkPlans([{ product_user_id: "one" }]);
  [...timedOut.timers.values()].forEach((abort) => abort()); await timedOut.idle();
  assert(timedOut.ui.homeworkPlanBadge({ product_user_id: "one" }).includes("Ошибка проверки")); count++;

  const mismatched = fixture(); mismatched.ui.configureHomeworkPlans("course-a", true);
  mismatched.respond(async (body) => ({ ok: true, ...body, course_id: "another-course", status: "detected", complete: true, plans: [{ code: "TEMEL" }] }));
  mismatched.ui.queueHomeworkPlans([{ product_user_id: "one" }]); await mismatched.idle();
  assert(mismatched.ui.homeworkPlanBadge({ product_user_id: "one" }).includes("Ошибка проверки")); count++;

  const editing = fixture(); editing.ui.configureHomeworkPlans("course-a", true);
  editing.nodes.homeworkReviewDetail.innerHTML = "unsaved review comment";
  const badge = { textContent: "", hidden: true, getAttribute: () => "one" }; editing.badges.push(badge);
  editing.ui.queueHomeworkPlans([{ product_user_id: "one" }]); await editing.idle();
  assert.equal(badge.textContent, "TEMEL"); assert.equal(editing.nodes.homeworkReviewDetail.innerHTML, "unsaved review comment");
  editing.ui.clearAdminSession(); assert.equal(editing.ui.homeworkPlans.cache.size, 0); assert.equal(badge.hidden, true); count++;
  console.log(`Admin Homework plan badges: ${count} runtime scenarios passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
