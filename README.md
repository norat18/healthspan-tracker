# Healthspan Tracker

A free, private web app for keeping track of your health in one place — and getting reminded when each test, screening or vaccine is due.

**Use it:** https://healthspantracker.web.app · mirror: https://healthspantracker.pages.dev

## What it does

- **Bloodwork** — lipids, metabolic panel, A1c, vitamins, inflammation and more, each with a plain-language purpose, target range, trend chart and change since last time. Import results straight from MyChart-style PDF reports.
- **Body & fitness** — DEXA body composition, bone density, VO₂ max, resting heart rate and home measurements, plus a **fitness age** calculated from your VO₂ max.
- **Scans** — visual result cards for carotid (CIMT), coronary calcium (CAC), coronary CT angiogram and full-body MRI.
- **Screenings & vaccines** — women's and men's health screenings, preventive checks and adult vaccines based on U.S. guidelines (USPSTF, ACOG, ACS, CDC), starting at the right age and adjusted for family history.
- **Reminders** — what's overdue and coming up, plus a calendar file (.ics) with alerts.
- **Visit prep sheet** — a printable page for your next checkup: tests to ask for, results to discuss, medications and questions.

## Privacy

- Without an account, everything stays in your browser.
- Signed in with Google, your data is stored in your own Firestore document. [Security rules](firestore.rules) allow only your account to read or write it.
- No ads, analytics or tracking. You can delete your cloud data at any time (Data tab).

This is a personal tracker, not medical advice.

## Features at a glance

- Google sign-in with live sync across devices (changes from two devices are merged); works offline and installs to your home screen.
- Push-notification reminders (opt-in): the day something is due, a week before, and Mondays for anything overdue.
- PDF lab-report import (values and the lab's normal ranges), visit prep sheet, fitness age, family-history-aware screening schedule.
- [Privacy & terms](public/privacy.html). Security: Firestore rules (own data only), Firebase App Check, Content-Security-Policy.

## Development

Plain HTML, CSS and JavaScript — no build step. Everything the site serves is in [`public/`](public).

```bash
python3 -m http.server 8790 --directory public   # then open http://localhost:8790
```

**Deploy:** pushing to `main` deploys Firebase Hosting automatically (GitHub Actions). Manually:

```bash
npx firebase-tools deploy --only hosting,firestore:rules   # https://healthspantracker.web.app
```

`https://healthspantracker.pages.dev` mirrors Firebase Hosting through a Cloudflare Pages Function
([`functions/[[path]].js`](functions/[[path]].js)), so it never needs a separate deploy.

**When you change files in `public/`:** bump the `?v=` numbers in `index.html` and the `CACHE` name and list in `sw.js`, so browsers and the offline copy pick up the new version.

**Reminders service** ([`reminders/`](reminders)): Cloudflare Worker + D1 with a daily cron. Deploy with `cd reminders && npm install && VAPID_PUBLIC_KEY=<public key> cf deploy`. The private signing key is stored as the `VAPID_PRIVATE_JWK` Worker secret.

| File | Purpose |
|------|---------|
| `public/catalog.js` | Built-in tests, scans, screenings and vaccines |
| `public/app.js` | Core app: storage, sync/merge, scheduling, views |
| `public/cloud.js`, `firebase-config.js` | Google sign-in, App Check, per-account storage, live updates |
| `public/push.js`, `sw.js` | Notification sign-up; offline cache and notification display |
| `public/summary.js`, `results.js`, `scans.js` | Summary, result cards & fitness age, scan cards |
| `public/myinfo.js`, `visit.js`, `labimport.js`, `pastdates.js` | My Info, visit sheet, PDF import, past dates |
| `public/privacy.html` | Privacy & terms |

## License

MIT
