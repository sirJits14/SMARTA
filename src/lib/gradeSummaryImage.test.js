import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SCHOOL_NAME, IMAGE_PALETTE, fitScale, layoutGradeSummary, paintGradeSummary, renderGradeSummaryPng, wrapText,
} from './gradeSummaryImage.js';

const measure = (text) => text.length * 10;
const sizeAware = (text, font) => (text.length * Number(/(\d+)px/.exec(font)[1])) / 3;
const generatedOn = new Date(2026, 9, 22);
const row = (over = {}) => ({ id: 'a', name: 'Mabini', strand: '', adviser: 'ANA CRUZ', schedule: 'Morning Shift', male: 21, female: 19, total: 40, ...over });
const summary = (over = {}) => ({
  grade: 8, schoolYear: '2026-2027', hasStrand: false, unknownSex: 0,
  rows: [row(), row({ id: 'b', name: 'Rizal', adviser: '', schedule: '', male: 0, female: 0, total: 0 })],
  totals: { sections: 2, male: 21, female: 19, total: 40 },
  ...over,
});
const layout = (s = summary(), options = {}, measurer = measure) => layoutGradeSummary(s, measurer, { schoolName: 'Test School', generatedOn, ...options });
const strings = (l) => l.texts.map((t) => t.text);
const find = (l, text) => l.texts.find((t) => t.text === text);

describe('wrapText', () => {
  it('keeps short text on one line and empty text as one empty line', () => {
    expect(wrapText('aaa bbb', 100, measure)).toEqual(['aaa bbb']);
    expect(wrapText('', 100, measure)).toEqual(['']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText('aaa bbb ccc ddd', 100, measure)).toEqual(['aaa bbb', 'ccc ddd']);
  });

  it('breaks a word wider than the column', () => {
    expect(wrapText('abcdefghijklmnop', 100, measure)).toEqual(['abcdefghij', 'klmnop']);
  });

  it('ends the last allowed line with an ellipsis when text is left over', () => {
    const lines = wrapText('aaa bbb ccc ddd eee fff', 100, measure);
    expect(lines).toEqual(['aaa bbb', 'ccc ddd e…']);
    expect(lines.every((line) => measure(line) <= 100)).toBe(true);
  });
});

