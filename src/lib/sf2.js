import sf2TemplateUrl from '../../shared/sf2/sf2-template.xlsx?url';
import { buildSf2Workbook } from '../../shared/sf2/buildSf2Workbook.js';

// The workbook is built by shared/sf2 so SIMS and Cloud Functions produce the same file. SIMS loads the
// template in the browser; Cloud Functions reads the same file from disk.
export async function buildSF2Workbook(options) {
  const res = await fetch(sf2TemplateUrl);
  return buildSf2Workbook({ ...options, templateBuffer: await res.arrayBuffer() });
}
