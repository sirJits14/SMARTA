// Read-only (GET only) checks of project bnhs-sims before and after each publish step.
// node check-live.cjs <before|after> <indexes|functions|rules|sims|accounts|parent>
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const lib = (p) => require(path.join(root, 'node_modules', 'firebase-tools', 'lib', p));
const { requireAuth } = lib('requireAuth');
const { Client } = lib('apiv2');
const P = 'bnhs-sims';

// Live state this release was prepared on (read 2026-11-28 from production; see live/live-state.json).
const LIVE_FUNCTION_COUNT = 81;
const NEW = ['requestTempPassesFn', 'withdrawTempPassRequestFn', 'getTempPassRequestsFn', 'listTempPassRequestsFn',
  'fulfilTempPassRequestsFn', 'markTempPassRequestsPrintedFn', 'declineTempPassRequestFn'];
const CHANGED = { issueTempPassFn: 'issuetemppassfn-00001-cif', saveStudentPhotoFn: 'savestudentphotofn-00001-tif', getStudentPhotoFn: 'getstudentphotofn-00001-bec' };
const ACCOUNT = { createStaffUserFn: 'createstaffuserfn-00007-pow', updateStaffUserFn: 'updatestaffuserfn-00007-muj',
  setStaffUserDisabledFn: 'setstaffuserdisabledfn-00007-hop', resetStaffPasswordFn: 'resetstaffpasswordfn-00007-voh',
  deleteStaffUserFn: 'deletestaffuserfn-00007-hun', changeOwnPasswordFn: 'changeownpasswordfn-00007-rub' };
const BASE_VERSION = { 'bnhs-sims': '628b6aa03e5fd26c', 'bnhs-parent': 'a5bcf5096a1ea7dd' };
const SITE = { sims: 'bnhs-sims', parent: 'bnhs-parent' };
const INDEX_COUNT = 4; // temp_pass_requests composites

const text = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\r\n/g, '\n').trim();
const same = (a, file) => a !== null && a.replace(/\r\n/g, '\n').trim() === text(file);

async function get(urlPrefix, p, queryParams) {
  const client = new Client({ urlPrefix, auth: true });
  const r = await client.get(p, { queryParams, resolveOnHTTPError: true });
  return { status: r.status, body: r.body };
}
async function firestoreRules() {
  const rel = await get('https://firebaserules.googleapis.com', `/v1/projects/${P}/releases`);
  if (rel.status !== 200) throw new Error(`rules releases: HTTP ${rel.status}`);
  const release = (rel.body.releases || []).find((r) => r.name.endsWith('/releases/cloud.firestore'));
  if (!release) return null;
  const rs = await get('https://firebaserules.googleapis.com', `/v1/${release.rulesetName}`);
  return rs.body.source.files[0].content;
}
async function functions() {
  const r = await get('https://cloudfunctions.googleapis.com', `/v2/projects/${P}/locations/-/functions`, { pageSize: 300 });
  if (r.status !== 200) throw new Error(`functions list: HTTP ${r.status}`);
  return new Map((r.body.functions || []).map((f) => [f.name.split('/').pop(), { state: f.state, revision: f.serviceConfig?.revision }]));
}
async function liveVersion(site) {
  const r = await get('https://firebasehosting.googleapis.com', `/v1beta1/projects/${P}/sites/${site}/releases`, { pageSize: 1 });
  if (r.status !== 200) throw new Error(`hosting ${site}: HTTP ${r.status}`);
  return r.body.releases?.[0]?.version?.name?.split('/').pop();
}
async function requestIndexes() {
  // The API lists every index whatever group is in the path, so filter by name and follow the pages.
  const found = [];
  let token;
  do {
    const r = await get('https://firestore.googleapis.com', `/v1/projects/${P}/databases/(default)/collectionGroups/-/indexes`, token ? { pageToken: token } : undefined);
    if (r.status !== 200) throw new Error(`indexes list: HTTP ${r.status}`);
    found.push(...(r.body.indexes || []));
    token = r.body.nextPageToken;
  } while (token);
  return found.filter((i) => i.name.includes('/collectionGroups/temp_pass_requests/') && i.state === 'READY');
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
const rulesAreBase = async () => need(same(await firestoreRules(), 'live/live-firestore.rules'), 'live Firestore rules are still the ones this release was built on');
const indexesReady = async () => need((await requestIndexes()).length === INDEX_COUNT, `all ${INDEX_COUNT} temp_pass_requests indexes are READY`);

const checks = {
  before: {
    indexes: async () => {
      const live = await functions();
      need(live.size === LIVE_FUNCTION_COUNT, `${LIVE_FUNCTION_COUNT} functions are live (found ${live.size})`);
      for (const name of NEW) need(!live.has(name), `${name} does not exist yet`);
    },
    functions: async () => {
      await indexesReady();
      await rulesAreBase();
      const live = await functions();
      need(live.size === LIVE_FUNCTION_COUNT, `${LIVE_FUNCTION_COUNT} functions are live (found ${live.size})`);
      for (const name of NEW) need(!live.has(name), `${name} does not exist yet`);
      for (const [name, revision] of Object.entries(CHANGED)) need(live.get(name)?.revision === revision, `${name} is still ${revision} (found ${live.get(name)?.revision})`);
    },
    rules: async () => { await indexesReady(); await functionsAreLive(); await rulesAreBase(); },
    sims: async () => { await functionsAreLive(); await rulesAreNew(); },
    accounts: async () => {
      await functionsAreLive(); await rulesAreNew();
      const live = await functions();
      for (const [name, revision] of Object.entries(ACCOUNT)) need(live.get(name)?.revision === revision, `${name} is still ${revision} (found ${live.get(name)?.revision})`);
    },
    parent: async () => { await functionsAreLive(); await rulesAreNew(); },
  },
  after: {
    indexes: indexesReady,
    functions: async () => {
      await functionsAreLive();
      const live = await functions();
      need(live.size === LIVE_FUNCTION_COUNT + NEW.length, `${LIVE_FUNCTION_COUNT + NEW.length} functions are live (found ${live.size})`);
      for (const [name, revision] of Object.entries(ACCOUNT)) need(live.get(name)?.revision === revision, `${name} was not touched (${live.get(name)?.revision})`);
    },
    rules: rulesAreNew,
    accounts: async () => {
      const live = await functions();
      for (const [name, old] of Object.entries(ACCOUNT)) {
        const f = live.get(name);
        need(f?.state === 'ACTIVE' && f.revision !== old, `function ${name} has a new ACTIVE revision (${f?.revision})`);
      }
      need(live.size === LIVE_FUNCTION_COUNT + NEW.length, `${LIVE_FUNCTION_COUNT + NEW.length} functions are live (found ${live.size})`);
    },
    sims: async () => {}, parent: async () => {},
  },
};

(async () => {
  const [when, step] = process.argv.slice(2);
  if (!checks[when]?.[step]) throw new Error('usage: check-live.cjs <before|after> <indexes|functions|rules|sims|accounts|parent>');
  await requireAuth({ project: P, projectId: P });
  const site = SITE[step];
  if (site && when === 'before') {
    const version = await liveVersion(site);
    need(version === BASE_VERSION[site], `${site} live version is still ${BASE_VERSION[site]} (found ${version})`);
  }
  if (step === 'accounts' && when === 'before') {
    const version = await liveVersion('bnhs-sims');
    need(version !== BASE_VERSION['bnhs-sims'], `SIMS is already the new release (live ${version}); the new role is accepted only after it`);
  }
  await checks[when][step]();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
