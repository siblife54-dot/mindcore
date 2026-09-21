const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const js = fs.readFileSync("app.js", "utf8");
const helpersStart = js.indexOf("  function getHomeworkGateState(homework)");
const helpersEnd = js.indexOf("  async function fetchStudentHomeworks()", helpersStart);
assert(helpersStart >= 0 && helpersEnd > helpersStart, "Homework gate helpers must be defined before the Homework API client");

const helperSource = js.slice(helpersStart, helpersEnd);
const context = {};
vm.runInNewContext(
  `${helperSource}\nthis.gate = { getHomeworkGateState, buildHomeworkByLesson, getLessonHomeworkGateState, getLessonCompletionControlState, shouldAutoCompleteHomework, autoCompleteAcceptedHomework };`,
  context
);
const {
  getHomeworkGateState,
  buildHomeworkByLesson,
  getLessonHomeworkGateState,
  getLessonCompletionControlState,
  shouldAutoCompleteHomework,
  autoCompleteAcceptedHomework
} = context.gate;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepStrictEqual(plain(getHomeworkGateState(null)), {
  satisfied: true, rule: "none", reason: "no_homework"
});
for (const malformedHomework of [undefined, "homework", 101, []]) {
  assert.deepStrictEqual(plain(getHomeworkGateState(malformedHomework)), {
    satisfied: false, rule: "unknown", reason: "invalid_homework"
  });
}
assert.deepStrictEqual(plain(getHomeworkGateState({ unlock_rule: " independent ", submission: null })), {
  satisfied: true, rule: "independent", reason: "independent"
});

function homework(rule, status) {
  return { unlock_rule: rule, submission: status === null ? null : { status } };
}

assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_submission", null))), {
  satisfied: false, rule: "after_submission", reason: "needs_submission"
});
for (const status of ["pending_review", "revision_requested", "accepted"]) {
  assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_submission", status))), {
    satisfied: true, rule: "after_submission", reason: "submitted"
  });
}
assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_approval", null))), {
  satisfied: false, rule: "after_approval", reason: "needs_submission"
});
for (const status of ["pending_review", "revision_requested"]) {
  assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_approval", status))), {
    satisfied: false, rule: "after_approval", reason: status
  });
}
assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_approval", "accepted"))), {
  satisfied: true, rule: "after_approval", reason: "accepted"
});
assert.deepStrictEqual(plain(getHomeworkGateState({ unlock_rule: " future_rule ", submission: {} })), {
  satisfied: false, rule: "future_rule", reason: "unknown_rule"
});

const input = [
  { lesson_id: 101, unlock_rule: "independent", submission: null },
  { lesson_id: "102", unlock_rule: "after_approval", submission: { status: "accepted" } }
];
const inputSnapshot = JSON.stringify(input);
const byLesson = buildHomeworkByLesson(input);
assert.deepStrictEqual(Object.keys(byLesson), ["101", "102"]);
assert.strictEqual(byLesson["101"], input[0]);
assert.deepStrictEqual(plain(getLessonHomeworkGateState({ id: 102 }, byLesson)), {
  satisfied: true, rule: "after_approval", reason: "accepted"
});
assert.strictEqual(JSON.stringify(input), inputSnapshot, "helpers must not mutate Homework input");
assert.deepStrictEqual(plain(getLessonHomeworkGateState({ id: 999 }, byLesson)), {
  satisfied: true, rule: "none", reason: "no_homework"
});

const completionState = (completed, gate) => plain(getLessonCompletionControlState(completed, gate));
assert.deepStrictEqual(completionState(true, null), {
  disabled: true, text: "Пройдено ✓", reason: "completed"
});
for (const gate of [
  getHomeworkGateState(null),
  getHomeworkGateState(homework("independent", null)),
  getHomeworkGateState(homework("after_submission", "pending_review")),
  getHomeworkGateState(homework("after_submission", "revision_requested")),
  getHomeworkGateState(homework("after_approval", "accepted"))
]) {
  assert.strictEqual(completionState(false, gate).disabled, false);
  assert.strictEqual(completionState(false, gate).text, "Отметить как пройдено");
}
assert.deepStrictEqual(completionState(false, getHomeworkGateState(homework("after_submission", null))), {
  disabled: true, text: "Сначала отправьте домашнее задание", reason: "needs_submission"
});
assert.strictEqual(completionState(false, getHomeworkGateState(homework("after_approval", null))).disabled, true);
assert.deepStrictEqual(completionState(false, getHomeworkGateState(homework("after_approval", "pending_review"))), {
  disabled: true, text: "Домашнее задание на проверке", reason: "pending_review"
});
assert.deepStrictEqual(completionState(false, getHomeworkGateState(homework("after_approval", "revision_requested"))), {
  disabled: true, text: "Требуется доработка", reason: "revision_requested"
});
for (const gate of [
  null,
  getHomeworkGateState(undefined),
  getHomeworkGateState({ unlock_rule: "future_rule", submission: null }),
  getHomeworkGateState(homework("after_approval", "future_status"))
]) {
  assert.strictEqual(completionState(false, gate).disabled, true);
  assert.strictEqual(completionState(false, gate).text, "Не удалось проверить домашнее задание");
}
assert.deepStrictEqual(completionState(false, { satisfied: false, reason: "loading" }), {
  disabled: true, text: "Проверяем домашнее задание...", reason: "loading"
});

