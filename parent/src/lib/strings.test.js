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
      'joinActive', 'joinContinue', 'joinStep', 'joinSteps',
      'joinStepOf', 'joinOf', 'joinPreparing', 'joinPrepareFailed', 'joinSkipStep', 'adviserSlipTitle', 'adviserSlipBody', 'adviserScan', 'adviserScanTitle',
      'adviserCodeLabel', 'adviserCheck', 'adviserConfirmTitle', 'adviserConfirm', 'adviserNotMine', 'adviserNoSlip', 'adviserUseSlip', 'adviserRequestTitle',
      'adviserRequestBody', 'adviserWrongKind', 'familyWrongKind', 'adviserRequestInstead',
      'summaryTitle', 'summaryTitleNone', 'summaryLinked', 'summaryAdviser', 'summaryPending', 'summaryRetry', 'summaryContinue', 'summarySkipped',
      'addRoleRow', 'addRoleRowHint', 'addRoleRowHintParent', 'schoolRequestsRow', 'requestFulfilled', 'requestSuperseded'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the SF2 download strings', () => {
    for (const k of ['classActions', 'sf2Button', 'sf2Title', 'sf2Hint', 'sf2Month', 'sf2Download', 'sf2Preparing', 'sf2Close', 'sf2NoLearners', 'sf2NoMonths', 'sf2Ready', 'sf2Save', 'sf2Failed', 'sf2SaveFailed'])
      expect(typeof S[k], k).toBe('string');
  });
  it('has the learner request strings', () => {
    for (const k of ['addLearnerButton', 'addLearnerTitle', 'addLearnerHint', 'learnerSectionLearner', 'learnerLrn', 'learnerLastName', 'learnerFirstName',
      'learnerMiddleName', 'learnerExt', 'learnerSex', 'learnerMale', 'learnerFemale', 'learnerChoose', 'learnerBirthdate', 'learnerEnrollType',
      'learnerSectionContact', 'learnerAddress', 'learnerGuardianName', 'learnerGuardianRelationship', 'learnerGuardianContact', 'learnerContactNumber',
      'learnerSend', 'learnerSending', 'learnerCancel', 'learnerSent', 'removeFromClass', 'removeHint', 'removeReason', 'removeNote', 'removeNoteHint',
      'removePending', 'withdrawRequest', 'requestWithdrawn', 'requestsTitle', 'requestsEmpty', 'requestsClose', 'requestsWaitingOne', 'requestsWaitingMany',
      'requestsPast', 'requestReasonLabel', 'requestSendAgain', 'learnerAddVerb', 'learnerRemoveVerb', 'learnerStatusPending', 'learnerStatusApproved',
      'learnerStatusRejected', 'learnerStatusWithdrawn'])
      expect(typeof S[k], k).toBe('string');
    expect(S.learnerSent).toBe('Sent for approval. You get an Inbox note when it is decided.');
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
