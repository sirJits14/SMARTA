import { useEffect, useRef, useState } from 'react';
import { MAX_ZOOM, initialView, clampView } from '../../shared/studentPhoto.js';
import { imageSize, drawCrop, exportPhoto, decodeImage, captureFrame, panView, keyView } from '../lib/photoCanvas.js';
import { createCamera, createCropSettler } from '../../shared/photoSession.js';
import { Btn, Field } from './ui.jsx';

export const CAMERA_UNAVAILABLE = 'The camera is not available. Choose a file instead.';
export const FILE_UNREADABLE = 'That file could not be opened as a picture.';
const ACCEPT = 'image/jpeg,image/png,image/webp';
// The preview is 280px square on screen, drawn at twice that for sharp displays.
const PREVIEW_PIXELS = 560;

// Picks a picture (file or camera) and positions a square crop over it.
// onReady(base64) follows each settled change; onReady('') means "not ready".
export default function PhotoCropper({ onReady, disabled = false }) {
  const [picture, setPicture] = useState(null); // { image, view }
  const [camera, setCamera] = useState(null); // null = closed, { stream: null } = opening
  const [videoReady, setVideoReady] = useState(false);
  const [cameraUsed, setCameraUsed] = useState(false);
  const [message, setMessage] = useState('');
  const latest = useRef(null); // the picture as of the last event, ahead of the next render
  const job = useRef(0); // a file decode applies only while its number is current
  const drag = useRef(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [tools] = useState(() => ({
    camera: createCamera(),
    crop: createCropSettler({ encode: exportPhoto, publish: (photo) => readyRef.current(photo), fail: (error) => setMessage(error.message) }),
  }));

  // Closing the dialog turns the camera off and discards anything still running.
  useEffect(() => () => { job.current += 1; tools.camera.stop(); tools.crop.cancel(); }, [tools]);
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

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so the same file can be chosen again
    if (!file) return;
    const mine = ++job.current;
    latest.current = null;
    setPicture(null);
    setMessage('');
    tools.crop.hold();
    let image;
    try { image = await decodeImage(file); }
    catch { if (mine === job.current) setMessage(FILE_UNREADABLE); return; }
    if (mine === job.current) show(image, initialView(imageSize(image)));
  };

  // Leaving the camera without a capture brings back the earlier picture, if any.
  const closeCamera = () => {
    tools.camera.stop();
    setCamera(null);
    if (latest.current) tools.crop.change(latest.current.image, latest.current.view);
  };
  const openCamera = async () => {
    job.current += 1;
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
      setMessage(CAMERA_UNAVAILABLE);
    }
  };
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const frame = captureFrame(video);
    tools.camera.stop();
    setCamera(null);
    show(frame, initialView(imageSize(frame)));
  };

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
    const next = keyView(latest.current.image, latest.current.view, event.key);
    if (!next) return;
    event.preventDefault(); // arrows must not also scroll the dialog
    move(next);
  };
  const zoomTo = (value) => {
    const { image, view } = latest.current;
    move(clampView(imageSize(image), { ...view, zoom: Number(value) }));
  };

  return <div className="sims-photo-cropper">
    {camera ? <>
      <video ref={videoRef} className="sims-photo-frame" playsInline muted autoPlay aria-label="Camera preview"
        onLoadedData={() => setVideoReady(true)} />
      {!camera.stream && <p role="status" className="sims-photo-note">Starting the camera…</p>}
      <div className="sims-photo-tools">
        <Btn disabled={disabled || !camera.stream || !videoReady} onClick={capture}>Capture</Btn>
        <Btn variant="ghost" disabled={disabled} onClick={closeCamera} autoFocus>Cancel</Btn>
      </div>
    </> : <>
      <div className="sims-photo-tools">
        <Btn variant="ghost" disabled={disabled} onClick={() => fileRef.current?.click()}>Choose a file</Btn>
        <Btn variant="ghost" disabled={disabled} onClick={openCamera} autoFocus={cameraUsed}>Use camera</Btn>
      </div>
      {picture && <>
        <canvas ref={canvasRef} className="sims-photo-frame sims-photo-crop" width={PREVIEW_PIXELS} height={PREVIEW_PIXELS}
          tabIndex={disabled ? -1 : 0} role="application" aria-disabled={disabled || undefined}
          aria-label="Photo crop. Drag or use the arrow keys to position."
          onPointerDown={startDrag} onPointerMove={dragTo} onPointerUp={endDrag} onPointerCancel={endDrag}
          onLostPointerCapture={endDrag} onKeyDown={onKeyDown} />
        <Field label="Zoom">
          <input type="range" className="sims-photo-zoom" min={1} max={MAX_ZOOM} step={0.01} value={picture.view.zoom}
            disabled={disabled} onChange={(event) => zoomTo(event.target.value)} />
        </Field>
      </>}
    </>}
    {/* A dismissed file picker fires "cancel", which would otherwise reach the dialog and close it. */}
    <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={chooseFile} onCancel={(event) => event.stopPropagation()} />
    {message && <p role="alert" className="sims-feedback">{message}</p>}
  </div>;
}
