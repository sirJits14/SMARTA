import { useEffect, useRef, useState } from 'react';
import { MAX_ZOOM, initialView, clampView } from '../../../shared/studentPhoto.js';
import { createCamera, createCropSettler } from '../../../shared/photoSession.js';
import { imageSize, drawCrop, exportPhoto, decodeImage, releaseImage, captureFrame, panView, arrowView } from '../lib/photoCanvas.js';
import { Banner, Btn, Field } from './ui.jsx';
import S from '../strings.js';

const ACCEPT = 'image/jpeg,image/png,image/webp';
// The preview is 280px square on screen, drawn at twice that for sharp displays.
const PREVIEW_PIXELS = 560;

// Picks a picture (file or camera) and positions a square crop over it.
// onReady(base64) follows each settled change; onReady('') means "not ready".
export default function PhotoCropper({ onReady, disabled = false }) {
  const [picture, setPicture] = useState(null); // { image, view }
  const [opening, setOpening] = useState(false); // a chosen file is being read
  const [camera, setCamera] = useState(null); // null = closed, { stream: null } = opening
  const [videoReady, setVideoReady] = useState(false);
  const [cameraUsed, setCameraUsed] = useState(false);
  const [message, setMessage] = useState('');
  const latest = useRef(null); // the picture as of the last event, ahead of the next render
  const job = useRef(0); // a file being read applies only while its number is current
  const drag = useRef(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const endedRef = useRef(null);
  const [tools] = useState(() => ({
    camera: createCamera(undefined, () => endedRef.current?.()),
    crop: createCropSettler({ encode: exportPhoto, publish: (photo) => readyRef.current(photo), fail: () => setMessage(S.photoPrepareFailed) }),
  }));

  // Leaving the editor turns the camera off and discards anything still running.
  useEffect(() => () => { job.current += 1; tools.camera.stop(); tools.crop.cancel(); releaseImage(latest.current?.image); }, [tools]);
  useEffect(() => {
    if (picture && canvasRef.current) drawCrop(canvasRef.current, picture.image, picture.view);
  }, [picture, camera]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !camera?.stream) return undefined;
    video.srcObject = camera.stream;
    video.play()?.catch(() => {});
    return () => { video.srcObject = null; };
  }, [camera]);

  const show = (image, view) => {
    latest.current = { image, view };
    setPicture(latest.current);
    setMessage('');
    tools.crop.change(image, view);
  };
  const move = (view) => {
    const now = latest.current;
    if (view !== now.view) show(now.image, view);
  };
  const discard = () => {
    releaseImage(latest.current?.image);
    latest.current = null;
    setPicture(null);
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so the same file can be chosen again
    if (!file) return;
    const mine = ++job.current;
    tools.crop.hold();
    discard();
    setMessage('');
    setOpening(true);
    let image = null;
    try { image = await decodeImage(file); }
    catch { /* reported below */ }
    if (mine !== job.current) { releaseImage(image); return; }
    setOpening(false);
    if (image) show(image, initialView(imageSize(image)));
    else setMessage(S.photoBadFile);
  };

  // Leaving the camera without a capture brings back the earlier picture, if any.
  const closeCamera = () => {
    tools.camera.stop();
    setCamera(null);
    if (latest.current) tools.crop.change(latest.current.image, latest.current.view);
  };
  endedRef.current = () => { closeCamera(); setMessage(S.photoCameraUnavailable); };
  const openCamera = async () => {
    job.current += 1;
    setOpening(false);
    tools.crop.hold();
    setMessage('');
    setVideoReady(false);
    setCameraUsed(true);
    setCamera({ stream: null });
    try {
      const stream = await tools.camera.start();
      if (stream) setCamera({ stream });
    } catch {
      closeCamera();
      setMessage(S.photoCameraUnavailable);
    }
  };
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const frame = captureFrame(video);
    tools.camera.stop();
    setCamera(null);
    releaseImage(latest.current?.image);
    show(frame, initialView(imageSize(frame)));
  };
  const videoStarted = () => setVideoReady(true);

  const startDrag = (event) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const dragTo = (event) => {
    const from = drag.current;
    if (disabled || !latest.current || from?.id !== event.pointerId) return;
    drag.current = { id: from.id, x: event.clientX, y: event.clientY };
    const { image, view } = latest.current;
    move(panView(image, view, event.clientX - from.x, event.clientY - from.y, event.currentTarget.clientWidth));
  };
  const endDrag = (event) => { if (drag.current?.id === event.pointerId) drag.current = null; };
  const onKeyDown = (event) => {
    if (disabled || !latest.current) return;
    const next = arrowView(latest.current.image, latest.current.view, event);
    if (!next) return;
    event.preventDefault(); // arrows must not also scroll the sheet
    move(next);
  };
  const zoomTo = (value) => {
    const { image, view } = latest.current;
    move(clampView(imageSize(image), { ...view, zoom: Number(value) }));
  };

  return (
    <div className="photo-cropper">
      {camera ? (
        <>
          <video ref={videoRef} className="photo-frame" playsInline muted autoPlay aria-label={S.photoCameraPreview}
            onLoadedData={videoStarted} onPlaying={videoStarted} />
          {!camera.stream && <p role="status" className="class-note">{S.photoCameraStarting}</p>}
          <div className="photo-tools">
            <Btn disabled={disabled || !camera.stream || !videoReady} onClick={capture}>{S.photoCapture}</Btn>
            <Btn variant="ghost" disabled={disabled} onClick={closeCamera} autoFocus>{S.cancel}</Btn>
          </div>
        </>
      ) : (
        <>
          <div className="photo-tools">
            <Btn variant="ghost" disabled={disabled} onClick={() => fileRef.current?.click()}>{S.photoChooseFile}</Btn>
            <Btn variant="ghost" disabled={disabled} onClick={openCamera} autoFocus={cameraUsed}>{S.photoUseCamera}</Btn>
          </div>
          {opening && <p role="status" className="class-note">{S.photoOpening}</p>}
          {picture && (
            <>
              <canvas ref={canvasRef} className="photo-frame photo-crop" width={PREVIEW_PIXELS} height={PREVIEW_PIXELS}
                tabIndex={disabled ? -1 : 0} role="application" aria-disabled={disabled || undefined} aria-label={S.photoCropLabel}
                onPointerDown={startDrag} onPointerMove={dragTo} onPointerUp={endDrag} onPointerCancel={endDrag}
                onLostPointerCapture={endDrag} onKeyDown={onKeyDown} />
              <Field label={S.photoZoom}>
                <input type="range" className="photo-zoom" min={1} max={MAX_ZOOM} step={0.01} value={picture.view.zoom}
                  disabled={disabled} onChange={(event) => zoomTo(event.target.value)} />
              </Field>
            </>
          )}
        </>
      )}
      {/* Off screen rather than hidden: iOS Safari is not reliable about opening a picker for an input that is not laid out. */}
      <input ref={fileRef} type="file" className="photo-file" accept={ACCEPT} tabIndex={-1} aria-hidden="true" onChange={chooseFile} />
      {message && <Banner tone="danger">{message}</Banner>}
    </div>
  );
}
