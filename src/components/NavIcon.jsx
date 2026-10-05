const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  students: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 7 M21 21v-2a4 4 0 0 0-3-3.87',
  sections: 'M3 7l9-4 9 4-9 4z M3 12l9 4 9-4 M3 17l9 4 9-4',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18 M7 15h2 M13 15h2',
  enroll: 'M14 3H5v18h14V8z M14 3v5h5 M8 14h8 M12 10v8',
  attendance: 'M9 3h6v4H9z M9 5H5v16h14V5h-4 M8 14l3 3 5-6',
  idcards: 'M3 5h18v14H3z M8 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M5 16c0-3 6-3 6 0 M14 9h4 M14 13h4',
  guardians: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
  announcements: 'M3 10v4h4l6 5V5l-6 5H3z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  accounts: 'M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M3 21v-1a7 7 0 0 1 10.5-6 M18 14v6 M15 17h6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  collapse: 'M14 7l-5 5 5 5',
  logout: 'M9 3H4v18h5 M9 12h12 M17 8l4 4-4 4',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  close: 'M6 6l12 12 M6 18L18 6',
};
export default function NavIcon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.dashboard} /></svg>;
}
