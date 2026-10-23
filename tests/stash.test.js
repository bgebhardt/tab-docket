import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { installFakeChrome } from './fake-chrome.js';

let fake;
let stash;

beforeEach(async () => {
  fake = installFakeChrome();
  // Fresh module instance per test so the module-level root-creation state never leaks.
  stash = await import(`../lib/stash.js?t=${Math.random()}`);
});

const tab = (id, url, extra = {}) => ({ id, windowId: 1, url, title: `Tab ${id}`, ...extra });

test('getGroups returns nothing and creates nothing before first use', async () => {
  const result = await stash.getGroups();
  assert.deepEqual(result, { rootId: null, groups: [] });
  assert.equal(await stash.getRootId({ create: false }), null);
});

test('getRootId creates the folder once, even when called concurrently', async () => {
  const ids = await Promise.all([stash.getRootId(), stash.getRootId(), stash.getRootId()]);
  assert.equal(new Set(ids).size, 1);
  const roots = [...fake.nodes.values()].filter((n) => n.title === 'Tab Docket');
  assert.equal(roots.length, 1);
  assert.equal(roots[0].parentId, '2');
});

test('getRootId re-finds the folder by title when the cached id is stale', async () => {
  const id = await stash.getRootId();
  fake.sync.rootId = 'gone';
  assert.equal(await stash.getRootId(), id);
  assert.equal(fake.sync.rootId, id);
});

test('createGroup is idempotent and case-insensitive', async () => {
  const a = await stash.createGroup('Trip');
  const b = await stash.createGroup('  trip ');
  assert.equal(a.id, b.id);
  await assert.rejects(() => stash.createGroup('   '), /empty/);
});

test('stashTabs saves tabs, skips internal pages, and reports closable tabs', async () => {
  const { id: groupId } = await stash.createGroup('Inbox');
  const tabs = [tab(1, 'https://a.test/'), tab(2, 'chrome://settings'), tab(3, 'https://b.test/')];
  const result = await stash.stashTabs(tabs, groupId);

  assert.deepEqual({ ...result, done: result.done.map((t) => t.id) }, {
    saved: 2, moved: 0, already: 0, skipped: 1, done: [1, 3],
  });
  const { groups } = await stash.getGroups();
  assert.deepEqual(groups[0].items.map((i) => i.url), ['https://a.test/', 'https://b.test/']);
});

test('stashTabs does not duplicate: same group is a no-op, other group moves the item', async () => {
  const inbox = await stash.createGroup('Inbox');
  const taxes = await stash.createGroup('Taxes');
  await stash.stashTabs([tab(1, 'https://a.test/')], inbox.id);

  const again = await stash.stashTabs([tab(1, 'https://a.test')], inbox.id); // trailing-slash variant
  assert.equal(again.already, 1);
  assert.equal(again.done.length, 1, 'already-stashed tabs are still safe to close');

  const moved = await stash.stashTabs([tab(1, 'https://a.test/')], taxes.id);
  assert.equal(moved.moved, 1);

  const { groups } = await stash.getGroups();
  const byTitle = Object.fromEntries(groups.map((g) => [g.title, g.items.length]));
  assert.deepEqual(byTitle, { Inbox: 0, Taxes: 1 });
});

test('loose bookmarks in the root appear as an Unsorted pseudo-group', async () => {
  const rootId = await stash.getRootId();
  await chrome.bookmarks.create({ parentId: rootId, title: 'Loose', url: 'https://loose.test/' });
  const { groups } = await stash.getGroups();
  assert.equal(groups[0].title, 'Unsorted');
  assert.equal(groups[0].isRoot, true);
  assert.equal(groups[0].id, rootId);
});

test('moveItem, removeItem and restoreItem', async () => {
  const a = await stash.createGroup('A');
  const b = await stash.createGroup('B');
  await stash.stashTabs([tab(1, 'https://one.test/'), tab(2, 'https://two.test/')], a.id);
  let { groups } = await stash.getGroups();
  const [first, second] = groups.find((g) => g.title === 'A').items;

  await stash.moveItem(first.id, b.id);
  await stash.removeItem(second.id);
  ({ groups } = await stash.getGroups());
  assert.equal(groups.find((g) => g.title === 'A').items.length, 0);
  assert.equal(groups.find((g) => g.title === 'B').items.length, 1);

  await stash.restoreItem({ parentId: a.id, index: 0, title: second.title, url: second.url });
  ({ groups } = await stash.getGroups());
  assert.equal(groups.find((g) => g.title === 'A').items[0].url, 'https://two.test/');
});

test('restoreItem falls back to the root when the group was deleted', async () => {
  const a = await stash.createGroup('A');
  await stash.deleteGroup(a.id);
  const node = await stash.restoreItem({ parentId: a.id, index: 3, title: 'T', url: 'https://t.test/' });
  assert.equal(node.parentId, await stash.getRootId());
});

test('deleteGroup removes the folder and its items', async () => {
  const a = await stash.createGroup('A');
  await stash.stashTabs([tab(1, 'https://one.test/')], a.id);
  await stash.deleteGroup(a.id);
  const { groups } = await stash.getGroups();
  assert.equal(groups.length, 0);
});

test('closeTabs opens a replacement tab when it would empty the window', async () => {
  fake.tabs.push(tab(1, 'https://a.test/'), tab(2, 'https://b.test/'));
  await stash.closeTabs([fake.tabs[0], fake.tabs[1]]);
  assert.deepEqual(fake.calls.tabsCreated, [{ windowId: 1 }]);
  assert.deepEqual(fake.calls.tabsRemoved, [1, 2]);
});

