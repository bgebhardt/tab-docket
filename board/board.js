import {
  createGroup,
  deleteGroup,
  getGroups,
  getSettings,
  moveItem,
  openItems,
  openOrFocus,
  removeItem,
  renameGroup,
  restoreItem,
  setSettings,
} from '../lib/stash.js';
import { COMPANION_TOOLS, SORT_MODES, STALE_DAYS, ageLabel, domainOf, isStale, pickItems, sortGroups } from '../lib/util.js';

const $ = (selector) => document.querySelector(selector);
const OPEN_CONFIRM_THRESHOLD = 10;

let groups = [];
let query = '';
let draggingId = null;
let toastTimer = null;
let undo = null;
let sortMode = 'modified';
const collapsedIds = new Set(); // folded groups, saved in settings.collapsed
const starredIds = new Set(); // starred items, saved in settings.starred
const flagged = new Set(); // ids of flagged items (in memory only)

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick, title) {
  const node = el('button', className, label);
  if (title) node.title = title;
  node.addEventListener('click', onClick);
  return node;
}

// ---------- data ----------

async function load() {
  ({ groups } = await getGroups());
  groups = sortGroups(groups, sortMode);
  const existing = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
  for (const id of flagged) if (!existing.has(id)) flagged.delete(id);
  const before = starredIds.size;
  for (const id of starredIds) if (!existing.has(id)) starredIds.delete(id);
  if (starredIds.size !== before) setSettings({ starred: [...starredIds] });
  for (const id of collapsedIds) if (!groups.some((g) => g.id === id)) collapsedIds.delete(id);
  render();
}

// Bookmark changes can arrive in bursts (e.g. stashing a whole window); coalesce re-renders.
let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 100);
}

function matches(item, group) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.url, group.title].some((s) => s.toLowerCase().includes(q));
}

// ---------- rendering ----------

function faviconUrl(pageUrl) {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}

