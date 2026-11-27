import base from './registrar.config.mjs';

export default {
  ...base,
  plugins: [{
    name: 'school-review-fixture', enforce: 'pre',
    resolveId(source) { if (source === 'firebase/functions') return 'virtual:school-functions'; },
    load(id) {
      const path = id.replaceAll('\\', '/');
      if (id === 'virtual:school-functions') return 'import { transport } from "/tests/browser/school-review-fixture.js"; export const httpsCallable = (_functions, name) => data => transport(name, data);';
      if (path.endsWith('/src/hooks/useCollection.js')) return 'export { useStaffCollectionResource } from "/tests/browser/school-review-fixture.js";';
    },
  }, ...base.plugins],
  server: { ...base.server, port: 5191 },
  cacheDir: '.superpowers/vite-school-review',
};
