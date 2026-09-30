// Reads an activation code out of whatever a QR holds: the printed slip's
// link (<portal>/activate?c=CODE) or a bare code. Same normalisation as
// functions/src/lib/activationCode.js so a scanned code matches the server.
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const MAX_BARE = 16;
const MAX_FRAME = 640;

export const normalizeCode = (input) =>
  String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export function extractCode(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (!/\/activate\/?$/.test(url.pathname)) return null;
    candidate = url.searchParams.get('c') || '';
  } else if (raw.length > MAX_BARE) {
    return null;
  }
  const code = normalizeCode(candidate);
  return CODE_RE.test(code) ? code : null;
}

// The phone's own QR reader where it exists (Android Chrome); otherwise jsQR,
// loaded only now so it never weighs on the app's first load.
export async function createDetector({ win = globalThis, loadJsQR = () => import('jsqr').then((m) => m.default) } = {}) {
  if (win.BarcodeDetector) {
    try {
      const formats = await win.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const native = new win.BarcodeDetector({ formats: ['qr_code'] });
        return { kind: 'native', async detect(source) { return (await native.detect(source))[0]?.rawValue ?? null; } };
      }
    } catch { /* fall back to jsQR */ }
  }
  const jsQR = await loadJsQR();
  let canvas = null, ctx = null;
  return {
    kind: 'jsqr',
    async detect(source) {
      const w = source.videoWidth || source.width || 0;
      const h = source.videoHeight || source.height || 0;
      if (!w || !h) return null;
      const scale = Math.min(1, MAX_FRAME / Math.max(w, h));
      const cw = Math.round(w * scale), ch = Math.round(h * scale);
      if (!canvas) { canvas = win.document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
      canvas.width = cw; canvas.height = ch;
      ctx.drawImage(source, 0, 0, cw, ch);
      const { data } = ctx.getImageData(0, 0, cw, ch);
      return jsQR(data, cw, ch, { inversionAttempts: 'dontInvert' })?.data ?? null;
    },
  };
}
