import { PHOTO_SIZE, cropRect, dragView, compressToLimit } from '../../shared/studentPhoto.js';

// Browser side of the learner photo crop. The geometry lives in shared/studentPhoto.js.
const PREVIEW_PX = 280;
const KEY_STEP = 8;
const ARROWS = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };

// A decoded file reports its own size as natural*; a captured frame is a canvas.
export const imageSize = (image) => ({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });

export function drawCrop(canvas, image, view) {
  const context = canvas.getContext('2d');
  const { sx, sy, size } = cropRect(imageSize(image), view);
  // JPEG has no transparency, so see-through parts of a PNG become white.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error('This photo could not be prepared. Try another one.'));
  reader.readAsDataURL(blob);
});

// The 600 pixel JPEG that is saved, as base64 without the data URL prefix.
export async function exportPhoto(image, view) {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  drawCrop(canvas, image, view);
  return toBase64(await compressToLimit(
    (quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))));
}

// Decodes the whole file once; every later crop draws from this one picture.
export async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The file holds no picture.');
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function captureFrame(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Returns the very same view when nothing moves, so callers can skip the change.
// A preview with no width (not laid out yet) cannot be measured against.
export function panView(image, view, dx, dy, viewportPx) {
  if (!(viewportPx > 0)) return view;
  const next = dragView(imageSize(image), view, dx, dy, viewportPx);
  return next.cx === view.cx && next.cy === view.cy && next.zoom === view.zoom ? view : next;
}

// Arrow keys move the picture as a short drag would; null for any other key.
export function keyView(image, view, key) {
  return Object.hasOwn(ARROWS, key) ? panView(image, view, ...ARROWS[key], PREVIEW_PX) : null;
}