test('closeTabs leaves the window alone when other tabs remain', async () => {
  fake.tabs.push(tab(1, 'https://a.test/'), tab(2, 'https://b.test/'), tab(3, 'https://c.test/', { pinned: true }));
  await stash.closeTabs([fake.tabs[0], fake.tabs[1]]);
  assert.deepEqual(fake.calls.tabsCreated, []);
  assert.deepEqual(fake.calls.tabsRemoved, [1, 2]);
});

test('quickStash saves to the Inbox and closes the tab', async () => {
  fake.sync.closeAfter = true;
  fake.tabs.push(tab(1, 'https://a.test/'), tab(2, 'https://b.test/'));
  const result = await stash.quickStash(fake.tabs[0]);
  assert.equal(result.saved, 1);
  const { groups } = await stash.getGroups();
  assert.deepEqual(groups.map((g) => [g.title, g.items.length]), [['Inbox', 1]]);
  assert.deepEqual(fake.calls.tabsRemoved, [1]);
});

test('quickStash reuses one Inbox', async () => {
  await stash.quickStash(tab(1, 'https://a.test/'));
  await stash.quickStash(tab(2, 'https://b.test/'));
  const { groups } = await stash.getGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.deepEqual(fake.calls.tabsRemoved, []);
});

test('quickStash does not close the tab by default', async () => {
  fake.tabs.push(tab(1, 'https://a.test/'), tab(2, 'https://b.test/'));
  await stash.quickStash(fake.tabs[0]);
  assert.deepEqual(fake.calls.tabsRemoved, []);
});

test('quickStash leaves internal pages alone', async () => {
  fake.sync.closeAfter = true;
  const result = await stash.quickStash(tab(1, 'chrome://settings'));
  assert.equal(result.done.length, 0);
  assert.deepEqual(fake.calls.tabsRemoved, []);
});

test('quickStash uses the last group when configured, and falls back when it is gone', async () => {
  const trip = await stash.createGroup('Trip');
  fake.sync.quickTarget = 'last';
  fake.sync.lastGroupId = trip.id;
  await stash.quickStash(tab(1, 'https://a.test/'));
  let { groups } = await stash.getGroups();
  assert.equal(groups.find((g) => g.title === 'Trip').items.length, 1);

  await stash.deleteGroup(trip.id);
  await stash.quickStash(tab(2, 'https://b.test/'));
  ({ groups } = await stash.getGroups());
  assert.deepEqual(groups.map((g) => g.title), ['Inbox']);
});

test('openBoard opens the page once, then focuses it', async () => {
  await stash.openBoard();
  assert.equal(fake.calls.tabsCreated.length, 1);
  fake.tabs.push({ id: 9, windowId: 4, url: fake.calls.tabsCreated[0].url });
  await stash.openBoard();
  assert.equal(fake.calls.tabsCreated.length, 1);
  assert.deepEqual(fake.calls.tabsUpdated, [{ id: 9, active: true }]);
  assert.deepEqual(fake.calls.windowsUpdated, [{ id: 4, focused: true }]);
});

test('openOrFocus focuses an existing tab for the url and opens one otherwise', async () => {
  await stash.openOrFocus('chrome-extension://abc/main.html');
  assert.equal(fake.calls.tabsCreated.length, 1);
  fake.tabs.push({ id: 5, windowId: 2, url: 'chrome-extension://abc/main.html' });
  await stash.openOrFocus('chrome-extension://abc/main.html');
  assert.equal(fake.calls.tabsCreated.length, 1);
  assert.deepEqual(fake.calls.tabsUpdated, [{ id: 5, active: true }]);
});

test('closeTabs retries a transient tabs.remove failure', async () => {
  fake.tabs.push(tab(1, 'https://a.test/'), tab(2, 'https://b.test/'));
  fake.calls.removeFailures = 2;
  await stash.closeTabs([fake.tabs[0]]);
  assert.deepEqual(fake.calls.tabsRemoved, [1]);
});

test('closeTabs does not open a replacement tab when the window query comes back empty', async () => {
  await stash.closeTabs([tab(1, 'https://a.test/')]);
  assert.deepEqual(fake.calls.tabsCreated, []);
  assert.deepEqual(fake.calls.tabsRemoved, [1]);
});

test('closeTabs throws when the browser says it removed a tab but the tab is still open', async () => {
  fake.tabs.push(tab(1, 'https://a.test/'), tab(2, 'https://b.test/'));
  fake.calls.ignoreRemove = true;
  await assert.rejects(stash.closeTabs([fake.tabs[0]]), /did not close the tab \(tab id 1\)/);
});

test('getGroups exposes order, modified and oldest for sorting', async () => {
  const a = await stash.createGroup('A');
  await stash.createGroup('B');
  await stash.stashTabs([tab(1, 'https://one.test/')], a.id);
  const { groups } = await stash.getGroups();
  assert.deepEqual(groups.map((g) => g.order), [0, 1]);
  assert.ok(groups[0].modified > 0 && groups[0].oldest > 0);
  assert.equal(groups[1].oldest, undefined);
});

test('getRootId adopts and renames a folder from the old product name', async () => {
  const old = await chrome.bookmarks.create({ title: 'Tab Stash' });
  const id = await stash.getRootId({ create: false });
  assert.equal(id, old.id);
  assert.equal(fake.nodes.get(old.id).title, 'Tab Docket');
  const roots = [...fake.nodes.values()].filter((n) => n.title === 'Tab Docket' || n.title === 'Tab Stash');
  assert.equal(roots.length, 1);
});
