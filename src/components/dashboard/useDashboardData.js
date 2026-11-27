import { useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource, useStaffCollectionResource } from '../../hooks/useCollection.js';
import { useLocalToday } from '../../hooks/useLocalToday.js';
import { useLearnerRequestCount } from '../../hooks/useLearnerRequestCount.js';
import { canOpen, grades, isAdmin, scopeRoster } from '../../lib/access.js';
import { attendanceCoverage, rosterBySection, unassignedCount } from '../../lib/dashboardStats.js';

// Everything the dashboard reads, loaded once and scoped to the signed-in person's grades.
export function useDashboardData({ me, schoolYear }) {
  const studentsResource = useStaffCollectionResource('students', { me, schoolYear });
  const sectionsResource = useStaffCollectionResource('sections', { me, schoolYear });
  const enrollmentsResource = useStaffCollectionResource('enrollments', { me, schoolYear });
  const attendanceResource = useStaffCollectionResource('student_attendance', { me, schoolYear });
  const postsResource = useCollectionResource('announcements');
  const admin = isAdmin(me);
  const canRequests = canOpen(me, 'learnerRequests');
  // Rules let only admins read the ID card batch; everyone else never opens the listener.
  const idCardsResource = useQueryResource(() => (admin ? collection(db, 'id_card_batch') : null), [admin]);
  const idCardIds = useMemo(() => idCardsResource.data.map((d) => d.id), [idCardsResource.data]);
  const requests = useLearnerRequestCount(canRequests);
  const today = useLocalToday();

  const { students, sections, enrollments, attendance } = useMemo(() => scopeRoster({
    students: studentsResource.data, sections: sectionsResource.data,
    enrollments: enrollmentsResource.data, attendance: attendanceResource.data,
  }, grades(me), schoolYear), [studentsResource.data, sectionsResource.data, enrollmentsResource.data, attendanceResource.data, me, schoolYear]);

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const sectionsById = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s])), [sections]);
  const rosterMap = useMemo(() => rosterBySection(students, enrollments, schoolYear), [students, enrollments, schoolYear]);
  const coverage = useMemo(() => attendanceCoverage({ students, sections, enrollments, attendance, schoolYear, date: today }),
    [students, sections, enrollments, attendance, schoolYear, today]);
  const unassignedTotal = useMemo(() => unassignedCount(students, enrollments, schoolYear), [students, enrollments, schoolYear]);
  // Post states depend on the clock; recomputed whenever posts or the day change.
  const nowMs = useMemo(() => Date.now(), [postsResource.data, today]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    me, admin, canRequests, schoolYear, today, nowMs,
    students, sections, enrollments, attendance, studentsById, sectionsById, rosterMap, coverage, requests, unassignedTotal,
    posts: postsResource.data,
    idCardIds,
    resources: {
      roster: [studentsResource, sectionsResource, enrollmentsResource, attendanceResource],
      posts: [postsResource],
      idCards: admin ? [idCardsResource] : [],
    },
  };
}
