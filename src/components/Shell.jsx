import { T } from '../styles.js';
import { Btn } from './ui.jsx';
const NAV = [
  { k:'students', label:'Students' },
  { k:'sections', label:'Sections' },
  { k:'enroll', label:'Enrollment' },
  { k:'attendance', label:'Attendance' },
];
export default function Shell({ me, page, setPage, schoolYear, onLogout, children }) {
  return (
    <div style={{ fontFamily:T.body, color:T.ink, minHeight:'100vh', background:T.paper, display:'grid', gridTemplateColumns:'200px 1fr', gridTemplateRows:'56px 1fr' }}>
      <div style={{ gridColumn:'1 / 3', background:T.ink, color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 18px' }}>
        <span style={{ fontFamily:T.display, fontSize:18, fontWeight:600 }}>BNHS Learner Records</span>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ background:T.maroon, borderRadius:20, padding:'3px 12px', fontSize:12, ...T.num }}>SY {schoolYear}</span>
          <span style={{ fontSize:12, opacity:0.8 }}>{me.name}</span>
          <Btn variant="ghost" onClick={onLogout} style={{ color:'#fff', borderColor:'rgba(255,255,255,0.3)' }}>Sign out</Btn>
        </div>
      </div>
      <nav style={{ background:T.surface, borderRight:`1px solid ${T.line}`, padding:12 }}>
        {NAV.map((n) => (
          <button key={n.k} onClick={()=>setPage(n.k)} style={{ fontFamily:T.body, display:'block', width:'100%', textAlign:'left', border:'none', borderRadius:8, padding:'10px 12px', marginBottom:4, cursor:'pointer', fontSize:13, fontWeight: page===n.k?700:500, background: page===n.k?T.paper:'transparent', color: page===n.k?T.maroon:T.ink }}>{n.label}</button>
        ))}
      </nav>
      <main style={{ padding:24, overflow:'auto' }}>{children}</main>
    </div>
  );
}
