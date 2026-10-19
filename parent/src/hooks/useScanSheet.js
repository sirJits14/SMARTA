import { useCallback, useState } from 'react';
import S from '../strings.js';

// The camera code and jsQR fallback load only when someone taps Scan. A failed
// download is reported inline; typing the code still works.
export function useScanSheet() {
  const [Sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const open = () => {
    if (loading) return;
    setLoading(true); setError('');
    import('../components/ScanSheet.jsx')
      .then((m) => setSheet(() => m.default))
      .catch(() => setError(S.scanLoadFailed))
      .finally(() => setLoading(false));
  };
  const close = useCallback(() => setSheet(null), []);
  return { Sheet, open, close, loading, error };
}
