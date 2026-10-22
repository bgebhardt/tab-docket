# Tab Stash: context for Claude

Chromium MV3 extension (no build step, no dependencies). Read `README.md` for usage and `docs/DESIGN.md` for decisions, edge cases and the manual test checklist.

## Why this exists

The owner (Bryan) runs Comet (Chromium-based) with far too many tabs and had memory pressure (Comet alone used 6–13 GB, swap nearly full). He already uses Tab Manager Plus (finding open tabs), Session Buddy (stashing whole sessions) and Raindrop.io (long-term storage). His recurring problem: anything saved goes out of sight and is never revisited. Tab Stash is a **working set**: tabs to deal with soon, grouped by topic, shown on every New Tab page, with age/staleness surfaced. It is deliberately **not** an archive, session manager or tab sleeper.

Hard requirements from him: free (no paid tiers, no caps), send a single tab to a group quickly, groups organized by type, list kept visible. Toby (60-tab free cap) and Workona were rejected; the built-in Reading List was rejected because it has no grouping.

## Constraints and decisions to keep

- Data lives in a bookmarks folder `Tab Stash` (subfolders = groups), not in extension storage. Don't move it to `storage.sync` (quota) or IndexedDB (lock-in).
- Build DOM with `createElement`/`textContent`, never `innerHTML` (page titles are untrusted).
- Keep `lib/util.js` free of `chrome.*` so it stays unit-testable; all browser calls go through `lib/stash.js`.
- New items are appended; oldest item is at the top (queue semantics).
- A URL exists at most once in the stash; re-stashing moves it.
- No network requests, minimal permissions (`bookmarks`, `tabs`, `storage`, `favicon`).

## Status

- v0.1.0 implemented. Unit tests pass (`npm test`). **The popup and New Tab UI have never been run in a real browser**: the first session could not load the extension. Verify with the checklist in `docs/DESIGN.md` and fix whatever breaks.
- Unverified assumptions about Comet: the `chrome_url_overrides` New Tab override, the `_favicon/` endpoint, and the `Alt+Shift+S` command.
- Known gap: drag-and-drop only moves between groups (no reorder; `bookmarks.move` has an off-by-one quirk when moving down within the same folder).

## Commands

```sh
npm test         # node:test with tests/fake-chrome.js
npm run check    # node --check on every script
npm run icons    # regenerate icons/ (pure-Python PNG writer)
```

Load for manual testing: `comet://extensions` → Developer mode → Load unpacked → this folder; click reload there after edits.

## Conventions

- Match the existing style: small ES modules, comments explain *why*, 2-space indent, single quotes.
- When behavior changes, update `docs/DESIGN.md` (edge-case table, checklist), `README.md` and `CHANGELOG.md`.
- Add or extend tests in `tests/` for any logic in `lib/`.
- Commit messages: short imperative subject; only commit when asked.
