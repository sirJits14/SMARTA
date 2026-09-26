import { describe, it, expect } from 'vitest';
import { attendanceCoverage, recentEnrollments } from './dashboardStats.js';
const schoolYear='2026-2027', date='2026-09-25';
const students=[{id:'s1',firstName:'Test',lastName:'One',sex:'M'},{id:'s2',firstName:'Test',lastName:'Two',sex:'F'}];
const sections=[{id:'b',name:'B',gradeLevel:8,schoolYear},{id:'a',name:'A',gradeLevel:7,schoolYear},{id:'empty',name:'Empty',gradeLevel:9,schoolYear}];
const enrollments=[{studentId:'s1',sectionId:'a',status:'enrolled',schoolYear},{studentId:'s2',sectionId:'b',status:'enrolled',schoolYear}];
const base={students,sections,enrollments,schoolYear,date};
const record={sectionId:'a',schoolYear,date,marks:{}};
describe('attendance record coverage',()=>{
  it('counts saved empty marks once and excludes empty/orphan sections',()=>{
    const r=attendanceCoverage({...base,attendance:[record,record,{...record,sectionId:'empty'},{...record,sectionId:'orphan'}]});
    expect(r).toMatchObject({recordedCount:1,totalSections:2,percent:50});
    expect(r.pendingSections.map(s=>s.id)).toEqual(['b']);
  });
  it.each([{...record,date:'2026-09-24'},{...record,schoolYear:'2025-2026'},{...record,schoolYear:undefined}])('ignores records outside current date/year',wrong=>{
    expect(attendanceCoverage({...base,attendance:[wrong]})).toMatchObject({recordedCount:0,totalSections:2,percent:0});
  });
  it('returns null rather than completion when no enrolled sections exist',()=>{
    expect(attendanceCoverage({...base,enrollments:[],attendance:[record]})).toMatchObject({recordedCount:0,totalSections:0,percent:null,pendingSections:[]});
  });
  it('excludes unresolved learners and wrong-year enrollment and section records',()=>{
    const r=attendanceCoverage({...base,students:[],attendance:[record]});
    expect(r.totalSections).toBe(0);
    expect(attendanceCoverage({...base,enrollments:enrollments.map(e=>({...e,schoolYear:'old'})),attendance:[]}).totalSections).toBe(0);
    expect(attendanceCoverage({...base,sections:sections.map(s=>({...s,schoolYear:'old'})),attendance:[]}).totalSections).toBe(0);
  });
  it('sorts pending sections and never inflates duplicate inputs',()=>{
    expect(attendanceCoverage({...base,sections:[...sections,sections[0]],enrollments:[...enrollments,...enrollments],attendance:[]}).pendingSections.map(s=>s.id)).toEqual(['a','b']);
    expect(attendanceCoverage({...base,attendance:[record,{...record,sectionId:'b'},record]})).toMatchObject({recordedCount:2,totalSections:2,percent:100,pendingSections:[]});
  });
  it('filters activity by year before limiting',()=>{
    const rows=[{studentId:'old',schoolYear:'old',status:'enrolled',dateEnrolled:'2026-10-01'},{studentId:'current',schoolYear,status:'enrolled',dateEnrolled:'2026-09-25'}];
    expect(recentEnrollments(rows,schoolYear,1).map(e=>e.studentId)).toEqual(['current']);
  });
});
