// Makes an element swipeable left/right with pointer events (works with touch and mouse).

const THRESHOLD = 90;

export function makeSwipeable(el, { onLeft, onRight, onTap }) {
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, horizontal = false, pointerId = null;

  const hintL = el.querySelector('.hint-left');
  const hintR = el.querySelector('.hint-right');

  function setHints(x) {
    const p = Math.min(Math.abs(x) / THRESHOLD, 1);
    if (hintR) hintR.style.opacity = x > 0 ? p : 0;
    if (hintL) hintL.style.opacity = x < 0 ? p : 0;
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    pointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY; dx = 0;
    dragging = true; decided = false; horizontal = false;
    el.style.transition = 'none';
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
    dx = mx;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    setHints(dx);
  });

  function end(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    el.style.transition = 'transform .25s ease, opacity .25s ease';
    if (horizontal && Math.abs(dx) > THRESHOLD) {
      fly(dx > 0 ? 'right' : 'left');
    } else {
      el.style.transform = '';
      setHints(0);
      if (!decided && onTap) onTap();
    }
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { if (!horizontal) { dragging = false; el.style.transform = ''; setHints(0); } else end(e); });

  function fly(dir) {
    el.style.transition = 'transform .25s ease, opacity .25s ease';
    const x = dir === 'right' ? window.innerWidth : -window.innerWidth;
    setHints(dir === 'right' ? 1 : -1);
    el.style.transform = `translateX(${x}px) rotate(${x / 18}deg)`;
    el.style.opacity = '0';
    setTimeout(() => (dir === 'right' ? onRight() : onLeft()), 220);
  }

  return { fly };
}
