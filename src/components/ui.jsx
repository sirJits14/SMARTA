import { T } from '../styles.js';
const font = { fontFamily: T.body };
export const Btn = ({ style, variant='solid', ...p }) => (
  <button {...p} style={{ ...font, cursor:'pointer', border:'none', borderRadius:8, padding:'9px 16px',
    fontWeight:600, fontSize:13,
    background: variant==='solid' ? T.maroon : 'transparent',
    color: variant==='solid' ? '#fff' : T.ink,
    ...(variant==='ghost' ? { border:`1px solid ${T.line}` } : {}), ...style }} />
);
export const Inp = ({ style, ...p }) => (
  <input {...p} style={{ ...font, outline:'none', border:`1px solid ${T.line}`, borderRadius:8,
    padding:'9px 11px', fontSize:13, width:'100%', boxSizing:'border-box', ...style }} />
);
export const Sel = ({ style, ...p }) => (
  <select {...p} style={{ ...font, outline:'none', border:`1px solid ${T.line}`, borderRadius:8,
    padding:'9px 11px', fontSize:13, width:'100%', boxSizing:'border-box', background:'#fff', ...style }} />
);
export const Field = ({ label, error, children }) => (
  <label style={{ display:'block', marginBottom:12 }}>
    <span style={{ ...font, display:'block', fontSize:12, fontWeight:600, color:T.ink, marginBottom:4 }}>{label}</span>
    {children}
    {error && <span style={{ ...font, color:T.absent, fontSize:11 }}>{error}</span>}
  </label>
);
export const Modal = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(22,35,59,0.5)',
    display:'grid', placeItems:'center', zIndex:50 }}>
    <div onClick={(e)=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, padding:24,
      width:520, maxWidth:'92vw', maxHeight:'90vh', overflow:'auto' }}>{children}</div>
  </div>
);
export const Confirm = ({ message, onYes, onNo }) => (
  <Modal onClose={onNo}>
    <p style={{ ...font, color:T.ink, fontSize:14 }}>{message}</p>
    <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
      <Btn variant="ghost" onClick={onNo}>Keep it</Btn>
      <Btn onClick={onYes} style={{ background:T.absent }}>Delete</Btn>
    </div>
  </Modal>
);
export const EmptyState = ({ title, hint }) => (
  <div style={{ ...font, textAlign:'center', color:T.excused, padding:'48px 20px' }}>
    <div style={{ fontWeight:700, color:T.ink, marginBottom:6 }}>{title}</div>
    <div style={{ fontSize:13 }}>{hint}</div>
  </div>
);
