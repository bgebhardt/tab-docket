# Tab Stash

A browser extension for Chromium browsers (Chrome, Comet, Arc, Edge, Brave…) that keeps a **visible working set of tabs**.

Send a tab to a named group with one keystroke, close it, and see the whole list every time you open a new tab. It is built for tabs you intend to come back to *soon*, not an archive. Stale items are flagged so they don't quietly rot.

## Why

Session managers and read-later tools fail the same way: once a tab is saved it is out of sight, so you never return. Tab Stash fixes that by replacing your New Tab page with the list, and by being a *queue* rather than a vault. Long-term storage belongs in a bookmark manager such as Raindrop. Tab Stash is for the tabs you want to deal with this week.

## Features

- **Stash from the toolbar or `Alt+Shift+S`**: pick a group (type to filter, `↑`/`↓` to move, `Enter` to choose) or type a new name and press `Enter` to create it.
- **Three scopes**: this tab, the tabs you multi-selected (`Shift`/`Cmd`-click), or the whole window (pinned tabs are left alone).
- **Optionally close tabs after stashing** (on by default). A window is never emptied: if every tab would close, a fresh tab opens first.
- **New Tab page shows your groups** as cards, with favicon, title, domain and age for each page.
  - Pages in the stash 14+ days are highlighted as stale.
  - `✓` marks an item done (with Undo), **Open all** / **Open & clear** restore a whole group, and you can rename or delete groups.
  - Drag an item onto another group to move it.
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

> Replacing the New Tab page means only one extension can own it. If another extension (or Comet's own page) already does, the browser may ask which to keep.

## Where your data lives

The stash is a normal bookmarks folder named **Tab Stash** in *Other bookmarks*. Each subfolder is a group and each bookmark is a stashed tab.

- It syncs through your browser account's bookmark sync, if you use it.
- It is searchable from the address bar and any bookmark manager.
- Uninstalling the extension leaves your data intact.
- Bookmarks added directly to the `Tab Stash` folder show up in an **Unsorted** group. Folders nested inside a group are ignored.
- Settings (close-after-stash, last used group) are kept in `chrome.storage.local`.

New items are appended, so the **oldest item is at the top** of each group.

## Permissions

| Permission | Why |
|---|---|
| `bookmarks` | The stash is stored as bookmarks |
| `tabs` | Read the URL and title of tabs, and close them |
| `storage` | Remember settings and the stash folder id |
| `favicon` | Show site icons on the New Tab page |

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
background.js        service worker: toolbar badge
lib/util.js          pure helpers (unit tested)
lib/stash.js         bookmarks/tabs/storage logic (unit tested against a fake)
popup/               toolbar popup
newtab/              New Tab override
styles/theme.css     shared light/dark theme
tests/               node:test suites + fake chrome API
docs/DESIGN.md       goals, decisions, edge cases
```

The popup and New Tab UI are not covered by automated tests; verify them by loading the extension. See [docs/DESIGN.md](docs/DESIGN.md) for the manual test checklist.

## Limitations

- Drag and drop moves items between groups but does not reorder within a group.
- Only one level of groups.
- Opening a large group at once can use a lot of memory (you get a confirmation above 10 tabs).
- Developed against Chromium's extension APIs; Firefox is not supported.

## License

MIT. See [LICENSE](LICENSE).
