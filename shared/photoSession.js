// The two things in the photo cropper that finish later and can finish too late:
// opening the camera, and encoding the crop. Shared by SIMS and the Parent App.
export const CAMERA_CONSTRAINTS = { video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false };

const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop());

// One camera at a time. start() resolves to null when stop() or a newer start()
// overtook it, and stops whatever that late request opened. onEnded() is called
// when the open camera stops by itself (unplugged, taken by another app, or the
// permission withdrawn); stopping it here does not count.
export function createCamera(devices = () => globalThis.navigator?.mediaDevices, onEnded = () => {}) {
  let stream = null;
  let turn = 0;
  const close = () => { turn += 1; stopTracks(stream); stream = null; };
  return {
    stop: close,
    async start() {
      close();
      const mine = turn;
      let opened;
      try {
        opened = await devices().getUserMedia(CAMERA_CONSTRAINTS);
      } catch (error) {
        if (mine !== turn) return null;
        throw error;
      }
      if (mine !== turn) { stopTracks(opened); return null; }
      stream = opened;
      const ended = () => { if (mine !== turn) return; close(); onEnded(); };
      opened.getTracks().forEach((track) => track.addEventListener?.('ended', ended));
      return opened;
    },
  };
}

// Publishes '' the moment the picture or crop changes, then the encoded photo
// once it has rested. An encode overtaken by a later change is thrown away, so
// the published photo is never older than what is on screen.
export function createCropSettler({ encode, publish, fail, delay = 200 }) {
  let timer;
  let revision = 0;
  const cancel = () => { revision += 1; clearTimeout(timer); };
  const hold = () => { cancel(); publish(''); };
  return {
    cancel,
    hold,
    change(image, view) {
      hold();
      const mine = revision;
      timer = setTimeout(async () => {
        try {
          const photo = await encode(image, view);
          if (mine === revision) publish(photo);
        } catch (error) {
          if (mine === revision) fail(error);
        }
      }, delay);
    },
  };
}
