// Same token shape as the SIMS (see src/styles.js), tuned for phones: larger tap
// targets. Font: SF Pro on Apple devices, Inter elsewhere (--font-sans).
// Colors are CSS variables from shared/theme/theme.css, so light/dark follows
// <html data-theme> (docs/superpowers/specs/2026-10-06-dark-mode-design.md).
export const T = {
  primary: 'var(--t-primary)', primaryDeep: 'var(--t-primary-deep)', bg: 'var(--t-bg)', surface: 'var(--t-surface)', border: 'var(--t-border)',
  ink: 'var(--t-ink)', inkMuted: 'var(--t-muted)', danger: 'var(--t-absent)', ok: 'var(--t-present)', warn: 'var(--t-late)',
  onPrimary: 'var(--t-on-primary)', onStatus: 'var(--t-on-status)', dangerText: 'var(--t-danger-text)', warnText: 'var(--t-warn-text)',
  font: 'var(--font-sans)',
  radius: 12, pill: 999, tap: 48,
};
