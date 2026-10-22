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
  const roots = [...fake.nodes.values()].filter((n) => n.title === 'Tab Stash');
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
