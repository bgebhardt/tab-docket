// Pure helpers. No chrome.* access here so they can be unit tested in Node.

export const ROOT_TITLE = 'Tab Stash';
export const INBOX_TITLE = 'Inbox';
export const UNSORTED_TITLE = 'Unsorted';
export const STALE_DAYS = 14;
export const MAX_GROUP_NAME = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const STASHABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'ftp:']);

/** Only real pages can be stashed; browser-internal pages (new tab, settings) are skipped. */
export function isStashable(url) {
  if (!url) return false;
  try {
    return STASHABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Canonical form used to detect duplicates. */
export function normalizeUrl(url) {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Trim, collapse whitespace and cap length. Returns '' when the name is unusable. */
export function cleanGroupName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_GROUP_NAME);
}

export function ageDays(dateAdded, now = Date.now()) {
  return Math.max(0, Math.floor((now - dateAdded) / DAY_MS));
}

export function ageLabel(dateAdded, now = Date.now()) {
  const d = ageDays(dateAdded, now);
  if (d < 1) return 'today';
  if (d < 7) return `${d}d`;
  if (d < 60) return `${Math.floor(d / 7)}w`;
  return `${Math.floor(d / 30)}mo`;
}

export function isStale(dateAdded, now = Date.now(), days = STALE_DAYS) {
  return ageDays(dateAdded, now) >= days;
}

/** Case-insensitive substring filter on group titles. Empty query returns everything. */
export function filterGroups(groups, query) {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter((g) => g.title.toLowerCase().includes(q));
}

export function hasGroupNamed(groups, name) {
  const n = name.trim().toLowerCase();
  return groups.some((g) => g.title.toLowerCase() === n);
}

/** Total number of bookmarked pages anywhere under a bookmark tree node. */
export function countItems(node) {
  if (!node) return 0;
  if (node.url) return 1;
  return (node.children ?? []).reduce((sum, child) => sum + countItems(child), 0);
}

export function badgeText(count) {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}
