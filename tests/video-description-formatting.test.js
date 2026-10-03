const assert = require("assert");
const fs = require("fs");

const admin = fs.readFileSync("admin.js", "utf8");
const adminCss = fs.readFileSync("admin.css", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

assert(admin.includes('contenteditable="true"'));
assert(admin.includes('data-command="bold"'));
assert(admin.includes('data-command="italic"'));
assert(admin.includes('data-command="underline"'));
assert(admin.includes('data-command="insertUnorderedList"'));
assert(admin.includes('data-command="insertOrderedList"'));
assert(admin.includes("descriptionInput.innerHTML"));
assert(admin.includes('document.execCommand("insertText", false'));

[admin, app].forEach((source) => {
  assert(source.includes("function sanitizeVideoDescription(value)"));
  assert(source.includes('var blocked = { SCRIPT: true, STYLE: true, IFRAME: true'));
  assert(source.includes('var allowed = { STRONG: "strong", B: "strong", EM: "em"'));
});

assert(app.includes("descriptionNode.innerHTML = sanitizeVideoDescription"));
assert(app.includes("'<div class=\"lesson-media__description\""));
assert(adminCss.includes(".video-description-input"));
assert(adminCss.includes("font-weight: 400"));
assert(styles.includes(".lesson-media__description"));

console.log("video description formatting checks passed");
