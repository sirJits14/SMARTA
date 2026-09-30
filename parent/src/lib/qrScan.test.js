import { describe, it, expect, vi } from 'vitest';
import { extractCode, normalizeCode, createDetector } from './qrScan.js';

describe('extractCode', () => {
  it('reads the code from the printed slip URL on any host', () => {
    expect(extractCode('https://bnhs-parent.web.app/activate?c=ABCD2345')).toBe('ABCD2345');
    expect(extractCode('http://localhost:5174/activate/?c=abcd2345')).toBe('ABCD2345');
  });
  it('accepts a bare code with dash, spaces, lowercase and look-alike letters', () => {
    expect(extractCode('ABCD-2345')).toBe('ABCD2345');
    expect(extractCode(' abcd 2345 ')).toBe('ABCD2345');
    expect(extractCode('ABCD-O1IL')).toBe('ABCD0111');
  });
  it('rejects foreign URLs, wrong length, U, junk and empty input', () => {
    expect(extractCode('https://example.com/pay?c=ABCD2345')).toBeNull();
    expect(extractCode('https://bnhs-parent.web.app/activate')).toBeNull();
    expect(extractCode('ABCD234')).toBeNull();
    expect(extractCode('ABCDU234')).toBeNull();
    expect(extractCode('WIFI:S:school;T:WPA;P:secret;;')).toBeNull();
    expect(extractCode('')).toBeNull();
    expect(extractCode(null)).toBeNull();
  });
  it('normalizes like the server', () => {
    expect(normalizeCode('abc-o1l')).toBe('ABC011');
  });
});

describe('createDetector', () => {
  it('uses the native BarcodeDetector when it supports qr_code', async () => {
    class BarcodeDetector {
      static async getSupportedFormats() { return ['qr_code', 'ean_13']; }
      constructor(opts) { this.opts = opts; }
      async detect() { return [{ rawValue: 'https://x/activate?c=ABCD2345' }]; }
    }
    const loadJsQR = vi.fn();
    const d = await createDetector({ win: { BarcodeDetector }, loadJsQR });
    expect(d.kind).toBe('native');
    expect(await d.detect({})).toBe('https://x/activate?c=ABCD2345');
    expect(loadJsQR).not.toHaveBeenCalled();
  });
  it('returns null from native detect when nothing is found', async () => {
    class BarcodeDetector { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }
    const d = await createDetector({ win: { BarcodeDetector }, loadJsQR: vi.fn() });
    expect(await d.detect({})).toBeNull();
  });
  it('falls back to jsQR when BarcodeDetector is missing or lacks qr_code', async () => {
    const jsQR = vi.fn(() => ({ data: 'ABCD-2345' }));
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn((x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })) };
    const canvas = { getContext: vi.fn(() => ctx) };
    const win = { document: { createElement: vi.fn(() => canvas) } };
    const d = await createDetector({ win, loadJsQR: async () => jsQR });
    expect(d.kind).toBe('jsqr');
    expect(await d.detect({ videoWidth: 1280, videoHeight: 720 })).toBe('ABCD-2345');
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 640, 360, { inversionAttempts: 'dontInvert' });

    class NoQr { static async getSupportedFormats() { return ['ean_13']; } }
    expect((await createDetector({ win: { ...win, BarcodeDetector: NoQr }, loadJsQR: async () => jsQR })).kind).toBe('jsqr');
  });
  it('jsQR detect returns null for a source with no size yet or no QR', async () => {
    const jsQR = vi.fn(() => null);
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })) };
    const win = { document: { createElement: () => ({ getContext: () => ctx }) } };
    const d = await createDetector({ win, loadJsQR: async () => jsQR });
    expect(await d.detect({ videoWidth: 0, videoHeight: 0 })).toBeNull();
    expect(await d.detect({ width: 100, height: 100 })).toBeNull();
  });
});
