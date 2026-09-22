// Thrown by handlers; converted to HttpsError at the function boundary so
// handlers stay testable without firebase-functions.
export class CallableError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
