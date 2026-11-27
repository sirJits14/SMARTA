// SIMS side of the learner photo crop. Everything but opening a file is shared with the Parent App.
export { imageSize, drawCrop, exportPhoto, captureFrame, panView, keyView } from '../../shared/photoCanvas.js';

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
