// Design tokens for BNHS SIMS — registrar's ledger direction.
export const T = {
  ink:'#16233b', maroon:'#7a1f2b', gold:'#e0a422',
  paper:'#f5f7fa', line:'#d9dee6', surface:'#ffffff',
  present:'#157f43', late:'#9a6300', absent:'#c23b3b', excused:'#5b6b82',
  display:"'Zilla Slab',Georgia,serif",
  body:"'Public Sans',system-ui,sans-serif",
  num:{ fontFamily:"'Public Sans',system-ui,sans-serif", fontVariantNumeric:'tabular-nums' },
};
export const MARK_COLOR = { P:T.present, L:T.late, A:T.absent, E:T.excused };
// Shared style snippets reused across surfaces.
export const S = {
  page:{ fontFamily:T.body, color:T.ink, background:T.paper, minHeight:'100vh' },
  card:{ background:T.surface, border:`1px solid ${T.line}`, borderRadius:12, padding:20 },
};
