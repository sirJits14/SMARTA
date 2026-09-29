import { useEffect, useRef, useState } from 'react';
import { createActionRunner } from '../lib/actionRunner.js';
export function useAsyncAction() {
  const [state, setState] = useState({ pending: [], errors: {} });
  const mounted = useRef(true), runner = useRef(null);
  if (!runner.current) runner.current = createActionRunner(next => { if (mounted.current) setState(next); });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return { ...state, busy: state.pending.length > 0, run: runner.current.run };
}
