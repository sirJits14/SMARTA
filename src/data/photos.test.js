import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => []);
vi.mock('../firebase.js', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => async (data) => { sent.push([name, data]); return { data: { from: name } }; },
}));

import { getStudentPhoto, saveStudentPhoto, photoDataUrl } from './photos.js';

beforeEach(() => { sent.length = 0; });

describe('learner photo calls', () => {
  it('asks for one learner’s photo and returns the callable data', async () => {
    await expect(getStudentPhoto('s1')).resolves.toEqual({ from: 'getStudentPhotoFn' });
    expect(sent).toEqual([['getStudentPhotoFn', { studentId: 's1' }]]);
  });
  it('sends the learner and the base64 picture when saving', async () => {
    await saveStudentPhoto('s1', 'QUJD');
    expect(sent).toEqual([['saveStudentPhotoFn', { studentId: 's1', contentBase64: 'QUJD' }]]);
  });
  it('turns a stored photo into a JPEG data URL, and nothing into an empty string', () => {
    expect(photoDataUrl({ contentBase64: 'QUJD', updatedAt: 1 })).toBe('data:image/jpeg;base64,QUJD');
    expect(photoDataUrl(null)).toBe('');
    expect(photoDataUrl(undefined)).toBe('');
  });
});
