import {it,expect} from 'vitest';
import {shouldStartNavigation} from './navigationState.js';
it('preserves the active attendance draft for repeated sidebar selection',()=>{
expect(shouldStartNavigation('attendance','attendance')).toBe(false);
expect(shouldStartNavigation('attendance','attendance',null)).toBe(false);
});
it('starts a session for another destination or an explicit entry',()=>{
expect(shouldStartNavigation('dashboard','attendance')).toBe(true);
expect(shouldStartNavigation('attendance','attendance',{attendanceEntry:{sectionId:'sec0'}})).toBe(true);
});