function itemEl(item, group) {
  const li = el('li', 'item');
  li.draggable = true;
  li.addEventListener('dragstart', (e) => {
    draggingId = item.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => {
    draggingId = null;
    li.classList.remove('dragging');
  });

  const flag = el('input', 'flag');
  flag.type = 'checkbox';
  flag.checked = flagged.has(item.id);
  flag.title = 'Flag this tab';
  flag.setAttribute('aria-label', `Flag ${item.title}`);
  flag.addEventListener('change', () => {
    toggleFlag([item.id], flag.checked);
  });
  li.classList.toggle('flagged', flag.checked);

  const link = el('a', 'link');
  link.href = item.url;
  link.title = item.url;
  link.rel = 'noopener';

  const icon = el('img', 'favicon');
  icon.src = faviconUrl(item.url);
  icon.alt = '';
  icon.addEventListener('error', () => icon.style.visibility = 'hidden');

  const text = el('span', 'text');
  text.append(el('span', 'title', item.title), el('span', 'domain', domainOf(item.url)));
  link.append(icon, text);

  const age = el('span', isStale(item.dateAdded) ? 'age stale' : 'age', ageLabel(item.dateAdded));
  if (isStale(item.dateAdded)) age.title = `In the stash for ${STALE_DAYS}+ days — do it or drop it`;

  const starred = starredIds.has(item.id);
  li.classList.toggle('starred', starred);
  const star = button(starred ? '★' : '☆', starred ? 'ghost star on' : 'ghost star', () => toggleStar(item), starred ? 'Unstar' : 'Star — make this stand out');
  star.setAttribute('aria-pressed', String(starred));

  const done = button('✓', 'ghost done', () => dismiss(item, group), 'Done — remove from stash');
  li.append(flag, link, age, star, done);
  return li;
}

function groupEl(group) {
  const items = group.items.filter((item) => matches(item, group));
  const section = el('section', 'group');

  // While filtering, show matches even inside folded groups.
  const collapsed = collapsedIds.has(group.id) && !query.trim();
  section.classList.toggle('collapsed', collapsed);

  const head = el('div', 'group-head');
  const fold = button(collapsed ? '▸' : '▾', 'ghost fold', () => toggleCollapsed(group), collapsed ? 'Expand group' : 'Collapse group');
  fold.setAttribute('aria-expanded', String(!collapsed));
  const visibleIds = items.map((i) => i.id);
  const flaggedHere = visibleIds.filter((id) => flagged.has(id)).length;
  const all = el('input', 'flag');
  all.type = 'checkbox';
  all.checked = visibleIds.length > 0 && flaggedHere === visibleIds.length;
  all.indeterminate = flaggedHere > 0 && flaggedHere < visibleIds.length;
  all.disabled = !visibleIds.length;
  all.title = 'Flag every tab in this group';
  all.setAttribute('aria-label', `Flag all in ${group.title}`);
  all.addEventListener('change', () => toggleFlag(visibleIds, all.checked));
  head.append(fold, all, el('h2', '', group.title), el('span', 'count', String(group.items.length)));
  section.append(head);

  const actions = el('div', 'actions');
  if (!collapsed && group.items.length) {
    actions.append(
      button('Open all', 'ghost', () => openGroup(group, false), 'Open every tab, keep them stashed'),
      button('Open & clear', 'ghost', () => openGroup(group, true), 'Open every tab and remove them from the stash'),
    );
  }
  if (!collapsed && !group.isRoot) {
    actions.append(
      button('Rename', 'ghost', () => rename(group)),
      button('Delete', 'ghost danger', () => remove(group)),
    );
  }
  if (!collapsed) section.append(actions);

  const list = el('ul', 'items');
  for (const item of collapsed ? [] : items) list.append(itemEl(item, group));
  if (!collapsed) section.append(list);
  if (!collapsed && !group.items.length) section.append(el('p', 'empty', 'Empty — stash tabs here from the toolbar button.'));

  section.addEventListener('dragover', (e) => {
    if (!draggingId) return;
    e.preventDefault();
    section.classList.add('drop-target');
  });
  section.addEventListener('dragleave', (e) => {
    if (!section.contains(e.relatedTarget)) section.classList.remove('drop-target');
  });
  section.addEventListener('drop', async (e) => {
    e.preventDefault();
    section.classList.remove('drop-target');
    const id = draggingId;
    draggingId = null;
    if (id) await moveItem(id, group.id); // bookmark events trigger the re-render
  });
  return section;
}

function render() {
  const board = $('#board');
  board.replaceChildren();

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const stale = groups.reduce((sum, g) => sum + g.items.filter((i) => isStale(i.dateAdded)).length, 0);
  $('#summary').textContent = total
    ? `${total} tab${total === 1 ? '' : 's'} in ${groups.length} group${groups.length === 1 ? '' : 's'}` +
      (stale ? ` · ${stale} stale` : '')
    : 'Nothing stashed';

  if (!groups.length) {
    const welcome = el('div', 'welcome');
    welcome.append(
      el('h2', '', 'Your working set is empty'),
      el('p', '', 'Click the Tab Stash toolbar button on any page to park it in a group, or press the quick-stash shortcut to save and close a tab in one step.'),
    );
    board.append(welcome);
    return;
  }

  const q = query.trim();
  for (const group of groups) {
    const visible = group.items.some((item) => matches(item, group));
    if (q && !visible) continue;
    board.append(groupEl(group));
  }
  renderBulk();
}

// ---------- flagged tabs ----------

async function toggleStar(item) {
  if (starredIds.has(item.id)) starredIds.delete(item.id);
  else starredIds.add(item.id);
  render();
  await setSettings({ starred: [...starredIds] });
}

// Undo re-creates a bookmark with a new id, so carry the star over to it.
async function restoreStarred(entry, wasStarred) {
  const node = await restoreItem(entry);
  if (wasStarred && node?.id) {
    starredIds.add(node.id);
    await setSettings({ starred: [...starredIds] });
  }
}

async function toggleCollapsed(group) {
  if (collapsedIds.has(group.id)) {
    collapsedIds.delete(group.id);
  } else {
    collapsedIds.add(group.id);
    // Hidden tabs must not stay flagged, or bulk actions would hit things you can't see.
    for (const item of group.items) flagged.delete(item.id);
  }
  render();
  await setSettings({ collapsed: [...collapsedIds] });
}

function toggleFlag(ids, on) {
  for (const id of ids) {
    if (on) flagged.add(id);
    else flagged.delete(id);
  }
  render();
}

function renderBulk() {
  const bar = $('#bulk');
  const picked = pickItems(groups, flagged);
  bar.hidden = !picked.length;
  bar.replaceChildren();
  if (!picked.length) return;

  const move = el('select');
  move.setAttribute('aria-label', 'Move flagged tabs to a group');
  move.append(new Option('Move to…', ''));
  for (const g of groups) move.append(new Option(g.title, g.id));
  move.append(new Option('＋ New group…', 'new'));
  move.addEventListener('change', () => {
    const value = move.value;
    move.value = '';
    if (value) moveFlagged(value);
  });

  bar.append(
    el('span', 'bulk-count', `${picked.length} flagged`),
    button('Open', 'ghost', () => openFlagged(), 'Open the flagged tabs, keep them stashed'),
    move,
    button('Delete', 'ghost danger', () => deleteFlagged(), 'Remove the flagged tabs from the stash'),
    button('Clear', 'ghost', () => toggleFlag([...flagged], false), 'Unflag everything (Esc)'),
  );
}

// ---------- actions ----------

function showToast(message, onUndo) {
  undo = onUndo;
  $('#toastText').textContent = message;
  $('#toastUndo').hidden = !onUndo;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
    undo = null;
  }, 6000);
}

