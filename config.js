// TerraLink — public configuration.
// These two values are meant to be public: the anon key only ever gets you
// what row-level security allows. Never put the service_role key here.
window.TERRALINK = {
  SUPABASE_URL: "https://uhzqfhnrcdlpjqzihdnm.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoenFmaG5yY2RscGpxemloZG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2ODA4MTYsImV4cCI6MjEwNTI1NjgxNn0.dIhpmwvTD_YWbCGgyjUmt-T1VJerkt310gOleIjD20s",
  // Optional. Leave empty to use OpenStreetMap's own map tiles (no key needed).
  // Paste a free CARTO basemaps key (carto.com/basemaps) to use CARTO's light map instead.
  CARTO_KEY: "",
};
