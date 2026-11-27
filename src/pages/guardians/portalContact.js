// School contact details staff set for the Parents App's
// Settings > Help & Contact School page (stored on settings/parent_portal).
export const CONTACT_FIELDS = ['contactPhone', 'contactEmail', 'contactFacebookUrl', 'officeHours'];

export const cleanContact = (values) => Object.fromEntries(CONTACT_FIELDS.map((k) => [k, String(values?.[k] ?? '').trim()]));

export function contactError({ contactEmail, contactFacebookUrl }) {
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return 'Enter a valid email address, or leave Email blank.';
  if (contactFacebookUrl && !contactFacebookUrl.startsWith('https://')) return 'The Facebook page link must start with https://';
  return null;
}
