import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, onSnapshot as onQuerySnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

export function useCollection(path) {
  const [rows, setRows] = useState([]);
  useEffect(() => onSnapshot(collection(db, path),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [path]);
  return rows;
}

export function useDoc(path) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const [col, id] = path.split('/');
    return onSnapshot(doc(db, col, id), (s) => setData(s.exists() ? { id: s.id, ...s.data() } : null));
  }, [path]);
  return data;
}

// Bounded query listener for the Guardians area. buildQuery must include a
// limit(); never use useCollection() on audit_log, scan_events, reports,
// access_requests or guardian_links.
export function useQueryRows(buildQuery, deps) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setRows([]); return; }
    return onQuerySnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}
