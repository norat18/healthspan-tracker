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

## Development

Plain HTML, CSS and JavaScript — no build step. Everything the site serves is in [`public/`](public).

```bash
python3 -m http.server 8790 --directory public   # then open http://localhost:8790
```

Deploy:

```bash
npx firebase-tools deploy --only hosting,firestore:rules            # https://healthspantracker.web.app
npx wrangler pages deploy public --project-name healthspantracker   # https://healthspantracker.pages.dev
```

| File | Purpose |
|------|---------|
| `public/catalog.js` | Built-in tests, scans, screenings and vaccines |
| `public/app.js` | Core app: storage, scheduling, views |
| `public/cloud.js`, `firebase-config.js` | Google sign-in and per-account storage |
| `public/summary.js`, `results.js`, `scans.js` | Summary, result cards & fitness age, scan cards |
| `public/myinfo.js`, `visit.js`, `labimport.js`, `pastdates.js` | My Info, visit sheet, PDF import, past dates |

## License

MIT
