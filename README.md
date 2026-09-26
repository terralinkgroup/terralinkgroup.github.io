# TerraLink

A booking site for a made-up airline group, just for fun. No real flights,
no real payments.

The whole site is plain files — no build step. `index.html` is the page,
`live.js` talks to the booking backend on Supabase, `config.js` holds the
Supabase address and its public key (safe to publish; the private keys live
in Supabase, not here).

Hosted with GitHub Pages: **Settings → Pages → Deploy from a branch →
`main` / `(root)`**. To update the site, replace `index.html` (or any file)
and commit — Pages republishes in a minute or two.
