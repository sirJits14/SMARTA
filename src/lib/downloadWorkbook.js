import { downloadBlob } from './downloadBlob.js';

export async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
