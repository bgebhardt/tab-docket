# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.0] - 2026-10-23

First public release.

### Changed
- Renamed from "Tab Stash" to **Tab Docket**, because Tab Stash is an established Firefox extension. An existing `Tab Stash` bookmarks folder is adopted and renamed to `Tab Docket` automatically; nothing is lost.

### Added
- About section on the options page and a credit line on the stash page (author, copyright, license, links, disclaimer).
- `PRIVACY.md`, `author` and `homepage_url` in the manifest.
- `npm run release` builds `dist/tab-docket-vX.Y.Z.zip` (plus SHA-256) and refuses to build if versions disagree.

## [0.2.0] - 2026-10-22

### Added
- Star tabs on the stash page: starred rows get a gold-tinted background (light and dark themes).
- Group sorting on the stash page and in the popup: last modified (default), A–Z, most tabs, oldest tab first, folder order. The choice is remembered.
- Collapsible groups on the stash page; the folded state is remembered.
- Flag tabs on the stash page (per item or per group) and act on them in bulk: Open, Move to a group (or new group), Delete with Undo.
- Stash page header buttons that open (or focus) Tab Manager Plus and Session Buddy.
- Quick stash shortcut (`Alt+Shift+Q`): saves the active tab and closes it with no popup. Goes to the Inbox, or the last-used group (option).
- Group name suggestions in the popup: offline guesses from shared title words and the dominant site, plus an on-device AI name when the browser has the Prompt API model ready. No network.
- Options page: close-after-stash and quick-stash target.
- `Alt+Shift+O` and a "View stash" button at the top of the popup open (or focus) the stash page.

### Changed
- Clicking a stashed tab on the stash page opens it in a new tab, leaving the stash page open (previously it replaced the stash page).
- Closing tabs after stashing is now off by default, and `closeTabs` retries then verifies the tab is really gone, reporting an error if the browser ignores the request.
- The stash page no longer overrides the New Tab page (Comet's New Tab is Perplexity). It lives at `board/board.html` and is opened by shortcut or from the popup.

## [0.1.0] - 2026-10-22

### Added
- Toolbar popup and `Alt+Shift+S` shortcut to stash this tab, selected tabs, or the whole window into a group.
- Type-to-filter / type-to-create group picker with keyboard navigation.
- New Tab page showing groups as cards with age, stale highlighting, filter, drag to move, Undo, rename, delete, Open all, Open & clear.
- Toolbar badge with the number of stashed tabs.
- Storage in a `Tab Stash` bookmarks folder; duplicates move instead of copying.
- Unit tests for the helpers and the bookmarks/tabs logic.
