import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;

// Learner photos have no client Storage access: these two callables are the only
// way in or out (functions/src/handlers/studentPhotos.js).
// { photo: { contentBase64, updatedAt } | null }
export const getStudentPhoto = (studentId) => call('getStudentPhotoFn', { studentId });
export const saveStudentPhoto = (studentId, contentBase64) => call('saveStudentPhotoFn', { studentId, contentBase64 });
export const photoDataUrl = (photo) => (photo?.contentBase64 ? `data:image/jpeg;base64,${photo.contentBase64}` : '');
