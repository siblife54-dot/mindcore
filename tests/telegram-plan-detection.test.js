"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { stripTypeScriptTypes } = require("node:module");
const root = path.join(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (code) => "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const authUrl = moduleUrl(stripTypeScriptTypes(source("supabase/functions/_shared/homework-auth.ts"), { mode: "transform" }));
const handlerUrl = moduleUrl(stripTypeScriptTypes(source("supabase/functions/get-homework-student-plans/handler.ts"), { mode: "transform" })
  .replace('"../_shared/homework-auth.ts"', JSON.stringify(authUrl)));
const studentId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const channels = [1, 2, 3].map((n) => ({ code: "plan_" + n, label: "Plan " + n, chat_id: "-10012345" + n }));
let cases = 0;

function fixture(options = {}) {
  const trace = [], calls = [];
  const tables = {
    admin_sessions: [{ account_id: 7, token_hash: "hash", expires_at: "2099-01-01", revoked_at: null }],
    accounts: [{ id: 7, status: "active" }],
    courses: [{ course_id: "course_a", account_id: 7 }, { course_id: "course_b", account_id: 8 }],
    course_settings: [{ course_id: "course_a", telegram_plan_detection_enabled: true }],
    product_users: [{ id: studentId, course_id: "course_a", webapp_user_id: "profile_a" },
      { id: otherId, course_id: "course_b", webapp_user_id: "profile_b" }],
    webapp_users: [{ id: "profile_a", platform: "telegram", platform_user_id: "123456", telegram_id: "123456" }],
    course_integrations: [{ course_id: "course_a", telegram_plan_channels: channels }],
    ...options.tables,
  };
  const client = {
    async rpc(name, args) {
      trace.push({ rpc: name, args });
      if (name === "hash_admin_session_token") return { data: "hash", error: null };
      assert.equal(name, "get_course_telegram_bot_token");
      assert.deepEqual(args, { p_course_id: "course_a" });
      return { data: options.missingToken ? null : "private-test-token", error: null };
    },
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        async maybeSingle() {
          trace.push({ table, filters });
          return { data: tables[table].find((row) => filters.every(([key, value]) => row[key] === value)) ?? null,
            error: table === options.errorTable ? { message: "private database error" } : null };
        },
      };
      return query;
    },
  };
  return { trace, calls, deps: {
    createSupabase: () => client,
    async fetchTelegram(url, init) {
      const body = JSON.parse(init.body);
      calls.push(body);
      assert.equal(url, "https://api.telegram.org/botprivate-test-token/getChatMember");
      assert.equal(body.user_id, "123456");
      assert(init.signal instanceof AbortSignal, "Telegram requests need a bounded timeout");
      const result = (options.results ?? ["member", "left", "kicked"])[channels.findIndex((p) => p.chat_id === body.chat_id)];
      if (result === "timeout") throw new Error(url);
      if (result === "malformed") return new Response("not json");
      if (result === "api_error") return Response.json({ ok: false, description: "private-test-token" }, { status: 429 });
      return Response.json({ ok: true, result: typeof result === "object" ? result : { status: result } });
    },
  } };
}

