/* global __APP_BUILD__ */
// __APP_BUILD__ is replaced at build time by vite.config.js `define`; the
// fallback covers any tool that loads this file without that define.
const raw = typeof __APP_BUILD__ === 'undefined' ? {} : __APP_BUILD__;
export const BUILD = { date: raw.date || 'dev', commit: raw.commit || 'dev' };
export const versionLabel = (b = BUILD) => (b.commit === 'dev' ? b.date : `${b.date} (${b.commit})`);
