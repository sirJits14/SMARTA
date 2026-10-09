import { FieldValue } from 'firebase-admin/firestore';

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
    const gradeLevel = section.data().gradeLevel;
    if (!Number.isInteger(gradeLevel) || gradeLevel < 7 || gradeLevel > 12) return reject('grade');

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
    let scheduleTimeIn;
    if (section.data().scheduleId) {
      const schedule = await tx.get(db.doc(`schedules/${section.data().scheduleId}`));
      scheduleTimeIn = schedule.data()?.timeIn;
    }
    const update = { sectionId: data.sectionId, gradeLevel, schoolYear: data.schoolYear, date,
      marks, rosterInitialized: true, updatedAt: date };
    const field = data.kind === 'in' ? 'timeIn' : 'timeOut';
    const priorTime = attendance[field]?.[data.studentId];
    // Delayed/offline events must not move a later recorded time backwards.
    update[field] = { [data.studentId]: priorTime && priorTime > scanTime ? priorTime : scanTime };
    if (data.kind === 'in' && !attendance.timeIn?.[data.studentId]) {
      const existingMark = marks[data.studentId];
      if (!existingMark || existingMark === 'A') {
        marks[data.studentId] = scheduleTimeIn && scanTime > scheduleTimeIn ? 'L' : 'P';
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
