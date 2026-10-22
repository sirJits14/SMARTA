import { T } from '../styles.js';
import logoUrl from '../assets/bnhs_logo.png?url';

export const DEFAULT_SCHOOL_NAME = 'Bukidnon National High School';
// The light tokens of shared/theme/theme.css, fixed so the image stays light in dark mode.
// gradeSummaryImage.test.js fails if they drift from the stylesheet.
export const IMAGE_PALETTE = {
  surface: '#FFFFFF', border: '#E3E8EF', ink: '#17212F', subtle: '#3F4C5E', muted: '#5F6E83', primary: '#077683',
};

const WIDTH = 1080;
const PAD = 48;
const TOP = 44;
const BOTTOM = 40;
const LOGO = 96;
const HEADER = 108;
const LINE = 32;
const ROW_PAD = 16;
const GAP = 12;
const RULE = 2;
const TOTALS_ROW = 72;
const MAX_LINES = 2;
const MAX_SCALE = 2;
const MAX_PIXELS = 16_000_000; // iOS Safari's canvas area limit
const BEST_EFFORT_MS = 3000; // the longest the logo or the fonts may delay an export
const ELLIPSIS = '…';
const font = (weight, size) => `${weight} ${size}px ${T.print}`;

// Column widths add up to the 984 px between the side paddings. Measured in Inter at 26 px, each
// plus the 12 px GAP: "Saint Francis" (600) needs 162 px, "Agri-Fishery" 153 px and
// "Afternoon Shift" 185 px, so those wrap or fit on one line without cutting a word.
const COUNT_COLUMNS = [
  { key: 'male', label: 'MALE', width: 64, align: 'right' },
  { key: 'female', label: 'FEMALE', width: 84, align: 'right' },
  { key: 'total', label: 'TOTAL', width: 74, align: 'right' },
];
const JHS_COLUMNS = [
  { key: 'name', label: 'SECTION', width: 184 },
  { key: 'adviser', label: 'ADVISER', width: 378 },
  { key: 'schedule', label: 'SCHEDULE', width: 200 },
  ...COUNT_COLUMNS,
];
const SHS_COLUMNS = [
  { key: 'name', label: 'SECTION', width: 184 },
  { key: 'strand', label: 'STRAND', width: 170 },
  { key: 'adviser', label: 'ADVISER', width: 208 },
  { key: 'schedule', label: 'SCHEDULE', width: 200 },
  ...COUNT_COLUMNS,
];
const cellFont = (key) => font(key === 'name' ? 600 : key === 'total' ? 700 : 400, 26);
const cellColor = (key) => (key === 'name' || key === 'total' ? IMAGE_PALETTE.ink : IMAGE_PALETTE.subtle);

// Splits a word wider than the column into pieces that each fit.
function breakWord(word, maxWidth, measure) {
  const pieces = [];
  let piece = '';
  for (const char of word) {
    if (piece && measure(piece + char) > maxWidth) { pieces.push(piece); piece = char; } else piece += char;
  }
  return piece ? [...pieces, piece] : pieces;
}

function fitEllipsis(text, maxWidth, measure) {
  let fitted = text;
  while (fitted && measure(fitted + ELLIPSIS) > maxWidth) fitted = fitted.slice(0, -1);
  return fitted.trimEnd() + ELLIPSIS;
}

// Wraps text to the column at word boundaries, to at most `maxLines` lines. Text left over ends
// the last line with an ellipsis.
export function wrapText(text, maxWidth, measure, maxLines = MAX_LINES) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
    .flatMap((word) => (measure(word) > maxWidth ? breakWord(word, maxWidth, measure) : [word]));
  const lines = [];
  let line = '';
  for (const word of words) {
    const joined = line ? `${line} ${word}` : word;
    if (!line || measure(joined) <= maxWidth) line = joined;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines.length ? lines : [''];
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitEllipsis(lines.slice(maxLines - 1).join(' '), maxWidth, measure);
  return kept;
}

// The school name on one line: the largest of three sizes that fits, else ellipsized at the smallest.
function schoolHeadline(name, maxWidth, measure) {
  for (const size of [30, 26, 22]) {
    if (measure(name, font(700, size)) <= maxWidth) return { text: name, size };
  }
  return { text: fitEllipsis(name, maxWidth, (value) => measure(value, font(700, 22))), size: 22 };
}

