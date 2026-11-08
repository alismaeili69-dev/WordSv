// Makes an element swipeable left/right with pointer events (works with touch and mouse).
// While dragging, the card tilts and tints green (right) or red (left); released short of the
// threshold it springs back, past it (or flicked fast) it flies off.

const THRESHOLD = 90;
const FLICK = 0.6; // px per ms
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function makeSwipeable(el, { onLeft, onRight, onTap }) {
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, horizontal = false, pointerId = null;
  let lastX = 0, lastT = 0, vx = 0, flying = false;

  const hintL = el.querySelector('.hint-left');
  const hintR = el.querySelector('.hint-right');

  function setHints(x) {
    const p = Math.min(Math.abs(x) / THRESHOLD, 1);
    if (hintR) { hintR.style.opacity = x > 0 ? p : 0; hintR.style.transform = `rotate(-10deg) scale(${x > 0 ? 0.8 + p * 0.2 : 0.8})`; }
    if (hintL) { hintL.style.opacity = x < 0 ? p : 0; hintL.style.transform = `rotate(10deg) scale(${x < 0 ? 0.8 + p * 0.2 : 0.8})`; }
    el.style.setProperty('--pr', x > 0 ? p : 0);
    el.style.setProperty('--pl', x < 0 ? p : 0);
  }

  el.addEventListener('pointerdown', (e) => {
    if (flying || e.target.closest('button')) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX; startY = e.clientY; dx = 0; vx = 0; lastT = performance.now();
    dragging = true; decided = false; horizontal = false;
    el.style.transition = 'none';
    el.style.animation = 'none'; // a running entrance animation would fight the drag
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!decided && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      decided = true;
      horizontal = Math.abs(mx) > Math.abs(my);
      if (horizontal) el.setPointerCapture(pointerId);
    }
    if (!horizontal) return;
    e.preventDefault();
    const now = performance.now();
    vx = (e.clientX - lastX) / Math.max(1, now - lastT);
    lastX = e.clientX; lastT = now;
    dx = mx;
    el.style.transform = `translate3d(${dx}px, ${Math.abs(dx) * 0.04}px, 0) rotate(${dx / 20}deg)`;
    setHints(dx);
  });

  function springBack() {
    el.style.transition = reduced() ? 'none' : 'transform .5s cubic-bezier(.34,1.56,.64,1), background-color .3s';
    el.style.transform = '';
    setHints(0);
  }

  function end(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    const flick = Math.abs(vx) > FLICK && Math.sign(vx) === Math.sign(dx) && Math.abs(dx) > 30;
    if (horizontal && (Math.abs(dx) > THRESHOLD || flick)) {
      fly(dx > 0 ? 'right' : 'left');
    } else {
      springBack();
      if (!decided && onTap) onTap();
    }
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { if (!horizontal) { dragging = false; springBack(); } else end(e); });

  function fly(dir) {
    if (flying) return;
    flying = true;
    const x = (dir === 'right' ? 1 : -1) * (window.innerWidth + 120);
    setHints(dir === 'right' ? THRESHOLD : -THRESHOLD);
    if (reduced()) {
      el.style.transition = 'opacity .12s';
      el.style.opacity = '0';
      setTimeout(() => (dir === 'right' ? onRight() : onLeft()), 120);
      return;
    }
    el.style.transition = 'transform .34s cubic-bezier(.4,0,.9,.6), opacity .34s ease-in';
    el.style.transform = `translate3d(${x}px, 40px, 0) rotate(${x / 22}deg)`;
    el.style.opacity = '0.2';
    setTimeout(() => (dir === 'right' ? onRight() : onLeft()), 240);
  }

  return { fly };
}
