# gee-companion · Ahotɔ Wellness Enterprise

*Everyday Health. Everyday Wellness.*

A private, 100% offline-first native iOS-styled wellness and weight-management companion built with **vanilla JavaScript, HTML5, and CSS3**.

## What it does

- **Native iOS Survey-Style Logging:** Step-by-step mobile questionnaire interface (one question per screen) for meal tracking and habit logging.
- **100% Tap Controls:** Zero `<select>` dropdowns — seamless iOS segmented controls, chips, and tap cards.
- **Ahotɔ Wellness Branding:** Warm cream background, Ahotɔ Green headers, Ahotɔ Gold accents, charcoal typography, and approved logo mark (gold heart, white ECG pulse, green dot).
- **Completely Offline:** Upgraded Service Worker (`sw.js`) pre-caches all shell assets and provides full offline capability from the first visit without internet.
- **Local-First Privacy:** All records stored in IndexedDB on device — no trackers, accounts, cloud databases, or build steps.
- **Daily Habits & Tracking:** Water tracking with quick-add buttons, flexible 2-meal logging, post-meal walk timing, movement breaks, guided indoor resistance training, and HIIT sessions.
- **Progress & Decision Support:** Weekly morning-weight averages, habit consistency score, high-DPR trend charts, and deterministic lifestyle guidance.
- **Data Portability:** Complete JSON backup/restore and CSV spreadsheet export.

## Personal defaults included

- Male, age 42
- Height: 160 cm
- Starting weight: 73 kg
- First milestone: 68 kg
- Later milestones: 64 kg and 60 kg
- Preferred longer-term range: 54–56 kg
- Water target: 2.5 L/day unless medically fluid-restricted
- Strength target: 3 sessions/week
- HIIT: up to 2 sessions/week
- Post-meal walking: 10–15 minutes when practical

All key values can be changed in **More → Profile & targets**.

## Run locally

Because service workers require HTTP(S), do not test offline mode using `file://`.

From the project folder, if Python is available:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

The app itself has no Python dependency; this command is only a convenient local static server.

## GitHub Pages deployment

1. Create a new public GitHub repository.
2. Upload/push every file in this folder, keeping the `icons/` folder.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your default branch (normally `main`) and `/ (root)`.
6. Save.
7. Open the GitHub Pages URL once online, then install/add it to your phone home screen.

No build command is required.

## Cloudflare Pages

You can also connect the GitHub repo to Cloudflare Pages.

- Framework preset: None
- Build command: leave blank
- Build output directory: `/` (repository root)

## iPhone installation

Open the hosted HTTPS site in Safari, tap **Share**, then **Add to Home Screen**. iOS controls whether the browser's install prompt appears, so the in-app Install button may not show on iPhone.

## Data and privacy

Health/activity records are stored locally in IndexedDB on the device/browser. Profile preferences are stored in localStorage. There is no account, server database, advertising or analytics.

Use **More → Export JSON backup** regularly, especially before clearing browser data or changing phones.

## Important limitation: reminders

This is a static/offline-first PWA with no push server. In-app “NEXT” guidance is reliable while you use the app. Browser notifications are optional and platform-dependent, but the app cannot guarantee scheduled background reminders after it has been closed.

## Weight calculations

- Weekly trend uses **morning weights only**.
- Evening weights are stored but do not affect the morning weekly average.
- Missing scale days are not counted as failures.
- At least repeated morning measurements are preferable before interpreting a weekly trend.

## Safety

The DSS is a transparent set of behavioural rules. It does not diagnose conditions, prescribe medication, recommend starvation/dehydration, or encourage escalating HIIT to compensate for eating.

Stop strenuous exercise and seek appropriate medical assessment for chest pain, fainting, severe dizziness, unusual shortness of breath or severe palpitations.
