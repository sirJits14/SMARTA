import base from './registrar.config.mjs';

export default {
  ...base,
  plugins: [{
    name: 'enrollment-preview-data', enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/src/hooks/useCollection.js')) return 'export { useCollectionResource } from "/tests/browser/enrollment-fixture.js";';
      if (path.endsWith('/src/data/enrollments.js')) return 'export { enrollStudent, withdrawEnrollment } from "/tests/browser/enrollment-fixture.js";';
    },
  }, ...base.plugins],
  server: { ...base.server, port: 5188 },
  cacheDir: 'node_modules/.vite-enrollment-preview',
};
