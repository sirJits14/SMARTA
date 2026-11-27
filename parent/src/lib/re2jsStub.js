// Stands in for the `re2js` package (vite.config.js aliases it here).
// Firestore 4.17+ imports re2js eagerly for its Pipeline expressions
// (`like`, `regexContains`, `regexMatch`), which put ~42 KB gz of regex
// engine into the initial-load chunk. The Parent app only runs ordinary
// queries and listeners and never builds a Pipeline, so this code is never
// reached. If it ever is, Firestore wraps each RE2JS.compile() call in
// try/catch and returns its own "invalid pattern" error result, so a
// Pipeline regex would fail cleanly rather than crash the app.
export class RE2JS {
  static compile() {
    throw new Error('re2js is not bundled in the Parent app (Firestore Pipeline regex expressions are unsupported)');
  }
}
