// Turning a camera/library photo into a small story image (no server needed).
// The photo is cropped to 9:16, resized and re-encoded as JPEG in the browser. Re-encoding
// also drops EXIF metadata such as GPS location. The result is a data URL small enough to
// live inside the moment's Firestore document (documents are limited to 1 MiB).

export const STORY_W = 720;
export const STORY_H = 1280;
export const MAX_CHARS = 380000; // ~280 KB of JPEG as base64

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file could not be opened as an image.')); };
    img.src = url;
  });
}

// where to draw an image of size iw×ih into W×H so it covers (or fits inside) the area
export function placement(iw, ih, W, H, mode = 'cover', focusY = 0.5) {
  const scale = mode === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
  const w = iw * scale, h = ih * scale;
  const x = (W - w) / 2;
  const y = mode === 'cover' ? Math.min(0, Math.max(H - h, (H - h) * focusY)) : (H - h) / 2;
  return { x: x || 0, y: y || 0, w, h };
}

function blurredBackground(ctx, img, W, H) {
  // cheap, widely supported blur: draw tiny, then scale up with smoothing
  const small = document.createElement('canvas');
  small.width = 18; small.height = 32;
  const s = small.getContext('2d');
  const p = placement(img.naturalWidth, img.naturalHeight, 18, 32, 'cover');
  s.drawImage(img, p.x, p.y, p.w, p.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fillRect(0, 0, W, H);
}

export function renderStoryImage(img, { fit = 'cover', focusY = 0.5, maxChars = MAX_CHARS } = {}) {
  let W = STORY_W, H = STORY_H;
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (fit === 'contain') blurredBackground(ctx, img, W, H);
    const p = placement(img.naturalWidth, img.naturalHeight, W, H, fit, focusY);
    ctx.drawImage(img, p.x, p.y, p.w, p.h);
    for (let q = 0.82; q >= 0.5; q -= 0.08) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= maxChars) return data;
    }
    W = Math.round(W * 0.8); H = Math.round(H * 0.8);
  }
  throw new Error('This photo could not be made small enough. Try another one.');
}

export function isStoryPhoto(s) {
  return typeof s === 'string' && s.startsWith('data:image/jpeg;base64,') && s.length <= 460000;
}
