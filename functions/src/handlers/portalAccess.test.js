import { it, expect } from 'vitest';
import { activateFamilyCode, retiredRelationshipChange } from './portalAccess.js';
it('rejects the legacy adviser slip path before looking up a code', async () => {
  await expect(activateFamilyCode({}, { relationship: 'Adviser', code: 'ABCDEFGH' })).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('does not convert a legacy adviser link into family access without approval', async () => {
  await expect(retiredRelationshipChange({}, { relationship: 'Mother' })).rejects.toMatchObject({ code: 'failed-precondition' });
});
