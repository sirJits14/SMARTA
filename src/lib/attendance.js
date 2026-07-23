export function markFor(docsByDate, date, studentId) {
  return docsByDate[date]?.marks?.[studentId] ?? 'P';
}

export function summarizeMonth({ roster, schoolDays, docsByDate }) {
  const out = {};
  for (const id of roster) {
    let present = 0, late = 0, absent = 0, excused = 0;
    for (const date of schoolDays) {
      const m = markFor(docsByDate, date, id);
      if (m === 'A') absent++;
      else if (m === 'E') excused++;
      else { present++; if (m === 'L') late++; } // P or L both count as present
    }
    out[id] = { present, late, absent, excused };
  }
  return out;
}
