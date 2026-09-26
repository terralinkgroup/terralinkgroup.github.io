/* TerraLink — live mode.
   Loaded after the page's own script. It leaves the site alone until someone
   actually books, then hands the booking to the edge function so the points
   and the confirmation email come from the server instead of this browser.

   If Supabase is unreachable or nobody is signed in, everything falls back to
   the local demo behaviour — the page still works. */
(function () {
  var CFG = window.TERRALINK || {};
  var FN = (CFG.SUPABASE_URL || "") + "/functions/v1/send-confirmation";

  function client() {
    try { return (typeof AUTH !== "undefined" && AUTH.client) || null; } catch (_) { return null; }
  }
  function user() {
    try { return (typeof AUTH !== "undefined" && AUTH.user) || null; } catch (_) { return null; }
  }

  /* ---------- pull the real balance once the member signs in ---------- */
  async function syncClub() {
    var c = client(), u = user();
    if (!c || !u) return;
    try {
      var p = await c.from("profiles").select("club_number, points").eq("id", u.id).single();
      var l = await c.from("bookings")
        .select("reference, origin, destination, cabin, miles, points, paid_with, points_spent, upgrade_points, status, created_at")
        .order("created_at", { ascending: false }).limit(25);
      if (p.error) return;

      var club = {
        no: p.data.club_number,
        points: p.data.points || 0,
        activity: (l.data || []).map(function (b) {
          /* what each trip did to the balance, net: a cancelled one did
             nothing, and an upgrade's points come out of what it earned */
          var cx = b.status === "cancelled", up = b.upgrade_points || 0;
          return {
            ref: b.reference,
            route: b.origin + " → " + b.destination,
            cabin: cx ? "cancelled" : b.cabin + (up ? " (upgraded)" : ""),
            miles: cx ? 0 : (b.miles || 0),
            points: cx ? 0 : b.paid_with === "points" ? -((b.points_spent || 0) + up) : (b.points || 0) - up,
            date: new Date(b.created_at).toLocaleDateString(undefined,
              { day: "numeric", month: "short", year: "numeric" }),
          };
        }),
      };
      localStorage.setItem("tl_club", JSON.stringify(club));
      if (location.hash === "#/club" && typeof renderClub === "function") renderClub();
    } catch (_) { /* offline — keep the local copy */ }
  }

  window.tlSyncClub = syncClub;

  // the page calls setUser() on every auth change; piggyback on it
  if (typeof setUser === "function") {
    var origSetUser = setUser;
    window.setUser = setUser = function (u) {
      var r = origSetUser.apply(this, arguments);
      if (u) setTimeout(syncClub, 0);
      return r;
    };
  }
  setTimeout(syncClub, 1200);

  /* ---------- hand the finished booking to the server ---------- */
  function legsOf(b) {
    // the page builds the payload itself so booking and managing send one shape
    if (typeof serverLegs === "function") return serverLegs(b.out, b.ret);
    var out = [];
    // dir lets the server price each direction separately, and lets My Trips
    // split the itinerary back into outbound and return
    function push(list, dir) {
      (list || []).forEach(function (e) {
        var A = (typeof AINFO !== "undefined" && AINFO[e.from]) || null;
        var B = (typeof AINFO !== "undefined" && AINFO[e.to]) || null;
        out.push({
          dir: dir,
          from: e.from, to: e.to, dep: e.dep, arr: e.arr,
          flightNo: e.fn, carrier: e.ai, ac: e.ac,
          /* the carrier code decides which price column the server reads; a
             codeshare is priced in the operating airline's own cabins, so it
             deliberately sends none */
          carrierCode: (!e.cs && typeof AL !== "undefined" && AL[e.ai]) ? AL[e.ai].code : null,
          fromLat: A ? A[0] : null, fromLon: A ? A[1] : null,
          toLat: B ? B[0] : null, toLon: B ? B[1] : null,
        });
      });
    }
    push(b.out, "out"); push(b.ret, "ret");
    return out;
  }

  // What the confirmation says when there's no email to announce. The site
  // doesn't promise email, so a failed send is simply not mentioned — but a
  // send that didn't happen is never reported as one either.
  var DEMO_NOTE = "Demo booking — no payment was taken and no seats are held. " +
                  "Download your boarding passes below; they're also kept in My trips.";

  // the page re-renders the confirmation on route, so set the line and set it
  // again on the next tick in case that render lands after us
  function note(text) {
    function put() {
      var el = document.querySelector("#conf-fare .note");
      if (el) el.textContent = text;
    }
    put();
    setTimeout(put, 80);
  }

  async function submit(b) {
    var c = client(), u = user();
    if (!c || !u) { note(DEMO_NOTE + " Sign in to keep this booking on your account."); return; }

    var sess = await c.auth.getSession();
    var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
    if (!token) { note(DEMO_NOTE + " Sign in again to save this to your account."); return; }

    note("Saving your booking…");

    var res, body;
    try {
      res = await fetch(FN, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: b.ctx.from, destination: b.ctx.to,
          tripType: b.ctx.trip, cabin: b.ctx.cab,
          departDate: b.ctx.d || null,
          returnDate: (b.ctx.trip === "round" && b.ctx.r) ? b.ctx.r : null,
          itinerary: legsOf(b),
          seats: b.seats || [],
          passengers: b.pax,
          total: b.total,
          contactEmail: b.email,
          payWithPoints: b.paidWith === "points",
        }),
      });
      body = await res.json();
    } catch (e) {
      note("Couldn't reach the booking service — this booking is saved in this browser only. " + DEMO_NOTE);
      return;
    }

    if (res.status === 402 || (body && body.code === "insufficient_points")) {
      // the page debited optimistically; the server is the truth, so resync
      note("Your account doesn't have enough points for this award, so the booking wasn't made. " +
           "Nothing was charged and your balance is unchanged.");
      syncClub();
      return;
    }
    if (!res.ok) {
      note("The booking service refused this one (" + (body.error || res.status) + ").");
      syncClub();
      return;
    }

    // server wins: its reference, its points, its price
    b.ref = body.reference;
    b.points = body.points;
    b.miles = body.miles;
    b.paidWith = body.paidWith || b.paidWith;
    b.pointsSpent = body.pointsSpent || 0;
    if (typeof body.total === "number") b.total = body.total;
    b.club = {
      no: body.clubNumber,
      total: body.balance,
      tier: typeof tierOf === "function" ? tierOf(body.balance).name : "",
    };
    var el = document.getElementById("conf-ref");
    if (el) el.textContent = body.reference;
    if (typeof renderConfirmed === "function") renderConfirmed();

    /* Only ever announce an email that actually went out. When one didn't,
       say nothing about email at all — the boarding pass is the deliverable.
       The reason is logged for whoever is debugging, not shown to the booker. */
    if (body.emailed) {
      note("Confirmation sent to " + b.email + ". " + DEMO_NOTE);
    } else {
      if (body.emailError) console.info("[TerraLink] no confirmation email:", body.emailError);
      note("Booking saved to your account. " + DEMO_NOTE);
    }

    syncClub();
  }

  /* wrap the page's own confirm handler */
  function wrap() {
    var btn = document.getElementById("confirm-booking");
    if (!btn || !btn.onclick || btn.__tlWrapped) return;
    var orig = btn.onclick;
    btn.__tlWrapped = true;
    btn.onclick = function (ev) {
      var before = location.hash;
      orig.call(this, ev);
      if (location.hash === "#/confirmed" && before !== "#/confirmed") {
        // let the page paint its own confirmation first
        setTimeout(function () {
          try { if (LAST_BOOKING) submit(LAST_BOOKING); } catch (_) {}
        }, 60);
      }
    };
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", wrap);
  else wrap();
})();
