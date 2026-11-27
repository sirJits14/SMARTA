import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('School access history', () => {
  it('has the audit_log index its query needs', () => {
    const { indexes } = JSON.parse(readFileSync(new URL('../../../../firestore.indexes.json', import.meta.url), 'utf8'));
    expect(indexes).toContainEqual({ collectionGroup: 'audit_log', queryScope: 'COLLECTION', fields: [
      { fieldPath: 'targetType', order: 'ASCENDING' }, { fieldPath: 'at', order: 'DESCENDING' }] });
  });
});
