// Service worker: the toolbar badge (how many tabs are waiting in the stash) and the keyboard
// commands that work without a popup.
// Event listeners must be registered at the top level so they survive service-worker restarts.

import { badgeText, countItems } from './lib/util.js';
import { getRootId, openBoard, quickStash } from './lib/stash.js';

let timer = null;

async function updateBadge() {
  try {
    const rootId = await getRootId({ create: false });
    let count = 0;
    if (rootId) {
      const [root] = await chrome.bookmarks.getSubTree(rootId);
      count = countItems(root);
    }
    await chrome.action.setBadgeText({ text: badgeText(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
  } catch (err) {
    console.warn('Tab Docket: badge update failed', err);
  }
}

// Bookmark imports and bulk edits fire many events; coalesce them into one update.
function scheduleBadgeUpdate() {
  clearTimeout(timer);
  timer = setTimeout(updateBadge, 150);
}

chrome.runtime.onInstalled.addListener(scheduleBadgeUpdate);
chrome.runtime.onStartup.addListener(scheduleBadgeUpdate);
chrome.bookmarks.onCreated.addListener(scheduleBadgeUpdate);
chrome.bookmarks.onRemoved.addListener(scheduleBadgeUpdate);
chrome.bookmarks.onMoved.addListener(scheduleBadgeUpdate);
chrome.bookmarks.onChanged.addListener(scheduleBadgeUpdate);
chrome.bookmarks.onImportEnded.addListener(scheduleBadgeUpdate);

// ---------- commands ----------

async function flashBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(updateBadge, 1500);
}

// Run quick stashes one at a time: pressing the shortcut rapidly must not race the Inbox creation.
let quickQueue = Promise.resolve();

async function runQuickStash() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return;
    const result = await quickStash(tab);
    if (!result.done.length) await flashBadge('!', '#dc2626'); // internal page, nothing stashed
  } catch (err) {
    console.error('Tab Docket: quick stash failed', err);
    await flashBadge('ERR', '#dc2626');
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-stash') quickQueue = quickQueue.then(runQuickStash);
  else if (command === 'open-board') openBoard().catch((err) => console.error(err));
});
