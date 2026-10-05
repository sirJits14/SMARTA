import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// PNG IHDR: width at byte 16, height at 20 (big-endian), colour type at 25 (2 = RGB, 6 = RGBA).
const png = path => { const b = readFileSync(path); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] }; };

describe('SMARTA logo assets', () => {
  it.each([
    ['src/assets/sims-favicon.png', 64, 64],
    ['src/assets/smarta-mark.png', 64, 64],
    ['src/assets/smarta-wordmark.png', 480, 142],
  ])('%s is %ix%i with transparency', (path, width, height) => {
    expect(png(path)).toEqual({ width, height, colorType: 6 });
  });

  // Opaque so iOS "Add to Home Screen" never fills transparent corners with black.
  it.each([
    ['parent/public/icons/icon-192.png', 192],
    ['parent/public/icons/icon-512.png', 512],
    ['parent/public/icons/icon-maskable-512.png', 512],
  ])('%s is an opaque %ipx square', (path, size) => {
    expect(png(path)).toEqual({ width: size, height: size, colorType: 2 });
  });
});
