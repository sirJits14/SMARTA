// DIRECTION CONTRACT — "The Card File" (see DESIGN.md for the full system)
// THESIS: Registration isn't a dashboard task, it's filing — every screen is
//   a drawer of index cards, refusing the sidebar-plus-stat-tiles default.
// OWN-WORLD: Walnut drawer-frame ground, manila card surfaces, brass tab
//   accents (Bright on walnut, Deep on manila); Courier Prime for every
//   typed record field, Work Sans for UI chrome; 4 status colors as brass
//   guide-tab flags, never dots/pills/side-borders.
// STORY: The registrar pulls a drawer, flips a card, stamps today's mark,
//   refiles — a tactile record system trustworthy enough to hand a principal.
// FIRST VIEWPORT (Attendance, the priority surface): an open drawer for the
//   picked section — a stack of card-rows, each a typed LRN/name with a
//   brass-tabbed status flag at its right edge; a tally ribbon up top.
// FORM: candidate 7 of 7 grounded directions (card-catalog world), assigned
//   by concept-seed.mjs (key 440d6ec7, mode operate); no dealt challenger
//   (cassette-futurism panel, Saul Bass titles, origami crane, mesophotic
//   dive, teletext, variable-font specimen) beat it on audience
//   identification or product clarity after fusing and weighing all six.
// All contrast pairs below are WCAG-verified against their intended ground —
// see DESIGN.md §Colors for the exact ratios and why Brass has two values.
export const T = {
  walnut: '#3E2B1F',       // drawer/cabinet ground — page frame, masthead, nav rail
  manila: '#E8DCB8',       // card/content surface — everything actually read or typed sits here
  ink: '#2A2118',          // primary text on manila (11.5:1)
  line: '#C9B98A',         // hairline dividers/borders on manila
  brassBright: '#9C7A3C',  // accent ON WALNUT ONLY — nav highlight, masthead icons (3.35:1 on walnut)
  brassDeep: '#7A5C28',    // accent ON MANILA ONLY — button borders, focus rings, icons on cards (4.53:1 on manila)
  brassPlate: '#5C4527',   // walnut warmed toward brass — the "pulled-out drawer front" active-nav fill (manila text 6.58:1)
  // Guide-tab status colors — attendance/enrollment semantics only, white label text (all ≥4.5:1)
  present: '#4B6B4F', late: '#8B6914', absent: '#8B3A2F', excused: '#4A5568',
  display: "'Courier Prime',ui-monospace,Menlo,Consolas,monospace", // typed record content: names, titles
  body: "'Work Sans',system-ui,sans-serif",                        // UI chrome: labels, buttons, nav
  num: { fontFamily: "'Courier Prime',ui-monospace,Menlo,Consolas,monospace" }, // data fields — monospace is inherently tabular
  radius: 3,       // nearly-square corners everywhere — never a pill/rounded-2xl radius
  cardShadow: '0 2px 5px rgba(46,33,15,0.22)',      // paper-thickness shadow: warm-toned, offset+blur, never a cool/glass shadow
  tabShadow: '0 3px 7px rgba(46,33,15,0.3)',        // guide-tabs overhang the card edge, so their shadow reads slightly stronger
  // Trapezoidal guide-tab notch — the signature shape, never a plain rounded rectangle.
  tabClip: 'polygon(0 0, 100% 8%, 100% 92%, 0 100%)',
};
export const MARK_COLOR = { P: T.present, L: T.late, A: T.absent, E: T.excused };
export const MARK_LABEL_SHORT = { P: 'PRES', L: 'LATE', A: 'ABS', E: 'EXC' };
// Shared style snippets reused across surfaces.
export const S = {
  page: { fontFamily: T.body, color: T.ink, background: T.walnut, minHeight: '100vh' },
  card: { background: T.manila, border: `1px solid ${T.line}`, borderRadius: T.radius, padding: 20, boxShadow: T.cardShadow },
  // A page's walnut-ground title row — headings here use T.manila text, never T.ink (verified 9.77:1).
  plate: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  h1: { fontFamily: T.display, color: T.manila, margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '0.01em' },
  h2: { fontFamily: T.display, color: T.ink, margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  thead: { background: 'rgba(201,185,138,0.32)', textAlign: 'left' },
  th: { padding: '9px 12px', borderBottom: `1px solid ${T.line}`, fontFamily: T.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.75 },
  td: { padding: '10px 12px', borderBottom: `1px solid ${T.line}` },
};
