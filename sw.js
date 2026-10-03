/* TerraLink — offline support.
   The page, the timetable (data.json), the settings and the libraries are kept
   so the site opens, and trips and boarding passes work, with no signal. The
   page and timetable are always fetched fresh when there is a connection; the
   kept copies are only used when there isn't. Supabase, weather and map tiles
   are never kept here. */
const V = "tl-v2";
const CORE = ["./", "index.html", "data.json", "config.js", "live.js", "site.webmanifest",
  "favicon-32.png", "favicon-48.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
  "entertainment/"];
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(CORE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await Promise.all(LIBS.map((u) => fetch(u, { mode: "cors" }).then((r) => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

const fresh = new Set(["", "index.html", "data.json", "config.js", "live.js"]);
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const lib = LIBS.includes(url.href) || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!same && !lib) return;                       // Supabase, weather, tiles: straight to the network
  const name = same ? url.pathname.replace(/^.*\//, "") : "";
  if (same && (req.mode === "navigate" || fresh.has(name))) {
    // network first, the kept copy if offline. Each page is kept under its own
    // address (the site and entertainment/ are separate pages).
    const key = req.mode === "navigate" ? new URL(url.pathname.replace(/\/index\.html$/, "/"), self.location.origin).href : req;
    e.respondWith((async () => {
      const c = await caches.open(V);
      try {
        const r = await fetch(req);
        if (r.ok && !r.redirected) c.put(key, r.clone());
        return r;
      } catch (_) {
        const root = new URL("./", self.location).pathname === url.pathname || /\/index\.html$/.test(url.pathname) && !/entertainment/.test(url.pathname);
        return (await c.match(key, { ignoreSearch: true })) || (root ? (await c.match("index.html")) || (await c.match("./")) : null) || Response.error();
      }
    })());
    return;
  }
  // everything else: the kept copy, refreshed in the background
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(req, { ignoreSearch: same });
    const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
