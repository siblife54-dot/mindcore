const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const admin = fs.readFileSync("admin.js", "utf8");
const adminCss = fs.readFileSync("admin.css", "utf8");
const app = fs.readFileSync("app.js", "utf8");

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity.toLowerCase() === "amp") return "&";
    if (entity.toLowerCase() === "lt") return "<";
    if (entity.toLowerCase() === "gt") return ">";
    if (entity.toLowerCase() === "quot") return '"';
    if (entity.toLowerCase() === "apos") return "'";
    return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === "x" ? 2 : 1), entity[1].toLowerCase() === "x" ? 16 : 10));
  });
}

function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

class TestNode {
  constructor(type, name, value) {
    this.nodeType = type;
    this.tagName = name || "";
    this.nodeValue = value || "";
    this.childNodes = [];
  }

  appendChild(node) {
    this.childNodes.push(node);
    return node;
  }

  get textContent() {
    return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = value ? [new TestNode(3, "", value)] : [];
  }

  get innerHTML() {
    return this.childNodes.map(serializeNode).join("");
  }

  set innerHTML(value) {
    this.childNodes = parseHtml(value).childNodes;
  }
}

function serializeNode(node) {
  if (node.nodeType === 3) return escapeText(node.nodeValue);
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "<br>";
  return `<${tag}>${node.innerHTML}</${tag}>`;
}

function parseHtml(value) {
  const root = new TestNode(11);
  const stack = [root];
  const tokenPattern = /<\/?[A-Za-z][^>]*>|[^<]+|</g;
  let token;
  while ((token = tokenPattern.exec(String(value)))) {
    const part = token[0];
    if (!part.startsWith("<") || part === "<") {
      stack[stack.length - 1].appendChild(new TestNode(3, "", decodeEntities(part)));
      continue;
    }
    const closing = /^<\//.test(part);
    const tagMatch = part.match(/^<\/?\s*([A-Za-z][\w-]*)/);
    if (!tagMatch) continue;
    const tag = tagMatch[1].toUpperCase();
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const element = new TestNode(1, tag);
    stack[stack.length - 1].appendChild(element);
    if (!/^(BR|IMG|HR|INPUT|META|LINK)$/.test(tag) && !/\/>$/.test(part)) stack.push(element);
  }
  return root;
}

const document = {
  createElement(tag) {
    if (tag === "template") {
      const template = new TestNode(1, "TEMPLATE");
      template.content = new TestNode(11);
      Object.defineProperty(template, "innerHTML", {
        get() { return template.content.innerHTML; },
        set(value) { template.content.childNodes = parseHtml(value).childNodes; }
      });
      return template;
    }
    return new TestNode(1, tag.toUpperCase());
  },
  createTextNode(value) { return new TestNode(3, "", value); }
};

const functionMatch = admin.match(/function sanitizeVideoDescription\(value\) \{[\s\S]*?\n  \}\n\n  function escapeHtml/);
assert(functionMatch, "sanitizeVideoDescription must exist");
const functionSource = functionMatch[0].replace(/\n\n  function escapeHtml$/, "");
const sanitize = vm.runInNewContext(`(${functionSource})`, { document });

const cases = [
  ["A & B", "A &amp; B"],
  ["A &amp; B", "A &amp; B"],
  ["2 < 3 > 1", "2 &lt; 3 &gt; 1"],
  ["Обычный текст", "Обычный текст"],
  ["строка 1\nстрока 2", "строка 1<br>строка 2"],
  ["<b>жирный</b> <i>курсив</i> <u>линия</u>", "<strong>жирный</strong> <em>курсив</em> <u>линия</u>"],
  ["<ul><li>один</li></ul><ol><li>два</li></ol>", "<ul><li>один</li></ul><ol><li>два</li></ol>"],
  ["<br>", ""],
  ["<div><br></div>", ""],
  ['<p onclick="alert(1)">текст</p><script>alert(1)</script><img src=x onerror="alert(1)">', "<p>текст</p>"]
];

cases.forEach(([input, expected]) => {
  assert.strictEqual(sanitize(input), expected, input);
  assert.strictEqual(sanitize(sanitize(input)), expected, `idempotence: ${input}`);
});

assert(admin.includes("var payload = { video_description: normalizedDescription.trim() ? normalizedDescription : null }"));
assert(app.includes("var description = sanitizeVideoDescription((block && block.video_description) || \"\")"));
assert(adminCss.includes("background: var(--admin-surface)"));
assert(adminCss.includes("background: var(--admin-bg-elevated)"));
const videoDescriptionCss = adminCss.slice(adminCss.indexOf(".video-description-field"), adminCss.indexOf(".admin-advanced"));
assert(!videoDescriptionCss.includes("#fff"));
assert(!videoDescriptionCss.includes("#fbfcff"));
assert(!videoDescriptionCss.includes("rgba(118,87,230"));

console.log("video description formatting checks passed");