// Turns a gradeSummary into drawing primitives: filled rectangles, positioned text lines (drawn
// with a middle baseline) and the logo box. `measure(text, fontSpec)` returns a width in px.
export function layoutGradeSummary(summary, measure, { schoolName, generatedOn = new Date() } = {}) {
  let left = PAD;
  const columns = (summary.hasStrand ? SHS_COLUMNS : JHS_COLUMNS).map((column) => {
    const placed = { ...column, x: left };
    left += column.width;
    return placed;
  });
  const edge = (column) => (column.align === 'right' ? column.x + column.width : column.x);
  const rects = [];
  const texts = [];
  const text = (value, x, y, spec, color, align = 'left') => texts.push({ text: value, x, y, font: spec, color, align });
  const rule = (y, color = IMAGE_PALETTE.border) => rects.push({ x: PAD, y, w: WIDTH - PAD * 2, h: RULE, color });

  let y = TOP;
  const textLeft = PAD + LOGO + 24;
  const name = String(schoolName ?? '').trim() || DEFAULT_SCHOOL_NAME;
  const school = schoolHeadline(name.toUpperCase(), WIDTH - PAD - textLeft, measure);
  text(school.text, textLeft, y + 20, font(700, school.size), IMAGE_PALETTE.ink);
  text(`Grade ${summary.grade} · Sections and enrollment`, textLeft, y + 58, font(600, 24), IMAGE_PALETTE.primary);
  text(`SY ${summary.schoolYear}`, textLeft, y + 92, font(400, 22), IMAGE_PALETTE.muted);
  const logo = { x: PAD, y: y + (HEADER - LOGO) / 2, size: LOGO };
  y += HEADER + 28;
  rule(y);
  y += RULE;

  columns.forEach((column) => text(column.label, edge(column), y + 28, font(600, 18), IMAGE_PALETTE.muted, column.align));
  y += 56;
  rule(y);
  y += RULE;

  summary.rows.forEach((row, index) => {
    const cells = columns.map((column) => {
      const right = column.align === 'right';
      const spec = cellFont(column.key);
      const value = right ? String(row[column.key]) : row[column.key] || '—';
      return { column, spec, lines: right ? [value] : wrapText(value, column.width - GAP, (s) => measure(s, spec)) };
    });
    const height = Math.max(...cells.map((cell) => cell.lines.length)) * LINE + ROW_PAD * 2;
    cells.forEach(({ column, spec, lines }) => {
      const top = y + (height - lines.length * LINE) / 2;
      lines.forEach((line, i) => text(line, edge(column), top + i * LINE + LINE / 2, spec, cellColor(column.key), column.align));
    });
    y += height;
    if (index < summary.rows.length - 1) { rule(y); y += RULE; }
  });

  rule(y, IMAGE_PALETTE.primary);
  y += RULE;
  const count = summary.totals.sections;
  text(`Grade ${summary.grade} total · ${count} ${count === 1 ? 'section' : 'sections'}`, PAD, y + TOTALS_ROW / 2, font(600, 24), IMAGE_PALETTE.ink);
  columns.filter((column) => column.align === 'right')
    .forEach((column) => text(String(summary.totals[column.key]), edge(column), y + TOTALS_ROW / 2, font(700, 26), IMAGE_PALETTE.ink, 'right'));
  y += TOTALS_ROW + 28;

  if (summary.unknownSex > 0) {
    const n = summary.unknownSex;
    text(`${n} ${n === 1 ? 'learner has' : 'learners have'} no sex on record, so Male + Female is less than Total.`, PAD, y + 14, font(400, 20), IMAGE_PALETTE.muted);
    y += 40;
  }
  const date = generatedOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  text(`Generated ${date} · BNHS Learner Records`, PAD, y + 14, font(400, 20), IMAGE_PALETTE.muted);
  y += 28 + BOTTOM;

  rects.unshift({ x: 0, y: 0, w: WIDTH, h: y, color: IMAGE_PALETTE.surface });
  return { width: WIDTH, height: y, columns, rects, texts, logo };
}

// Draws a layout onto a 2D context already scaled to the layout's units. `logo` is a loaded image
// or null; it is fitted inside its box without distortion.
export function paintGradeSummary(ctx, layout, logo) {
  ctx.textBaseline = 'middle';
  layout.rects.forEach(({ x, y, w, h, color }) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); });
  if (logo && layout.logo) {
    const box = layout.logo;
    const ratio = (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height) || 1;
    const w = ratio >= 1 ? box.size : box.size * ratio;
    const h = ratio >= 1 ? box.size / ratio : box.size;
    ctx.drawImage(logo, box.x + (box.size - w) / 2, box.y + (box.size - h) / 2, w, h);
  }
  layout.texts.forEach(({ text, x, y, font: spec, color, align }) => {
    ctx.font = spec; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y);
  });
}

// 2x for crisp text, reduced so a very tall image stays under the browser's canvas area limit.
export const fitScale = (width, height) => Math.min(MAX_SCALE, Math.sqrt(MAX_PIXELS / (width * height)));

// Best effort: a face that fails to load leaves the image on the system-ui fallback.
async function loadFonts() {
  if (!document.fonts?.load) return;
  await Promise.allSettled([font(400, 26), font(600, 26), font(700, 30)].map((spec) => document.fonts.load(spec)));
}

function loadLogo() {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = logoUrl;
  });
}

// Resolves to `fallback` if `promise` has not settled within `ms`. The timer is cleared once the race ends.
function within(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Renders a gradeSummary as a PNG Blob. The logo and Inter are best effort and each is waited for
// at most BEST_EFFORT_MS, so a stalled request cannot hold the export; a failure to encode rejects.
export async function renderGradeSummaryPng(summary, { schoolName, generatedOn = new Date() } = {}) {
  const [logo] = await Promise.all([within(loadLogo(), BEST_EFFORT_MS, null), within(loadFonts(), BEST_EFFORT_MS)]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const measure = (value, spec) => { ctx.font = spec; return ctx.measureText(value).width; };
  const layout = layoutGradeSummary(summary, measure, { schoolName, generatedOn });
  const scale = fitScale(layout.width, layout.height);
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  ctx.scale(scale, scale);
  paintGradeSummary(ctx, layout, logo);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be encoded.'))), 'image/png');
  });
}
