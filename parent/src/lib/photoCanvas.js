// Parent App side of the learner photo crop. Drawing, exporting and moving are shared
// with SIMS; opening a file is handled here for phones.
import { MAX_ZOOM, PHOTO_SIZE } from '../../../shared/studentPhoto.js';
import { imageSize, keyView } from '../../../shared/photoCanvas.js';

export { imageSize, drawCrop, exportPhoto, captureFrame, panView, keyView } from '../../../shared/photoCanvas.js';

export const DECODE_TIMEOUT_MS = 15000;
// The closest zoom cuts a quarter of the short side, which must still hold a full-size photo.
export const SOURCE_SIDE = PHOTO_SIZE * MAX_ZOOM;
// iOS Safari refuses canvases over 16,777,216 pixels.
export const SOURCE_PIXELS = 16_000_000;

export function fittedSize({ width, height }) {
  const scale = Math.min(1, SOURCE_SIDE / Math.min(width, height), Math.sqrt(SOURCE_PIXELS / (width * height)));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Resolves on whichever answers first, decode() or the load event. Some browsers
// leave decode() waiting, or refuse a large picture that loads fine, so only the
// error event or the time limit counts as a failure.
const opened = (image, url) => new Promise((resolve, reject) => {
  let timer;
  const settle = (error) => {
    clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    if (error) reject(new Error(error)); else resolve();
  };
  timer = setTimeout(() => settle('The picture did not open in time.'), DECODE_TIMEOUT_MS);
  image.onload = () => settle();
  image.onerror = () => settle('The file holds no picture.');
  image.src = url;
  image.decode?.().then(() => settle(), () => {});
});

// A camera original is far larger than the saved photo; one smaller copy keeps
// dragging smooth and the phone's memory free.
function shrunk(image) {
  const size = imageSize(image);
  const target = fittedSize(size);
  if (target.width === size.width && target.height === size.height) return image;
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The picture is too large for this device.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, target.width, target.height);
  return canvas;
}

// Opens the whole file once; every later crop draws from the picture returned here.
export async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await opened(image, url);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The file holds no picture.');
    return shrunk(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Phones cap the memory all canvases share and free it late, so a canvas that is
// no longer shown is emptied at once.
export function releaseImage(image) {
  if (typeof image?.getContext !== 'function') return;
  image.width = 0;
  image.height = 0;
}

// Arrow keys on their own move the crop; with a modifier they stay with the browser.
export const arrowView = (image, view, event) => (
  event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ? null : keyView(image, view, event.key)
);
