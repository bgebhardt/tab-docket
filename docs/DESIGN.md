# Tab Stash: Design

Status: v0.1, implemented and unit tested, UI not yet exercised in a browser.

## Problem

Too many open tabs push memory pressure up (Comet alone was using 6–13 GB). Existing tools do not help with the tabs that still matter:

- **Tab sleeping/discarding** reduces memory but leaves the tab open and cluttering the strip.
- **Session managers** (Session Buddy) save whole sets of tabs. They are good for stashing, but a saved session is out of sight, so it is never reopened.
- **Read-later and bookmark managers** (Reading List, Raindrop, Toby) are either flat, hidden, or capped on the free tier. Raindrop is used for long-term storage, and the same out-of-sight problem applies to it.

What is missing is a **working set**: tabs I want to get to soon, grouped by topic, kept in front of me.

## Goals

1. Send one tab (or several) to a named group in about one keystroke plus a name.
2. Make the list unavoidable: show it on every new tab.
3. Keep it a queue, not a vault: surface age so stale items get done or dropped.
4. Free, local, no account, no caps.
5. Never lose data and never lock it in.

## Non-goals

- Long-term archiving (use Raindrop or bookmarks).
- Session restore (use Session Buddy).
- Tab sleeping or memory management (use Auto Tab Discard or browser settings).
- Cross-browser support beyond Chromium.
- A cloud backend or sharing.

## Key decisions

### 1. Store data as bookmarks

The stash is a bookmarks folder `Tab Stash` with one subfolder per group.

| Alternative | Why not |
|---|---|
| `chrome.storage.local` | Data would be tied to the extension: lost on uninstall, invisible to other tools, no sync. |
| `chrome.storage.sync` | 100 KB quota (about 8 KB per item); a stash of dozens of tabs would hit limits. |
| Own IndexedDB | Same lock-in as `storage.local`, plus I'd write a sync story. |

Bookmarks give sync, search, an unlimited quota, and survive extension removal for free. The cost is that users can edit the data from outside the extension, so the code must tolerate that (see Edge cases).

### 2. New Tab override as the visibility mechanism

The whole premise is that the list must be seen without effort. A popup, side panel or dashboard has to be opened deliberately, which is exactly the habit that failed with session managers. The cost: it takes over the New Tab page, which only one extension can own.

### 3. Queue ordering and staleness

New items are appended so the **oldest is on top**. Each item shows its age, and items older than 14 days (`STALE_DAYS`) get an amber chip and are counted in the header. The age uses the bookmark's `dateAdded`, so no extra metadata is stored.

### 4. Typing is the primary interaction

The popup puts focus in a text field that filters groups. `Enter` picks the highlighted row, and if the typed name matches nothing, a "Create" row appears, so the same keystroke flow covers both choosing and creating. The most recently used group is listed first, which makes repeated stashing to one group a two-key action.

### 5. Duplicates move rather than copy

A URL appears at most once in the stash. Stashing an already-stashed page moves it into the chosen group. Rationale: duplicates inflate the "work remaining" number and the user's intent is clearly "this belongs in X now".

### 6. Plain MV3, no build step

The code is ES modules loaded directly by the browser; there is nothing to compile, so loading the folder unpacked is the entire install. DOM is built with `createElement`/`textContent` (never `innerHTML`) so page titles cannot inject markup, in addition to the MV3 default CSP.

## Architecture

```
            ┌───────────────┐   chrome.bookmarks events   ┌──────────────┐
 toolbar ──▶│ popup/        │                             │ background.js│──▶ badge count
 Alt+Shift+S│ popup.js      │──┐                          └──────────────┘
            └───────────────┘  │ lib/stash.js ──▶ chrome.bookmarks ("Tab Stash" folder)
            ┌───────────────┐  │      ▲            chrome.tabs, chrome.storage.local
 new tab ──▶│ newtab/       │──┘      │
            │ newtab.js     │◀────────┘ re-render on bookmark events
            └───────────────┘
                 both import lib/util.js (pure helpers)
```

