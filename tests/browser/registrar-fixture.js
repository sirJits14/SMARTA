import { useEffect, useState } from 'react';
const sy='2026-2027', today=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
const sections=Array.from({length:8},(_,i)=>({id:'sec'+i,name:['Acacia','Bamboo','Camia','Dahlia','Emerald','Faith','Galileo','Hope'][i],gradeLevel:7+Math.floor(i/2),schoolYear:sy}));
const students=Array.from({length:128},(_,i)=>({id:'s'+i,firstName:'Learner '+String(i+1).padStart(3,'0'),lastName:'Synthetic',sex:i%2?'F':'M',lrn:'999'+String(i).padStart(9,'0'),status:'active',birthdate:'2012-01-01',documents:{}}));
students[0].idCard={printedAt:{seconds:1},printedBy:'fixture@bnhs',lrn:students[0].lrn};
students[1].idCard={printedAt:{seconds:1},printedBy:'fixture@bnhs',lrn:'000000000000'};
const enrollments=students.slice(0,116).map((s,i)=>({id:s.id+'_'+sy,studentId:s.id,sectionId:'sec'+(i%8),schoolYear:sy,status:'enrolled',gradeLevel:sections[i%8].gradeLevel,dateEnrolled:today}));
const attendance=[{id:'sec0_'+today,sectionId:'sec0',schoolYear:sy,date:today,marks:{}}];
const data={students,sections,enrollments,student_attendance:attendance,schedules:[],kiosks:[]};
const settings={currentSchoolYear:sy,schoolId:'SYNTHETIC',schoolName:'BNHS Preview'};
function useScenario(){const [s,set]=useState(window.previewScenario||'normal');useEffect(()=>{const f=()=>set(window.previewScenario||'normal');window.addEventListener('preview-change',f);return()=>window.removeEventListener('preview-change',f)},[]);return s;}
const empty=[];
export function useCollectionResource(path){const s=useScenario();return {data:s==='empty'?empty:(data[path]||empty),loading:s==='loading',error:s==='error'?new Error('Synthetic failure'):null,retry:()=>{window.previewScenario='normal';window.dispatchEvent(new Event('preview-change'))}};}
export function useDocResource(path){useScenario();return {data:path==='settings/app'?settings:path?.startsWith('student_attendance/')?attendance.find(d=>d.id===path.split('/')[1])||null:null,loading:false,error:null,retry:()=>{}};}
export function useQueryResource(){useScenario();return {data:empty,loading:false,error:null,retry:()=>{}};}
export const useCollection=p=>useCollectionResource(p).data;
export const useDoc=p=>useDocResource(p).data;
export const useQueryRows=(q,d)=>useQueryResource(q,d).data;
