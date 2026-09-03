/* Theme toggle.
   The initial theme is applied inline in <head>; this file only owns
   the button, so a failure here leaves the page correctly themed. */
(function () {
  "use strict";

  var root = document.documentElement;
  var btn = document.getElementById("theme");
  var text = document.getElementById("theme-text");
  if (!btn || !text) return;

  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    var set = root.dataset.theme;
    if (set === "dark" || set === "light") return set;
    return media.matches ? "dark" : "light";
  }

  function label() {
    // The button names the theme you would switch TO.
    var next = current() === "dark" ? "light" : "dark";
    text.textContent = next === "dark" ? "Dark" : "Light";
    btn.setAttribute("aria-label", "Switch to " + next + " theme");
  }

  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
    label();
  });

  // Follow the OS only while the visitor has made no explicit choice.
  media.addEventListener("change", function () {
    if (!root.dataset.theme) label();
  });

  label();
})();
