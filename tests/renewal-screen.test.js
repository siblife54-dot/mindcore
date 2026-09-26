"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toLowerCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.className = "";
    this.href = "";
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) delete this.listeners[type];
  }

  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  closest(selector) {
    if (selector === "button[data-option-id]") {
      return this.tagName === "button" && this.dataset.optionId ? this : null;
    }
    if (selector === "a.renewal-screen__back") {
      return this.tagName === "a" && this.className.split(/\s+/).includes("renewal-screen__back") ? this : null;
    }
    if (selector === "a.renewal-screen__support") {
      return this.tagName === "a" && this.className.split(/\s+/).includes("renewal-screen__support") ? this : null;
    }
    return null;
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = String(value);
  }

  get innerHTML() {
    return this._innerHTML || "";
  }
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function loadRenewalScreen() {
  const context = {
    URL,
    Intl,
    Date,
    Map,
    Math,
    Number,
    Promise,
    String,
    document: { createElement: (tagName) => new FakeElement(tagName) },
    fetch: null,
    window: { location: { assign() {} } }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["locales/ru.js", "locales/tr.js", "localization.js"]) {
    vm.runInContext(fs.readFileSync(path.join(rootDir, file), "utf8"), context);
  }
  context.window.MindCoreI18n = context.MindCoreI18n;
  vm.runInContext(fs.readFileSync(path.join(rootDir, "renewal-screen.js"), "utf8"), context);
  return context;
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Function ${name} was not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Function ${name} is incomplete`);
}

function option(overrides) {
  return Object.assign({
    id: "00000000-0000-0000-0000-000000000001",
    title: "Продление",
    days_to_add: 30,
    price_minor: 99000,
    currency: "RUB",
    description: null,
    sort_order: 1
  }, overrides || {});
}

function config(overrides) {
  return Object.assign({
    ok: true,
    enabled: true,
    settings: { show_before_days: 7, support_url: null, support_label: "Поддержка" },
    options: [option()]
  }, overrides || {});
}

function expertContactConfig(overrides) {
  return Object.assign({
    ok: true,
    enabled: true,
    mode: "expert_contact",
    settings: {
      show_before_days: 7,
      support_url: "https://t.me/expert",
      support_label: "Написать эксперту"
    },
    options: []
  }, overrides || {});
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function run() {
  const appSource = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
  const configFunctionSource = fs.readFileSync(path.join(rootDir, "supabase/functions/get-renewal-config/index.ts"), "utf8");
  assert.match(configFunctionSource, /renewal_enabled, access_expired_button_text, access_expired_button_url/,
    "manual renewal must reuse the expiry-screen contact fields");
  assert.match(configFunctionSource, /mode: "expert_contact"/,
    "disabled paid renewal must expose expert-contact mode when configured");
  assert.match(configFunctionSource, /\.select\("show_before_days"\)/,
    "manual renewal warning must reuse course_renewal_settings.show_before_days");
  const eligibilityContext = {
    window: { RenewalScreen: {} },
    COURSE_SETTINGS: { access_control_enabled: true },
    PRODUCT_USER: null,
    isPreviewMode: () => false
  };
  vm.createContext(eligibilityContext);
  vm.runInContext([
    extractFunction(appSource, "getAccessClassification"),
    extractFunction(appSource, "shouldLoadRenewalConfig"),
    "this.shouldLoad = shouldLoadRenewalConfig;"
  ].join("\n"), eligibilityContext);

  eligibilityContext.PRODUCT_USER = { id: "user", status: "active", access_expires_at: null };
  assert.equal(eligibilityContext.shouldLoad({ allowed: true, reason: "allowed" }), false, "active + null must be indefinite");
  eligibilityContext.PRODUCT_USER = { id: "user", status: "expired", access_expires_at: null };
  assert.equal(eligibilityContext.shouldLoad({ allowed: false, reason: "status_expired" }), true, "expired status + null must load renewal");
  eligibilityContext.PRODUCT_USER = { id: "user", status: "blocked", access_expires_at: null };
  assert.equal(eligibilityContext.shouldLoad({ allowed: false, reason: "status_blocked" }), false, "blocked + null must not load renewal");

  let telegramOpenUrl = null;
  let telegramContactUrl = null;
  const navigationContext = {
    URL,
    globalThis: { Telegram: { WebApp: {
      openLink: (url) => { telegramOpenUrl = url; },
      openTelegramLink: (url) => { telegramContactUrl = url; }
    } } },
    window: { location: { assign() { throw new Error("assign must not be used for Telegram"); } } }
  };
  vm.createContext(navigationContext);
  vm.runInContext([
    extractFunction(appSource, "openRenewalPaymentUrl"),
    extractFunction(appSource, "openExpertContactUrl"),
    "this.openPayment = openRenewalPaymentUrl;",
    "this.openContact = openExpertContactUrl;"
  ].join("\n"), navigationContext);
  assert.equal(navigationContext.openPayment("https://pay.example"), "external");
  assert.equal(telegramOpenUrl, "https://pay.example");
  assert.equal(navigationContext.openContact("https://t.me/expert"), "external");
  assert.equal(telegramContactUrl, "https://t.me/expert");
  assert.equal(navigationContext.openContact("https://example.com/expert"), "default", "non-Telegram links must use normal navigation");
  let assignedByApp = null;
  navigationContext.globalThis.Telegram = null;
  navigationContext.window.location.assign = (url) => { assignedByApp = url; };
  assert.equal(navigationContext.openPayment("https://pay.example/current"), "current");
  assert.equal(assignedByApp, "https://pay.example/current");
  assert.equal(navigationContext.openContact("https://t.me/expert"), "default", "browser fallback must keep the anchor navigation");

  let expiredContactOpened = null;
  let expiredClickHandler = null;
  const expiredLink = { href: "https://t.me/expert", addEventListener(type, handler) { if (type === "click") expiredClickHandler = handler; } };
  const expiredHost = { innerHTML: "", querySelector: () => expiredLink };
  const expiredScreenContext = {
    RENEWAL_CONFIG: { mode: "expert_contact" },
    getAccessExpiredScreenModel: () => ({ title: "Завершён", text: "Напишите эксперту", buttonText: "Написать", buttonUrl: "https://t.me/expert", accessExpiresAt: null }),
    formatAccessDate: () => "",
    escapeHtml: (value) => String(value),
    escapeAttr: (value) => String(value),
    openExpertContactUrl: (url) => { expiredContactOpened = url; return "external"; }
  };
  vm.createContext(expiredScreenContext);
  vm.runInContext(extractFunction(appSource, "renderAccessExpiredScreen") + "\nthis.renderExpired = renderAccessExpiredScreen;", expiredScreenContext);
  expiredScreenContext.renderExpired(expiredHost, { allowed: false });
  let expiredDefaultPrevented = false;
  assert.equal(typeof expiredClickHandler, "function");
  expiredClickHandler({ preventDefault() { expiredDefaultPrevented = true; } });
  assert.equal(expiredContactOpened, "https://t.me/expert", "expired expert contact must use the same Telegram navigation");
  assert.equal(expiredDefaultPrevented, true);

  const context = loadRenewalScreen();
  const RenewalScreen = context.window.RenewalScreen;
  assert.equal(RenewalScreen.formatPrice(99000, "RUB").replace(/\s/g, " "), "990 ₽");
  assert.equal(RenewalScreen.formatPrice(99050, "RUB").replace(/\s/g, " "), "990,50 ₽");
  assert.equal(RenewalScreen.formatPrice(169000, "RUB").replace(/\s/g, " "), "1 690 ₽");
  assert.equal(RenewalScreen.formatPrice(0, "RUB").replace(/\s/g, " "), "0 ₽");
  assert.equal(RenewalScreen.normalizeConfig(config({ options: [option({ price_minor: Number.MAX_SAFE_INTEGER + 1 })] })), null);
  assert.equal(RenewalScreen.normalizeConfig(config({ options: [option({ price_minor: 1000000000001 })] })), null);
  assert.equal(RenewalScreen.normalizeConfig(expertContactConfig()).mode, "expert_contact");
  assert.equal(RenewalScreen.normalizeConfig(expertContactConfig({ settings: { show_before_days: 7, support_url: "javascript:alert(1)", support_label: "Эксперт" } })), null);

  const expertHost = new FakeElement("section");
  let openedExpertUrl = null;
  assert.equal(RenewalScreen.render({
    mode: "warning",
    container: expertHost,
    courseId: "course",
    productUser: { id: "user" },
    renewalConfig: expertContactConfig(),
    onSupportNavigate: (url) => { openedExpertUrl = url; return "external"; }
  }), true);
  const expertRoot = expertHost.children[0];
  assert.equal(findElement(expertRoot, (element) => element.className === "renewal-screen__tariffs"), null, "expert warning must not show tariffs");
  assert.equal(findElement(expertRoot, (element) => element.tagName === "button"), null, "expert warning must not create a request button");
  const expertLink = findElement(expertRoot, (element) => element.className.split(/\s+/).includes("renewal-screen__support"));
  assert.equal(expertLink.href, "https://t.me/expert");
  assert.equal(expertLink.textContent, "Написать эксперту");
  assert.equal(expertLink.className.split(/\s+/).includes("btn-primary"), true, "expert link must use the primary themed button");
  let expertDefaultPrevented = false;
  expertRoot.listeners.click({ target: expertLink, preventDefault() { expertDefaultPrevented = true; } });
  assert.equal(openedExpertUrl, "https://t.me/expert");
  assert.equal(expertDefaultPrevented, true, "Telegram navigation must suppress duplicate anchor navigation");
  assert.equal(RenewalScreen.render({
    mode: "expired",
    container: new FakeElement("section"),
    courseId: "course",
    productUser: { id: "user" },
    renewalConfig: expertContactConfig()
  }), false, "expired access must keep using the course_settings screen");

  const lessonHost = new FakeElement("section");
  let backTarget = null;
  assert.equal(RenewalScreen.render({
    mode: "expired",
    container: lessonHost,
    courseId: "course_alpha",
    productUser: { id: "user" },
    accessExpiresAt: null,
    renewalConfig: config(),
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon",
    backUrl: "./index.html?course=course_alpha",
    onBack: (url) => { backTarget = url; }
  }), true);
  const lessonRoot = lessonHost.children[0];
  const backLink = findElement(lessonRoot, (element) => element.tagName === "a");
  assert.equal(findElement(lessonRoot, (element) => element.className === "renewal-screen__date"), null, "null expiry must not render a date");
  assert.equal(backLink.textContent, "Назад в кабинет");
  assert.equal(backLink.href, "./index.html?course=course_alpha");
  lessonRoot.listeners.click({ target: backLink, preventDefault() {} });
  assert.equal(backTarget, "./index.html?course=course_alpha");

  let requestCount = 0;
  context.fetch = async () => {
    requestCount += 1;
    return { ok: true, status: 200, json: async () => ({ ok: true, created: true, payment_url: "https://pay.example" }) };
  };
  const telegramHost = new FakeElement("section");
  RenewalScreen.render({
    container: telegramHost,
    courseId: "course",
    productUser: { id: "user" },
    renewalConfig: config(),
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon",
    onNavigate: () => "external"
  });
  const telegramRoot = telegramHost.children[0];
  const telegramButton = findElement(telegramRoot, (element) => element.tagName === "button");
  telegramRoot.listeners.click({ target: telegramButton });
  await flush();
  assert.equal(telegramRoot.attributes["aria-busy"], "false", "external navigation must clear busy");
  assert.equal(telegramButton.disabled, false, "external navigation must unlock buttons");

  requestCount = 0;
  const assignedUrls = [];
  context.window.location.assign = (url) => { assignedUrls.push(url); };
  const browserHost = new FakeElement("section");
  RenewalScreen.render({
    container: browserHost,
    courseId: "course",
    productUser: { id: "user" },
    renewalConfig: config(),
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon"
  });
  const browserRoot = browserHost.children[0];
  const browserButton = findElement(browserRoot, (element) => element.tagName === "button");
  browserRoot.listeners.click({ target: browserButton });
  await flush();
  browserRoot.listeners.click({ target: browserButton });
  assert.equal(requestCount, 1, "current-page navigation must remain busy and prevent a second request");
  assert.deepEqual(assignedUrls, ["https://pay.example"]);

  const warningHost = new FakeElement("section");
  const lessonsHost = new FakeElement("section");
  const order = [];
  const expiredContext = {
    document: {
      body: { getAttribute: () => "dashboard" },
      getElementById(id) {
        if (id === "renewalBannerHost") return warningHost;
        if (id === "lessonsContainer") return lessonsHost;
        return null;
      }
    },
    window: { RenewalScreen: { destroy: (host) => { assert.equal(host, warningHost); order.push("destroy"); } } },
    getAccessClassification: () => "expired_status",
    setDashboardCourseContentBlocked: () => order.push("block"),
    renderRenewal: () => { order.push("render"); return true; },
    renderAccessExpiredScreen: () => order.push("fallback"),
    wireLessonBackLinks() {}
  };
  vm.createContext(expiredContext);
  vm.runInContext(extractFunction(appSource, "renderExpiredAccess") + "\nthis.renderExpiredAccess = renderExpiredAccess;", expiredContext);
  expiredContext.renderExpiredAccess({ allowed: false, reason: "status_expired" });
  assert.deepEqual(order, ["destroy", "block", "render"], "warning must be destroyed before expired render");

  console.log("Renewal regression tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
