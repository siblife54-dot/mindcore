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
  `${helperSource}\nthis.gate = { getHomeworkGateState, buildHomeworkByLesson, getLessonHomeworkGateState };`,
  context
);
const { getHomeworkGateState, buildHomeworkByLesson, getLessonHomeworkGateState } = context.gate;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepStrictEqual(plain(getHomeworkGateState(null)), {
  satisfied: true, rule: "none", reason: "no_homework"
});
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

// Stage 6.3 is logic-only: gate helpers must not touch I/O or existing access/completion flows.
for (const forbidden of ["document", "fetch(", "localStorage", "APP_STORAGE", "completedLessons"]) {
  assert(!helperSource.includes(forbidden), `pure helpers must not reference ${forbidden}`);
}
const accessibilityStart = js.indexOf("  function getMaxCompletedDayNumber(");
const accessibilityEnd = js.indexOf("  function isDebugMode()", accessibilityStart);
const accessibilitySource = js.slice(accessibilityStart, accessibilityEnd);
assert(!/Homework|homework/.test(accessibilitySource), "accessibility behavior must not use Homework yet");

const completionStart = js.indexOf('var completeBtn = document.getElementById("completeBtn")');
const completionEnd = js.indexOf("void renderLessonHomework(lesson)", completionStart);
const completionSource = js.slice(completionStart, completionEnd);
assert(completionStart >= 0 && completionEnd > completionStart);
assert(!/HomeworkGate|getHomeworkGate/.test(completionSource), "lesson completion must not be gated yet");
assert(js.includes("await saveCompleted(completed)"), "completedLessons persistence must remain present");

for (const table of ["lesson_homeworks", "homework_submissions", "homework_attempts", "homework_attachments"]) {
  assert(!js.includes(`.from("${table}")`), `app.js must not directly access ${table}`);
}
assert(!helperSource.includes("supabase"), "gate helpers must not introduce backend access");

console.log("Homework gate regression assertions passed");
