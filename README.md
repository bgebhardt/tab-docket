# Tab Stash

A browser extension for Chromium browsers (Chrome, Comet, Arc, Edge, Brave…) that keeps a **visible working set of tabs**.

Send a tab to a named group with one keystroke, close it, and keep the whole list one shortcut away. It is built for tabs you intend to come back to *soon*, not an archive. Stale items are flagged so they don't quietly rot.

## Why

Session managers and read-later tools fail the same way: once a tab is saved it is out of sight, so you never return. Tab Stash fixes that by keeping the list one keystroke away (`Alt+Shift+O`), and by being a *queue* rather than a vault. Long-term storage belongs in a bookmark manager such as Raindrop. Tab Stash is for the tabs you want to deal with this week.

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for how it fits with the other tab tools in use (Tab Manager Plus, Session Buddy, Raindrop.io).

## Features

- **Quick stash (`Alt+Shift+Q`)**: saves the current tab to the Inbox (or your last-used group) and closes it, with no popup. Go through your tabs pressing it to clear them fast.
- **Stash to a chosen group from the toolbar or `Alt+Shift+S`**: pick a group (type to filter, `↑`/`↓` to move, `Enter` to choose) or type a new name and press `Enter` to create it.
- **Three scopes**: this tab, the tabs you multi-selected (`Shift`/`Cmd`-click), or the whole window (pinned tabs are left alone).
- **Name suggestions**: the popup offers group names based on the tabs' titles and sites, and an on-device AI name where the browser supports the Prompt API (Gemini Nano). Nothing is sent over the network.
- **Close tabs after stashing is an option** (off by default; popup checkbox or options page, applies to quick stash too). A window is never emptied: if every tab would close, a fresh tab opens first.
- **The stash page shows your groups** (`Alt+Shift+O`, or the "View stash" button at the top of the popup) as cards, with favicon, title, domain and age for each page.
  - Pages in the stash 14+ days are highlighted as stale.
  - Clicking a tab opens it in a **new tab** and keeps the stash page open (Cmd/Ctrl-click or middle-click opens it in the background).
  - `✓` marks an item done (with Undo), **Open all** / **Open & clear** restore a whole group, and you can rename or delete groups.
  - Drag an item onto another group to move it.
  - **Star tabs** with the ☆ button (shown on hover) to give them a soft gold background so they stand out. Stars are remembered, survive moves between groups and Undo, but are stored in this browser profile only (not synced).
  - **Sort groups** (also in the popup's group list; one shared setting): last modified (default), A–Z, most tabs, oldest tab first (what's going stale), or folder order. "Unsorted" always stays on top.
  - **Collapse groups** with the ▾ arrow to hide the ones you don't need right now. Folded groups are remembered, still count towards the totals, and still accept drops. Filtering shows matches inside folded groups.
  - **Flag tabs** with the checkboxes (or a group's checkbox for the whole group); a bar appears with **Open**, **Move to…** (any group or a new one), **Delete** (with Undo) and **Clear** (`Esc`). Flags are not saved across page loads.
  - Header buttons open Tab Manager Plus and Session Buddy in a tab (they must be installed).
  - Filter box searches titles, URLs and group names.
- **Toolbar badge** shows how many tabs are waiting.
- **No duplicates**: stashing a page that is already stashed moves it to the chosen group.
- **No server, no account, no tracking.** Data lives in your browser's bookmarks (see below).

## Install (unpacked)

1. Open `chrome://extensions` (in Comet: `comet://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Optionally pin the toolbar icon and check the shortcut at `chrome://extensions/shortcuts`.

Reload the extension from the same page after pulling changes.

The extension does not touch your New Tab page. Open the stash page with `Alt+Shift+O`. Shortcuts can be changed at `chrome://extensions/shortcuts`; a clash with another extension just leaves that one unassigned.

## Where your data lives

The stash is a normal bookmarks folder named **Tab Stash** in *Other bookmarks*. Each subfolder is a group and each bookmark is a stashed tab.

- It syncs through your browser account's bookmark sync, if you use it.
- It is searchable from the address bar and any bookmark manager.
- Uninstalling the extension leaves your data intact.
- Bookmarks added directly to the `Tab Stash` folder show up in an **Unsorted** group. Folders nested inside a group are ignored.
- Settings (close-after-stash, quick-stash target, last used group) are kept in `chrome.storage.local`.

New items are appended, so the **oldest item is at the top** of each group.

## Permissions

| Permission | Why |
|---|---|
| `bookmarks` | The stash is stored as bookmarks |
| `tabs` | Read the URL and title of tabs, and close them |
| `storage` | Remember settings and the stash folder id |
| `favicon` | Show site icons on the stash page |

The extension makes no network requests.

## Development

No build step and no dependencies. Requires Node 20+ for the tests and Python 3 for the icons.

```sh
npm test            # unit tests (Node's built-in runner, with a fake chrome.* API)
npm run check       # syntax-check every script
npm run icons       # regenerate icons/ from tools/make-icons.py
```

Layout:

```
manifest.json        MV3 manifest
background.js        service worker: toolbar badge, quick-stash and open-stash commands
lib/util.js          pure helpers (unit tested)
lib/stash.js         bookmarks/tabs/storage logic (unit tested against a fake)
lib/ai.js            optional on-device AI group naming
popup/               toolbar popup
board/               stash page (all groups)
options/             options page
styles/theme.css     shared light/dark theme
tests/               node:test suites + fake chrome API
docs/DESIGN.md       goals, decisions, edge cases
docs/WORKFLOW.md     the owner's tab workflow and companion extensions
```

The popup, stash page and options UI are not covered by automated tests; verify them by loading the extension. See [docs/DESIGN.md](docs/DESIGN.md) for the manual test checklist.

## Limitations

- Drag and drop moves items between groups but does not reorder within a group.
- Only one level of groups.
- Opening a large group at once can use a lot of memory (you get a confirmation above 10 tabs).
- Developed against Chromium's extension APIs; Firefox is not supported.

## License

MIT. See [LICENSE](LICENSE).
