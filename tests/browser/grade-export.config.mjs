import base from './registrar.config.mjs';

export default {
  ...base,
  plugins: [{
    name: 'grade-export-fixture', enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/src/hooks/useCollection.js')) return 'export { useStaffCollectionResource } from "/tests/browser/grade-export-fixture.js";';
      // Advisory slips are not under test; without this the blanket data stubs make the hook report an error banner.
      if (path.endsWith('/src/hooks/useAdvisoryStatus.js')) return 'export const useAdvisoryStatus = () => ({ bySection: new Map(), loading: false, error: "", reload() {} });';
    },
  }, ...base.plugins],
  server: { ...base.server, port: 5192 },
  cacheDir: 'node_modules/.vite-grade-export',
};
