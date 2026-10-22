import {
  createGroup,
  deleteGroup,
  getGroups,
  moveItem,
  openItems,
  removeItem,
  renameGroup,
  restoreItem,
} from '../lib/stash.js';
import { STALE_DAYS, ageLabel, domainOf, isStale } from '../lib/util.js';

const $ = (selector) => document.querySelector(selector);
const OPEN_CONFIRM_THRESHOLD = 10;

let groups = [];
let query = '';
let draggingId = null;
let toastTimer = null;
let undo = null;

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

  const done = button('✓', 'ghost done', () => dismiss(item, group), 'Done — remove from stash');
  li.append(link, age, done);
  return li;
}

function groupEl(group) {
  const items = group.items.filter((item) => matches(item, group));
  const section = el('section', 'group');

  const head = el('div', 'group-head');
  head.append(el('h2', '', group.title), el('span', 'count', String(group.items.length)));
  section.append(head);

  const actions = el('div', 'actions');
  if (group.items.length) {
    actions.append(
      button('Open all', 'ghost', () => openGroup(group, false), 'Open every tab, keep them stashed'),
      button('Open & clear', 'ghost', () => openGroup(group, true), 'Open every tab and remove them from the stash'),
    );
  }
  if (!group.isRoot) {
    actions.append(
      button('Rename', 'ghost', () => rename(group)),
      button('Delete', 'ghost danger', () => remove(group)),
    );
  }
  section.append(actions);

  const list = el('ul', 'items');
  for (const item of items) list.append(itemEl(item, group));
  section.append(list);
  if (!group.items.length) section.append(el('p', 'empty', 'Empty — stash tabs here from the toolbar button.'));

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
      el('p', '', 'Click the Tab Stash toolbar button on any page to park it in a group. It will show up here.'),
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
  await removeItem(item.id);
  showToast('Removed from stash', async () => {
    await restoreItem({ parentId: group.id, index, title: item.title, url: item.url });
  });
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
  const shortcut = commands.find((c) => c.name === '_execute_action')?.shortcut;
  $('#hint').textContent = shortcut
    ? `Stash the current tab with ${shortcut}`
    : 'No keyboard shortcut set — assign one on the extensions shortcuts page.';
}

// ---------- init ----------

$('#search').addEventListener('input', (e) => {
  query = e.target.value;
  render();
});
$('#newGroup').addEventListener('click', addGroup);
$('#toastUndo').addEventListener('click', async () => {
  const action = undo;
  undo = null;
  $('#toast').hidden = true;
  if (action) await action();
});

for (const event of ['onCreated', 'onRemoved', 'onMoved', 'onChanged', 'onImportEnded']) {
  chrome.bookmarks[event].addListener(scheduleReload);
}

load().catch((err) => {
  console.error(err);
  $('#summary').textContent = 'Failed to load the stash: ' + err.message;
});
showShortcutHint();
