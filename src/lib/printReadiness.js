export function printImagesReady(images, expectedCount) {
  return expectedCount > 0 && images.length === expectedCount && images.every(image => image.complete && image.naturalWidth > 0);
}
