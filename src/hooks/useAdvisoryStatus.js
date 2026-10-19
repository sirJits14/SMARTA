import { useCallback, useEffect, useState } from 'react';
import { listAdvisoryStatus } from '../data/advisorySlips.js';

// Adviser and outstanding slip per section, current school year only.
export function useAdvisoryStatus(enabled) {
  const [state, setState] = useState({ bySection: new Map(), loading: enabled, error: '' });
  const reload = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const { sections } = await listAdvisoryStatus();
      setState({ bySection: new Map(sections.map((s) => [s.sectionId, s])), loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || 'Could not load advisers.' }));
    }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
