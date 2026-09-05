/* ============================================================
   sotiris.site — shared script
   ------------------------------------------------------------
   Loaded on every page after the Supabase UMD bundle and before
   the page's own <script>. Everything here was previously copied
   into each page by hand.

   Uses `var` and function declarations deliberately: these are
   classic scripts, and a page that still declares one of these
   names should override it rather than throw a redeclaration
   error partway through a refactor.
   ============================================================ */

/* ---------- Supabase ----------
   The client is only built if the UMD bundle actually loaded, so
   pages that don't talk to the database (the landing page, the
   sign-up chooser) can load this file without erroring. */
var SUPABASE_URL = 'https://ulhmvcagmlrfplwhdmid.supabase.co';
var SUPABASE_KEY = 'sb_publishable_wetKL2PMoCSDzBaAWIrtHQ_iz1Lkci2';
var supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

/* ---------- Form errors ----------
   Errors belong next to the form, not in a browser dialog you have
   to dismiss before you can see the field you got wrong.

   Pass the id of the field to fix and focus lands there. Pass
   nothing — because there is no single field at fault — and focus
   lands on the message itself, which is role="alert", so a screen
   reader reads it and a keyboard user is left beside the form. */
function showError(message, focusId) {
  var box = document.getElementById('form-error');
  if (!box) return;
  box.textContent = message;
  box.style.display = 'block';

  var field = focusId ? document.getElementById(focusId) : null;
  if (field) { field.focus(); return; }

  box.setAttribute('tabindex', '-1');
  box.focus();
}

/* ---------- Reduced motion ----------
   Read live rather than once at load: someone can turn the setting
   on while the page is open, and every page used to miss that. */
var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
var prefersReducedMotion = reducedMotionQuery.matches;
reducedMotionQuery.addEventListener('change', function (e) {
  prefersReducedMotion = e.matches;
});

/* ---------- Reveal on scroll ----------
   One observer for the whole page. The landing page used to build four, with
   four different thresholds (0.25 / 0.2 / 0.3 / 0.15) for what is conceptually
   the same question: is this on screen yet?

   Callbacks fire once, then the element is dropped. If IntersectionObserver is
   missing, everything runs immediately rather than never. */
var revealJobs = new WeakMap();
var revealObserver = null;

function whenVisible(el, fn) {
  if (!el) return;
  if (!('IntersectionObserver' in window)) { fn(el); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        revealObserver.unobserve(entry.target);
        var job = revealJobs.get(entry.target);
        if (job) { revealJobs.delete(entry.target); job(entry.target); }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
  }
  revealJobs.set(el, fn);
  revealObserver.observe(el);
}
