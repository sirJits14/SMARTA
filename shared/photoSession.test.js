import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_CONSTRAINTS, createCamera, createCropSettler } from './photoSession.js';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const fakeStream = (count = 2) => {
  const tracks = Array.from({ length: count }, () => ({ stop: vi.fn() }));
  return { tracks, getTracks: () => tracks };
};
// Tracks that can report ending on their own, as a real MediaStreamTrack does.
const listeningStream = () => {
  const stream = fakeStream();
  stream.tracks.forEach((track) => {
    const heard = [];
    track.addEventListener = (type, listener) => { if (type === 'ended') heard.push(listener); };
    track.end = () => heard.forEach((listener) => listener());
  });
  return stream;
};
const stopped = (stream) => stream.tracks.every((t) => t.stop.mock.calls.length > 0);
const running = (stream) => stream.tracks.every((t) => t.stop.mock.calls.length === 0);

describe('camera', () => {
  it('asks for the back camera without audio', async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    await createCamera(() => ({ getUserMedia })).start();
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    expect(CAMERA_CONSTRAINTS.audio).toBe(false);
  });
  it('stops every track when stopped', async () => {
    const stream = fakeStream();
    const camera = createCamera(() => ({ getUserMedia: async () => stream }));
    await expect(camera.start()).resolves.toBe(stream);
    expect(running(stream)).toBe(true);
    camera.stop();
    expect(stopped(stream)).toBe(true);
  });
  it('stops a stream that arrives after the camera was closed', async () => {
    const late = deferred(); const stream = fakeStream();
    const camera = createCamera(() => ({ getUserMedia: () => late.promise }));
    const opening = camera.start();
    camera.stop();
    late.resolve(stream);
    await expect(opening).resolves.toBeNull();
    expect(stopped(stream)).toBe(true);
  });
  it('keeps only the newest stream when opened twice', async () => {
    const first = deferred(); const second = deferred();
    const waiting = [first, second];
    const camera = createCamera(() => ({ getUserMedia: () => waiting.shift().promise }));
    const one = camera.start(); const two = camera.start();
    const old = fakeStream(); const current = fakeStream();
    second.resolve(current); first.resolve(old);
    await expect(one).resolves.toBeNull();
    await expect(two).resolves.toBe(current);
    expect(stopped(old)).toBe(true);
    expect(running(current)).toBe(true);
    camera.stop();
    expect(stopped(current)).toBe(true);
  });
  it('fails when the camera is refused or missing', async () => {
    const refused = createCamera(() => ({ getUserMedia: async () => { throw new Error('NotAllowedError'); } }));
    await expect(refused.start()).rejects.toThrow();
    await expect(createCamera(() => undefined).start()).rejects.toThrow();
  });
  it('stays quiet when a refusal arrives after closing', async () => {
    const late = deferred();
    const camera = createCamera(() => ({ getUserMedia: () => late.promise }));
    const opening = camera.start();
    camera.stop();
    late.reject(new Error('NotAllowedError'));
    await expect(opening).resolves.toBeNull();
  });
  it('closes and says so once when the stream ends on its own', async () => {
    const stream = listeningStream(); const ended = vi.fn();
    const camera = createCamera(() => ({ getUserMedia: async () => stream }), ended);
    await camera.start();
    stream.tracks[0].end();
    stream.tracks[1].end();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(stopped(stream)).toBe(true);
  });
  it('ignores the end of a stream it has already closed or replaced', async () => {
    const first = listeningStream(); const second = listeningStream(); const waiting = [first, second];
    const ended = vi.fn();
    const camera = createCamera(() => ({ getUserMedia: async () => waiting.shift() }), ended);
    await camera.start();
    await camera.start();
    first.tracks[0].end();
    expect(running(second)).toBe(true);
    camera.stop();
    second.tracks[0].end();
    expect(ended).not.toHaveBeenCalled();
  });
});

describe('settled crop', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const make = (encode) => {
    const published = []; const failed = [];
    const settler = createCropSettler({ encode, publish: (v) => published.push(v), fail: (e) => failed.push(e.message) });
    return { settler, published, failed };
  };
  // Each encode call waits until the test resolves it.
  const manual = () => {
    const jobs = [];
    return { jobs, encode: () => { const job = deferred(); jobs.push(job); return job.promise; } };
  };

  it('withdraws the photo at once and publishes after 200ms of rest', async () => {
    const encode = vi.fn(async (image, view) => `${image}:${view}`);
    const { settler, published } = make(encode);
    settler.change('img', 1);
    expect(published).toEqual(['']);
    await vi.advanceTimersByTimeAsync(199);
    expect(encode).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual(['', 'img:1']);
  });
  it('encodes only the last of several quick changes', async () => {
    const encode = vi.fn(async (_image, view) => view);
    const { settler, published } = make(encode);
    settler.change('img', 'a');
    await vi.advanceTimersByTimeAsync(100);
    settler.change('img', 'b');
    await vi.advanceTimersByTimeAsync(200);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(published).toEqual(['', '', 'b']);
  });
  it('drops a result that finishes after the picture changed', async () => {
    const { jobs, encode } = manual();
    const { settler, published } = make(encode);
    settler.change('img', 'a');
    await vi.advanceTimersByTimeAsync(200);
    settler.change('img', 'b');
    jobs[0].resolve('stale');
    await vi.advanceTimersByTimeAsync(200);
    expect(published).toEqual(['', '']);
    jobs[1].resolve('fresh');
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toEqual(['', '', 'fresh']);
  });
  it('withdraws and stays silent after hold, even mid-encode', async () => {
    const { jobs, encode } = manual();
    const { settler, published, failed } = make(encode);
    settler.change('img', 'a');
    await vi.advanceTimersByTimeAsync(200);
    settler.hold();
    jobs[0].resolve('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toEqual(['', '']);
    expect(failed).toEqual([]);
  });
  it('publishes nothing at all after cancel', async () => {
    const { jobs, encode } = manual();
    const { settler, published, failed } = make(encode);
    settler.change('img', 'a');
    await vi.advanceTimersByTimeAsync(200);
    settler.cancel();
    jobs[0].reject(new Error('late'));
    settler.change('img', 'b');
    settler.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(jobs).toHaveLength(1);
    expect(published).toEqual(['', '']);
    expect(failed).toEqual([]);
  });
  it('reports a failure only for the current picture', async () => {
    const { jobs, encode } = manual();
    const { settler, published, failed } = make(encode);
    settler.change('img', 'a');
    await vi.advanceTimersByTimeAsync(200);
    settler.change('img', 'b');
    await vi.advanceTimersByTimeAsync(200);
    jobs[0].reject(new Error('old'));
    jobs[1].reject(new Error('This photo is too large to save. Try another one.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(failed).toEqual(['This photo is too large to save. Try another one.']);
    expect(published).toEqual(['', '']);
  });
});
