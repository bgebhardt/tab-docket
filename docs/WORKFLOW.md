# Tab workflow

How Tab Stash fits alongside the other browser tools in use. Each tool has one job, and the point of Tab Stash is to fill the one gap none of them covers.

Browser: **Comet** (Chromium-based, so Chrome Web Store extensions install normally).

## The layers

| Layer | Question it answers | Tool | Lifetime |
|---|---|---|---|
| Open now | "Where did that tab go?" | Tab Manager Plus | Minutes to days |
| **Working set** | "What do I still need to get to?" | **Tab Stash** (this repo) | Days to a couple of weeks |
| Whole-session stash | "Put all of this away, I'll want it back as a set" | Session Buddy | Until the project resumes |
| Long-term reference | "I want to keep this" | Raindrop.io | Indefinite |
| Memory | "Stop idle tabs eating RAM" | Auto Tab Discard (recommended, see below) | Automatic |

## Extensions in use

### Tab Manager Plus for Chrome
[Chrome Web Store](https://chrome.google.com/webstore/detail/tab-manager-plus-for-chro/cnkdjjdmfiffagllbiiilooaoofcoeff)

Used mainly to **find open tabs quickly**: type to search across every window, jump to a tab, close or move several at once. It has basic sessions, but they are not the main use. Tab Stash does not replace it, because Tab Stash only deals with tabs that have been parked.

### Session Buddy
[Chrome Web Store](https://chrome.google.com/webstore/detail/sessionbuddy/edacconmaakjimmfgnblocblbcdcpbko)

Used to **stash and reopen complete sets of tabs**, and as a safety net (it auto-saves and recovers closed windows or crashes). It works on whole sessions, not single tabs, so it cannot do "send this one tab to a list". Saved sessions are out of sight, which is why they rarely get reopened.

### Raindrop.io
[Chrome Web Store](https://chromewebstore.google.com/detail/ldgfbffkinooeloadekpmfoklnobpien)

Used for **tabs worth keeping long term**: reference material, things to read eventually, anything that should outlive the current week. Same out-of-sight problem as Session Buddy, which is acceptable for an archive and is the reason Tab Stash exists for the short term.

### Auto Tab Discard (recommended, not yet confirmed installed)
[Chrome Web Store: Auto Tab Discard (suspend)](https://chromewebstore.google.com/detail/jhnleheckmknfcgijgkadoemagpecfol)

Discards tabs after a configurable idle time and lets you whitelist hosts, so memory is freed without closing anything. Several similarly named extensions exist; the link above is the "Auto Tab Discard (suspend)" listing with about 100,000 users. Comet's own settings may also have a memory-saver option. Check there first.

## Where Tab Stash fits

The gap: no tool kept a **single tab, in a named group, visible every time a new tab opens**. Tab Stash covers it:

- `Alt+Shift+S` sends the current tab (or selected tabs, or the window) to a group and closes it.
- The New Tab page shows every group, with age and stale highlighting.
- It is a queue: items are meant to be done or dropped, not kept forever.

## Deciding where a tab goes

```
Need it soon / in progress?
├─ yes ─▶ Tab Stash group (by topic)
└─ no
   ├─ Want to keep it for good? ─▶ Raindrop.io
   ├─ Whole set of tabs for a project to resume later? ─▶ Session Buddy
   └─ Done with it ─▶ close it (Session Buddy will have a copy if needed)
```

When a Tab Stash item goes stale (14+ days), promote it to Raindrop if it is worth keeping, or drop it.

## Memory habits (Comet)

These came out of a memory-pressure investigation in October 2026, when Comet alone used 6 to 13 GB, swap was nearly full and the Mac was slow.

- **Check Comet's Task Manager** (Window menu) and end the heaviest tabs and extensions. A few tabs usually account for most of the memory.
- **Relaunching Comet restores every tab**, and with all of them loaded it used about twice the memory of the previous run (13 GB vs 6 GB). Enable tab discarding or limit restore-on-launch, and stash tabs before quitting.
- **Restart the Mac** after a bad session; swap is only fully released by a reboot.
- Other big consumers seen: Claude.app, Obsidian, Discord, Beeper and Finder. Quit what is not in use.
- Around 30 login items were configured; trimming unused ones reduces baseline memory.

## Suggested habits

These are suggestions, not established routines:

- Stash instead of leaving tabs open "just in case".
- Skim the New Tab page each morning, and clear one stale item a day.
- Keep the number of groups small (5 to 8) so the page stays readable.

## Changing this document

Update it when tools are added or dropped, and mark anything unconfirmed as such.
