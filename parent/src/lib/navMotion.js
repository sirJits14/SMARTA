// Which way a navigation moves through the app, for the page transition in
// hooks/useRoute.js. Tab roots sit at depth 0, what they open at 1, and a
// report (opened from a learner's history) at 2.
const DEPTH = { learner: 1, announcement: 1, requestAccess: 1, activate: 1, report: 2 };

export function routeDepth(route) {
  if (route.name === 'settings') return route.params.section ? 1 : 0;
  return DEPTH[route.name] ?? 0;
}

const sameScreen = (a, b) => a.name === b.name && JSON.stringify(a.params) === JSON.stringify(b.params);

// 'forward' (deeper), 'back' (shallower), 'fade' (sideways, e.g. switching
// tabs), or null when the screen itself doesn't change (only the query did).
export function navDirection(from, to) {
  if (!from || !to || sameScreen(from, to)) return null;
  const a = routeDepth(from), b = routeDepth(to);
  return b > a ? 'forward' : b < a ? 'back' : 'fade';
}
