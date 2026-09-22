// Tiny path router: enough for deep links from pushes and QR slips.
const ROUTES = [
  ['home', /^\/$/],
  ['verify', /^\/verify$/],
  ['consent', /^\/consent$/],
  ['activate', /^\/activate$/],
  ['learner', /^\/learner\/([^/]+)$/, ['id']],
  ['inbox', /^\/inbox$/],
  ['report', /^\/report\/([^/]+)$/, ['eventId']],
  ['requestAccess', /^\/request-access$/],
  ['settings', /^\/settings$/],
];

export function matchRoute(pathname, search = '') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const query = Object.fromEntries(new URLSearchParams(search));
  for (const [name, re, keys = []] of ROUTES) {
    const m = path.match(re);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query };
  }
  return { name: 'notFound', params: {}, query };
}
