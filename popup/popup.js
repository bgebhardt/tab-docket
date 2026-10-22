import {
  closeTabs,
  createGroup,
  getGroups,
  getSettings,
  openBoard,
  setSettings,
  stashTabs,
} from '../lib/stash.js';
import { aiSuggestName } from '../lib/ai.js';
import {
  INBOX_TITLE,
  cleanGroupName,
  filterGroups,
  hasGroupNamed,
  isStashable,
  SORT_MODES,
  sortGroups,
  suggestGroupNames,
} from '../lib/util.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  scopes: [],
  scope: null,
  groups: [], // candidate groups, last-used first
  query: '',
  active: 0,
  busy: false,
  suggestions: [], // [{ name, ai }]
  rawGroups: [], // unsorted candidates
  sort: 'modified',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- data ----------

async function loadScopes() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const active = tabs.find((t) => t.active);
  const selected = tabs.filter((t) => t.highlighted);
  const unpinned = tabs.filter((t) => !t.pinned);

  const scopes = [{ key: 'tab', label: 'This tab', tabs: [active] }];
  if (selected.length > 1) scopes.push({ key: 'selected', label: `Selected (${selected.length})`, tabs: selected });
  scopes.push({ key: 'window', label: `Window (${unpinned.length})`, tabs: unpinned });

  state.scopes = scopes;
  state.scope = scopes.find((s) => s.key === 'selected') ?? scopes[0];
}

async function loadGroups() {
  const { groups } = await getGroups();
  const candidates = groups
    .filter((g) => !g.isRoot)
    .map((g) => ({ id: g.id, title: g.title, count: g.items.length, order: g.order, modified: g.modified, oldest: g.oldest }));
  // Not created until something is stashed into it, so it has no dates and sorts last.
  if (!hasGroupNamed(candidates, INBOX_TITLE)) candidates.push({ id: null, title: INBOX_TITLE, count: 0 });
  state.rawGroups = candidates;
  applySort();
}

function applySort() {
  state.groups = sortGroups(state.rawGroups, state.sort);
}

// ---------- rendering ----------

function visibleRows() {
  const rows = filterGroups(state.groups, state.query).map((g) => ({ kind: 'group', group: g }));
  const name = cleanGroupName(state.query);
  if (name && !hasGroupNamed(state.groups, name)) rows.push({ kind: 'create', name });
  return rows;
}

function renderScopes() {
  const box = $('#scopes');
  box.replaceChildren();
  for (const scope of state.scopes) {
    const button = el('button', '', scope.label);
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(scope === state.scope));
    button.addEventListener('click', () => {
      state.scope = scope;
      renderScopes();
      renderSubject();
      loadSuggestions();
      $('#query').focus();
    });
    box.append(button);
  }
}

function renderSubject() {
  const tabs = state.scope.tabs;
  const stashable = tabs.filter((t) => isStashable(t.url)).length;
  let text = tabs.length === 1 ? tabs[0].title || tabs[0].url : `${stashable} of ${tabs.length} tabs can be stashed`;
  if (tabs.length === 1 && !stashable) text = 'This page can’t be stashed';
  $('#subject').textContent = text;
}

function renderRows() {
  const list = $('#rows');
  const rows = visibleRows();
  state.active = Math.min(state.active, Math.max(rows.length - 1, 0));
  list.replaceChildren();

  rows.forEach((row, i) => {
    const button = el('button', i === state.active ? 'active' : '');
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(i === state.active));
    if (row.kind === 'group') {
      button.append(el('span', 'name', row.group.title), el('span', 'count', String(row.group.count)));
    } else {
      button.classList.add('create');
      button.append(el('span', 'name', `＋ Create “${row.name}”`), el('span', 'hint', '↵'));
    }
    button.addEventListener('click', () => choose(row));
    const item = el('li');
    item.append(button);
    list.append(item);
  });
}

