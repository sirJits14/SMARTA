import { S, T } from './styles.js';
export default function App() {
  return (
    <div style={{ ...S.page, display:'grid', placeItems:'center' }}>
      <h1 style={{ fontFamily:T.display, color:T.maroon }}>BNHS Learner Records</h1>
    </div>
  );
}