// Gate helpers must stay pure and must not touch I/O.
for (const forbidden of ["document", "fetch(", "localStorage", "APP_STORAGE", "completedLessons"]) {
  assert(!helperSource.includes(forbidden), `pure helpers must not reference ${forbidden}`);
}
const accessibilityStart = js.indexOf("  function getMaxCompletedDayNumber(");
const accessibilityEnd = js.indexOf("  function isDebugMode()", accessibilityStart);
const accessibilitySource = js.slice(accessibilityStart, accessibilityEnd);
const accessibilityContext = { preview: false };
vm.runInNewContext(
  `${helperSource}\n${accessibilitySource}\nfunction isPreviewMode() { return preview; }\nthis.accessibility = getAccessibilityModel;`,
  accessibilityContext
);
const getAccessibilityModel = accessibilityContext.accessibility;
const lessons = [
  { id: 101, lesson_id: "lesson-1", day_number: 1, is_locked: false },
  { id: 102, lesson_id: "lesson-2", day_number: 2, is_locked: false },
  { id: 103, lesson_id: "lesson-3", day_number: 3, is_locked: false }
];
const access = (completed, homeworks, resolved = true, customLessons = lessons) => plain(
  getAccessibilityModel(customLessons, completed, buildHomeworkByLesson(homeworks), resolved).map
);

assert.strictEqual(access([], {})["lesson-1"], true, "the first lesson must be accessible");
assert.strictEqual(access(["lesson-2"], [{ lesson_id: 102, ...homework("after_approval", "pending_review") }])["lesson-2"], true,
  "a completed lesson must remain accessible despite its own unmet gate");
assert.strictEqual(access([], {})["lesson-2"], false, "the next lesson requires previous completion");
assert.strictEqual(access(["lesson-1"], [])["lesson-2"], true, "no Homework satisfies the gate");
assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("independent", null) }])["lesson-2"], true);
assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("after_submission", null) }])["lesson-2"], false);
for (const status of ["pending_review", "revision_requested"]) {
  assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("after_submission", status) }])["lesson-2"], true);
  assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("after_approval", status) }])["lesson-2"], false);
}
assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("after_approval", "accepted") }])["lesson-2"], true);
assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("future_rule", null) }])["lesson-2"], false);
assert.strictEqual(access(["lesson-1"], [], true, [{ ...lessons[0], is_locked: true }])["lesson-1"], false,
  "manual is_locked must always win");
assert.strictEqual(access(["lesson-1"], [{ lesson_id: 101, ...homework("after_approval", "pending_review") }])["lesson-1"], true,
  "a completed lesson's own unmet gate must not lock that lesson");

const unresolved = access(["lesson-1"], [], false);
assert.strictEqual(unresolved["lesson-1"], true, "the first lesson remains available after an API failure");
assert.strictEqual(unresolved["lesson-2"], false, "new transitions fail closed after an API failure");
assert.strictEqual(access(["lesson-1", "lesson-2"], [], false)["lesson-2"], true,
  "completed lessons remain available after an API failure");

// Omitting Homework arguments preserves the legacy completion-only behavior for
// preview/no-Telegram and lesson direct-access checks.
assert.strictEqual(plain(getAccessibilityModel(lessons, ["lesson-1"]).map)["lesson-2"], true);
accessibilityContext.preview = true;
assert.deepStrictEqual(plain(getAccessibilityModel(lessons, []).map), {
  "lesson-1": true, "lesson-2": true, "lesson-3": true
});
accessibilityContext.preview = false;