(async () => {
  const { handleRequest } = await import(handlerUrl);
  async function run(options = {}, body = { course_id: "course_a", product_user_id: studentId }, headers = { "X-Admin-Session": "session" }) {
    const f = fixture(options);
    const response = await handleRequest(new Request("https://example.test", {
      method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
    }), f.deps);
    const data = await response.json();
    assert(!JSON.stringify(data).includes("private-"), "Responses must not expose upstream secrets/errors");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    cases++;
    return { ...f, data, response };
  }
  let r = await run();
  assert.equal(r.data.status, "detected");
  assert.deepEqual(r.data.plans, [{ code: "plan_1", label: "Plan 1" }]);
  assert.equal(r.calls.length, 3);
  assert(!("telegram_id" in r.data));

  r = await run({ results: ["member", "administrator", "creator"] });
  assert.equal(r.data.status, "ambiguous"); assert.equal(r.data.ambiguous, true); assert.equal(r.data.plans.length, 3);
  r = await run({ results: ["left", "kicked", { status: "restricted", is_member: false }] });
  assert.equal(r.data.status, "no_membership"); assert.equal(r.data.complete, true);
  r = await run({ results: [{ status: "restricted", is_member: true }, "left", "left"] });
  assert.equal(r.data.status, "detected");
  for (const failure of ["timeout", "malformed", "api_error", "unknown", { status: "restricted" }]) {
    r = await run({ results: [failure, "left", "left"] });
    assert.equal(r.data.status, "telegram_error"); assert.equal(r.data.complete, false);
  }
  r = await run({ results: ["member", "timeout", "member"] });
  assert.equal(r.data.status, "telegram_error"); assert.equal(r.data.ambiguous, true); assert.equal(r.data.plans.length, 2);

  for (const enabled of [false, null, "true", undefined]) {
    r = await run({ tables: { course_settings: [{ course_id: "course_a", telegram_plan_detection_enabled: enabled }] } });
    assert.equal(r.data.status, "disabled"); assert.equal(r.calls.length, 0);
    assert(!r.trace.some((item) => item.rpc === "get_course_telegram_bot_token" || item.table === "course_integrations"));
  }
  r = await run({}, undefined, {});
  assert.equal(r.response.status, 401); assert.equal(r.trace.length, 0);
  for (const session of [[], [{ account_id: 7, token_hash: "hash", expires_at: "2000-01-01" }],
    [{ account_id: 7, token_hash: "hash", expires_at: "2099-01-01", revoked_at: "2026-01-01" }]]) {
    r = await run({ tables: { admin_sessions: session } });
    assert.equal(r.response.status, 401); assert.equal(r.calls.length, 0);
  }
  r = await run({ tables: { accounts: [{ id: 7, status: "blocked" }] } });
  assert.equal(r.response.status, 403);
  r = await run({}, { course_id: "course_b", product_user_id: otherId });
  assert.equal(r.response.status, 403); assert(!r.trace.some((item) => item.table === "course_settings"));
  r = await run({}, { course_id: "course_a", product_user_id: otherId });
  assert.equal(r.response.status, 404); assert.equal(r.calls.length, 0);
  for (const extra of [{ telegram_id: "999" }, { chat_id: "-100999" }, { bot_token: "client-token" }, { account_id: 8 }]) {
    r = await run({}, { course_id: "course_a", product_user_id: studentId, ...extra });
    assert.equal(r.response.status, 400); assert.equal(r.trace.length, 0);
  }
  r = await run({}, "{"); assert.equal(r.response.status, 400);
  for (const profile of [null, { platform: "browser", platform_user_id: "123456" },
    { platform: "telegram", platform_user_id: "guest_x" },
    { platform: "telegram", platform_user_id: "123456", telegram_id: "654321" }]) {
    r = await run({ tables: { webapp_users: profile ? [{ id: "profile_a", ...profile }] : [] } });
    assert.equal(r.data.status, "identity_unavailable"); assert.equal(r.calls.length, 0);
  }
  for (const config of [[], {}, [channels[0], channels[0]], [{ ...channels[0], chat_id: "https://evil.test" }],
    [{ ...channels[0], bot_token: "not-allowed" }]]) {
    r = await run({ tables: { course_integrations: [{ course_id: "course_a", telegram_plan_channels: config }] } });
    assert.equal(r.response.status, 409); assert.equal(r.calls.length, 0);
  }
  r = await run({ missingToken: true }); assert.equal(r.response.status, 500); assert.equal(r.calls.length, 0);
  for (const errorTable of ["course_settings", "product_users", "webapp_users", "course_integrations"]) {
    r = await run({ errorTable }); assert.equal(r.response.status, 500); assert.equal(r.calls.length, 0);
  }
  for (const method of ["GET", "OPTIONS"]) {
    const f = fixture();
    const response = await handleRequest(new Request("https://example.test", { method }), f.deps);
    assert.equal(response.status, method === "OPTIONS" ? 200 : 405);
    assert(response.headers.get("Access-Control-Allow-Headers").includes("x-admin-session"));
    assert.equal(f.trace.length, 0); cases++;
  }
  const migration = source("migrations/20261110090000_add_telegram_plan_detection.sql");
  assert.match(migration, /telegram_plan_detection_enabled boolean not null default false/);
  assert(!/\b(?:insert|update|delete|grant|revoke)\b/i.test(migration));
  console.log(`Telegram plan detection: ${cases} runtime scenarios passed (real admin auth helpers, mocked DB/Telegram)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
