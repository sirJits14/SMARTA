import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, photoPath, initialView, clampView, cropRect, dragView, compressToLimit, photoBytesError } from './studentPhoto.js';

// Smallest bytes that pass the header checks: SOI, one SOF0 segment, EOI.
const jpeg = (width, height, padding = 0) => Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00,
  ...new Array(padding).fill(0),
  0xff, 0xd9,
]);

describe('crop geometry', () => {
  const wide = { width: 800, height: 400 };
  it('starts centred on the largest square', () => {
    expect(cropRect(wide, initialView(wide))).toEqual({ sx: 200, sy: 0, size: 400 });
  });
  it('keeps the square inside the image', () => {
    expect(cropRect(wide, clampView(wide, { zoom: 1, cx: -50, cy: 9999 }))).toEqual({ sx: 0, sy: 0, size: 400 });
    expect(clampView(wide, { zoom: 99, cx: 400, cy: 200 }).zoom).toBe(4);
    expect(clampView(wide, { zoom: 0, cx: 400, cy: 200 }).zoom).toBe(1);
  });
  it('dragging moves the image with the finger', () => {
    const view = dragView(wide, initialView(wide), 140, 0, 280);
    expect(cropRect(wide, view)).toEqual({ sx: 0, sy: 0, size: 400 });
  });
});

describe('compression', () => {
  it('returns the first quality within the limit', async () => {
    const tried = [];
    const out = await compressToLimit(async q => { tried.push(q); return { size: tried.length < 3 ? PHOTO_MAX_BYTES + 1 : 10 }; });
    expect(out).toEqual({ size: 10 });
    expect(tried).toHaveLength(3);
  });
  it('fails when nothing fits', async () => {
    await expect(compressToLimit(async () => ({ size: PHOTO_MAX_BYTES + 1 }))).rejects.toThrow(/too large/i);
  });
});

describe('server photo check', () => {
  it('accepts a square JPEG', () => { expect(photoBytesError(jpeg(600, 600))).toBe(''); });
  it('refuses other formats, non-square, oversized pixels and oversized files', () => {
    expect(photoBytesError(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toMatch(/JPEG/);
    expect(photoBytesError(jpeg(600, 400))).toMatch(/square/);
    expect(photoBytesError(jpeg(900, 900))).toMatch(/600/);
    expect(photoBytesError(jpeg(100, 100))).toMatch(/too small/i);
    expect(photoBytesError(jpeg(600, 600, PHOTO_MAX_BYTES))).toMatch(/200 KB/);
  });
  it('names the file after the learner', () => { expect(photoPath('S1')).toBe('student_photos/S1.jpg'); });
});
