const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const adminJs = fs.readFileSync(path.join(root, "admin.js"), "utf8");

const managementSection = adminJs.match(/management:\s*\[([^\]]*)\]/);
assert(managementSection, "ADMIN_SECTIONS must define management tabs");

const managementTabs = Array.from(
  managementSection[1].matchAll(/["']([^"']+)["']/g),
  (match) => match[1]
);
assert(managementTabs.length > 0, "management must contain at least one tab");

for (const tab of managementTabs) {
  const panelPattern = new RegExp(
    `<section[^>]+data-admin-panel=["']${tab}["'][^>]*>([\\s\\S]*?)(?=<section[^>]+class=["'][^"']*admin-tab-panel|<aside class=["']admin-live-preview-column)`
  );
  const panel = adminHtml.match(panelPattern);
  assert(panel, `management panel "${tab}" must exist`);

  const localHeader = panel[1].match(/<header class=["'][^"']*admin-local-header[^"']*["'][^>]*>([\s\S]*?)<\/header>/);
  assert(localHeader, `management panel "${tab}" must have a local header`);
  assert(
    !/admin-card__eyebrow/.test(localHeader[1]),
    `management panel "${tab}" must not inherit an eyebrow; add one only through an explicit screen-specific contract`
  );
}

assert(!adminHtml.includes("Управление курсом"), "the legacy automatic management eyebrow must be removed");

console.log("admin management header tests passed");
