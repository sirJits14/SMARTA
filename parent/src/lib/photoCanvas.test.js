import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_ZOOM, PHOTO_SIZE, initialView } from '../../../shared/studentPhoto.js';
import { decodeImage, fittedSize, releaseImage, arrowView, DECODE_TIMEOUT_MS, SOURCE_SIDE, SOURCE_PIXELS } from './photoCanvas.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('source size', () => {
  it('keeps enough pixels on the short side for the closest zoom', () => {
    expect(SOURCE_SIDE).toBe(PHOTO_SIZE * MAX_ZOOM);
    expect(fittedSize({ width: 4000, height: 3000 })).toEqual({ width: 3200, height: 2400 });
    expect(fittedSize({ width: 3000, height: 6000 })).toEqual({ width: 2400, height: 4800 });
  });
  it('leaves smaller pictures as they are', () => {
    expect(fittedSize({ width: 3200, height: 2400 })).toEqual({ width: 3200, height: 2400 });
    expect(fittedSize({ width: 320, height: 200 })).toEqual({ width: 320, height: 200 });
  });
  it('never asks for more pixels than a phone canvas holds', () => {
    expect(SOURCE_PIXELS).toBeLessThan(16_777_216);
    for (const size of [{ width: 20000, height: 4000 }, { width: 3000, height: 24000 }, { width: 12000, height: 2000 }]) {
      const out = fittedSize(size);
      expect(out.width * out.height).toBeLessThan(16_777_216);
      expect(out.width / out.height).toBeCloseTo(size.width / size.height, 1);
    }
  });
});

// An image whose load, error and decode answers the test chooses.
function stubBrowser({ decode = () => new Promise(() => {}), event, width = 40, height = 30, context = true } = {}) {
  const seen = { revoked: [], drawn: [], canvases: [] };
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: (url) => seen.revoked.push(url) });
  vi.stubGlobal('Image', class {
    naturalWidth = width; naturalHeight = height;
    set src(value) { this.url = value; if (event) queueMicrotask(() => this[event]?.()); }
    get src() { return this.url; }
    decode() { return decode(); }
  });
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => (context ? { drawImage: (...args) => seen.drawn.push([...args, seen.revoked.length]) } : null) };
    seen.canvases.push(canvas);
    return canvas;
  } });
  return seen;
}

describe('opening a file', () => {
  it('uses the picture once decode settles, and revokes its object URL', async () => {
    const seen = stubBrowser({ decode: async () => {} });
    const image = await decodeImage({});
    expect(image.src).toBe('blob:1');
    expect(seen.revoked).toEqual(['blob:1']);
    expect(seen.canvases).toEqual([]);
  });
  it('falls back to the load event when decode never settles', async () => {
    const seen = stubBrowser({ event: 'onload' });
    await expect(decodeImage({})).resolves.toMatchObject({ url: 'blob:1' });
    expect(seen.revoked).toEqual(['blob:1']);
  });
  it('still opens a picture that loads although decode refused it', async () => {
    stubBrowser({ decode: async () => { throw new Error('EncodingError'); }, event: 'onload' });
    await expect(decodeImage({})).resolves.toMatchObject({ url: 'blob:1' });
  });
  it('rejects on the error event', async () => {
    const seen = stubBrowser({ decode: async () => { throw new Error('EncodingError'); }, event: 'onerror' });
    await expect(decodeImage({})).rejects.toThrow();
    expect(seen.revoked).toEqual(['blob:1']);
  });
  it('gives up when nothing ever answers', async () => {
    vi.useFakeTimers();
    const seen = stubBrowser();
    const outcome = decodeImage({}).then(() => 'opened', () => 'failed');
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS - 1);
    expect(seen.revoked).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBe('failed');
    expect(seen.revoked).toEqual(['blob:1']);
  });
  it('rejects a picture with no size', async () => {
    stubBrowser({ decode: async () => {}, width: 0 });
    await expect(decodeImage({})).rejects.toThrow();
  });
  it('shrinks a very large picture once, before its URL is revoked', async () => {
    const seen = stubBrowser({ decode: async () => {}, width: 8000, height: 6000 });
    const picture = await decodeImage({});
    expect(picture).toBe(seen.canvases[0]);
    expect([picture.width, picture.height]).toEqual([3200, 2400]);
    expect(seen.drawn).toHaveLength(1);
    const [source, x, y, w, h, revokedAtDraw] = seen.drawn[0];
    expect([source.url, x, y, w, h, revokedAtDraw]).toEqual(['blob:1', 0, 0, 3200, 2400, 0]);
    expect(seen.revoked).toEqual(['blob:1']);
  });
  it('rejects when the phone cannot make the smaller copy', async () => {
    const seen = stubBrowser({ decode: async () => {}, width: 8000, height: 6000, context: false });
    await expect(decodeImage({})).rejects.toThrow();
    expect(seen.revoked).toEqual(['blob:1']);
  });
});

describe('releasing a picture', () => {
  it('empties a canvas and leaves an image or nothing alone', () => {
    const canvas = { width: 10, height: 10, getContext() {} };
    releaseImage(canvas);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    const image = { width: 10, height: 10 };
    releaseImage(image);
    expect(image.width).toBe(10);
    expect(() => releaseImage(undefined)).not.toThrow();
  });
});

describe('arrow keys', () => {
  const wide = { naturalWidth: 800, naturalHeight: 400 };
  const view = { ...initialView({ width: 800, height: 400 }), zoom: 2 };
  it('move the crop on their own', () => {
    expect(arrowView(wide, view, { key: 'ArrowRight' }).cx).toBeLessThan(view.cx);
    expect(arrowView(wide, view, { key: 'Tab' })).toBeNull();
  });
  it('are left to the browser when a modifier is held', () => {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(arrowView(wide, view, { key: 'ArrowLeft', [modifier]: true }), modifier).toBeNull();
    }
  });
});