const renderLessonStart = js.indexOf("  async function renderLesson(lessons)");
const renderLessonEnd = js.indexOf("  function pluralizeRu", renderLessonStart);
const completionSource = js.slice(renderLessonStart, renderLessonEnd);
assert(completionSource.includes('reason: "loading"'));
assert(completionSource.includes("resolvedHomeworkGate.satisfied !== true"));
assert(completionSource.includes("updateCompletionControl(null)"), "Homework errors must fail closed");
assert.strictEqual((completionSource.match(/fetchStudentHomeworks\(\)/g) || []).length, 1);
assert(completionSource.includes("!isPreviewMode() && Boolean(getTelegramInitData())"));
assert(completionSource.includes("resolvedHomeworkGate = getHomeworkGateState(updatedHomework)"));
assert(js.includes("await saveCompleted(completed)"), "completedLessons persistence must remain present");

const dashboardStart = js.indexOf("  async function renderDashboard(lessons, config)");
const dashboardEnd = js.indexOf("  async function renderLesson(lessons)", dashboardStart);
const dashboardSource = js.slice(dashboardStart, dashboardEnd);
assert.strictEqual((dashboardSource.match(/fetchStudentHomeworks\(\)/g) || []).length, 1,
  "dashboard must make at most one Homework request");
assert(dashboardSource.includes("!isPreviewMode() && Boolean(getTelegramInitData())"),
  "preview/no-Telegram must not request Homework");
assert(dashboardSource.includes("lessons.map(renderLessonCard)"), "classic cards must share renderLessonCard");
assert(dashboardSource.includes("renderLessonCard(lesson)"), "grouped cards must share renderLessonCard");
assert(!dashboardSource.includes('.from("lesson_homeworks")'), "dashboard must not read Homework tables directly");

for (const table of ["lesson_homeworks", "homework_submissions", "homework_attempts", "homework_attachments"]) {
  assert(!js.includes(`.from("${table}")`), `app.js must not directly access ${table}`);
}
assert(!helperSource.includes("supabase"), "gate helpers must not introduce backend access");

async function testAutoCompletion() {
  async function run({ rule = "after_approval", status = "accepted", completed = false, last = false, fail = false } = {}) {
    const calls = [];
    const guard = { started: false };
    const lesson = { lesson_id: "lesson-1" };
    const nextLesson = last ? null : { lesson_id: "lesson-2" };
    const options = {
      guard,
      isCompleted: () => completed,
      homework: homework(rule, status),
      lesson,
      nextLesson,
      markCompleted: async (id) => {
        calls.push(["markCompleted", id]);
        if (fail) throw new TypeError("storage failed");
      },
      onStarting: () => calls.push(["starting"]),
      onCompleted: () => calls.push(["completed"]),
      navigate: (next) => calls.push(["navigate", next && next.lesson_id]),
      onError: (error) => calls.push(["error", error.name])
    };
    return { result: await autoCompleteAcceptedHomework(options), calls, guard, options };
  }

  const accepted = await run();
  assert.strictEqual(accepted.result, true, "accepted after_approval must auto-complete");
  assert.deepStrictEqual(accepted.calls, [
    ["starting"], ["markCompleted", "lesson-1"], ["completed"], ["navigate", "lesson-2"]
  ], "completion must persist before navigating to the next array lesson");

  const last = await run({ last: true });
  assert.deepStrictEqual(last.calls.at(-1), ["navigate", null], "the final lesson must navigate to dashboard");

  for (const scenario of [
    { completed: true },
    { rule: "independent" },
    { rule: "after_submission" },
    { status: "pending_review" },
    { status: "revision_requested" }
  ]) {
    const skipped = await run(scenario);
    assert.strictEqual(skipped.result, false);
    assert.deepStrictEqual(skipped.calls, [], `must not auto-complete: ${JSON.stringify(scenario)}`);
  }

  const guarded = await run();
  assert.strictEqual(await autoCompleteAcceptedHomework(guarded.options), false, "guard must prevent a second execution");
  assert.strictEqual(guarded.calls.filter(([name]) => name === "markCompleted").length, 1);

  const failed = await run({ fail: true });
  assert.strictEqual(failed.result, false);
  assert.strictEqual(failed.guard.started, true, "failed attempts must not retry forever");
  assert.deepStrictEqual(failed.calls, [
    ["starting"], ["markCompleted", "lesson-1"], ["error", "TypeError"]
  ], "a persistence error must be logged without navigation");

  assert.strictEqual(shouldAutoCompleteHomework(false, homework("after_approval", "accepted")), true);
  assert(!completionSource.includes("setInterval("), "lesson auto-completion must not poll");
  assert(!completionSource.includes("Realtime"), "lesson auto-completion must not add Realtime");
}

testAutoCompletion().then(function () {
  console.log("Homework gate regression assertions passed");
}).catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
