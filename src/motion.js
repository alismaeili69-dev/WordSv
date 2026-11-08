// Small motion helpers shared by the app and the Moments screens.

export const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// Slide the page in the direction of travel. Uses the View Transitions API when the browser has it
// (old page slides out while the new one slides in), otherwise just slides the new page in.
export function pageTransition(update, dir) {
  const root = document.documentElement;
  if (reducedMotion()) { update(); return; }
  root.dataset.dir = dir;
  if (document.startViewTransition) {
    try {
      const vt = document.startViewTransition(update);
      vt.finished.finally(() => { if (root.dataset.dir === dir) delete root.dataset.dir; });
      return;
    } catch { /* fall through */ }
  }
  update();
  const v = document.getElementById('view');
  v.classList.remove('page-in');
  void v.offsetWidth; // restart the animation
  v.classList.add('page-in');
  clearTimeout(pageTransition.t);
  pageTransition.t = setTimeout(() => { v.classList.remove('page-in'); delete root.dataset.dir; }, 450);
}

// Play an element's closing animation (CSS `.closing`), then remove it.
export function closeOverlay(el, ms = 260) {
  if (!el || !el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  el.classList.add('closing');
  el.style.pointerEvents = 'none';
  setTimeout(() => el.remove(), ms);
}

// Fade out a toast-like element, then remove it.
export function fadeAway(el, ms = 300) {
  if (!el || !el.isConnected) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), reducedMotion() ? 0 : ms);
}

export const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
