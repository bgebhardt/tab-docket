# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] - 2026-10-22

### Added
- Flag tabs on the stash page (per item or per group) and act on them in bulk: Open, Move to a group (or new group), Delete with Undo.
- Stash page header buttons that open (or focus) Tab Manager Plus and Session Buddy.
- Quick stash shortcut (`Alt+Shift+Q`): saves the active tab and closes it with no popup. Goes to the Inbox, or the last-used group (option).
- Group name suggestions in the popup: offline guesses from shared title words and the dominant site, plus an on-device AI name when the browser has the Prompt API model ready. No network.
- Options page: close-after-stash and quick-stash target.
- `Alt+Shift+O` and a "View stash" button at the top of the popup open (or focus) the stash page.

### Changed
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
