# Gongola Journal — Elite Workflow v2

Professional, mobile-first visual and workflow upgrade for the existing `gongolatechlab/trading-journal` repository.

## What is preserved

- Existing personal trade log and price-distance points calculation.
- Existing daily notes, personal preferences and trade filters.
- Dashboard metrics, trade calendar, equity curve and ICT machine performance.
- Supabase sign-in and machine-results read path.
- Existing browser storage keys: `myTrades`, `dailyNotes`, `journalSettings`.

## What's new

- Three switchable design directions: Obsidian Gold, Midnight Blue and Slate Minimal.
- Calm mobile UI, clearer metric hierarchy and touch-friendly controls.
- A structured daily review, including sessions, plan adherence, execution grade,
  lessons, next-session priority and optional chart screenshots. Works on days with no trades.
- Optional trade setup/session/plan/psychology context, with screenshot attachment.
- Screenshots resized locally and stored as blobs in browser IndexedDB.
- Screenshot viewer with download and individual deletion.
- Complete JSON export/restore of locally stored trades, notes, settings, reviews and images.
- Safer trade-list rendering of stored notes as plain text, not interpreted HTML.

## Important storage limitation

The existing application stores personal trades in browser **localStorage**. This upgrade adds
screenshot storage using **IndexedDB** on the **same browser and device**. The existing Supabase
login is **not** a cloud-sync service for these personal journal records. Export backups regularly;
changing devices or clearing browser data can lose them.

## Safe installation

1. Download `gongola-journal-elite-v2.zip` from ChatGPT.
2. In Termux, open your existing `~/ai-agent/workspace/trading-journal` directory.
3. Extract the ZIP into that directory so `elite.css`, `elite.js`, `journal-workflow.css`,
   `journal-workflow.js`, and `install_elite.py` sit beside `index.html`.
4. Run: `python install_elite.py`
5. Check `git diff -- index.html` and `git status` before committing only the intended files.
6. Test daily review, screenshots, restore from backup and mobile themes before publishing.

The installer backs up the previous HTML to `~/.gongola-backups/` and only adds CSS/JS links.
It does **not** replace the original journal HTML file or existing JavaScript.

## Browser requirements

Modern Chromium-based Android browser recommended. The frontend uses no added JavaScript
libraries. It still relies on the existing Tailwind CDN and Supabase SDK CDN as before.

## Upgrade notes

This package supersedes Elite v1. If `elite.css` and `elite.js` are already linked, the installer
only adds the missing `journal-workflow` asset links. Settings theme preference is saved separately.

## Deployment safety

Do not stage or commit unrelated local changes. The user must review and approve deployment to
GitHub Pages. No preview or production deployment is performed by this package.
