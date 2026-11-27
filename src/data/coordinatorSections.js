import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

export const getCoordinatorSectionOptions = async sectionId =>
  (await httpsCallable(functions, 'getCoordinatorSectionOptionsFn')({ sectionId })).data;
export const updateCoordinatorSection = async (sectionId, fields) =>
  (await httpsCallable(functions, 'updateCoordinatorSectionFn')({
    sectionId, name: fields.name, adviserName: fields.adviserName || '', scheduleId: fields.scheduleId || null,
  })).data;
