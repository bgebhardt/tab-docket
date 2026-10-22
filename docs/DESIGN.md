# Tab Stash: Design

Status: v0.2, implemented and unit tested, UI not yet exercised in a browser.

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

### 2. A one-keystroke stash page instead of a New Tab override

The premise is that the list must be easy to see. v0.1 overrode the New Tab page, but in Comet the New Tab is the Perplexity box and that is staying. So the list is a regular extension page (`board/board.html`) opened with `Alt+Shift+O` or the popup's "View stash" link; an existing stash tab is focused rather than duplicated. Trade-off: it has to be opened deliberately, so the habit matters (see WORKFLOW). Pinning that tab is a cheap way to keep it in sight. A side panel was considered but Comet already uses its side panel for the assistant.

### 3. Queue ordering and staleness

New items are appended so the **oldest is on top**. Each item shows its age, and items older than 14 days (`STALE_DAYS`) get an amber chip and are counted in the header. The age uses the bookmark's `dateAdded`, so no extra metadata is stored.

### 4. Typing is the primary interaction

The popup puts focus in a text field that filters groups. `Enter` picks the highlighted row, and if the typed name matches nothing, a "Create" row appears, so the same keystroke flow covers both choosing and creating. Groups are sorted by the shared sort setting. The default, last modified, puts the group you just stashed into at the top, so repeated stashing to one group is still a two-key action; with other sorts the last-used group is no longer pinned first.

### 5. Duplicates move rather than copy

A URL appears at most once in the stash. Stashing an already-stashed page moves it into the chosen group. Rationale: duplicates inflate the "work remaining" number and the user's intent is clearly "this belongs in X now".

### 6. Quick stash

`Alt+Shift+Q` runs in the service worker with no UI: it stashes the active tab to the Inbox (or the last-used group, per option) and closes it if `closeAfter` is on. Invocations are serialized so rapid presses cannot create two Inbox folders. An unstashable page flashes a red `!` on the badge instead of failing silently.

### 7. Group name suggestions

Offline first: `suggestGroupNames` (pure, in `util.js`) proposes words shared by 2+ titles and the dominant site. On top of that `lib/ai.js` asks the browser's built-in Prompt API (on-device model) for a 1–3 word name, only if the model is already downloaded (it never triggers a download) and with an 8 s timeout. Suggestions are chips that fill the name box; nothing is created until the user presses Enter. A cloud LLM (e.g. the Claude API) would give better names but needs an API key and network access, which conflicts with the "no network requests" constraint, so it is not used.

### 8. Plain MV3, no build step

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
- The stash page and badge subscribe to bookmark events, so changes from any source (popup, another window, the bookmark manager, sync) show up live. Event bursts are debounced (100–150 ms).

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

Settings in `chrome.storage.local`: `closeAfter` (default `false`), `quickTarget` (`inbox` | `last`, default `inbox`), `groupSort` (`modified` | `alpha` | `size` | `oldest` | `manual`, default `modified`; "modified" uses the folder's `dateGroupModified`), `starred` (bookmark ids of starred items; pruned when an item disappears, carried over to the new id on Undo; per profile, not synced), `collapsed` (ids of folded groups; pruned of deleted groups on load), `lastGroupId`, `rootId`.

## Flows

**Stash**: popup loads the tabs in the current window and the groups. The default scope is *Selected* if more than one tab is highlighted, else *This tab*. On choose: create the group if new, `stashTabs` (create or move bookmarks), remember the group, close the tabs that are now safely stored (if enabled), show a summary, close the popup.

**Quick stash**: command fires in the service worker, takes the active tab of the focused window, resolves the target group, `stashTabs`, then `closeTabs` if enabled.

**Flag & bulk act**: checkboxes keep a set of flagged item ids in memory only (they are never written to bookmarks, so they reset on reload and are pruned when an item disappears). `pickItems` resolves them to items in board order, which keeps Undo's restore indexes ascending.

**Revisit**: the stash page shows the cards. Click an item to open it in that tab; `✓` removes it (Undo for 6 s); **Open & clear** opens a group and empties it.

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

Not automated: popup, stash page, options and the command handlers. Manual checklist after changes:

1. Load unpacked; press `Alt+Shift+O`: the stash page opens with the empty state. Press it again: the same tab is focused. A new tab still shows Comet's own page.
2. On a normal page press `Alt+Shift+S`, type a name, `Enter`. Tab closes, badge shows 1, new tab shows the card.
3. Quick stash: on a normal page press `Alt+Shift+Q`. The tab closes, the badge count goes up and an `Inbox` group exists. Press it on `chrome://settings`: red `!` flash, tab stays. Toggle *Close tabs after stashing* off in options: the tab stays open.
3a. Stash the same page again to a different group: it moves rather than duplicates.
4. Select three tabs (`Shift`-click) and stash: scope defaults to *Selected (3)*.
5. Stash *Window* with pinned tabs: pins stay.
6. Stash the only tab in a window: window stays open on a new tab.
7. `chrome://settings` shows "can't be stashed" and is not closed.
8. Stash page: `✓` plus Undo, drag between groups, rename, delete, Open & clear, filter box.
9. Edit the `Tab Stash` folder in the bookmark manager: the stash page updates live.
10a. Select 3 tabs about one topic and open the popup: name chips appear; clicking one fills the box. If the browser has Gemini Nano a `✨` chip appears after a moment.
10c. Change the sort in the stash page and in the popup: both lists reorder and the choice sticks (it is the same setting). Stash a tab to a group: with *Last modified* that group moves to the top.
10d. Star two items: gold background, ★ stays visible; ☆ appears on hover for the rest. Move a starred item to another group, and delete + Undo one: both keep the star. Check both OS themes.
10a. Collapse a group with ▾, reload the page: it stays collapsed. Type in the filter: matches inside it appear. Collapsing a group unflags its tabs.
10b. Flag two items in different groups and a whole group via its header checkbox: the bar shows the count. Open opens them, Move to… relocates them (also to a new group), Delete removes them and Undo restores them in place, Esc clears flags.
10. Toggle dark mode in the OS: both pages follow.

## Risks and open questions

- **Comet compatibility** has not been confirmed. The `_favicon` endpoint and `commands` should behave as in Chromium, but verify. The Prompt API (`LanguageModel`) may not exist in Comet; the heuristic chips cover that.
- **Bookmarks sync noise**: stash churn appears in bookmark sync and in "Recently added" bookmark views.
- **Keyboard shortcuts** (`Alt+Shift+S`, `Q`, `O`) may collide with another extension; rebind at `chrome://extensions/shortcuts`.

## Future ideas

- Reorder within a group (drag; note `bookmarks.move` index quirks when moving down in the same folder).
- Weekly notification when items go stale.
- Context-menu "Stash this tab to ▸ group".
- Per-group staleness threshold and a "snooze" action.
- Export a group as Markdown.
