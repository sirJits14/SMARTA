import { describe, expect, it, vi } from 'vitest';
import { createPhotoCache, photoDataUrl, photoVersion, canManagePhotos, canRequestPasses, photoCountText } from './studentPhoto.js';

const photo = (text) => ({ photo: { contentBase64: text, updatedAt: 1 } });
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

describe('photo cache', () => {
  it('shares one request for the same learner and version', async () => {
    const fetchPhoto = vi.fn(async (id) => photo(id));
    const cache = createPhotoCache(fetchPhoto);
    const [a, b] = await Promise.all([cache.load('S1', 5), cache.load('S1', 5)]);
    expect(a).toBe('data:image/jpeg;base64,S1');
    expect(b).toBe(a);
    await cache.load('S1', 5);
    expect(fetchPhoto).toHaveBeenCalledTimes(1);
    expect(fetchPhoto).toHaveBeenCalledWith('S1');
  });
  it('asks again for a new version and keeps learners apart', async () => {
    const fetchPhoto = vi.fn(async (id) => photo(`${id}-${fetchPhoto.mock.calls.length}`));
    const cache = createPhotoCache(fetchPhoto);
    await expect(cache.load('S1', 5)).resolves.toBe('data:image/jpeg;base64,S1-1');
    await expect(cache.load('S1', 6)).resolves.toBe('data:image/jpeg;base64,S1-2');
    await expect(cache.load('S2', 5)).resolves.toBe('data:image/jpeg;base64,S2-3');
  });
  it('answers an empty string when there is no photo', async () => {
    const cache = createPhotoCache(async () => ({ photo: null }));
    await expect(cache.load('S1', 5)).resolves.toBe('');
  });
  it('does not keep a failure', async () => {
    const fetchPhoto = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(photo('ok'));
    const cache = createPhotoCache(fetchPhoto);
    await expect(cache.load('S1', 5)).rejects.toThrow('offline');
    await expect(cache.load('S1', 5)).resolves.toBe('data:image/jpeg;base64,ok');
    expect(fetchPhoto).toHaveBeenCalledTimes(2);
  });
  it('forgets everything when cleared', async () => {
    const fetchPhoto = vi.fn(async () => photo('x'));
    const cache = createPhotoCache(fetchPhoto);
    await cache.load('S1', 5);
    cache.clear();
    await cache.load('S1', 5);
    expect(fetchPhoto).toHaveBeenCalledTimes(2);
  });
  it('hands nothing over from a request that was still running when cleared', async () => {
    const old = deferred(); const next = deferred(); const waiting = [old, next];
    const cache = createPhotoCache(() => waiting.shift().promise);
    const before = cache.load('S1', 5);
    await Promise.resolve();
    cache.clear();
    const after = cache.load('S1', 5);
    old.resolve(photo('previous-account'));
    next.resolve(photo('next-account'));
    await expect(before).resolves.toBe('');
    await expect(after).resolves.toBe('data:image/jpeg;base64,next-account');
  });
  it('keeps the newer request when an older one fails after clearing', async () => {
    const old = deferred();
    const fetchPhoto = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(photo('new'));
    const cache = createPhotoCache(fetchPhoto);
    const before = cache.load('S1', 5);
    await Promise.resolve();
    cache.clear();
    await cache.load('S1', 5);
    old.reject(new Error('signed out'));
    await expect(before).rejects.toThrow();
    await cache.load('S1', 5);
    expect(fetchPhoto).toHaveBeenCalledTimes(2);
  });
});

describe('photo helpers', () => {
  it('turns a stored photo into a data URL', () => {
    expect(photoDataUrl({ contentBase64: 'abc' })).toBe('data:image/jpeg;base64,abc');
    expect(photoDataUrl(null)).toBe('');
    expect(photoDataUrl(undefined)).toBe('');
  });
  it('gives a version only for the learner on screen whose read was allowed', () => {
    const learner = { id: 'S1', photoUpdatedAt: { seconds: 42 } };
    expect(photoVersion(learner, null, 'S1')).toBe(42);
    expect(photoVersion(learner, 'permission-denied', 'S1')).toBeUndefined();
    // The learner read for the screen just left is still held for a moment after switching.
    expect(photoVersion(learner, null, 'S2')).toBeUndefined();
    expect(photoVersion({ id: 'S1' }, null, 'S1')).toBeUndefined();
    expect(photoVersion(null, null, 'S1')).toBeUndefined();
    expect(photoVersion(undefined, null, 'S1')).toBeUndefined();
  });
  it('allows photos only for this class, when the server says so, while the year runs', () => {
    const roster = { canEditPhotos: true, section: { id: 'a' } };
    expect(canManagePhotos(roster, 'a', false)).toBe(true);
    expect(canManagePhotos(roster, 'a', true)).toBe(false);
    expect(canManagePhotos(roster, 'b', false)).toBe(false);
    expect(canManagePhotos({ section: { id: 'a' } }, 'a', false)).toBe(false);
    expect(canManagePhotos(null, 'a', false)).toBe(false);
  });
  it('offers pass requests for the class whose list is on screen, while the year runs', () => {
    const roster = { section: { id: 'a' } };
    expect(canRequestPasses(roster, 'a', false)).toBe(true);
    // Asking for a pass does not depend on being allowed to change photos.
    expect(canRequestPasses({ ...roster, canEditPhotos: false }, 'a', false)).toBe(true);
  });
  it('offers no pass request while another class, or nothing, is on screen', () => {
    expect(canRequestPasses({ section: { id: 'a' } }, 'b', false)).toBe(false);
    expect(canRequestPasses(null, 'a', false)).toBe(false);
    expect(canRequestPasses({}, '', false)).toBe(false);
    expect(canRequestPasses(null, undefined, false)).toBe(false);
  });
  it('offers no pass request once the school year has ended', () => {
    expect(canRequestPasses({ section: { id: 'a' } }, 'a', true)).toBe(false);
  });
  it('counts the learners with a photo', () => {
    expect(photoCountText(2, 40)).toBe('2 of 40 have a photo');
  });
});
