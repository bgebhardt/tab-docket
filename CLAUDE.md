# Tab Docket: context for Claude

Chromium MV3 extension (no build step, no dependencies). Read `README.md` for usage and `docs/DESIGN.md` for decisions, edge cases and the manual test checklist.

## Why this exists

The owner (Bryan) runs Comet (Chromium-based) with far too many tabs and had memory pressure (Comet alone used 6–13 GB, swap nearly full). He already uses Tab Manager Plus (finding open tabs), Session Buddy (stashing whole sessions) and Raindrop.io (long-term storage). His recurring problem: anything saved goes out of sight and is never revisited. Tab Docket is a **working set**: tabs to deal with soon, grouped by topic, viewable on a dedicated stash page (the New Tab page is left alone: Comet's is Perplexity), with age/staleness surfaced. It is deliberately **not** an archive, session manager or tab sleeper.

The full picture of his tools and where each fits is in `docs/WORKFLOW.md`.

Hard requirements from him: free (no paid tiers, no caps), send a single tab to a group quickly, groups organized by type, list kept visible. Toby (60-tab free cap) and Workona were rejected; the built-in Reading List was rejected because it has no grouping.

## Constraints and decisions to keep

- Data lives in a bookmarks folder `Tab Docket` (subfolders = groups), not in extension storage. Don't move it to `storage.sync` (quota) or IndexedDB (lock-in).
- Build DOM with `createElement`/`textContent`, never `innerHTML` (page titles are untrusted).
- Keep `lib/util.js` free of `chrome.*` so it stays unit-testable; all browser calls go through `lib/stash.js`.
- New items are appended; oldest item is at the top (queue semantics).
- A URL exists at most once in the stash; re-stashing moves it.
- AI name suggestions must stay on-device (Prompt API) or offline heuristics; no cloud LLM calls.
- No network requests, minimal permissions (`bookmarks`, `tabs`, `storage`, `favicon`).

## Status

- v0.2.0 implemented (quick-stash shortcut, name suggestions, options page, stash page instead of New Tab override). Unit tests pass (`npm test`). Bryan has loaded v0.1 in Comet and the popup/stash page worked; v0.2 additions are untested in a browser. Verify with the checklist in `docs/DESIGN.md` and fix whatever breaks.
- Unverified assumptions about Comet: the `_favicon/` endpoint, the `Alt+Shift+S/Q/O` commands, and whether `LanguageModel` (Prompt API) exists (suggestions fall back to heuristics).
- Known gap: drag-and-drop only moves between groups (no reorder; `bookmarks.move` has an off-by-one quirk when moving down within the same folder).

## Commands

```sh
npm test         # node:test with tests/fake-chrome.js
npm run check    # node --check on every script
npm run icons    # regenerate icons/ (pure-Python PNG writer)
```

Load for manual testing: `comet://extensions` → Developer mode → Load unpacked → this folder; click reload there after edits.

## Releasing

The product is **Tab Docket** (renamed from "Tab Stash", which is an established Firefox extension by Josh Berry; don't revert). Author/copyright: Bryan Gebhardt, MIT (`LICENSE`, `lib/about.js`, README "About", `PRIVACY.md`). The legacy `Tab Stash` bookmarks folder is used in place by `getRootId` (never renamed: lookups must not write, and the title may belong to another extension).

1. Bump `version` in `manifest.json` and `package.json`; add a `## [x.y.z]` entry to `CHANGELOG.md` (the build and a test enforce all three agree).
2. `npm test && npm run release` -> `dist/tab-docket-vX.Y.Z.zip` + `.sha256` (dist/ is git-ignored).
3. Commit, tag `vX.Y.Z`, push, then `gh release create vX.Y.Z dist/*.zip dist/*.sha256`. Only when Bryan asks.

## Conventions

- Match the existing style: small ES modules, comments explain *why*, 2-space indent, single quotes.
- When behavior changes, update `docs/DESIGN.md` (edge-case table, checklist), `README.md` and `CHANGELOG.md`.
- Add or extend tests in `tests/` for any logic in `lib/`.
- Commit messages: short imperative subject; only commit when asked.
