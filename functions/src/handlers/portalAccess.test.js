import { it, expect } from 'vitest';
import { activateFamilyCode } from './portalAccess.js';
it('rejects the legacy adviser slip path before looking up a code', async () => {
  await expect(activateFamilyCode({}, { relationship: 'Adviser', code: 'ABCDEFGH' })).rejects.toMatchObject({ code: 'failed-precondition' });
});
