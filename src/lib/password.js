// Mirrors changeOwnPassword's limits in functions/src/handlers/users.js.
export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

export function passwordProblem(pw, confirm) {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  if (pw !== confirm) return 'The two passwords do not match.';
  return null;
}
