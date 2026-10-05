// Design tokens for BNHS SIMS — modern dashboard direction (see DESIGN.md).
// Adapted from a reference case-study image's register (rounded cards, pill
// badges) with our own token values, recolored to the SMARTA logo's teals, and
// real product data — not a pixel clone. See
// docs/superpowers/specs/2026-07-24-bnhs-sims-dashboard-redesign-design.md
// for the full spec. All contrast pairs below are WCAG-verified by hand.
export const T = {
  primary: '#007A72',      // main interactive/accent (deeper than logo teal #00A79D) — 5.22:1 with white text
  primaryDeep: '#154854',  // hover/pressed state — logo dark teal
  bg: '#F2F8F7',           // page background — soft teal-tinted, not stark white
  surface: '#FFFFFF',      // card panels
  border: '#DCEBE8',       // hairlines, dividers, default input border
  ink: '#12313A',          // primary text — teal-tinted near-black — 12.81:1 on bg, 13.76:1 on surface
  inkMuted: '#55706F',     // secondary/muted text — 4.97:1 on bg, 5.34:1 on surface
  // Attendance status — functional requirement, not a style choice. All four
  // clear 4.5:1 with white pill text.
  present: '#15803D', late: '#B45309', absent: '#DC2626', excused: '#64748B',
  display: "'Inter',system-ui,sans-serif",
  body: "'Inter',system-ui,sans-serif",
  num: { fontFamily: "'Inter',system-ui,sans-serif", fontVariantNumeric: 'tabular-nums' },
  radius: 14,       // card corner radius
  pill: 999,        // full pill radius — badges, buttons, active nav item
  cardShadow: '0 1px 3px rgba(18,49,58,0.08), 0 4px 12px rgba(18,49,58,0.06)',
};
export const MARK_COLOR = { P: T.present, L: T.late, A: T.absent, E: T.excused };
// Shared style snippets reused across surfaces.
export const S = {
  page: { fontFamily: T.body, color: T.ink, background: T.bg, minHeight: '100vh' },
  card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20, boxShadow: T.cardShadow },
  plate: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  h1: { fontFamily: T.display, color: T.ink, margin: 0, fontSize: 22, fontWeight: 700 },
  h2: { fontFamily: T.display, color: T.ink, margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  thead: { background: 'rgba(0,122,114,0.05)', textAlign: 'left' },
  th: { padding: '10px 12px', borderBottom: `1px solid ${T.border}`, fontFamily: T.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.inkMuted },
  td: { padding: '10px 12px', borderBottom: `1px solid ${T.border}` },
};
