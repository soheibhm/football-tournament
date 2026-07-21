# ⚽ Football Tournament Manager

A complete football tournament website — **pure HTML, CSS and vanilla JavaScript**.
No React, no Node.js, no PHP, no database server. Everything is saved permanently
in the browser using `localStorage`.

## Project structure

```
index.html   → Public site (Home, Groups, Statistics, Champion)
admin.html   → Password-protected admin dashboard
style.css    → All styling (responsive, dark mode, RTL)
script.js    → All logic (data storage, calculations, rendering)
data.json    → Sample data you can import from the admin "Data" tab to try a demo
images/      → Put any extra static images here (logos are stored as base64 in
               localStorage when uploaded through the admin panel, so this folder
               is optional)
```

## Running it locally

Just double-click `index.html` (or `admin.html`), or open it with your browser.
No build step, no server, no npm install. Works 100% offline once opened.

> Note: some browsers restrict `localStorage` for pages opened directly from disk
> (`file://`). If you notice data not saving, run a tiny local server instead, e.g.:
> `python3 -m http.server 8000` then visit `http://localhost:8000`.

## Deploying for free

Works as-is on:
- **GitHub Pages** — push this folder to a repo, enable Pages on the `main` branch.
- **Netlify** — drag & drop this folder onto Netlify's deploy page.
- **Vercel** — import the repo or drag & drop, no framework/build settings needed.

## Admin access

Go to `admin.html`. Default password:

```
admin123
```

**Change it** before deploying publicly — open `script.js` and edit the
`ADMIN_PASSWORD` constant near the top of the file. This is a simple client-side
password meant to deter casual visitors, not a real security system (anyone who
reads the JS source can find it) — don't use it to protect sensitive data.

## Using the admin dashboard

1. **Tournament** tab — set the name, banner image, start date and number of groups.
2. **Clubs** tab — add clubs (max 4 per group), upload logos, edit or delete them.
   Click **👥 Squad** on any club to register that club's players (name + optional
   shirt number) or delete them — each club's squad is managed independently.
3. **Fixtures** tab — auto-generate a round-robin schedule per group (or all at once).
4. **Matches** tab — click a match to enter/edit the score. For each goal, pick the
   scoring team and then choose the **scorer from that club's registered squad**
   (a dropdown, not free text) plus an optional assist provider from the same
   squad. If a club has no players registered yet, an "Other (type manually)"
   fallback lets you type the name directly. You can also **reassign which two
   clubs are playing** a fixture directly from this modal, and add extra matches
   by hand from the Fixtures tab. Standings, top scorers, top assists and best
   clubs update automatically the moment you save.
5. **Knockout** tab — build a knockout bracket on top of the group stage. Use
   **Quick Setup** to auto-generate the classic cross-group draw (1st of Group A
   vs 2nd of Group B, and vice versa — works for any even number of groups), or
   add rounds and matches manually. Each side of a knockout match can be:
   - a specific group position (e.g. "1st — Group A"),
   - the **winner** or **loser** of an earlier knockout match (so the bracket
     fills itself in as results come in), or
   - a manually chosen club.

   Use **Advance Winners →** on a round to automatically create the next round,
   pairing up that round's winners. Penalty shoot-out scores can be entered for
   matches that finish level.
6. **Champion** tab — manually crown the tournament champion once it's decided.
7. **Data** tab — export the whole tournament to a `.json` file, import one back in,
   or reset everything.

## Full admin control

Everything in the tournament can be edited after the fact, not just at creation:
- Group names can be renamed anytime (Fixtures tab).
- Fixtures can be regenerated per group, and extra matches added by hand.
- A match's home/away clubs, date, score, goals and assists can all be edited
  or cleared at any time — nothing is locked in once entered.
- The group stage runs **home & away (double round-robin)** by default; toggle
  it off in the Fixtures tab for a single match per pair instead.

## Notes on LocalStorage

- All tournament data lives under the key `ftm_tournament_v1` in `localStorage`.
- Club logos and the banner are stored as base64 data URLs — keep images small
  (a few hundred KB) since `localStorage` typically caps out around 5–10MB per site.
- Theme (`ftm_theme`) and language (`ftm_lang`) preferences are stored separately
  and shared between the public site and the admin dashboard.
- Nothing ever leaves the browser — there is no backend, API or database involved.

Enjoy the tournament! 🏆
