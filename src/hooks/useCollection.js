import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
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
