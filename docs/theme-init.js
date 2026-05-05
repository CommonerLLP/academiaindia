// Apply theme synchronously before paint so there's no light-mode flash on
// reload. Must run before the body renders. Source of truth:
// localStorage["hei.theme"]; falls back to OS pref.
//
// Lives in its own file so CSP can lock script-src to 'self' without
// needing 'unsafe-inline'. Keep this file < 1 KB and dependency-free.
(function () {
  try {
    const saved = localStorage.getItem("hei.theme");
    const t = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (_) {
    // localStorage may throw on some browsers in private mode; fail silently.
  }
})();
