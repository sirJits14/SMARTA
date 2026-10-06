import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EnrollPage from '/src/pages/EnrollPage.jsx';
import { resetFixture, setScenario, writes } from './enrollment-fixture.js';

window.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.getElementById('root');
const root = createRoot(host);
const results = document.body.appendChild(document.createElement('div'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const button = (text, scope = host) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const input = label => { const node = [...host.querySelectorAll('label')].find(node => node.textContent === label); return document.getElementById(node?.htmlFor); };
const click = node => act(async () => { assert(node, 'Control absent'); node.focus(); node.click(); });
const change = (node, value) => act(async () => {
  Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const scenario = value => act(async () => setScenario(value));
const selectSection = () => click(host.querySelector('.sims-enrollment-section'));
const openDrawer = async () => { await selectSection(); await click(button('Enroll a learner')); };

const checks = [
  ['Directory filters by grade, searches, and counts only current resolvable learners', async () => {
    assert(host.querySelectorAll('.sims-enrollment-section').length === 30, 'Expected only Grade 7 sections');
    assert(!host.textContent.includes('Previous year section'), 'Previous year section shown');
    const first = host.querySelector('.sims-enrollment-section');
    assert(first.textContent.includes('Acacia') && first.querySelector('[aria-label="14 learners"]'), 'Roster count includes duplicates, missing learners, or previous years');
    await click(button('Grade 12 (20)')); await change(input('Search sections'), 'dean');
    assert(host.querySelectorAll('.sims-enrollment-section').length === 1 && host.textContent.includes('William Dean'), 'Grade search failed');
    await click(button('Grade 7 (30)')); assert(input('Search sections').value === '', 'Grade change retained stale search');
    await selectSection(); assert(host.querySelectorAll('tbody tr').length === 14, 'Roster count differs from directory');
  }],
  ['Drawer opens on demand, prefills destination, allows overrides, and restores focus', async () => {
    assert(!host.querySelector('dialog'), 'Form visible before opening'); await openDrawer();
    assert(input('Destination section').value === 'g7-0', 'Selected section not prefilled');
    await change(input('Destination grade'), '8'); assert(input('Destination section').value === '', 'Grade change left wrong-grade destination');
    assert(input('Destination section').options.length === 3, 'Destination options not filtered to Grade 8');
    await change(input('Destination section'), 'g8-b'); await click(button('Cancel'));
    assert(!host.querySelector('dialog') && document.activeElement === button('Enroll a learner'), 'Cancel did not close or restore opener focus');
  }],
  ['Failed enrollment retains entries; retry enrolls to the overridden section', async () => {
    await openDrawer(); await change(input('Learner'), 's24'); await change(input('Destination grade'), '8'); await change(input('Destination section'), 'g8-b');
    await scenario('save-error'); await click(button('Enroll learner'));
    assert(host.querySelector('dialog[open]') && input('Learner').value === 's24' && input('Destination section').value === 'g8-b', 'Failed save lost draft');
    assert(host.textContent.includes('Your entries are still here') && writes.length === 0, 'Failure feedback or write guard absent');
    await scenario('normal'); await click(button('Enroll learner'));
    assert(!host.querySelector('dialog') && writes[0]?.sectionId === 'g8-b', 'Retry did not save selected destination');
    assert(host.querySelector('.sims-enrollment-roster h2').textContent === 'Dahlia' && host.querySelectorAll('tbody tr').length === 1, 'Roster did not follow saved destination');
  }],
  ['Move requires confirmation and withdraw updates the selected class', async () => {
    await openDrawer(); await change(input('Learner'), 's14'); await click(button('Enroll learner'));
    const confirmation = [...host.querySelectorAll('dialog[open]')].find(node => node.textContent.includes('already enrolled'));
    assert(confirmation && writes.length === 0, 'Move wrote before confirmation');
    await click(button('Move learner', confirmation)); assert(writes[0]?.sectionId === 'g7-0' && !host.querySelector('dialog'), 'Move destination incorrect or dialogs remain open');
    await click(button('Withdraw'));
    const withdrawDialog = host.querySelector('dialog[open]'); await click(button('Withdraw', withdrawDialog));
    assert(writes.at(-1)?.kind === 'withdraw' && host.querySelectorAll('tbody tr').length === 14, 'Withdraw did not update roster');
  }],
  ['Open draft survives resource error and recovery', async () => {
    await openDrawer(); await change(input('Learner'), 's24'); await scenario('error');
    assert(host.querySelector('dialog[open]') && input('Learner').value === 's24' && input('Learner').matches(':disabled'), 'Resource error discarded draft or left controls enabled');
    await scenario('normal'); assert(input('Learner').value === 's24' && !input('Learner').matches(':disabled'), 'Retry lost draft');
  }],
  ['Empty and loading states do not offer an actionable enrollment', async () => {
    await scenario('empty'); assert(host.textContent.includes('No sections yet') && button('Enroll a learner').disabled, 'Empty state is actionable');
    await scenario('loading'); assert(host.textContent.includes('Loading records') && button('Enroll a learner').disabled, 'Loading state is actionable');
  }],
];
for (const [name, check] of checks) {
  try {
    await act(async () => { resetFixture(); root.render(<div className="sims-ui"><EnrollPage schoolYear="2026-2027" /></div>); });
    await check(); results.append(Object.assign(document.createElement('p'), { textContent: `PASS ${name}` }));
  } catch (error) {
    results.append(Object.assign(document.createElement('p'), { textContent: `FAIL ${name}: ${error.message}` }));
  } finally { await act(async () => root.render(null)); }
}
results.dataset.done = 'true';
