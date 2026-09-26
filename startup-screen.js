(function () {
  "use strict";

  var ROOT_ID = "mindcoreStartupScreen";
  function t(key) {
    return window.MindCoreI18n ? window.MindCoreI18n.t(key) : key;
  }

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "mindcore-startup-screen";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = [
      '<div class="mindcore-startup-screen__content">',
      '<div class="mindcore-startup-screen__spinner" aria-hidden="true"></div>',
      '<p class="mindcore-startup-screen__text">' + t("startup.checking") + '</p>',
      '</div>'
    ].join("");
    document.body.appendChild(root);
    return root;
  }

  function setText(root, text) {
    var textNode = root.querySelector(".mindcore-startup-screen__text");
    if (textNode) textNode.textContent = text;
  }

  window.StartupScreen = {
    show: function () {
      var root = ensureRoot();
      root.classList.remove("is-error");
      setText(root, t("startup.checking"));
      root.classList.add("is-visible");
      root.removeAttribute("hidden");
      document.body.classList.add("mindcore-startup-open");
    },
    hide: function () {
      var root = document.getElementById(ROOT_ID);
      if (root) {
        root.classList.remove("is-visible", "is-error");
        root.setAttribute("hidden", "");
      }
      document.body.classList.remove("mindcore-startup-open");
    },
    showError: function () {
      var root = ensureRoot();
      root.classList.add("is-visible", "is-error");
      root.removeAttribute("hidden");
      setText(root, t("startup.error"));
      document.body.classList.add("mindcore-startup-open");
    },
    refresh: function () {
      var root = document.getElementById(ROOT_ID);
      if (root) setText(root, t(root.classList.contains("is-error") ? "startup.error" : "startup.checking"));
    }
  };
})();
