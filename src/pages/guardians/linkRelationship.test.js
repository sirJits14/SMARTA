import { describe, it, expect } from 'vitest';
import { relationshipChangeNote, canCorrectRelationship, correctionOptions } from './linkRelationship.js';

describe('relationshipChangeNote', () => {
  it('names the old relationship for a change made this school year', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: 'Mother', relationshipChangedFor: '2026-2027' })).toBe('changed from Mother');
  });
  it('says corrected when an administrator made the change', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Mother', previousRelationship: 'Guardian', relationshipChangedFor: '2026-2027', relationshipChangedBy: 'admin@deped.gov.ph' })).toBe('corrected from Guardian');
  });
  it('is empty for links never changed, or changed in an earlier school year', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Mother' })).toBeNull();
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: 'Mother', relationshipChangedFor: '2025-2026' })).toBeNull();
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: null, relationshipChangedFor: '2026-2027' })).toBeNull();
  });
});

describe('canCorrectRelationship', () => {
  it('allows active family links, including legacy links with no slot', () => {
    expect(canCorrectRelationship({ status: 'active', relationship: 'Guardian', slot: 'guardian' })).toBe(true);
    expect(canCorrectRelationship({ status: 'active', relationship: 'Mother' })).toBe(true);
  });
  it('refuses ended links and adviser links', () => {
    expect(canCorrectRelationship({ status: 'revoked', relationship: 'Mother', slot: 'guardian' })).toBe(false);
    expect(canCorrectRelationship({ status: 'expired', relationship: 'Mother' })).toBe(false);
    expect(canCorrectRelationship({ status: 'active', relationship: 'Adviser', slot: 'adviser' })).toBe(false);
    expect(canCorrectRelationship({ status: 'active', relationship: 'Adviser' })).toBe(false);
    expect(canCorrectRelationship({ status: 'active', relationship: 'Mother', slot: 'adviser' })).toBe(false);
    expect(canCorrectRelationship(null)).toBe(false);
  });
});

describe('correctionOptions', () => {
  it('lists the other family relationships and never Adviser', () => {
    expect(correctionOptions({ relationship: 'Guardian' })).toEqual(['Mother', 'Father', 'Grandparent', 'Sibling', 'Other']);
    expect(correctionOptions({ relationship: 'Mother' })).not.toContain('Adviser');
  });
});
