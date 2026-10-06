import React,{act,useRef} from 'react';import {createRoot} from 'react-dom/client';
import '/src/registrar.css';
import StudentsPage from '/src/pages/StudentsPage.jsx';import SectionsPage from '/src/pages/SectionsPage.jsx';import SchedulesPage from '/src/pages/SchedulesPage.jsx';import {usePrintReadiness} from '/src/hooks/usePrintReadiness.js';import IDCardsPage from '/src/pages/IDCardsPage.jsx';import Shell from '/src/components/Shell.jsx';
window.IS_REACT_ACT_ENVIRONMENT=true;const host=document.getElementById('test-root');const root=createRoot(host);const results=document.getElementById('results');
const assert=(condition,message)=>{if(!condition)throw Error(message)};const render=async node=>{await act(async()=>root.render(node))};
const button=name=>[...host.querySelectorAll('button')].find(n=>n.textContent.trim()===name);
const input=label=>{const l=[...host.querySelectorAll('label')].find(n=>n.textContent===label);return document.getElementById(l?.htmlFor)};
const click=async node=>{assert(node,'button absent');await act(async()=>node.click())};
const scenario=async name=>{await act(async()=>{window.previewScenario=name;window.dispatchEvent(new Event('preview-change'))})};
const fill=async(node,value)=>{assert(node,'input absent');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))})};
const waitFor=async(check,message,ms=8000)=>{const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw Error(message);await act(async()=>new Promise(r=>setTimeout(r,50)))}};
const admin={role:'admin',email:'admin@bnhs'};
const openBatch=async()=>{try{localStorage.removeItem('sims.idCards.tab')}catch{}await scenario('normal');await render(<IDCardsPage me={admin} schoolYear="2026-2027"/>);await click(button('Saved batch'));};
const dialogText=()=>[...host.querySelectorAll('dialog[open]')].map(d=>d.textContent).join(' ');
const stubPrint=()=>{const real=window.print;let calls=0;window.print=()=>{calls++};return{calls:()=>calls,restore:()=>{window.print=real}}};
async function draftTest(Page,add,label){await scenario('normal');await render(<Page me={admin} schoolYear="2026-2027"/>);await click(button(add));await fill(input(label),'Retain this draft');await scenario('error');assert(host.querySelector('dialog[open]'),'Open draft dialog disappeared during resource error');assert(input(label).value==='Retain this draft','Draft lost during error');assert([...host.querySelectorAll('dialog button')].filter(n=>n.textContent.includes(add)).every(n=>n.matches(':disabled')),'Save remains enabled during error');await scenario('normal');assert(input(label).value==='Retain this draft','Draft lost after recovery');}
function PrintCase({show}){const ref=useRef(null);const ready=usePrintReadiness(ref,'same-key',1);return <><output data-ready>{String(ready)}</output>{show&&<div ref={ref}><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"/></div>}</>}
const tests=[['Section details have a keyboard button',async()=>{await scenario('normal');await render(<SectionsPage me={admin} schoolYear="2026-2027"/>);const control=host.querySelector('button[aria-label="View Acacia section details"]');assert(control,'Section detail button absent');await click(control);assert(host.querySelector('dialog[open]'),'Section details did not open');}],['Learner draft survives retrieval failure',()=>draftTest(StudentsPage,'Add learner','Last name')],['Section draft survives retrieval failure',()=>draftTest(SectionsPage,'Add section','Section name')],['Schedule draft survives retrieval failure',()=>draftTest(SchedulesPage,'Add schedule','Schedule name')],['Print readiness resets when QR root detaches',async()=>{await render(<PrintCase show/>);await act(async()=>new Promise(r=>setTimeout(r,80)));assert(host.querySelector('[data-ready]').textContent==='true','Initial QR never became ready');await render(<PrintCase show={false}/>);assert(host.querySelector('[data-ready]').textContent==='false','Detached QR root still reports ready');await render(<PrintCase show/>);await act(async()=>new Promise(r=>setTimeout(r,80)));assert(host.querySelector('[data-ready]').textContent==='true','Remounted QR root never became ready');}]
,['Saved batch prints its enrolled learners by section and sets aside the unenrolled one',async()=>{await openBatch();
  const cards=[...host.querySelectorAll('.id-cards-print-only .id-card')];assert(cards.length===4,'Print sheet has '+cards.length+' cards, expected 4');
  assert(cards.map(c=>c.querySelector('.id-card-section').textContent).join('|')==='7 · Acacia|8 · Camia|8 · Camia|9 · Faith','Cards are not in grade/section order');
  assert(host.textContent.includes("Not enrolled — won't print · 1"),'Unenrolled batch learner not set aside');
  assert(host.textContent.includes('4 of 80 — 76 more fills a sheet'),'Fill meter missing or wrong');
  assert([...host.querySelectorAll('span')].filter(n=>n.textContent==='Printed').length===1,'Expected one Printed tag (s0)');}]
,['Search offers enrolled learners not in the batch, and Add clears the search',async()=>{await openBatch();
  await fill(input('Add a learner'),'Learner 004');
  const add=host.querySelector('button[aria-label="Add Synthetic, Learner 004"]');assert(add,'Search did not offer Learner 004');
  await fill(input('Add a learner'),'Learner 003');assert(!host.querySelector('button[aria-label="Add Synthetic, Learner 003"]'),'Search offered a learner already in the batch');
  await fill(input('Add a learner'),'Learner 004');await click(host.querySelector('button[aria-label="Add Synthetic, Learner 004"]'));
  assert(input('Add a learner').value==='','Add did not clear the search');}]
,['Printing the batch asks before marking, and both answers close the dialog',async()=>{const print=stubPrint();try{await openBatch();
  await waitFor(()=>button('Print')&&!button('Print').disabled,'Print never became ready');
  await click(button('Print'));assert(print.calls()===1,'window.print not called');
  assert(dialogText().includes('Did these 4 cards print correctly?'),'Confirm dialog missing after print');
  await click(button("No, don't mark"));assert(!dialogText().includes('print correctly'),'Dialog stayed open after No');
  await click(button('Print'));await click(button('Yes, mark as printed'));
  await waitFor(()=>!dialogText().includes('print correctly'),'Dialog stayed open after Yes');}finally{print.restore()}}]
,['Clear batch asks first',async()=>{await openBatch();
  await click(button('Clear batch'));
  assert(dialogText().includes('Remove all 5 learners from the batch? Nothing is marked printed.'),'Clear confirm missing');
  await click(button('Cancel'));assert(!host.querySelector('dialog[open]'),'Confirm stayed open after Cancel');}]
,['Coordinator section print never asks to mark',async()=>{const print=stubPrint();try{await scenario('normal');
  await render(<SectionsPage me={{role:'jhs_coord'}} schoolYear="2026-2027"/>);
  await click(host.querySelector('button[aria-label="View Acacia section details"]'));
  await waitFor(()=>button('Print QR Codes')&&!button('Print QR Codes').disabled,'Section print never became ready');
  await click(button('Print QR Codes'));assert(print.calls()===1,'window.print not called');
  assert(!dialogText().includes('print correctly'),'Coordinator was asked to mark cards');}finally{print.restore()}}]
,['Section name is a full-width beveled button with an arrow',async()=>{await scenario('normal');
  await render(<div className="sims-ui"><SectionsPage me={admin} schoolYear="2026-2027"/></div>);
  const control=host.querySelector('button[aria-label="View Acacia section details"]');assert(control,'Section detail button absent');
  const [name,arrow]=control.children;
  assert(name?.textContent==='Acacia','Name span missing');
  assert(arrow?.textContent==='›'&&arrow.getAttribute('aria-hidden')==='true','Arrow must be an aria-hidden › span');
  const css=getComputedStyle(control);
  assert(css.display==='flex','Button is not flex: '+css.display);
  assert(css.textDecorationLine==='none','Button is still underlined');
  assert(css.boxShadow!=='none','Button has no bevel shadow');
  const cell=control.closest('td');const cellCss=getComputedStyle(cell);
  const inner=cell.clientWidth-parseFloat(cellCss.paddingLeft)-parseFloat(cellCss.paddingRight);
  assert(Math.abs(control.offsetWidth-inner)<=1,'Button does not fill the cell: '+control.offsetWidth+' vs '+inner);}],
['Sidebar brand is the SMARTA wordmark, S mark when collapsed',async()=>{try{localStorage.setItem('sims.sidebar.collapsed','false')}catch{}
  try{await render(<Shell me={{...admin,name:'Admin'}} page="dashboard" setPage={()=>{}} schoolYear="2026-2027" onLogout={()=>{}}><p>Body</p></Shell>);
  const logo=()=>host.querySelector('.sims-brand img');
  assert(logo()?.alt==='SMARTA','Brand alt is '+logo()?.alt);
  assert(logo().classList.contains('sims-wordmark')&&logo().src.includes('smarta-wordmark-sidebar'),'Expanded brand is not the tagline-free wordmark: '+logo().src);
  assert(!host.querySelector('.sims-brand strong'),'Old BNHS SIMS text still shown');
  assert(logo().getBoundingClientRect().width<=188,'Wordmark wider than its 188px slot: '+logo().getBoundingClientRect().width);
  await click(host.querySelector('button[aria-label="Collapse sidebar"]'));
  assert(logo()?.alt==='SMARTA'&&logo().src.includes('smarta-mark'),'Collapsed brand is not the S mark: '+logo()?.src);
  }finally{try{localStorage.removeItem('sims.sidebar.collapsed')}catch{}}}]];
for(const[name,test]of tests){try{await test();results.append(Object.assign(document.createElement('p'),{textContent:'PASS '+name}));}catch(e){results.append(Object.assign(document.createElement('p'),{textContent:'FAIL '+name+': '+e.message}));}finally{await render(null);}}
results.dataset.done='true';
