import { describe,it,expect } from 'vitest';
import { resolveAttendanceEntry } from './attendanceEntry.js';
const base={sectionId:'a',date:'2026-09-25',schoolYear:'2026-2027',sections:[{id:'a',schoolYear:'2026-2027'}],ready:true};
describe('attendance entry',()=>{
  it('waits for sections before validating',()=>expect(resolveAttendanceEntry({...base,ready:false,sections:[]})).toMatchObject({status:'pending'}));
  it('accepts only a current-year section with a real date',()=>expect(resolveAttendanceEntry(base)).toMatchObject({status:'valid',sectionId:'a',date:'2026-09-25'}));
  it.each([{sectionId:'gone'},{schoolYear:'old'},{date:'2026-02-30'},{date:'nonsense'}])('rejects unavailable targets',patch=>expect(resolveAttendanceEntry({...base,...patch})).toMatchObject({status:'invalid',sectionId:''}));
  it('leaves ordinary attendance entry unselected',()=>expect(resolveAttendanceEntry({...base,sectionId:undefined,date:undefined})).toMatchObject({status:'none',sectionId:''}));
});
