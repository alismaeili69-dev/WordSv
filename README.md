# WordSv 🇸🇪

A WordUp-style app for learning Swedish B2/C1 vocabulary with spaced repetition. It runs in the browser and installs on iPhone as a home-screen app (PWA), with no build step and no backend.

## How it works

- **Learn**: browse new words (filter B2 / C1). Swipe right (or tap *Add*) to add a word to your vocabulary. Swipe left to skip it.
- **Review**: words come back on this schedule (days): `1, 2, 3, 5, 8, 14, 21, 31, 60, 90, 145, 180`.
  - Swipe right: the word moves to the next step.
  - Swipe left: the word goes 2 steps back and comes up again tomorrow.
  - After the 180-day step, the word is marked as mastered.
- **My words**: search your words and see each word's progress and next review date.
- **Settings**: daily review limit, auto-read aloud, add your own words, export/import a backup.

Progress is stored in your browser on that device (`localStorage`). Export a backup now and then.

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Always open WordSv from the home-screen icon. It keeps its own storage, separate from Safari tabs.

## Adding words

Edit `data/words.json`. Each entry looks like this:

```json
{
  "id": "unique-id",
  "sv": "ord",
  "en": "word",
  "pos": "noun",
  "forms": "ett ord, -et, -",
  "level": "B2",
  "examples": [{ "sv": "Ett svenskt exempel.", "en": "An English translation." }]
}
```

`id` must be unique and must never change (your progress is linked to it). You can also add words from inside the app, in Settings.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`**.

## Structure

```
index.html            app shell
styles.css            styles (light + dark mode)
manifest.webmanifest  PWA metadata
sw.js                 service worker (offline)
src/app.js            views: Learn, Review, My words, Settings
src/srs.js            spaced-repetition logic
src/storage.js        save / export / import
src/swipe.js          swipe gestures
data/words.json       word bank
icons/                app icons
```
