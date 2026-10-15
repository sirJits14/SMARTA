import base from './registrar.config.mjs';
import fs from 'node:fs';

export default {
  ...base,
  plugins: [{
    name: 'section-editing-fixture', enforce: 'pre',
    resolveId(source) { if (source === 'firebase/functions') return 'virtual:section-functions'; },
    load(id) {
      const path = id.replaceAll('\\', '/');
      if (id === 'virtual:section-functions') return 'import { transport } from "/tests/browser/section-editing-fixture.js"; export const httpsCallable = (_functions, name) => data => transport(name, data);';
      if (path.endsWith('/src/hooks/useCollection.js')) return 'export { useStaffCollectionResource } from "/tests/browser/section-editing-fixture.js";';
      if (path.endsWith('/src/data/coordinatorSections.js')) return fs.readFileSync(id, 'utf8');
    },
  }, ...base.plugins],
  server: { ...base.server, port: 5190 },
  cacheDir: 'node_modules/.vite-section-editing',
};
