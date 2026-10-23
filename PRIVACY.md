# Privacy

Tab Docket is written by Bryan Gebhardt and runs entirely inside your browser.

- **No data is collected, sent or sold.** The extension makes no network requests and has no analytics, accounts or servers.
- **Where your data lives.** Stashed tabs are ordinary bookmarks in a folder named **Tab Docket** (*Other bookmarks*). If you use your browser's bookmark sync, the browser syncs that folder like any other. Settings (close-after-stash, sort order, collapsed groups, starred tabs) are kept in the extension's local browser storage.
- **Group name suggestions.** Suggestions are computed on your device from the open tabs' titles and addresses. If your browser has a built-in on-device AI model (Prompt API), it may be used locally for a smarter suggestion; nothing is sent anywhere by this extension.
- **Permissions and why.**
  - `bookmarks`: store and read the stash folder.
  - `tabs`: read the title and address of the tabs you choose to stash, close them if you enabled that, and open stashed pages.
  - `storage`: remember settings.
  - `favicon`: show site icons next to stashed pages.
- **Removing your data.** Uninstalling leaves the bookmarks folder in place (delete it from your bookmark manager if you want it gone).
- **Links.** The About page links to GitHub (source, license, issues). Following a link is your choice and is handled by your browser.

If this policy changes it will be noted in [CHANGELOG.md](CHANGELOG.md).

Questions: open an issue at https://github.com/bgebhardt/tab-docket/issues.
