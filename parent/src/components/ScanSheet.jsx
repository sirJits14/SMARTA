import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import S from '../strings.js';
import { Btn } from './ui.jsx';
import { createDetector, extractCode } from '../lib/qrScan.js';

const FRAME_MS = 125; // ~8 decodes a second is plenty and spares the battery

// Full-screen camera view that fills in the activation code from the slip's
// QR. It never activates anything itself; Activate still needs the parent's
// name, relationship and a tap on "Link learner".
export default function ScanSheet({ onCode, onClose }) {
  const video = useRef(null);
  const detector = useRef(null);
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode;
  const [status, setStatus] = useState('starting'); // starting | scanning | denied
  const [notSlip, setNotSlip] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let stream = null, raf = 0, stopped = false, last = 0;
    const stop = () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
    const found = (text) => {
      const code = extractCode(text);
      if (!code) { setNotSlip(true); return false; }
      navigator.vibrate?.(60);
      stop();
      onCodeRef.current(code);
      return true;
    };
    const tick = async (t) => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && t - last >= FRAME_MS) {
        last = t;
        const text = await detector.current.detect(v).catch(() => null);
        if (stopped || (text && found(text))) return;
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        detector.current = await createDetector();
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        setStatus('scanning');
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setStatus('denied');
      }
    })();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { stop(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoFailed(false);
    try {
      if (!detector.current) detector.current = await createDetector();
      const bitmap = await createImageBitmap(file);
      const code = extractCode(await detector.current.detect(bitmap));
      bitmap.close?.();
      if (code) { onCodeRef.current(code); return; }
    } catch { /* reported below */ }
    setPhotoFailed(true);
  };

  // Portalled to <body>: Activate renders inside a .glass-card whose
  // backdrop-filter would otherwise trap this position:fixed overlay inside
  // the card instead of covering the screen.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={S.scanTitle}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0B0A14', color: '#fff', display: 'grid', gridTemplateRows: 'auto 1fr auto', fontFamily: 'inherit' }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{S.scanTitle}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, opacity: 0.85 }}>{status === 'denied' ? S.scanDenied : S.scanHelp}</p>
      </div>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: status === 'denied' ? 'none' : 'block' }} />
        {status !== 'denied' && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 'min(64vw, 280px)', aspectRatio: '1', border: '3px solid rgba(255,255,255,0.9)', borderRadius: 18, boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)' }} />
          </div>
        )}
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        {notSlip && <p role="status" style={{ margin: 0, fontSize: 14, color: '#FDE68A' }}>{S.scanNotSlip}</p>}
        {photoFailed && <p role="alert" style={{ margin: 0, fontSize: 14, color: '#FCA5A5' }}>{S.scanPhotoFailed}</p>}
        <label style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', minHeight: 44, display: 'grid', placeItems: 'center' }}>
          {S.scanPhoto}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
        </label>
        <Btn variant="ghost" onClick={onClose} style={{ color: '#fff', borderColor: '#fff' }}>{S.scanCancel}</Btn>
      </div>
    </div>,
    document.body,
  );
}
