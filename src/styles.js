// Design tokens for BNHS SIMS — modern dashboard direction (see DESIGN.md).
// Adapted from a reference case-study image's register (indigo/lavender
// SaaS dashboard, rounded cards, pill badges) with our own token values and
// real product data — not a pixel clone. See
// docs/superpowers/specs/2026-07-24-bnhs-sims-dashboard-redesign-design.md
// for the full spec. All contrast pairs below are WCAG-verified by hand.
export const T = {
  primary: '#5B4FE8',      // main interactive/accent — 5.63:1 with white text
  primaryDeep: '#4638C2',  // hover/pressed state
  bg: '#F5F4FC',           // page background — soft lavender-tinted, not stark white
  surface: '#FFFFFF',      // card panels
  border: '#E7E5F5',       // hairlines, dividers, default input border
  ink: '#1E1B33',          // primary text — indigo-tinted near-black — 15.26:1 on bg, 16.67:1 on surface
  inkMuted: '#6B6890',     // secondary/muted text — 4.80:1 on bg, 5.24:1 on surface
  // Attendance status — functional requirement, not a style choice. All four
  // clear 4.5:1 with white pill text.
  present: '#15803D', late: '#B45309', absent: '#DC2626', excused: '#64748B',
  display: "'Inter',system-ui,sans-serif",
  body: "'Inter',system-ui,sans-serif",
  num: { fontFamily: "'Inter',system-ui,sans-serif", fontVariantNumeric: 'tabular-nums' },
  radius: 14,       // card corner radius
  pill: 999,        // full pill radius — badges, buttons, active nav item
  cardShadow: '0 1px 3px rgba(30,27,51,0.08), 0 4px 12px rgba(30,27,51,0.06)',
};
export const MARK_COLOR = { P: T.present, L: T.late, A: T.absent, E: T.excused };
// Shared style snippets reused across surfaces.
export const S = {
  page: { fontFamily: T.body, color: T.ink, background: T.bg, minHeight: '100vh' },
  card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20, boxShadow: T.cardShadow },
  plate: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  h1: { fontFamily: T.display, color: T.ink, margin: 0, fontSize: 22, fontWeight: 700 },
  h2: { fontFamily: T.display, color: T.ink, margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  thead: { background: 'rgba(91,79,232,0.05)', textAlign: 'left' },
  th: { padding: '10px 12px', borderBottom: `1px solid ${T.border}`, fontFamily: T.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.inkMuted },
  td: { padding: '10px 12px', borderBottom: `1px solid ${T.border}` },
};
