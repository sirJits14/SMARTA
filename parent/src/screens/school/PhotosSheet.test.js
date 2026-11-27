import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { PhotosList, PhotoEditor } from './PhotosSheet.jsx';

vi.mock('../../firebase.js', () => ({ app: {}, db: {}, auth: { currentUser: null }, callable: () => async () => ({ data: {} }) }));

const rows = [
  { studentId: 'S2', displayName: 'ZAMORA, ANA', photoUpdatedAt: 1000 },
  { studentId: 'S1', displayName: 'ABAD, BEN' },
  { studentId: 'S3', displayName: 'CRUZ, CARLA' },
];
const list = (props) => renderToStaticMarkup(createElement(PhotosList, { rows, onPick() {}, onClose() {}, ...props }));
const editor = (props) => renderToStaticMarkup(createElement(PhotoEditor, {
  row: rows[1], version: undefined, current: '', busy: false, error: '', ready: false, onReady() {}, onSave() {}, onBack() {}, ...props,
}));
const button = (html, text) => html.match(new RegExp(`<button[^>]*>${text}</button>`))?.[0] || '';

describe('PhotosList', () => {
  it('counts the learners who have a photo', () => {
    expect(list()).toContain('1 of 3 have a photo');
  });
  it('lists learners in the order given, each with a status and one button', () => {
    const html = list();
    expect(html.indexOf('ZAMORA, ANA')).toBeLessThan(html.indexOf('ABAD, BEN'));
    expect(html.indexOf('ABAD, BEN')).toBeLessThan(html.indexOf('CRUZ, CARLA'));
    expect(html.split(`>${S.photoAdded}<`)).toHaveLength(2);
    expect(html.split(`>${S.photoMissing}<`)).toHaveLength(3);
    expect(html.split(`>${S.photoReplace}</button>`)).toHaveLength(2);
    expect(html.split(`>${S.photoAdd}</button>`)).toHaveLength(3);
  });
  it('names the learner in each button label', () => {
    expect(list()).toContain(`aria-label="${S.photoReplace}: ZAMORA, ANA"`);
    expect(list()).toContain(`aria-label="${S.photoAdd}: ABAD, BEN"`);
  });
  it('shows a photo saved in this sheet before the class list catches up', () => {
    const html = list({ saved: { S1: 2000 } });
    expect(html).toContain('2 of 3 have a photo');
    expect(html).toContain(`aria-label="${S.photoReplace}: ABAD, BEN"`);
  });
});

describe('PhotoEditor', () => {
  it('offers a file, the camera, Save and Back, with Save off until a crop is ready', () => {
    const html = editor();
    for (const text of ['ABAD, BEN', S.photoChooseFile, S.photoUseCamera, S.photoMissing]) expect(html).toContain(text);
    expect(button(html, S.photoSave)).toContain('disabled=""');
    expect(button(html, S.back)).not.toContain('disabled=""');
    expect(html).not.toContain('<img');
  });
  it('accepts pictures through a file input that is not removed from the page', () => {
    const input = editor().match(/<input[^>]*type="file"[^>]*>/)[0];
    expect(input).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(input).not.toContain('hidden=""');
    expect(input).toContain('tabindex="-1"');
  });
  it('turns Save on once a crop is ready', () => {
    expect(button(editor({ ready: true }), S.photoSave)).not.toContain('disabled=""');
  });
  it('shows the current photo when there is one', () => {
    const html = editor({ version: 5, current: 'data:image/jpeg;base64,abc' });
    expect(html).toContain('src="data:image/jpeg;base64,abc"');
    expect(html).toContain(S.photoAdded);
  });
  it('locks every control while saving', () => {
    const html = editor({ busy: true, ready: true });
    expect(button(html, S.photoSaving)).toContain('disabled=""');
    for (const text of [S.back, S.photoChooseFile, S.photoUseCamera]) expect(button(html, text), text).toContain('disabled=""');
  });
  it('shows why a save failed', () => {
    expect(editor({ error: S.photoSaveFailed })).toContain(S.photoSaveFailed);
  });
});
