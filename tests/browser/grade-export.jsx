import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import '/shared/theme/theme.css';
import '/src/registrar.css';
import SectionsPage from '/src/pages/SectionsPage.jsx';
import { SCHOOL_YEAR } from './grade-export-fixture.js';

window.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.getElementById('root');
const previews = document.getElementById('previews');
const root = createRoot(host);
const admin = { role: 'admin', uid: 'synthetic-admin' };
const glc = { role: 'glc', gradeLevel: 8, uid: 'synthetic-glc' };
const assert = (value, message) => { if (!value) throw Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const render = (me = admin, year = SCHOOL_YEAR, key = 'test') => act(async () => root.render(<SectionsPage key={key} me={me} schoolYear={year} />));
const exportButton = () => host.querySelector('button[aria-label^="Export image of Grade"]');
const gradeButton = (grade) => [...host.querySelectorAll('button.sims-segment')].find((node) => node.textContent.startsWith(`Grade ${grade}`));
const input = (label) => {
  const field = [...host.querySelectorAll('label')].find((node) => node.textContent === label);
  return document.getElementById(field?.htmlFor);
};
const click = (node) => act(async () => { assert(node, 'Missing control'); node.focus(); node.click(); });
const change = (node, value) => act(async () => {
  assert(node, 'Missing field');
  Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});

// With ?checks, downloads are captured instead of saved: the link click is swallowed and its Blob
// kept. Without it the page is a plain preview and Export image downloads for real.
const checking = location.search.includes('checks');
const downloads = [];
const blobs = new Map();
if (checking) {
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = createObjectURL(blob); blobs.set(url, blob); return url; };
  HTMLAnchorElement.prototype.click = function capture() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); };
}

const reset = async (key) => { downloads.length = 0; await render(admin, SCHOOL_YEAR, key); };
const exportAndWait = async () => {
  await click(exportButton());
  for (let i = 0; i < 100 && !downloads.length; i += 1) await act(async () => { await sleep(50); });
  assert(downloads.length === 1, 'The image was never downloaded');
  return downloads[0];
};
const showPreview = (label, blob) => {
  const figure = previews.appendChild(document.createElement('figure'));
  const image = figure.appendChild(new Image());
  image.src = URL.createObjectURL(blob);
  image.alt = `${label} export`;
  image.style.width = '540px';
  figure.appendChild(document.createElement('figcaption')).textContent = label;
};
// Size, corner colour and how much of the image is ink or the teal accent.
const inspect = async (blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let ink = 0;
  let teal = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink += 1;
    if (Math.abs(data[i] - 7) < 12 && Math.abs(data[i + 1] - 118) < 12 && Math.abs(data[i + 2] - 131) < 12) teal += 1;
  }
  return { width: bitmap.width, height: bitmap.height, corner: [...data.slice(0, 4)].join(), ink, teal };
};

