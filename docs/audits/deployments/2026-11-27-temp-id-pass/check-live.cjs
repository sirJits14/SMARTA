// Read-only (GET only) checks of project bnhs-sims before and after each publish step.
// node check-live.cjs <before|after> <storage|functions|rules|kiosk|sims|parent>
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const lib = (p) => require(path.join(root, 'node_modules', 'firebase-tools', 'lib', p));
const { requireAuth } = lib('requireAuth');
const { Client } = lib('apiv2');
const P = 'bnhs-sims';

const NEW = ['saveStudentPhotoFn', 'getStudentPhotoFn', 'issueTempPassFn', 'revokeTempPassFn', 'onStudentWritten', 'onEnrollmentWritten'];
const CHANGED = { onScanEventCreated: 'onscaneventcreated-00021-qax', getSchoolRosterFn: 'getschoolrosterfn-00002-hut' };
// Live versions this release was prepared on (read 2026-11-27).
const BASE_VERSION = { 'bnhs-sims': '1680e6bacdf293c9', 'bnhs-parent': '88863933447e311b', 'bnhs-student-kiosk': 'a49e53df3c72e454' };
const SITE = { sims: 'bnhs-sims', parent: 'bnhs-parent', kiosk: 'bnhs-student-kiosk' };

const text = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\r\n/g, '\n').trim();
const same = (a, file) => a !== null && a.replace(/\r\n/g, '\n').trim() === text(file);

async function get(urlPrefix, p, queryParams) {
  const client = new Client({ urlPrefix, auth: true });
  const r = await client.get(p, { queryParams, resolveOnHTTPError: true });
  return { status: r.status, body: r.body };
}
async function ruleset(match) {
  const rel = await get('https://firebaserules.googleapis.com', `/v1/projects/${P}/releases`);
  if (rel.status !== 200) throw new Error(`rules releases: HTTP ${rel.status}`);
  const release = (rel.body.releases || []).find((r) => match(r.name));
  if (!release) return null;
  const rs = await get('https://firebaserules.googleapis.com', `/v1/${release.rulesetName}`);
  return rs.body.source.files[0].content;
}
const firestoreRules = () => ruleset((n) => n.endsWith('/releases/cloud.firestore'));
async function bucketExists() {
  const r = await get('https://firebasestorage.googleapis.com', `/v1beta/projects/${P}/buckets`);
  return r.status === 200 && (r.body.buckets || []).length > 0;
}
async function functions() {
  const r = await get('https://cloudfunctions.googleapis.com', `/v2/projects/${P}/locations/-/functions`, { pageSize: 200 });
  if (r.status !== 200) throw new Error(`functions list: HTTP ${r.status}`);
  return new Map((r.body.functions || []).map((f) => [f.name.split('/').pop(), { state: f.state, revision: f.serviceConfig?.revision }]));
}
async function liveVersion(site) {
  const r = await get('https://firebasehosting.googleapis.com', `/v1beta1/projects/${P}/sites/${site}/releases`, { pageSize: 1 });
  if (r.status !== 200) throw new Error(`hosting ${site}: HTTP ${r.status}`);
  return r.body.releases?.[0]?.version?.name?.split('/').pop();
}

const problems = [];
const need = (ok, message) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) problems.push(message); };

async function functionsAreLive() {
  const live = await functions();
  for (const name of NEW) need(live.get(name)?.state === 'ACTIVE', `function ${name} is live and ACTIVE`);
  for (const [name, old] of Object.entries(CHANGED)) {
    const f = live.get(name);
    need(f?.state === 'ACTIVE' && f.revision !== old, `function ${name} has a new ACTIVE revision (${f?.revision})`);
  }
}
const rulesAreNew = async () => need(same(await firestoreRules(), 'rules/firestore.rules'), 'live Firestore rules are the prepared new rules');

const checks = {
  before: {
    storage: async () => need(await bucketExists(), 'Cloud Storage is switched on and has a bucket'),
    functions: async () => {
      need(await bucketExists(), 'Cloud Storage is switched on and has a bucket');
      need(same(await ruleset((n) => n.includes('/releases/firebase.storage/')), 'storage/storage.rules'), 'live Storage rules deny every client');
      const live = await functions();
      need(live.size === 75, `75 functions are live (found ${live.size})`);
      for (const name of NEW) need(!live.has(name), `${name} does not exist yet`);
      for (const [name, revision] of Object.entries(CHANGED)) need(live.get(name)?.revision === revision, `${name} is still ${revision} (found ${live.get(name)?.revision})`);
    },
    rules: async () => {
      await functionsAreLive();
      need(same(await firestoreRules(), 'live/live-firestore.rules'), 'live Firestore rules are still the ones this release was built on');
    },
    kiosk: async () => { await functionsAreLive(); await rulesAreNew(); },
    sims: async () => { await functionsAreLive(); await rulesAreNew(); },
    parent: async () => { await functionsAreLive(); await rulesAreNew(); },
  },
  after: {
    storage: async () => need(same(await ruleset((n) => n.includes('/releases/firebase.storage/')), 'storage/storage.rules'), 'live Storage rules deny every client'),
    functions: async () => { await functionsAreLive(); const live = await functions(); need(live.size === 81, `81 functions are live (found ${live.size})`); },
    rules: rulesAreNew,
    kiosk: async () => {}, sims: async () => {}, parent: async () => {},
  },
};

(async () => {
  const [when, step] = process.argv.slice(2);
  if (!checks[when]?.[step]) throw new Error('usage: check-live.cjs <before|after> <storage|functions|rules|kiosk|sims|parent>');
  await requireAuth({ project: P, projectId: P });
  const site = SITE[step];
  if (site && when === 'before') {
    const version = await liveVersion(site);
    need(version === BASE_VERSION[site], `${site} live version is still ${BASE_VERSION[site]} (found ${version})`);
  }
  await checks[when][step]();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
