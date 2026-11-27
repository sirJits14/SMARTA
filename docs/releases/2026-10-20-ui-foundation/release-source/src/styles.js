// Design tokens for BNHS SIMS: flat, bordered dashboard surfaces with a teal
// accent in light and dark (see DESIGN.md and
// docs/superpowers/specs/2026-10-20-sims-ui-modernization-design.md).
// Colors are CSS variables so one attribute on <html> switches light/dark.
// Values and their WCAG checks live in shared/theme/theme.css and
// shared/theme/contrast.test.js.
export const T = {
  primary: 'var(--t-primary)',          // light #077683 / dark #24A9B5 — actions, selection, state
  primaryDeep: 'var(--t-primary-deep)', // accent text on tinted fills
  bg: 'var(--t-bg)',                    // page background
  surface: 'var(--t-surface)',          // card panels
  border: 'var(--t-border)',            // hairlines, dividers
  ink: 'var(--t-ink)',                  // primary text
  inkMuted: 'var(--t-muted)',           // secondary text
  onPrimary: 'var(--t-on-primary)',     // text on primary (and danger) fills
  onStatus: 'var(--t-on-status)',       // text on attendance status fills
  // Attendance status — functional requirement, not a style choice.
  present: 'var(--t-present)', late: 'var(--t-late)', absent: 'var(--t-absent)', excused: 'var(--t-excused)',
  // SF Pro on Apple devices (native), Inter elsewhere; see --font-sans in theme.css.
  display: 'var(--font-sans)',
  body: 'var(--font-sans)',
  num: { fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' },
  // Printed cards and slips keep Inter so their fixed layouts set the same on every device.
  print: "'Inter',system-ui,sans-serif",
  radius: 12,       // card corner radius
  control: 8,       // buttons, inputs, menus
  pill: 999,        // full pill radius: badges and status pills only
  cardShadow: 'none', // surfaces separate with a 1px border, not a shadow
};
export const MARK_COLOR = { P: T.present, L: T.late, A: T.absent, E: T.excused };
// Shared style snippets reused across surfaces.
export const S = {
  page: { fontFamily: T.body, color: T.ink, background: T.bg, minHeight: '100vh' },
  card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20 },
  // Page heading row: title left, actions right, hairline below (see .sims-heading).
  plate: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  h1: { fontFamily: T.display, color: T.ink, margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 },
  h2: { fontFamily: T.display, color: T.ink, margin: '0 0 12px', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' },
  thead: { textAlign: 'left' },
  th: { padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontFamily: T.body, fontSize: 12, fontWeight: 500, color: T.inkMuted, whiteSpace: 'nowrap' },
  td: { padding: '12px 16px', borderBottom: `1px solid ${T.border}` },
};