describe('layoutGradeSummary', () => {
  it('writes the header, every row and the totals in reading order', () => {
    const l = layout();
    expect(strings(l)).toEqual(expect.arrayContaining([
      'TEST SCHOOL', 'Grade 8 · Sections and enrollment', 'SY 2026-2027',
      'SECTION', 'ADVISER', 'SCHEDULE', 'MALE', 'FEMALE', 'TOTAL',
      'Mabini', 'ANA CRUZ', 'Morning Shift', '21', '19', '40', 'Rizal', 'Grade 8 total · 2 sections',
    ]));
    const ys = ['TEST SCHOOL', 'SECTION', 'Mabini', 'Rizal', 'Grade 8 total · 2 sections'].map((text) => find(l, text).y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('shows a dash where the adviser or schedule is empty', () => {
    expect(strings(layout()).filter((text) => text === '—')).toHaveLength(2);
  });

  it('adds the Strand column only for senior high', () => {
    const shs = layout(summary({ grade: 11, hasStrand: true, rows: [row({ strand: 'STEM' })] }));
    expect(strings(shs)).toEqual(expect.arrayContaining(['STRAND', 'STEM']));
    expect(strings(layout())).not.toContain('STRAND');
  });

  it('lays the columns edge to edge inside the side padding, with labels that fit', () => {
    [summary(), summary({ grade: 11, hasStrand: true })].forEach((s) => {
      const { columns } = layout(s);
      expect(columns[0].x).toBe(48);
      columns.slice(1).forEach((column, i) => expect(column.x).toBe(columns[i].x + columns[i].width));
      expect(columns.at(-1).x + columns.at(-1).width).toBe(1032);
      columns.forEach((column) => expect(measure(column.label)).toBeLessThanOrEqual(column.width));
    });
  });

  it('keeps every piece of text inside the canvas', () => {
    const l = layout(summary({ unknownSex: 2 }));
    l.texts.forEach((t) => {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(l.width);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(l.height);
    });
  });

  it('grows a row by one line height for each extra wrapped line', () => {
    const long = layout(summary({ rows: [row({ adviser: 'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT' })] }));
    const short = layout(summary({ rows: [row({ adviser: 'ONE' })] }));
    expect(long.height - short.height).toBe(32);
    expect(strings(long)).toEqual(expect.arrayContaining(['ONE TWO THREE FOUR FIVE SIX SEVEN', 'EIGHT']));
  });

  it('says "1 section" for a single section', () => {
    const one = summary({ rows: [row()], totals: { sections: 1, male: 21, female: 19, total: 40 } });
    expect(strings(layout(one))).toContain('Grade 8 total · 1 section');
  });

  it('prints the sex footnote only when some learners have none on record', () => {
    expect(strings(layout()).some((text) => text.includes('no sex on record'))).toBe(false);
    expect(strings(layout(summary({ unknownSex: 1 })))).toContain('1 learner has no sex on record, so Male + Female is less than Total.');
    expect(strings(layout(summary({ unknownSex: 3 })))).toContain('3 learners have no sex on record, so Male + Female is less than Total.');
  });

  it('dates the footer with the generation date', () => {
    expect(strings(layout())).toContain('Generated Oct 22, 2026 · BNHS Learner Records');
  });

  it('falls back to the default school name when the given one is blank or missing', () => {
    expect(strings(layout(summary(), { schoolName: '   ' }))).toContain(DEFAULT_SCHOOL_NAME.toUpperCase());
    expect(strings(layoutGradeSummary(summary(), measure, { generatedOn }))).toContain(DEFAULT_SCHOOL_NAME.toUpperCase());
  });

  it('shrinks a long school name, then ends it with an ellipsis', () => {
    const medium = layout(summary(), { schoolName: 'm'.repeat(90) }, sizeAware);
    expect(find(medium, 'M'.repeat(90)).font).toContain('26px');
    const huge = layout(summary(), { schoolName: 'm'.repeat(200) }, sizeAware);
    const clipped = huge.texts.find((t) => t.text.endsWith('…'));
    expect(clipped.font).toContain('22px');
    expect(sizeAware(clipped.text, clipped.font)).toBeLessThanOrEqual(864);
  });

  it('puts a full-canvas background first and a single teal rule above the totals', () => {
    const l = layout();
    expect(l.rects[0]).toEqual({ x: 0, y: 0, w: l.width, h: l.height, color: IMAGE_PALETTE.surface });
    expect(l.rects.filter((rect) => rect.color === IMAGE_PALETTE.primary)).toHaveLength(1);
  });

  it('reserves a square box for the logo beside the header text', () => {
    expect(layout().logo).toEqual({ x: 48, y: 50, size: 96 });
  });
});

describe('IMAGE_PALETTE', () => {
  it('equals the light tokens in shared/theme/theme.css', () => {
    const css = readFileSync(new URL('../../shared/theme/theme.css', import.meta.url), 'utf8');
    const start = css.indexOf(':root, .paper {');
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    const light = Object.fromEntries([...body.matchAll(/--t-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toUpperCase()]));
    expect(IMAGE_PALETTE).toEqual({
      surface: light.surface, border: light.border, ink: light.ink, subtle: light.subtle, muted: light.muted, primary: light.primary,
    });
  });
});

function recorder() {
  const calls = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    fillRect: (...args) => calls.push(['fillRect', ...args, ctx.fillStyle]),
    fillText: (...args) => calls.push(['fillText', ...args, ctx.font, ctx.fillStyle, ctx.textAlign]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
  return { ctx, calls };
}

describe('paintGradeSummary', () => {
  it('fills the background first, then draws every text with its own style', () => {
    const l = layout();
    const { ctx, calls } = recorder();
    paintGradeSummary(ctx, l, null);
    expect(calls[0]).toEqual(['fillRect', 0, 0, l.width, l.height, IMAGE_PALETTE.surface]);
    expect(ctx.textBaseline).toBe('middle');
    const drawn = calls.filter(([name]) => name === 'fillText');
    expect(drawn).toHaveLength(l.texts.length);
    const first = l.texts[0];
    expect(drawn[0]).toEqual(['fillText', first.text, first.x, first.y, first.font, first.color, first.align]);
  });

  it('draws the logo inside its box with its own proportions, and skips it when absent', () => {
    const l = layout();
    const withLogo = recorder();
    const logo = { naturalWidth: 200, naturalHeight: 100 };
    paintGradeSummary(withLogo.ctx, l, logo);
    expect(withLogo.calls.find(([name]) => name === 'drawImage')).toEqual(['drawImage', logo, 48, 74, 96, 48]);
    const without = recorder();
    paintGradeSummary(without.ctx, l, null);
    expect(without.calls.some(([name]) => name === 'drawImage')).toBe(false);
  });
});

describe('fitScale', () => {
  it('uses 2x for an ordinary image', () => {
    expect(fitScale(1080, 600)).toBe(2);
  });

  it('shrinks a very tall image to stay under 16 million pixels', () => {
    const scale = fitScale(1080, 20000);
    expect(scale).toBeLessThan(2);
    expect(1080 * 20000 * scale * scale).toBeCloseTo(16_000_000, 0);
  });
});

// `logo` is 'load', 'fail' or 'hang' (the request neither loads nor fails).
function fakeBrowser({ blob = new Blob(['png'], { type: 'image/png' }), logo = 'load' } = {}) {
  const ctx = {
    measureText: vi.fn((text) => ({ width: text.length * 10 })),
    scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: vi.fn((done, type) => done(type === 'image/png' ? blob : null)) };
  const fonts = { load: vi.fn(async () => []) };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas), fonts });
  vi.stubGlobal('Image', class {
    set src(value) {
      if (logo !== 'hang') queueMicrotask(() => (logo === 'load' ? this.onload?.() : this.onerror?.()));
    }
  });
  return { canvas, ctx, fonts, blob };
}

describe('renderGradeSummaryPng', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sizes the canvas at the fitted scale and returns the PNG', async () => {
    const { canvas, ctx, fonts, blob } = fakeBrowser();
    const result = await renderGradeSummaryPng(summary(), { schoolName: 'Test School', generatedOn });
    expect(result).toBe(blob);
    expect(fonts.load).toHaveBeenCalled();
    expect(canvas.width).toBe(2160);
    expect(canvas.height).toBe(Math.round(layout().height * 2));
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('still renders when the logo cannot load', async () => {
    const { ctx } = fakeBrowser({ logo: 'fail' });
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).resolves.toBeInstanceOf(Blob);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('carries on with fallback fonts when font loading fails', async () => {
    const { fonts } = fakeBrowser();
    fonts.load.mockRejectedValue(new Error('offline'));
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).resolves.toBeInstanceOf(Blob);
  });

  it('rejects when the browser cannot encode a PNG', async () => {
    fakeBrowser({ blob: null });
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).rejects.toThrow('PNG');
  });

  it('waits for the fonts before it measures any text', async () => {
    const { ctx, fonts, blob } = fakeBrowser();
    let loaded;
    const deferred = new Promise((resolve) => { loaded = resolve; });
    fonts.load.mockImplementation(() => deferred);
    const pending = renderGradeSummaryPng(summary(), { generatedOn });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fonts.load).toHaveBeenCalled();
    expect(ctx.measureText).not.toHaveBeenCalled();
    loaded([]);
    await expect(pending).resolves.toBe(blob);
    expect(ctx.measureText).toHaveBeenCalled();
  });

  describe('when a request stalls', () => {
    const stalled = async (pending) => {
      let settled = false;
      pending.then(() => { settled = true; }, () => { settled = true; });
      await vi.advanceTimersByTimeAsync(2999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    };

    it('stops waiting for the fonts after 3 seconds and renders with the fallback', async () => {
      vi.useFakeTimers();
      const { fonts, blob } = fakeBrowser();
      fonts.load.mockImplementation(() => new Promise(() => {}));
      const pending = renderGradeSummaryPng(summary(), { generatedOn });
      await stalled(pending);
      await expect(pending).resolves.toBe(blob);
    });

    it('stops waiting for the logo after 3 seconds and renders without it', async () => {
      vi.useFakeTimers();
      const { ctx, blob } = fakeBrowser({ logo: 'hang' });
      const pending = renderGradeSummaryPng(summary(), { generatedOn });
      await stalled(pending);
      await expect(pending).resolves.toBe(blob);
      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('renders once both the fonts and the logo are stalled', async () => {
      vi.useFakeTimers();
      const { ctx, fonts } = fakeBrowser({ logo: 'hang' });
      fonts.load.mockImplementation(() => new Promise(() => {}));
      const pending = renderGradeSummaryPng(summary(), { generatedOn });
      await vi.advanceTimersByTimeAsync(3000);
      await expect(pending).resolves.toBeInstanceOf(Blob);
      expect(ctx.drawImage).not.toHaveBeenCalled();
    });
  });

  it('leaves no timer running once the fonts and the logo have loaded', async () => {
    vi.useFakeTimers();
    fakeBrowser();
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).resolves.toBeInstanceOf(Blob);
    expect(vi.getTimerCount()).toBe(0);
  });
});
