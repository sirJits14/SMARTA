import React,{act,useRef} from 'react';import {createRoot} from 'react-dom/client';
import StudentsPage from '/src/pages/StudentsPage.jsx';import SectionsPage from '/src/pages/SectionsPage.jsx';import SchedulesPage from '/src/pages/SchedulesPage.jsx';import {usePrintReadiness} from '/src/hooks/usePrintReadiness.js';import IDCardsPage from '/src/pages/IDCardsPage.jsx';
window.IS_REACT_ACT_ENVIRONMENT=true;const host=document.getElementById('test-root');const root=createRoot(host);const results=document.getElementById('results');
const assert=(condition,message)=>{if(!condition)throw Error(message)};const render=async node=>{await act(async()=>root.render(node))};
const button=name=>[...host.querySelectorAll('button')].find(n=>n.textContent.trim()===name);
const input=label=>{const l=[...host.querySelectorAll('label')].find(n=>n.textContent===label);return document.getElementById(l?.htmlFor)};
const click=async node=>{assert(node,'button absent');await act(async()=>node.click())};
const scenario=async name=>{await act(async()=>{window.previewScenario=name;window.dispatchEvent(new Event('preview-change'))})};
const fill=async(node,value)=>{assert(node,'input absent');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))})};
const waitFor=async(check,message,ms=8000)=>{const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw Error(message);await act(async()=>new Promise(r=>setTimeout(r,50)))}};
const admin={role:'admin',email:'admin@bnhs'};
const openQueue=async()=>{try{localStorage.removeItem('sims.idCards.tab')}catch{}await scenario('normal');await render(<IDCardsPage me={admin} schoolYear="2026-2027"/>);await click(button('Print queue'));};
const dialogText=()=>[...host.querySelectorAll('dialog[open]')].map(d=>d.textContent).join(' ');
const stubPrint=()=>{const real=window.print;let calls=0;window.print=()=>{calls++};return{calls:()=>calls,restore:()=>{window.print=real}}};
async function draftTest(Page,add,label){await scenario('normal');await render(<Page me={admin} schoolYear="2026-2027"/>);await click(button(add));await fill(input(label),'Retain this draft');await scenario('error');assert(host.querySelector('dialog[open]'),'Open draft dialog disappeared during resource error');assert(input(label).value==='Retain this draft','Draft lost during error');assert([...host.querySelectorAll('dialog button')].filter(n=>n.textContent.includes(add)).every(n=>n.matches(':disabled')),'Save remains enabled during error');await scenario('normal');assert(input(label).value==='Retain this draft','Draft lost after recovery');}
function PrintCase({show}){const ref=useRef(null);const ready=usePrintReadiness(ref,'same-key',1);return <><output data-ready>{String(ready)}</output>{show&&<div ref={ref}><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"/></div>}</>}
const tests=[['Section details have a keyboard button',async()=>{await scenario('normal');await render(<SectionsPage me={admin} schoolYear="2026-2027"/>);const control=host.querySelector('button[aria-label="View Acacia section details"]');assert(control,'Section detail button absent');await click(control);assert(host.querySelector('dialog[open]'),'Section details did not open');}],['Learner draft survives retrieval failure',()=>draftTest(StudentsPage,'Add learner','Last name')],['Section draft survives retrieval failure',()=>draftTest(SectionsPage,'Add section','Section name')],['Schedule draft survives retrieval failure',()=>draftTest(SchedulesPage,'Add schedule','Schedule name')],['Print readiness resets when QR root detaches',async()=>{await render(<PrintCase show/>);await act(async()=>new Promise(r=>setTimeout(r,80)));assert(host.querySelector('[data-ready]').textContent==='true','Initial QR never became ready');await render(<PrintCase show={false}/>);assert(host.querySelector('[data-ready]').textContent==='false','Detached QR root still reports ready');await render(<PrintCase show/>);await act(async()=>new Promise(r=>setTimeout(r,80)));assert(host.querySelector('[data-ready]').textContent==='true','Remounted QR root never became ready');}]
,['Print queue merges unprinted learners from every section onto shared sheets',async()=>{await openQueue();
  assert(host.textContent.includes('115 learners not yet printed'),'Queue count wrong: expected 115 (s0 printed, s1 stale LRN)');
  const cards=host.querySelectorAll('.id-cards-print-only .id-card');assert(cards.length===115,'Print sheet has '+cards.length+' cards, expected 115');
  assert(host.querySelectorAll('.id-cards-print-only .id-cards-sheet').length===2,'Expected 115 cards on 2 sheets');
  const labels=new Set([...host.querySelectorAll('.id-cards-print-only .id-card-section')].map(n=>n.textContent));assert(labels.size===8,'Expected cards from 8 sections, got '+labels.size);
  assert(host.querySelector('.id-cards-print-only .id-card-section').textContent==='7 · Acacia','First card is not grade 7 Acacia');
  assert(host.textContent.includes('115 cards · 2 sheets'),'Action bar summary missing');}]
,['Printing the queue asks before marking, and both answers close the dialog',async()=>{const print=stubPrint();try{await openQueue();
  await waitFor(()=>button('Print')&&!button('Print').disabled,'Print never became ready');
  await click(button('Print'));assert(print.calls()===1,'window.print not called');
  assert(dialogText().includes('Did these 115 cards print correctly?'),'Confirm dialog missing after print');
  await click(button("No, don't mark"));assert(!dialogText().includes('print correctly'),'Dialog stayed open after No');
  await click(button('Print'));await click(button('Yes, mark as printed'));
  await waitFor(()=>!dialogText().includes('print correctly'),'Dialog stayed open after Yes');}finally{print.restore()}}]
,['Mark as printed without printing asks first',async()=>{await openQueue();
  await click(button('Mark as printed without printing'));
  assert(dialogText().includes('Mark 115 learners as printed? They will leave the queue.'),'Mark-without-printing confirm missing');
  await click(button('Cancel'));assert(!host.querySelector('dialog[open]'),'Confirm stayed open after Cancel');}]
,['Coordinator section print never asks to mark',async()=>{const print=stubPrint();try{await scenario('normal');
  await render(<SectionsPage me={{role:'jhs_coord'}} schoolYear="2026-2027"/>);
  await click(host.querySelector('button[aria-label="View Acacia section details"]'));
  await waitFor(()=>button('Print QR Codes')&&!button('Print QR Codes').disabled,'Section print never became ready');
  await click(button('Print QR Codes'));assert(print.calls()===1,'window.print not called');
  assert(!dialogText().includes('print correctly'),'Coordinator was asked to mark cards');}finally{print.restore()}}]];
for(const[name,test]of tests){try{await test();results.append(Object.assign(document.createElement('p'),{textContent:'PASS '+name}));}catch(e){results.append(Object.assign(document.createElement('p'),{textContent:'FAIL '+name+': '+e.message}));}finally{await render(null);}}
results.dataset.done='true';
