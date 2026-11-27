import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  environment: 'node', fileParallelism: false, testTimeout: 20000,
  include: ['tests/rules/{existing,roles,parent,scanEvents,announcements,temporaryPassword,passwordReleaseCompatibility,schoolPortal,idCardBatch}.test.js'],
  // Broad-read isolation and direct school_years admin reads are held changes.
  // passwordReleaseCompatibility verifies the actual production contracts.
  testNamePattern: /^(?!.*(?:cannot read broad roster collections|school_years staff-read only))/,
} });
