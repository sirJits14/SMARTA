import { describe, it, expect } from 'vitest';
import S, { FORBIDDEN } from '../strings.js';

describe('strings', () => {
  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(S)) expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
  });
  it('never uses location/tracking/live wording', () => {
    for (const [k, v] of Object.entries(S)) for (const w of FORBIDDEN) expect(v.toLowerCase().includes(w), `${k} contains "${w}"`).toBe(false);
  });
  it('says gate scan, not attendance, on parent-facing labels', () => {
    expect(S.eventIn).toBe('Entered school');
    expect(S.eventOut).toBe('Left school');
    expect(S.pushDisclaimer).toContain('Inbox');
  });
  it('has the scan and adviser strings', () => {
    for (const k of ['scanButton', 'scanTitle', 'scanHelp', 'scanCancel', 'scanDenied', 'scanPhoto', 'scanNotSlip', 'scanPhotoFailed', 'scanLoadFailed', 'activateAdviserOption', 'activateAdviserHint', 'activateAdviserDeped'])
      expect(typeof S[k], k).toBe('string');
    expect(S.activateAdviserDeped).toContain('@deped.gov.ph');
  });
  it('has the appearance strings', () => {
    for (const k of ['themeTitle', 'themeAuto', 'themeLight', 'themeDark', 'themeGroupLabel', 'themeAutoStatusLight', 'themeAutoStatusDark', 'themeFixedLight', 'themeFixedDark', 'themeSavedHere'])
      expect(typeof S[k], k).toBe('string');
  });
});
