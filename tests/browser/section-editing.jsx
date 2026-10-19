import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import '/shared/theme/theme.css';
import '/src/registrar.css';
import SectionsPage from '/src/pages/SectionsPage.jsx';
import { requestedYears, resetFixture, setScenario, setAdviser, writes } from './section-editing-fixture.js';

window.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.getElementById('root');
const root = createRoot(host);
const glc = { role: 'glc', gradeLevel: 8, uid: 'synthetic-glc' };
const assert = (value, message) => { if (!value) throw Error(message); };
const render = (me = glc, year = '2026-2027', key = 'test') => act(async () => root.render(<SectionsPage key={key} me={me} schoolYear={year} />));
const button = (label, scope = host) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === label);
const input = label => {
  const field = [...host.querySelectorAll('label')].find(node => node.textContent === label);
  return document.getElementById(field?.htmlFor);
};
const click = node => act(async () => { assert(node, 'Missing control'); node.focus(); node.click(); });
const change = (node, value) => act(async () => {
  assert(node, 'Missing field');
  Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const reset = async key => { await act(async () => resetFixture()); await render(glc, '2026-2027', key); };
const checks = [
  ['Only own-grade current-year sections have Edit; Add/Delete remain absent', async () => {
    await reset('permissions');
    assert(button('Edit') && !button('Delete') && !button('Add section'), 'Wrong coordinator actions');
    assert(host.textContent.includes('Mabini') && !host.textContent.includes('Luna') && !host.textContent.includes('Historic section') && !host.textContent.includes('Rizal'), 'Sections escaped grade/year scope');
    assert([...input('School year').options].map(option => option.value).join(',') === '2026-2027,2027-2028', 'Wrong year window');
  }],
  ['Editor exposes only approved fields, selects an existing shift, and saves', async () => {
    await reset('save'); await click(button('Edit'));
    const dialog = host.querySelector('dialog[open]');
    assert(dialog && !input('Grade level') && !input('Track') && !input('Strand') && !dialog.querySelector('input[type="time"]'), 'Protected fields editable');
    assert(input('Schedule / shift').options.length === 3, 'Existing unassigned shift unavailable');
    await change(input('Section name'), 'Jacinto'); await change(input('Adviser name'), 'Dina Reyes');
    await change(input('Schedule / shift'), 'PM'); await click(button('Save changes'));
    assert(!host.querySelector('dialog') && host.textContent.includes('Jacinto') && host.textContent.includes('Dina Reyes'), 'Save did not update row and close');
    assert(JSON.stringify(writes) === JSON.stringify([{ sectionId: 'eight', name: 'Jacinto', adviserName: 'Dina Reyes', scheduleId: 'PM' }]), 'Request contained protected fields');
  }],
  ['Failed save retains draft and succeeds on retry', async () => {
    await reset('save-error'); await click(button('Edit'));
    await change(input('Section name'), 'Draft name'); await act(async () => setScenario('save-error'));
    await click(button('Save changes'));
    assert(input('Section name').value === 'Draft name' && host.textContent.includes('Your entries are still here') && !writes.length, 'Failed save lost draft');
    await act(async () => setScenario('normal')); await click(button('Save changes'));
    assert(writes.length === 1 && !host.querySelector('dialog'), 'Retry failed');
  }],
  ['Schedule retrieval failure disables save and retry preserves typed entries', async () => {
    await reset('options-error'); await act(async () => setScenario('options-error')); await click(button('Edit'));
    await change(input('Section name'), 'Retained name');
    assert(button('Save changes').disabled && host.textContent.includes('Could not load available schedules'), 'Missing safe loading failure');
    await act(async () => setScenario('normal')); await click(button('Try again'));
    assert(!button('Save changes').disabled && input('Section name').value === 'Retained name' && input('Schedule / shift'), 'Options retry lost draft');
    await click(button('Cancel'));
  }],
  ['Next-year section editing keeps learner reads in the current school year', async () => {
    await reset('next-year'); await change(input('School year'), '2027-2028');
    assert(host.textContent.includes('Rizal') && !host.textContent.includes('Mabini') && !host.querySelector('.sims-section-link'), 'Wrong next-year view');
    assert(requestedYears.get('students') === '2026-2027', 'Future learner query would be denied');
    await click(button('Edit')); await change(input('Adviser name'), 'Eva Santos'); await click(button('Save changes'));
    assert(writes[0]?.sectionId === 'next-eight' && host.textContent.includes('Eva Santos'), 'Next-year edit failed');
  }],
  ['Resource failure preserves the editor draft until records recover', async () => {
    await reset('resources'); await click(button('Edit')); await change(input('Section name'), 'Keep this name');
    await act(async () => setScenario('resource-error'));
    assert(host.querySelector('dialog fieldset').disabled && input('Section name').value === 'Keep this name', 'Draft was lost or remained actionable');
    await click(button('Try again', host.querySelector('dialog')));
    assert(!host.querySelector('dialog fieldset').disabled && input('Section name').value === 'Keep this name', 'Recovery lost draft');
    await click(button('Cancel'));
  }],
  ['Academic coordinators stay view-only and administrator actions remain available', async () => {
    await reset('roles'); await render({ role: 'jhs_coord' });
    assert(!button('Edit') && !button('Add section') && !button('Delete') && !input('School year'), 'Academic coordinator gained privileges');
    await render({ role: 'admin' }); assert(button('Edit') && button('Add section') && button('Delete'), 'Administrator actions regressed');
  }],
  ['Year rollover removes the old year and advances the planning window', async () => {
    await reset('rollover'); await change(input('School year'), '2027-2028');
    await render(glc, '2027-2028', 'rollover');
    assert([...input('School year').options].map(option => option.value).join(',') === '2027-2028,2028-2029', 'Year window did not roll forward');
  }],
  ['Administrator next-year setup keeps learner enrollment actions in the current year', async () => {
    await reset('admin-next'); await render({ role: 'admin' }, '2026-2027', 'admin-next');
    await change(input('School year'), '2027-2028');
    assert(host.textContent.includes('Rizal') && button('Edit') && button('Add section') && button('Delete'), 'Next-year section actions missing');
    assert(!host.querySelector('.sims-section-link') && !host.querySelector('dialog'), 'Next-year section can open current-year learner actions');
  }],
];

if (location.search.includes('checks')) {
  checks.push(['An open section detail follows the synced adviser', async () => {
    await reset('adviser-detail'); await click(host.querySelector('button[aria-label="View Mabini section details"]'));
    await act(async () => setAdviser('teacher', 'New Detail Adviser'));
    assert(host.querySelector('dialog').textContent.includes('New Detail Adviser'), 'The open detail still shows the previous adviser');
    await click(button('Close'));
  }]);
  checks.push(['An open editor follows adviser assignment and revocation without losing other edits', async () => {
    await reset('adviser-sync'); await click(button('Edit'));
    await change(input('Section name'), 'Unsaved section name');
    await act(async () => setAdviser('teacher', 'Assigned Teacher'));
    assert(input('Adviser name').readOnly && input('Adviser name').value === 'Assigned Teacher', 'Assignment did not lock and update the open editor');
    assert(input('Section name').value === 'Unsaved section name', 'Assignment discarded the section draft');
    await act(async () => setAdviser('replacement', 'Replacement Teacher'));
    assert(input('Adviser name').value === 'Replacement Teacher', 'Replacement did not update the open editor');
    await act(async () => setAdviser(undefined, 'Replacement Teacher'));
    assert(!input('Adviser name').readOnly && input('Adviser name').value === 'Replacement Teacher', 'Revocation did not preserve the name and unlock');
    await change(input('Adviser name'), 'Manual after revocation');
    await click(button('Save changes'));
    assert(writes[0]?.adviserName === 'Manual after revocation' && writes[0]?.name === 'Unsaved section name', 'Revoked adviser field could not be saved manually');
  }]);
  for (const [name, run] of checks) {
    const result = document.getElementById('results').appendChild(document.createElement('p'));
    try { await run(); result.textContent = `PASS ${name}`; }
    catch (error) { result.textContent = `FAIL ${name}: ${error.message}`; console.error(error); }
  }
}
await reset('preview');
document.getElementById('preview-role').addEventListener('change', event => render({ ...glc, role: event.target.value }, '2026-2027', event.target.value));
