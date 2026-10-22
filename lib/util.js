// Pure helpers. No chrome.* access here so they can be unit tested in Node.

export const ROOT_TITLE = 'Tab Stash';
export const INBOX_TITLE = 'Inbox';
export const UNSORTED_TITLE = 'Unsorted';
export const STALE_DAYS = 14;
export const MAX_GROUP_NAME = 60;

// Companion extensions (see docs/WORKFLOW.md) and the full-page view each one opens in a tab.
export const COMPANION_TOOLS = [
  { name: 'Tab Manager Plus', url: 'chrome-extension://cnkdjjdmfiffagllbiiilooaoofcoeff/popup.html' },
  { name: 'Session Buddy', url: 'chrome-extension://edacconmaakjimmfgnblocblbcdcpbko/main.html' },
];

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

/**
 * Flagged items in board order (group order, then position), each with its group and index so a
 * bulk delete can be undone. Ids that no longer exist are ignored.
 */
export function pickItems(groups, ids) {
  const picked = [];
  for (const group of groups) {
    group.items.forEach((item, index) => {
      if (ids.has(item.id)) picked.push({ item, group, index });
    });
  }
  return picked;
}

export const SORT_MODES = [
  { key: 'modified', label: 'Last modified' },
  { key: 'alpha', label: 'A–Z' },
  { key: 'size', label: 'Most tabs' },
  { key: 'oldest', label: 'Oldest tab first' },
  { key: 'manual', label: 'Folder order' },
];
export const DEFAULT_SORT = 'modified';

/**
 * Returns a sorted copy of the groups. Needs per-group `title`, `modified` (ms), `oldest` (ms of
 * the oldest item, if any), `order` (position in the folder) and `count` or `items`.
 * The "Unsorted" pseudo-group (isRoot) always stays first: it is a to-do for sorting.
 * Ties fall back to the title so the order is stable.
 */
export function sortGroups(groups, mode = DEFAULT_SORT) {
  const size = (g) => g.count ?? g.items?.length ?? 0;
  const by = {
    modified: (a, b) => (b.modified ?? 0) - (a.modified ?? 0),
    alpha: () => 0,
    size: (a, b) => size(b) - size(a),
    oldest: (a, b) => (a.oldest ?? Infinity) - (b.oldest ?? Infinity),
    manual: (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity),
  };
  const compare = by[mode] ?? by[DEFAULT_SORT];
  const cmp = (a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    const diff = compare(a, b);
    if (diff && Number.isFinite(diff)) return diff;
    if (diff === -Infinity || diff === Infinity) return diff < 0 ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  };
  return [...groups].sort(cmp);
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

// ---------- group name suggestions ----------

const STOPWORDS = new Set(
  ('about after again also because been before being best between both could does from have here how into just like more most '
    + 'much only other over some such than that their them then there these they this those through very want what when where which '
    + 'while will with would your the and for are not you all can has how new official home page login sign free online').split(' '),
);
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);

/** "docs.github.com" -> "Github", "bbc.co.uk" -> "Bbc". */
export function siteLabel(url) {
  const labels = domainOf(url).split('.');
  if (labels.length < 2) return '';
  const i = labels.length >= 3 && SECOND_LEVEL.has(labels.at(-2)) ? labels.length - 3 : labels.length - 2;
  const label = labels[i];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function titleWords(title) {
  return new Set(
    String(title ?? '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)),
  );
}

/**
 * Offline guesses at a group name for a set of tabs: words shared by several titles
 * ("Flights Paris") and the site when most tabs come from one place ("Github").
 * Returns up to 3 names, best first. Works without any AI.
 */
export function suggestGroupNames(tabs) {
  const pages = tabs.filter((t) => isStashable(t.url));
  if (!pages.length) return [];
  const out = [];

  if (pages.length > 1) {
    const counts = new Map();
    for (const page of pages) {
      for (const word of titleWords(page.title)) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    const shared = [...counts]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 2)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
    if (shared.length) out.push(shared.join(' '));
  }

  const sites = new Map();
  for (const page of pages) {
    const label = siteLabel(page.url);
    if (label) sites.set(label, (sites.get(label) ?? 0) + 1);
  }
  const [top, n] = [...sites].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (top && n / pages.length >= 0.6) out.push(top);

  return [...new Set(out.map(cleanGroupName).filter(Boolean))].slice(0, 3);
}