- `lib/util.js` has no browser dependencies and is unit tested directly.
- `lib/stash.js` owns every chrome API call except the badge and UI-only calls. It is tested against `tests/fake-chrome.js`, an in-memory bookmarks/tabs/storage implementation.
- The New Tab page and badge subscribe to bookmark events, so changes from any source (popup, another window, the bookmark manager, sync) show up live. Event bursts are debounced (100–150 ms).

## Data model

```
Other bookmarks/
└── Tab Stash/            ← root (id cached in storage.local; re-found by title if stale)
    ├── Inbox/            ← group
    │   ├── <bookmark>    ← stashed tab (title, url, dateAdded)
    │   └── …
    ├── Taxes/
    └── <bookmark>        ← loose item → shown as the pseudo-group "Unsorted"
```

Settings in `chrome.storage.local`: `closeAfter` (default `true`), `lastGroupId`, `rootId`.

## Flows

**Stash**: popup loads the tabs in the current window and the groups. The default scope is *Selected* if more than one tab is highlighted, else *This tab*. On choose: create the group if new, `stashTabs` (create or move bookmarks), remember the group, close the tabs that are now safely stored (if enabled), show a summary, close the popup.

**Revisit**: new tab shows the cards. Click an item to open it in that tab; `✓` removes it (Undo for 6 s); **Open & clear** opens a group and empties it.

## Edge cases

| Case | Behavior |
|---|---|
| Internal pages (`chrome://`, new tab, extension pages) | Not stashable; skipped and counted in the summary; never closed |
| Closing every tab in a window | A fresh tab opens first so the window survives |
| Stash folder deleted by the user | Cached id fails `bookmarks.get`; folder is recreated on next stash, reads return an empty state |
| Folder id differs on another synced machine | Re-found by title |
| Two contexts create the root simultaneously | In-context dedupe via a shared promise. A cross-context race (popup and service worker) is possible only on first run; the service worker only reads (`create: false`), so in practice it cannot happen |
| Bookmarks added by hand to the root | Shown as "Unsorted" |
| Folders nested inside a group | Ignored |
| Group deleted while an Undo is pending | Item is restored into the root (Unsorted) |
| Group name empty or over 60 chars | Rejected / truncated |
| Opening a large group | Confirmation above 10 tabs (memory) |
| Stashing a URL already in the stash | Moved, not duplicated; if already in that group it is a no-op and the tab still closes |

## Testing

Automated (`npm test`): all of `lib/util.js` and `lib/stash.js` against the fake chrome API: root creation and recovery, group idempotency, stash/dedupe/move, skip rules, Unsorted, delete/restore, window-preserving close.

Not automated: popup and New Tab UI. Manual checklist after changes:

1. Load unpacked; open a new tab, which shows the empty state.
2. On a normal page press `Alt+Shift+S`, type a name, `Enter`. Tab closes, badge shows 1, new tab shows the card.
3. Stash the same page again to a different group: it moves rather than duplicates.
4. Select three tabs (`Shift`-click) and stash: scope defaults to *Selected (3)*.
5. Stash *Window* with pinned tabs: pins stay.
6. Stash the only tab in a window: window stays open on a new tab.
7. `chrome://settings` shows "can't be stashed" and is not closed.
8. New Tab page: `✓` plus Undo, drag between groups, rename, delete, Open & clear, filter box.
9. Edit the `Tab Stash` folder in the bookmark manager: New Tab updates live.
10. Toggle dark mode in the OS: both pages follow.

## Risks and open questions

- **Comet compatibility** has not been confirmed. The `_favicon` endpoint, the New Tab override and `commands` should behave as in Chromium, but verify. If `chrome_url_overrides` is blocked, the popup still works.
- **Bookmarks sync noise**: stash churn appears in bookmark sync and in "Recently added" bookmark views.
- **Keyboard shortcut** `Alt+Shift+S` may collide with another extension; rebind at `chrome://extensions/shortcuts`.

## Future ideas

- Reorder within a group (drag; note `bookmarks.move` index quirks when moving down in the same folder).
- Weekly notification when items go stale.
- Context-menu "Stash this tab to ▸ group".
- Per-group staleness threshold and a "snooze" action.
- Export a group as Markdown.
