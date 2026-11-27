import { describe, it, expect } from 'vitest';
import { CONTACT_FIELDS, cleanContact, contactError } from './portalContact.js';

describe('cleanContact', () => {
  it('trims every field and fills missing ones with blanks', () => {
    expect(cleanContact({ contactPhone: ' 0917 123 4567 ', officeHours: 'Mon–Fri ' })).toEqual({ contactPhone: '0917 123 4567', contactEmail: '', contactFacebookUrl: '', officeHours: 'Mon–Fri' });
    expect(Object.keys(cleanContact(null))).toEqual(CONTACT_FIELDS);
  });
});

describe('contactError', () => {
  const ok = cleanContact({});
  it('accepts all blanks and valid values', () => {
    expect(contactError(ok)).toBeNull();
    expect(contactError({ ...ok, contactEmail: 'registrar@bnhs.edu.ph', contactFacebookUrl: 'https://www.facebook.com/bnhs' })).toBeNull();
  });
  it('rejects a malformed email', () => {
    expect(contactError({ ...ok, contactEmail: 'registrar' })).toMatch(/email/i);
  });
  it('rejects a Facebook link that is not https', () => {
    expect(contactError({ ...ok, contactFacebookUrl: 'facebook.com/bnhs' })).toMatch(/https:\/\//);
  });
});
