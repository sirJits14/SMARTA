import { sf2Months } from '../../../shared/sf2/months.js';
import { monthLabel } from '../../../shared/sf2/calendar.js';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The months an adviser can download, newest first, as { value: '2026-10', label: 'October 2026' }.
// `today` is the school-time date (YYYY-MM-DD); the server applies the same rule.
export const sf2MonthOptions = (schoolYear, today) =>
  sf2Months(schoolYear, today).map((value) => ({ value, label: monthLabel(value) }));

// The server returns the workbook as base64; a File lets a phone's share sheet save or open it.
export function base64ToFile(base64, filename, type = XLSX_TYPE) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type });
}

// Phones get the share sheet (Save to Files, Drive, open in Excel); other browsers get a normal
// download. Resolves 'shared', 'downloaded' or 'cancelled' (the person closed the share sheet).
export async function saveFile(file, nav = typeof navigator === 'undefined' ? undefined : navigator, doc = typeof document === 'undefined' ? undefined : document) {
  if (nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // Any other share failure falls through to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = doc.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
