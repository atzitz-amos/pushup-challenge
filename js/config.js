// Challenge rules. Dates are local calendar days (YYYY-MM-DD), inclusive.
export const CONFIG = {
  goal: 30,
  startDate: '2026-10-11',
  endDate: '2026-12-24',
  allowedMisses: 2,
  lateLogUntilHour: 12, // yesterday can still be logged until this hour
};

export const COLORS = ['#34d399', '#38bdf8', '#a78bfa', '#6ee7b7', '#818cf8'];

// Demo mode: open with ?demo, or from a page that sets window.PUSHUP_DEMO (the published preview).
// The challenge then starts 9 days ago with sample data, and yesterday stays loggable all day.
export const DEMO = !!globalThis.PUSHUP_DEMO || new URLSearchParams(location.search).has('demo');

if (DEMO) {
  const d = new Date();
  d.setDate(d.getDate() - 9);
  CONFIG.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  CONFIG.lateLogUntilHour = 24;
}
