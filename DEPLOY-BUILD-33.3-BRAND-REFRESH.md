# Deploy Build 33.3 — Brand Refresh

Replace these files in the GitHub Pages repository root:
- `app.html`
- `app.js`
- `view.html`
- `index.html`
- `seed.html`
- `style.css`
- `labs-refresh.css`
- `manifest.webmanifest`
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`
- `favicon-32.png`
- `favicon-64.png`

Add:
- `logo-mark.png`

This is an asset/branding update. No Firestore Rules, Firebase configuration, or Apps Script deployment is required.

After committing, hard-refresh the website. If the old PWA icon remains on Android/iOS, remove the old home-screen shortcut and add it again because operating systems cache installed app icons separately.
