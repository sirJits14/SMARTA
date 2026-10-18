import { CallableError } from '../errors.js';
import { activateCode } from './codes.js';

// Keep a clear response for older installed apps. An activation slip can
// establish a family link, but can no longer authorize a school role.
export async function activateFamilyCode(deps, input) {
  if (input.relationship === 'Adviser') throw new CallableError('failed-precondition', 'Request adviser access from the School view. School approval is required.');
  return activateCode(deps, input);
}
export async function retiredRelationshipChange() {
  throw new CallableError('failed-precondition', 'Family links and school roles are now separate. Request a School role, or ask the school to correct your family link.');
}
