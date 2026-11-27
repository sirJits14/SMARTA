// Learner photo rules shared by SIMS, the Parent App and Functions (spec 2026-11-27).
export const PHOTO_SIZE = 600;
export const PHOTO_MIN_SIZE = 300;
export const PHOTO_MAX_BYTES = 200 * 1024;
export const PHOTO_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.4];
export const MAX_ZOOM = 4;
export const photoPath = (studentId) => `student_photos/${studentId}.jpg`;

const between = (n, low, high) => Math.min(high, Math.max(low, n));
const side = (dim, zoom) => Math.min(dim.width, dim.height) / zoom;

export const initialView = (dim) => ({ zoom: 1, cx: dim.width / 2, cy: dim.height / 2 });

// A view is a zoom plus the centre of the square, in image pixels.
export function clampView(dim, view) {
  const zoom = between(view.zoom, 1, MAX_ZOOM);
  const half = side(dim, zoom) / 2;
  return { zoom, cx: between(view.cx, half, dim.width - half), cy: between(view.cy, half, dim.height - half) };
}

export function cropRect(dim, view) {
  const { zoom, cx, cy } = clampView(dim, view);
  const size = side(dim, zoom);
  return { sx: cx - size / 2, sy: cy - size / 2, size };
}

// (dx, dy) is how far the pointer moved on a square preview viewportPx wide.
export function dragView(dim, view, dx, dy, viewportPx) {
  const scale = side(dim, clampView(dim, view).zoom) / viewportPx;
  return clampView(dim, { ...view, cx: view.cx - dx * scale, cy: view.cy - dy * scale });
}

export async function compressToLimit(encode, maxBytes = PHOTO_MAX_BYTES) {
  for (const quality of PHOTO_QUALITIES) {
    const out = await encode(quality);
    if (out && out.size <= maxBytes) return out;
  }
  throw new Error('This photo is too large to save. Try another one.');
}

// Reads the frame size from a JPEG's start-of-frame segment; null if absent.
function jpegSize(bytes) {
  let at = 2;
  while (at + 8 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  return null;
}

export function photoBytesError(bytes) {
  if (bytes.length > PHOTO_MAX_BYTES) return 'The photo must be 200 KB or smaller.';
  const isJpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const size = isJpeg ? jpegSize(bytes) : null;
  if (!size) return 'The photo must be a JPEG image.';
  if (size.width !== size.height) return 'The photo must be square.';
  if (size.width > PHOTO_SIZE) return 'The photo must be at most 600 pixels wide.';
  if (size.width < PHOTO_MIN_SIZE) return 'The photo is too small. Use a clearer picture.';
  return '';
}