async function dismiss(item, group) {
  const index = group.items.findIndex((i) => i.id === item.id);
  const wasStarred = starredIds.has(item.id);
  await removeItem(item.id);
  showToast('Removed from stash', async () => {
    await restoreStarred({ parentId: group.id, index, title: item.title, url: item.url }, wasStarred);
  });
}

async function openFlagged() {
  const items = pickItems(groups, flagged).map((p) => p.item);
  if (items.length > OPEN_CONFIRM_THRESHOLD && !confirm(`Open ${items.length} tabs at once? That can use a lot of memory.`)) return;
  await openItems(items);
}

async function deleteFlagged() {
  const picked = pickItems(groups, flagged);
  flagged.clear();
  const wasStarred = new Set(picked.filter((p) => starredIds.has(p.item.id)).map((p) => p.item.id));
  for (const { item } of picked) await removeItem(item.id);
  showToast(`Removed ${picked.length} tab${picked.length === 1 ? '' : 's'} from stash`, async () => {
    // picked is in board order, so indexes are restored lowest first within each group.
    for (const { item, group, index } of picked) {
      await restoreStarred({ parentId: group.id, index, title: item.title, url: item.url }, wasStarred.has(item.id));
    }
  });
}

async function moveFlagged(target) {
  try {
    let groupId = target;
    if (target === 'new') {
      const name = prompt('New group name');
      if (name === null) return;
      groupId = (await createGroup(name)).id;
    }
    const picked = pickItems(groups, flagged);
    flagged.clear();
    for (const { item } of picked) {
      if (item.parentId !== groupId) await moveItem(item.id, groupId);
    }
    load();
  } catch (err) {
    showToast(err.message);
  }
}

async function openGroup(group, clear) {
  const count = group.items.length;
  if (count > OPEN_CONFIRM_THRESHOLD && !confirm(`Open ${count} tabs at once? That can use a lot of memory.`)) return;
  await openItems(group.items);
  if (clear) {
    for (const item of group.items) await removeItem(item.id);
  }
}

async function rename(group) {
  const name = prompt('Rename group', group.title);
  if (name === null) return;
  try {
    await renameGroup(group.id, name);
  } catch (err) {
    showToast(err.message);
  }
}

async function remove(group) {
  const n = group.items.length;
  const detail = n ? ` and its ${n} saved tab${n === 1 ? '' : 's'}` : '';
  if (confirm(`Delete group “${group.title}”${detail}?`)) await deleteGroup(group.id);
}

async function addGroup() {
  const name = prompt('New group name');
  if (name === null) return;
  try {
    await createGroup(name);
  } catch (err) {
    showToast(err.message);
  }
}

async function showShortcutHint() {
  const commands = await chrome.commands.getAll();
  const key = (name) => commands.find((c) => c.name === name)?.shortcut;
  const parts = [
    ['_execute_action', 'pick a group'],
    ['quick-stash', 'stash & close current tab'],
    ['open-board', 'open this page'],
  ].map(([name, what]) => (key(name) ? `${key(name)} ${what}` : null));
  $('#hint').textContent = parts.some(Boolean)
    ? parts.filter(Boolean).join(' · ')
    : 'No keyboard shortcuts set — assign them on the extensions shortcuts page.';
}

// ---------- init ----------

$('#search').addEventListener('input', (e) => {
  query = e.target.value;
  render();
});
$('#newGroup').addEventListener('click', addGroup);
$('#sort').addEventListener('change', async (e) => {
  sortMode = e.target.value;
  groups = sortGroups(groups, sortMode);
  render();
  await setSettings({ groupSort: sortMode });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && flagged.size && !(e.target instanceof HTMLInputElement)) toggleFlag([...flagged], false);
});
for (const tool of COMPANION_TOOLS) {
  $('#tools').append(
    button(`${tool.name} ↗`, 'ghost', async () => {
      try {
        await openOrFocus(tool.url);
      } catch (err) {
        showToast(`Couldn’t open ${tool.name}: ${err.message}`);
      }
    }, `Open ${tool.name} in a tab`),
  );
}
$('#toastUndo').addEventListener('click', async () => {
  const action = undo;
  undo = null;
  $('#toast').hidden = true;
  if (action) await action();
});

for (const event of ['onCreated', 'onRemoved', 'onMoved', 'onChanged', 'onImportEnded']) {
  chrome.bookmarks[event].addListener(scheduleReload);
}

getSettings()
  .then((settings) => {
    settings.collapsed.forEach((id) => collapsedIds.add(id));
    settings.starred.forEach((id) => starredIds.add(id));
    sortMode = settings.groupSort;
    for (const mode of SORT_MODES) $('#sort').append(new Option(mode.label, mode.key));
    $('#sort').value = sortMode;
  })
  .catch((err) => console.warn('Tab Stash: could not read collapsed groups', err))
  .then(load)
  .catch((err) => {
    console.error(err);
    $('#summary').textContent = 'Failed to load the stash: ' + err.message;
  });
showShortcutHint();
