import base from './registrar.config.mjs';

// Shell preview: the registrar harness plus a fixed pending-requests badge.
export default {
  ...base,
  plugins: [{
    name: 'shell-preview-data', enforce: 'pre',
    load(id) {
      if (id.replaceAll('\\', '/').endsWith('/src/hooks/useSchoolPendingCount.js')) {
        return 'export const useSchoolPendingCount = () => 3; export const refreshSchoolPendingCount = async () => {};';
      }
    },
  }, ...base.plugins],
  server: { ...base.server, port: 5191 },
  cacheDir: 'node_modules/.vite-shell-preview',
};
