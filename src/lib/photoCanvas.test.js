import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_MAX_BYTES, initialView } from '../../shared/studentPhoto.js';
import { imageSize, drawCrop, exportPhoto, decodeImage, captureFrame, panView, keyView } from './photoCanvas.js';

afterEach(() => { vi.unstubAllGlobals(); });

const wide = { naturalWidth: 800, naturalHeight: 400, width: 80, height: 40 };
const start = initialView({ width: 800, height: 400 });

// A canvas that records what was drawn and encodes to the sizes given, in order.
function fakeCanvas({ width = 0, height = 0, sizes = [10] } = {}) {
  const calls = [];
  const context = {
    set fillStyle(value) { calls.push(['fillStyle', value]); },
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
  const encoded = [];
  const canvas = {
    width, height, calls, encoded,
    getContext: () => context,
    toBlob: (done, type, quality) => {
      encoded.push({ type, quality, width: canvas.width, height: canvas.height });
      const size = sizes[Math.min(encoded.length, sizes.length) - 1];
      done(size === null ? null : { size, tag: encoded.length });
    },
  };
  return canvas;
}

class FakeReader {
  readAsDataURL(blob) {
    queueMicrotask(() => { this.result = `data:image/jpeg;base64,BLOB${blob.tag}`; this.onload(); });
  }
}

describe('picture size', () => {
  it('uses the natural size of an image and the pixel size of a canvas', () => {
    expect(imageSize(wide)).toEqual({ width: 800, height: 400 });
    expect(imageSize({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
  });
});

describe('drawing the crop', () => {
  it('paints white first, then only the chosen square across the whole canvas', () => {
    const canvas = fakeCanvas({ width: 280, height: 280 });
    drawCrop(canvas, wide, start);
    expect(canvas.calls).toEqual([
      ['fillStyle', '#ffffff'],
      ['fillRect', 0, 0, 280, 280],
      ['drawImage', wide, 200, 0, 400, 400, 0, 0, 280, 280],
    ]);
  });
});

describe('exporting the photo', () => {
  it('makes a 600 pixel JPEG and returns base64 without the data URL prefix', async () => {
    const canvas = fakeCanvas({ sizes: [PHOTO_MAX_BYTES + 1, 100] });
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('FileReader', FakeReader);
    await expect(exportPhoto(wide, start)).resolves.toBe('BLOB2');
    expect(canvas.encoded).toEqual([
      { type: 'image/jpeg', quality: 0.9, width: 600, height: 600 },
      { type: 'image/jpeg', quality: 0.82, width: 600, height: 600 },
    ]);
    expect(canvas.calls).toContainEqual(['drawImage', wide, 200, 0, 400, 400, 0, 0, 600, 600]);
  });
  it('fails with a readable message when the browser cannot encode a small enough photo', async () => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas({ sizes: [null] }) });
    await expect(exportPhoto(wide, start)).rejects.toThrow(/too large/i);
  });
});

describe('opening a file', () => {
  function stubBrowser({ decode, width = 40, height = 30 }) {
    const urls = { revoked: [], revokedBeforeDecode: null };
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:1',
      revokeObjectURL: (url) => urls.revoked.push(url),
    });
    vi.stubGlobal('Image', class {
      naturalWidth = width; naturalHeight = height;
      async decode() { urls.revokedBeforeDecode = urls.revoked.length; await decode(); }
    });
    return urls;
  }
  it('decodes the picture once and revokes its object URL afterwards', async () => {
    const decode = vi.fn(async () => {});
    const urls = stubBrowser({ decode });
    const image = await decodeImage({});
    expect(image.src).toBe('blob:1');
    expect(decode).toHaveBeenCalledTimes(1);
    expect(urls.revokedBeforeDecode).toBe(0);
    expect(urls.revoked).toEqual(['blob:1']);
  });
  it('rejects and still revokes when the file is not a picture', async () => {
    const urls = stubBrowser({ decode: async () => { throw new Error('EncodingError'); } });
    await expect(decodeImage({})).rejects.toThrow();
    expect(urls.revoked).toEqual(['blob:1']);
  });
  it('rejects a picture with no size', async () => {
    const urls = stubBrowser({ decode: async () => {}, width: 0 });
    await expect(decodeImage({})).rejects.toThrow();
    expect(urls.revoked).toEqual(['blob:1']);
  });
});

describe('camera frame', () => {
  it('copies the video frame at its own size', () => {
    const canvas = fakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const video = { videoWidth: 1280, videoHeight: 720 };
    expect(captureFrame(video)).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
    expect(canvas.calls).toEqual([['drawImage', video, 0, 0, 1280, 720]]);
  });
});

describe('moving the crop', () => {
  it('drags by the preview width', () => {
    expect(panView(wide, start, 28, 0, 280)).toEqual({ zoom: 1, cx: 360, cy: 200 });
  });
  it('ignores a drag while the preview has no width', () => {
    for (const width of [0, undefined, NaN]) expect(panView(wide, start, 28, 0, width)).toBe(start);
  });
  it('returns the same view when the crop is already against the edge', () => {
    expect(panView(wide, start, 0, 40, 280)).toBe(start);
  });
  it('moves the picture the way the arrow points', () => {
    const zoomed = { zoom: 2, cx: 400, cy: 200 };
    expect(keyView(wide, zoomed, 'ArrowRight').cx).toBeLessThan(400);
    expect(keyView(wide, zoomed, 'ArrowLeft').cx).toBeGreaterThan(400);
    expect(keyView(wide, zoomed, 'ArrowDown').cy).toBeLessThan(200);
    expect(keyView(wide, zoomed, 'ArrowUp').cy).toBeGreaterThan(200);
  });
  it('leaves other keys alone', () => {
    for (const key of ['Tab', 'Escape', 'Enter', 'a']) expect(keyView(wide, start, key)).toBeNull();
  });
});
