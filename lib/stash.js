// Everything that touches chrome.bookmarks / chrome.tabs / chrome.storage.
// The stash is an ordinary bookmarks folder ("Tab Stash") whose subfolders are groups.

import {
  ROOT_TITLE,
  UNSORTED_TITLE,
  cleanGroupName,
  isStashable,
  normalizeUrl,
} from './util.js';

const DEFAULT_SETTINGS = { closeAfter: true, lastGroupId: null };

let rootCreation = null;

// ---------- settings ----------

export async function getSettings() {
  const stored = await chrome.storage.local.get(['closeAfter', 'lastGroupId']);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}

// ---------- root folder ----------

async function cachedRootId() {
  const { rootId } = await chrome.storage.local.get('rootId');
  if (!rootId) return null;
  try {
    const [node] = await chrome.bookmarks.get(rootId);
    return node && !node.url ? node.id : null;
  } catch {
    return null; // folder was deleted
  }
}

async function remember(rootId) {
  await chrome.storage.local.set({ rootId });
  return rootId;
}

/**
 * Id of the "Tab Stash" folder. The id is cached, but the folder is re-found by title if the
 * cache is stale (deleted folder, or bookmarks synced from another machine with different ids).
 * With { create: false } returns null instead of creating the folder.
 */
export async function getRootId({ create = true } = {}) {
  const cached = await cachedRootId();
  if (cached) return cached;

  const matches = await chrome.bookmarks.search({ title: ROOT_TITLE });
  const folder = matches.find((n) => !n.url && n.title === ROOT_TITLE);
  if (folder) return remember(folder.id);

  if (!create) return null;
  // Share one in-flight creation so concurrent callers in the same context can't make two folders.
  rootCreation ??= chrome.bookmarks
    .create({ title: ROOT_TITLE }) // no parent: lands in "Other bookmarks"
    .then((n) => remember(n.id))
    .finally(() => {
      rootCreation = null;
    });
  return rootCreation;
}

// ---------- reading ----------

function toItem(node) {
  return {
    id: node.id,
    parentId: node.parentId,
    title: node.title || node.url,
    url: node.url,
    dateAdded: node.dateAdded,
  };
}

/**
 * Returns { rootId, groups }. Each group is { id, title, isRoot, items }.
 * Bookmarks sitting directly in the root folder are surfaced as a pseudo-group "Unsorted"
 * (its id is the root id, so moving items into it just works). Folders nested inside a
 * group are ignored.
 */
export async function getGroups() {
  const rootId = await getRootId({ create: false });
  if (!rootId) return { rootId: null, groups: [] };

  const [root] = await chrome.bookmarks.getSubTree(rootId);
  const children = root.children ?? [];
  const groups = children
    .filter((n) => !n.url)
    .map((folder) => ({
      id: folder.id,
      title: folder.title,
      isRoot: false,
      items: (folder.children ?? []).filter((n) => n.url).map(toItem),
    }));

  const loose = children.filter((n) => n.url).map(toItem);
  if (loose.length) groups.unshift({ id: rootId, title: UNSORTED_TITLE, isRoot: true, items: loose });
  return { rootId, groups };
}

// ---------- writing ----------

/** Returns the existing group with this name (case-insensitive) or creates it. */
export async function createGroup(name) {
  const title = cleanGroupName(name);
  if (!title) throw new Error('Group name is empty');

  const rootId = await getRootId();
  const siblings = await chrome.bookmarks.getChildren(rootId);
  const existing = siblings.find((n) => !n.url && n.title.toLowerCase() === title.toLowerCase());
  if (existing) return { id: existing.id, title: existing.title };

  const folder = await chrome.bookmarks.create({ parentId: rootId, title });
  return { id: folder.id, title: folder.title };
}

export async function renameGroup(groupId, name) {
  const title = cleanGroupName(name);
  if (!title) throw new Error('Group name is empty');
  await chrome.bookmarks.update(groupId, { title });
}

export async function deleteGroup(groupId) {
  await chrome.bookmarks.removeTree(groupId);
}

export async function removeItem(itemId) {
  await chrome.bookmarks.remove(itemId);
}

/** Re-creates a removed item where it was (used by Undo). */
export async function restoreItem({ parentId, index, title, url }) {
  try {
    await chrome.bookmarks.get(parentId); // group may have been deleted meanwhile
  } catch {
    parentId = await getRootId();
    index = undefined;
  }
  return chrome.bookmarks.create({ parentId, index, title, url });
}

export async function moveItem(itemId, groupId) {
  await chrome.bookmarks.move(itemId, { parentId: groupId });
}

/**
 * Saves tabs into a group. A page already in the stash is moved to the target group instead of
 * duplicated. New items are appended, so the oldest item stays at the top of each group.
 * Returns counts plus `done`: the tabs whose page is now in the target group (safe to close).
 */
export async function stashTabs(tabs, groupId) {
  const { groups } = await getGroups();
  const known = new Map();
  for (const group of groups) {
    for (const item of group.items) known.set(normalizeUrl(item.url), item);
  }

  const result = { saved: 0, moved: 0, already: 0, skipped: 0, done: [] };
  for (const tab of tabs) {
    if (!isStashable(tab.url)) {
      result.skipped++;
      continue;
    }
    const key = normalizeUrl(tab.url);
    const existing = known.get(key);
    if (!existing) {
      const node = await chrome.bookmarks.create({
        parentId: groupId,
        title: tab.title || tab.url,
        url: tab.url,
      });
      known.set(key, toItem(node));
      result.saved++;
    } else if (existing.parentId !== groupId) {
      await chrome.bookmarks.move(existing.id, { parentId: groupId });
      existing.parentId = groupId;
      result.moved++;
    } else {
      result.already++;
    }
    result.done.push(tab);
  }
  return result;
}

// ---------- tabs ----------

/**
 * Closes tabs, but never empties a window: if every tab in a window is being closed, a fresh
 * tab (which shows the stash) is opened first so the window survives.
 */
export async function closeTabs(tabs) {
  const byWindow = new Map();
  for (const tab of tabs) {
    if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, new Set());
    byWindow.get(tab.windowId).add(tab.id);
  }
  for (const [windowId, closing] of byWindow) {
    const all = await chrome.tabs.query({ windowId });
    if (all.every((t) => closing.has(t.id))) await chrome.tabs.create({ windowId });
  }
  await chrome.tabs.remove(tabs.map((t) => t.id));
}

/** Opens every item of a group in new background tabs. */
export async function openItems(items) {
  for (const [i, item] of items.entries()) {
    await chrome.tabs.create({ url: item.url, active: i === 0 });
  }
}
