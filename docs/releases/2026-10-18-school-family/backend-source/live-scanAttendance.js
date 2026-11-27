import { FieldValue } from 'firebase-admin/firestore';
import { sessionOf } from '../../shared/scheduleSessions.js';

export async function rejectScanAttendance(db, eventId, reason) {
  const ref = db.doc(`scan_events/${eventId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && !snap.data().attendanceResult) {
      tx.update(ref, { attendanceResult: { status: 'rejected', reason, processedAt: FieldValue.serverTimestamp() } });
    }
  });
}

// Raw scan fields are client-immutable. Only this backend adds the receipt,
// atomically with attendance, so retries cannot undo a later staff edit.
export async function applyScanAttendance(db, { eventId, data, date, scanTime }) {
  const rawRef = db.doc(`scan_events/${eventId}`);
  return db.runTransaction(async tx => {
    const raw = await tx.get(rawRef);
    if (!raw.exists) return { outcome: 'rejected:missing-event' };
    const previous = raw.data().attendanceResult;
    if (previous) return { outcome: previous.status === 'applied' ? 'duplicate' : `rejected:${previous.reason}` };
    const reject = reason => {
      tx.update(rawRef, { attendanceResult: { status: 'rejected', reason, processedAt: FieldValue.serverTimestamp() } });
      return { outcome: `rejected:${reason}` };
    };
    const [device, enrollment, student, section] = await Promise.all([
      tx.get(db.doc(`kiosks/${data.deviceId}`)),
      tx.get(db.doc(`enrollments/${data.studentId}_${data.schoolYear}`)),
      tx.get(db.doc(`students/${data.studentId}`)),
      tx.get(db.doc(`sections/${data.sectionId}`)),
    ]);
    if (device.data()?.active !== true) return reject('device');
    const enrolled = enrollment.data();
    if (!enrolled || enrolled.status !== 'enrolled' || enrolled.sectionId !== data.sectionId
        || enrolled.studentId !== data.studentId || enrolled.schoolYear !== data.schoolYear
        || !student.exists || !section.exists || section.data().schoolYear !== data.schoolYear) return reject('enrollment');

    const attendanceRef = db.doc(`student_attendance/${data.sectionId}_${date}`);
    const attendanceSnap = await tx.get(attendanceRef);
    const attendance = attendanceSnap.data() || {};
    if (attendance.schoolYear && attendance.schoolYear !== data.schoolYear) return reject('school-year');
    const marks = { ...(attendance.marks || {}) };
    if (!attendance.rosterInitialized) {
      const roster = await tx.get(db.collection('enrollments')
        .where('sectionId', '==', data.sectionId).where('schoolYear', '==', data.schoolYear).where('status', '==', 'enrolled'));
      for (const learner of roster.docs) {
        const id = learner.data().studentId;
        if (typeof id === 'string' && !Object.hasOwn(marks, id)) marks[id] = 'A';
      }
    }
    let schedule;
    if (section.data().scheduleId) {
      schedule = (await tx.get(db.doc(`schedules/${section.data().scheduleId}`))).data();
    }
    const update = { sectionId: data.sectionId, schoolYear: data.schoolYear, date,
      marks, rosterInitialized: true, updatedAt: date };
    const id = data.studentId;
    // Split-day schedules keep afternoon taps apart, so a 1 PM tap-in cannot
    // overwrite the morning arrival. Single-session schedules are always 'am'.
    const pm = sessionOf(scanTime, schedule) === 'pm';
    const field = { in: pm ? 'pmTimeIn' : 'timeIn', out: pm ? 'pmTimeOut' : 'timeOut' }[data.kind];
    const priorTime = attendance[field]?.[id];
    // Delayed/offline events must not move a later recorded time backwards.
    update[field] = { [id]: priorTime && priorTime > scanTime ? priorTime : scanTime };
    if (data.kind === 'in') {
      const firstOfDay = !attendance.timeIn?.[id] && !attendance.pmTimeIn?.[id];
      if (firstOfDay && (!marks[id] || marks[id] === 'A')) {
        // An afternoon-only learner is Present; the Absent AM note says why.
        marks[id] = !pm && schedule?.timeIn && scanTime > schedule.timeIn ? 'L' : 'P';
      }
      // Notes are informational only and never change the mark.
      if (pm && firstOfDay) update.absentAm = { [id]: true };
      if (pm && !attendance.pmTimeIn?.[id] && scanTime > schedule.pmTimeIn) update.latePm = { [id]: true };
      // Late PM is judged on the earliest afternoon tap-in, so any on-time one
      // proves the earliest was on time, whatever order the taps are processed in.
      if (pm && scanTime <= schedule.pmTimeIn && attendance.latePm?.[id]) update.latePm = { [id]: FieldValue.delete() };
      // A delayed morning tap-in proves the learner did come in the morning.
      if (!pm && attendance.absentAm?.[id]) {
        update.absentAm = { [id]: FieldValue.delete() };
        // absentAm marks a P that came from the PM-first rule; the real
        // morning arrival now decides it. E and L are never touched.
        if (marks[id] === 'P') marks[id] = schedule?.timeIn && scanTime > schedule.timeIn ? 'L' : 'P';
      }
    }
    tx.set(attendanceRef, update, { merge: true });
    tx.update(rawRef, { attendanceResult: {
      status: 'applied', date, scanTime,
      ...(data.kind === 'in' ? { mark: marks[data.studentId] ?? 'P' } : {}),
      processedAt: FieldValue.serverTimestamp(),
    } });
    return { outcome: 'applied' };
  }, { maxAttempts: 10 });
}