const checks = [
  ['Export image shows for every role that opens Sections, in the current school year only', async () => {
    await render(admin, SCHOOL_YEAR, 'admin');
    assert(exportButton()?.textContent === 'Export image', 'Administrator has no Export image button');
    assert(exportButton().getAttribute('aria-label') === 'Export image of Grade 8 sections', 'Wrong accessible name');
    await render(glc, SCHOOL_YEAR, 'glc');
    assert(exportButton(), 'Grade Level Coordinator has no button');
    await render({ role: 'jhs_coord' }, SCHOOL_YEAR, 'jhs');
    assert(exportButton(), 'Academic coordinator has no button');
    await render(admin, SCHOOL_YEAR, 'next-year');
    await change(input('School year'), '2027-2028');
    assert(host.textContent.includes('Aquino') && !exportButton(), 'The next-year planning view must not offer the image');
  }],
  ['One click downloads a light, non-blank PNG named for the grade and school year', async () => {
    await reset('download');
    const { filename, blob } = await exportAndWait();
    assert(filename === 'BNHS-Grade-8-Sections-SY2026-2027.png', `Wrong file name: ${filename}`);
    assert(blob.type === 'image/png', `Wrong type: ${blob.type}`);
    const pixels = await inspect(blob);
    assert(pixels.width === 2160 && pixels.height > 500 && pixels.height < 3000, `Unexpected size ${pixels.width}x${pixels.height}`);
    assert(pixels.corner === '255,255,255,255', 'The corner is not white');
    assert(pixels.ink > 20000 && pixels.teal > 1000, 'The image looks blank');
    assert(!exportButton().disabled, 'The button stayed busy');
    showPreview('Grade 8 (junior high)', blob);
  }],
  ['The image covers the whole grade while the search box filters the table', async () => {
    await reset('search');
    const full = await inspect((await exportAndWait()).blob);
    downloads.length = 0;
    await change(host.querySelector('input[type="search"]'), 'Mab');
    assert(host.textContent.includes('1 section in Grade 8 match'), 'The search did not filter the table');
    const filtered = await inspect((await exportAndWait()).blob);
    assert(filtered.height === full.height, 'The search box changed which sections were exported');
  }],
  ['Grade 11 exports its own file, as a different image from Grade 8', async () => {
    await reset('grade-11');
    const grade8 = await inspect((await exportAndWait()).blob);
    downloads.length = 0;
    await click(gradeButton(11));
    assert(exportButton().getAttribute('aria-label') === 'Export image of Grade 11 sections', 'The button did not follow the grade');
    const { filename, blob } = await exportAndWait();
    assert(filename === 'BNHS-Grade-11-Sections-SY2026-2027.png', `Wrong file name: ${filename}`);
    const grade11 = await inspect(blob);
    assert(grade11.height !== grade8.height, `Grade 11 came out as tall as Grade 8 (${grade8.height}px)`);
    showPreview('Grade 11 (senior high: Strand column, one learner without a sex on record)', blob);
  }],
  ['A failed export shows an alert, leaves the page usable, recovers and clears when the view changes', async () => {
    await reset('failure');
    const alertText = () => [...host.querySelectorAll('[role="alert"]')].map((node) => node.textContent).join('|');
    // Clicks Export image with PNG encoding broken; returns what the page logged with console.warn.
    const failedExport = async () => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      const warn = console.warn;
      const warnings = [];
      HTMLCanvasElement.prototype.toBlob = function failing(done) { done(null); };
      console.warn = (...args) => warnings.push(args);
      try {
        await click(exportButton());
        for (let i = 0; i < 100 && !alertText(); i += 1) await act(async () => { await sleep(50); });
      } finally { HTMLCanvasElement.prototype.toBlob = toBlob; console.warn = warn; }
      return warnings;
    };
    const warnings = await failedExport();
    assert(alertText() === 'Could not create the image. Please try again.', `Wrong or missing export error: "${alertText()}"`);
    assert(!downloads.length && !exportButton().disabled, 'The failed export left the page unusable');
    assert(warnings.length === 1 && warnings[0][0] === 'Grade image export failed' && warnings[0][1] instanceof Error, 'The cause of the failure was not logged');
    await exportAndWait();
    assert(!alertText(), 'The error stayed after a successful export');
    await failedExport();
    assert(alertText(), 'The second failed export showed no alert');
    await click(gradeButton(11));
    assert(!alertText(), 'The error stayed after switching to another grade');
    await failedExport();
    assert(alertText(), 'The failed Grade 11 export showed no alert');
    await change(input('School year'), '2027-2028');
    assert(host.textContent.includes('Aquino') && !alertText(), 'The error stayed after switching school year');
  }],
  ['Dark mode still produces a light image', async () => {
    await reset('dark');
    const root = document.documentElement;
    const theme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    try {
      const pixels = await inspect((await exportAndWait()).blob);
      assert(pixels.corner === '255,255,255,255', 'Dark mode leaked into the image');
    } finally { if (theme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme); }
  }],
];

if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
if (checking) {
  for (const [name, run] of checks) {
    const result = document.getElementById('results').appendChild(document.createElement('p'));
    try { await run(); result.textContent = `PASS ${name}`; }
    catch (error) { result.textContent = `FAIL ${name}: ${error.message}`; console.error(error); }
  }
} else {
  await reset('preview');
}
