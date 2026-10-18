// Schedule form rules. With the afternoon session on, times must run
// AM arrival < AM departure <= PM arrival < PM departure ("HH:MM" strings).
export function validateSchedule(f) {
  if (!f.name?.trim()) return 'Schedule name is required.';
  if (!f.timeIn || !f.timeOut) return f.pm ? 'AM arrival and AM departure are required.' : 'Time in and time out are required.';
  if (f.timeOut <= f.timeIn) return f.pm ? 'AM departure must be later than AM arrival.' : 'Time out must be later than time in.';
  if (!f.pm) return '';
  if (!f.pmTimeIn || !f.pmTimeOut) return 'PM arrival and PM departure are required.';
  if (f.pmTimeIn < f.timeOut) return 'PM arrival cannot be earlier than AM departure.';
  if (f.pmTimeOut <= f.pmTimeIn) return 'PM departure must be later than PM arrival.';
  return '';
}
