// Design tokens for BNHS SIMS — modern dashboard direction (see DESIGN.md).
// Adapted from a reference case-study image's register (rounded cards, pill
// badges) with our own token values, recolored to the SMARTA logo's teals, and
// real product data — not a pixel clone. See
// docs/superpowers/specs/2026-07-24-bnhs-sims-dashboard-redesign-design.md
// for the full spec.
// Colors are CSS variables so one attribute on <html> switches light/dark
// (docs/superpowers/specs/2026-10-06-dark-mode-design.md). Values and their
// WCAG checks live in shared/theme/theme.css and shared/theme/contrast.test.js;
// the light values are the original ones noted below.
export const T = {
  primary: 'var(--t-primary)',          // #007A72 — main interactive/accent; 5.22:1 with white text
  primaryDeep: 'var(--t-primary-deep)', // #154854 — logo dark teal
  bg: 'var(--t-bg)',                    // #F2F8F7 — page background
  surface: 'var(--t-surface)',          // #FFFFFF — card panels
  border: 'var(--t-border)',            // #DCEBE8 — hairlines, dividers
  ink: 'var(--t-ink)',                  // #12313A — primary text
  inkMuted: 'var(--t-muted)',           // #55706F — secondary text
  onPrimary: 'var(--t-on-primary)',     // text on primary (and danger) fills
  onStatus: 'var(--t-on-status)',       // text on attendance status fills
  // Attendance status — functional requirement, not a style choice.
  present: 'var(--t-present)', late: 'var(--t-late)', absent: 'var(--t-absent)', excused: 'var(--t-excused)',
  display: "'Inter',system-ui,sans-serif",
  body: "'Inter',system-ui,sans-serif",
  num: { fontFamily: "'Inter',system-ui,sans-serif", fontVariantNumeric: 'tabular-nums' },
  radius: 14,       // card corner radius
  pill: 999,        // full pill radius — badges, buttons, active nav item
  cardShadow: '0 1px 3px rgba(var(--t-ink-rgb),0.08), 0 4px 12px rgba(var(--t-ink-rgb),0.06)',
};
export const MARK_COLOR = { P: T.present, L: T.late, A: T.absent, E: T.excused };
// Shared style snippets reused across surfaces.
export const S = {
  page: { fontFamily: T.body, color: T.ink, background: T.bg, minHeight: '100vh' },
  card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20, boxShadow: T.cardShadow },
  plate: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  h1: { fontFamily: T.display, color: T.ink, margin: 0, fontSize: 22, fontWeight: 700 },
  h2: { fontFamily: T.display, color: T.ink, margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  thead: { background: 'rgba(var(--t-primary-rgb),0.05)', textAlign: 'left' },
  th: { padding: '10px 12px', borderBottom: `1px solid ${T.border}`, fontFamily: T.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.inkMuted },
  td: { padding: '10px 12px', borderBottom: `1px solid ${T.border}` },
};
