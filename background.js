// Service worker. Its only job is the toolbar badge: how many tabs are waiting in the stash.
// Event listeners must be registered at the top level so they survive service-worker restarts.

import { badgeText, countItems } from './lib/util.js';
import { getRootId } from './lib/stash.js';

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
    console.warn('Tab Stash: badge update failed', err);
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
