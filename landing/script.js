/**
 * Watermark Landing Page — Interactive Scripts
 *
 * Contract: nothing is hidden until this file has actually run. The first
 * statement both opts into the reveal styles and upgrades the header into the
 * fixed bar with a mobile menu toggle, so a blocked, empty or failing script.js
 * leaves the page fully readable.
 */

/* =========================================================================
   1. Reveal-on-Scroll Animations
   ========================================================================= */
document.documentElement.classList.add("reveal-on", "nav-ready");

document.addEventListener("DOMContentLoaded", () => {
  const revealElements = document.querySelectorAll(".reveal");
  const revealAll = () => revealElements.forEach((el) => el.classList.add("active"));

  try {
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("active");
              observer.unobserve(entry.target);
            }
          });
        },
        // A short element (the hero mockup inside a tall section) can only ever
        // show a sliver at the fold, so the trigger is "any sliver is on screen".
        { threshold: 0, rootMargin: "0px 0px -8% 0px" }
      );

      revealElements.forEach((el) => observer.observe(el));
    } else {
      // Older browsers without IntersectionObserver.
      revealAll();
    }
  } catch (error) {
    // Never let a reveal failure leave the page blank.
    revealAll();
  }

  // Slow first paint or a throttled frame can defer the observer's first
  // callback; a page of opacity:0 sections is worse than no animation.
  setTimeout(() => {
    if (document.querySelectorAll(".reveal.active").length === 0) revealAll();
  }, 1200);

  /* =========================================================================
     2. Mobile Navigation Menu
     ========================================================================= */
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("nav-menu");

  if (toggle && menu) {
    const setOpen = (open) => {
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    const desktop = window.matchMedia("(min-width: 768px)");
    desktop.addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });
  }

  /* =========================================================================
     3. Smooth In-Page Scrolling
     CSS keeps `scroll-behavior: auto` so the page still jumps correctly
     without this script; the animation is an enhancement.
     ========================================================================= */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const id = link.getAttribute("href");
    const target = id.length > 1 ? document.getElementById(id.slice(1)) : null;
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({
      behavior: reduceMotion.matches ? "auto" : "smooth",
      block: "start",
    });

    // Keep the URL deep-linkable; file:// documents reject history updates.
    try {
      history.replaceState(null, "", id);
    } catch {
      /* no history access (file://); the scroll itself already happened */
    }

    // Move focus with the viewport, as a skip link must.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
});
