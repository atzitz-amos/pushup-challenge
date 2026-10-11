// Challenge rules. Dates are local calendar days (YYYY-MM-DD), inclusive.
export const CONFIG = {
  goal: 30,
  startDate: '2026-10-11',
  endDate: '2026-12-24',
  allowedMisses: 2,
};

export const COLORS = ['#34d399', '#38bdf8', '#a78bfa', '#6ee7b7', '#818cf8'];

// Shared progress, so everyone sees each other. Create a free Supabase project, run
// supabase/schema.sql in its SQL editor, then paste the project URL
// (https://<project-id>.supabase.co) and the publishable key (sb_publishable_…) or
// legacy "anon public" key (eyJ…) here. Never the secret / service_role key.
// This key is meant to be public: what it can do is limited by the table's
// row-level security policies. Leave empty to stay local-only.
export const SUPABASE = {
  url: 'https://vdatwkzehwelmmlqgoys.supabase.co',
  anonKey: 'sb_publishable_tINRZ9IhGmWVPsJ3G-k8bA_O70eN1ZY',
};

// Demo mode: open with ?demo, or from a page that sets window.PUSHUP_DEMO (the published preview).
// The challenge then starts 9 days ago with sample data.
export const DEMO = !!globalThis.PUSHUP_DEMO || new URLSearchParams(location.search).has('demo');

if (DEMO) {
  const d = new Date();
  d.setDate(d.getDate() - 9);
  CONFIG.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
