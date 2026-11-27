// Parent App side of the learner photo crop. Opening, drawing, exporting and moving are
// shared with SIMS; large pictures are made smaller here for phones.
import { MAX_ZOOM, PHOTO_SIZE } from '../../../shared/studentPhoto.js';
import { imageSize, keyView, decodeImage as openImage } from '../../../shared/photoCanvas.js';

export { imageSize, drawCrop, exportPhoto, captureFrame, panView, keyView, DECODE_TIMEOUT_MS } from '../../../shared/photoCanvas.js';

// The closest zoom cuts a quarter of the short side, which must still hold a full-size photo.
export const SOURCE_SIDE = PHOTO_SIZE * MAX_ZOOM;
// iOS Safari refuses canvases over 16,777,216 pixels.
export const SOURCE_PIXELS = 16_000_000;

export function fittedSize({ width, height }) {
  const scale = Math.min(1, SOURCE_SIDE / Math.min(width, height), Math.sqrt(SOURCE_PIXELS / (width * height)));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

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

// Opens a chosen file, already shrunk to what a phone can comfortably hold.
export const decodeImage = (file) => openImage(file, shrunk);

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