function renderSuggestions() {
  const box = $('#suggest');
  box.replaceChildren();
  box.hidden = !state.suggestions.length;
  if (box.hidden) return;
  box.append(el('span', 'label', 'Name it:'));
  for (const { name, ai } of state.suggestions) {
    const chip = el('button', ai ? 'chip ai' : 'chip', ai ? `✨ ${name}` : name);
    chip.title = ai ? 'Suggested by on-device AI' : 'Suggested from the tab titles and sites';
    chip.addEventListener('click', () => {
      const input = $('#query');
      input.value = name;
      state.query = name;
      state.active = 0;
      renderRows();
      input.focus();
    });
    box.append(chip);
  }
}

// Offline guesses show instantly; the on-device AI name (if the browser has it) is added when ready.
async function loadSuggestions() {
  const scope = state.scope;
  const tabs = scope.tabs;
  const existing = state.groups.map((g) => g.title);
  const isCurrent = () => state.scope === scope;

  state.suggestions = suggestGroupNames(tabs).map((name) => ({ name, ai: false }));
  renderSuggestions();

  const name = await aiSuggestName(tabs, existing);
  if (!name || !isCurrent()) return;
  state.suggestions = [
    { name, ai: true },
    ...state.suggestions.filter((s) => s.name.toLowerCase() !== name.toLowerCase()),
  ].slice(0, 4);
  renderSuggestions();
}

// ---------- actions ----------

function setStatus(text) {
  $('#status').textContent = text;
}

function summarize(result) {
  const parts = [];
  if (result.saved) parts.push(`${result.saved} stashed`);
  if (result.moved) parts.push(`${result.moved} moved`);
  if (result.already) parts.push(`${result.already} already there`);
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  return parts.join(', ') || 'Nothing to stash';
}

async function choose(row) {
  if (state.busy) return;
  state.busy = true;
  setStatus('Stashing…');
  try {
    const target = row.kind === 'group' ? row.group : { id: null, title: row.name };
    const groupId = target.id ?? (await createGroup(target.title)).id;

    const result = await stashTabs(state.scope.tabs, groupId);
    await setSettings({ lastGroupId: groupId });
    if ($('#closeAfter').checked && result.done.length) await closeTabs(result.done);

    setStatus(summarize(result));
    setTimeout(() => window.close(), 700);
  } catch (err) {
    console.error(err);
    setStatus('Failed: ' + err.message);
    state.busy = false;
  }
}

function onKeydown(event) {
  const rows = visibleRows();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    state.active = (state.active + step + rows.length) % Math.max(rows.length, 1);
    renderRows();
  } else if (event.key === 'Enter' && rows[state.active]) {
    event.preventDefault();
    choose(rows[state.active]);
  }
}

// ---------- init ----------

async function init() {
  const settings = await getSettings();
  $('#closeAfter').checked = settings.closeAfter;
  $('#closeAfter').addEventListener('change', (e) => setSettings({ closeAfter: e.target.checked }));

  state.sort = settings.groupSort;
  await Promise.all([loadScopes(), loadGroups()]);
  const sort = $('#sort');
  for (const mode of SORT_MODES) sort.append(new Option(mode.label, mode.key));
  sort.value = state.sort;
  sort.addEventListener('change', async () => {
    state.sort = sort.value;
    applySort();
    state.active = 0;
    renderRows();
    $('#query').focus();
    await setSettings({ groupSort: state.sort });
  });
  renderScopes();
  renderSubject();
  renderRows();
  loadSuggestions();
  $('#boardCount').textContent = String(state.groups.reduce((sum, g) => sum + g.count, 0)) + ' ↗';
  $('#openBoard').addEventListener('click', async () => {
    await openBoard();
    window.close();
  });

  const query = $('#query');
  query.addEventListener('input', () => {
    state.query = query.value;
    state.active = 0;
    renderRows();
  });
  query.addEventListener('keydown', onKeydown);
  query.focus();
}

init().catch((err) => {
  console.error(err);
  setStatus('Failed to load: ' + err.message);
});
