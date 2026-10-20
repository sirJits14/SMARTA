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
  it('has the relationship change strings', () => {
    for (const k of ['relLinkedAs', 'relChange', 'relChangedFrom', 'relSheetTitle', 'relOnceNote', 'relConfirm', 'relChangeFailed', 'relAdviserWarning', 'relMovedToAdviser', 'legacyAdviserTitle', 'legacyAdviserHint', 'legacyAdviserRow', 'legacyAdviserUnnamed'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the appearance strings', () => {
    for (const k of ['themeTitle', 'themeAuto', 'themeLight', 'themeDark', 'themeGroupLabel', 'themeAutoStatusLight', 'themeAutoStatusDark', 'themeFixedLight', 'themeFixedDark', 'themeSavedHere'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the settings category strings', () => {
    for (const k of ['settingsProfile', 'settingsInstall', 'settingsMyLearners', 'settingsReportsRequests', 'settingsHelp', 'settingsPrivacyAccount', 'settingsAbout',
      'settingsLearnersEmpty', 'settingsReportsEmpty', 'reportReviewed', 'notifShortOn', 'notifShortOff', 'notifShortBlocked', 'notifShortUnsupported', 'notifShortInstall',
      'notifRowScans', 'notifRowAnnouncements', 'notifHowToInstall', 'installBody', 'installButton', 'installDone', 'installIosHeader', 'installIosStep1', 'installIosStep2',
      'installIosStep3', 'installOther', 'helpPhone', 'helpEmail', 'helpFacebook', 'helpHours', 'helpEmpty', 'aboutVersion'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the session attendance strings', () => {
    for (const k of ['sessionButton', 'sessionTitle', 'sessionClose', 'sessionAm', 'sessionPm', 'sessionMorningShift', 'sessionAfternoonShift',
      'sessionWholeDay', 'sessionNoMark', 'sessionSplitNote', 'sessionSingleNote'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the school access request strings', () => {
    for (const k of ['schoolAccessTitle', 'schoolAccessRow', 'schoolAccessRowHint', 'schoolAccessIntro', 'schoolAccessRole', 'schoolAccessSection',
      'schoolAccessChooseSection', 'schoolAccessGrade', 'schoolAccessSubmit', 'schoolAccessSent', 'schoolAccessMine', 'schoolAccessNone', 'schoolAccessWithdraw',
      'schoolAccessWithdrawn', 'schoolAccessEnded', 'requestPending', 'requestApproved', 'requestRejected', 'requestWithdrawn',
      'schoolRequestsTitle', 'schoolRequestsIntro', 'schoolRequestsEmpty', 'schoolRequestsApprove', 'schoolRequestsReject',
      'schoolRequestsReason', 'schoolRequestsConfirmReject', 'schoolRequestsCancel', 'schoolRequestsNeedsAdmin',
      'schoolRequestsApproved', 'schoolRequestsRejected', 'announcementsEmptySchool'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the join strings', () => {
    for (const k of ['joinTitle', 'joinIntro', 'joinNameLabel', 'joinNameHint', 'joinRolesLabel', 'joinFamily', 'joinFamilyHint', 'joinAdviser', 'joinAdviserHint',
      'joinNeedsApproval', 'joinNeedsApprovalNote', 'joinActive', 'joinContinue', 'joinStep', 'joinSteps',
      'joinStepOf', 'joinOf', 'joinPreparing', 'joinPrepareFailed', 'joinSkipStep', 'adviserSlipTitle', 'adviserSlipBody', 'adviserScan', 'adviserScanTitle',
      'adviserCodeLabel', 'adviserCheck', 'adviserConfirmTitle', 'adviserConfirm', 'adviserNotMine', 'adviserNoSlip', 'adviserUseSlip', 'adviserRequestTitle',
      'adviserRequestBody', 'adviserWrongKind', 'familyWrongKind', 'adviserRequestInstead',
      'summaryTitle', 'summaryTitleNone', 'summaryLinked', 'summaryAdviser', 'summaryPending', 'summaryRetry', 'summaryContinue', 'summarySkipped',
      'addRoleRow', 'addRoleRowHint', 'schoolRequestsRow', 'requestFulfilled', 'requestSuperseded'])
      expect(typeof S[k], k).toBe('string');
  });
  it('calls the family role Parent/Guardian and drops Subject Teacher copy', () => {
    expect(S.joinFamily).toBe('Parent/Guardian');
    expect(S.modeFamily).toBe('Parent/Guardian');
    expect(S.addRoleRowHint).toBe('Parent/Guardian or Class Adviser');
    expect(S.schoolRequestsIntro).toBe('Class Adviser requests for your grades, from any verified email. Approving gives the teacher that role right away.');
    for (const k of ['joinSubject', 'joinSubjectHint', 'joinChooseOne', 'subjectTitle', 'subjectBody', 'subjectBodyApproval', 'subjectSubmit', 'summarySubject', 'summarySubjectOne']) {
      expect(S[k], k).toBeUndefined();
    }
    expect(Object.values(S).filter((v) => typeof v === 'string' && /Subject Teacher|Family Member/.test(v))).toEqual([]);
  });
});
