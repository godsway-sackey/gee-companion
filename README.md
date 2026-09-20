# gee-companion

*Everyday Health. Everyday Wellness.*

A private, 100% offline-first native iOS-styled wellness and weight-management companion built with **vanilla JavaScript, HTML5, and CSS3**.

---

## Features

- **Native iOS Survey-Style Logging:** Step-by-step mobile questionnaire interface (one question per screen) for meal tracking and habit logging.
- **100% Tap Controls:** Zero `<select>` dropdowns — smooth iOS segmented controls, preset chips, and tap cards.
- **Modern iOS Design System:** Compact, native iOS aesthetic with warm cream background, deep forest green accents, gold highlights, charcoal typography, and an icon mark with the green dot placed above the heart.
- **Completely Offline:** Upgraded Service Worker (`sw.js`) pre-caches all shell assets and provides full offline capability from the first visit without internet.
- **Local-First Privacy:** All records stored in IndexedDB on device — no trackers, accounts, cloud databases, or build steps.
- **Habit Tracking:** Hydration tracking with quick-add buttons, structured 2-meal logging, post-meal walk timing, movement breaks, and workout logging.
- **Progress & Trends:** Weekly morning-weight averages, habit consistency score, and trend charts.
- **Data Portability:** Complete JSON backup/restore and CSV spreadsheet export.

---

## Run Locally

Because service workers require HTTP(S) or localhost, do not test offline mode using `file://`.

From the project folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

The app itself has no backend or framework dependencies; any static file server works.

---

## iPhone Installation (PWA)

1. Open the hosted HTTPS site in Safari.
2. Tap **Share** (box with arrow).
3. Tap **Add to Home Screen**.
4. The app runs in standalone fullscreen mode and works completely offline.

---

## Data and Privacy

Health and habit records are stored entirely in IndexedDB and localStorage on your device. No data is ever sent to any remote server or third party.

---

## License

MIT
