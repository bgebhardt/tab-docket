import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ageLabel,
  badgeText,
  cleanGroupName,
  countItems,
  domainOf,
  filterGroups,
  hasGroupNamed,
  isStale,
  isStashable,
  normalizeUrl,
  pickItems,
  siteLabel,
  suggestGroupNames,
} from '../lib/util.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 22);

test('isStashable accepts web and file pages only', () => {
  assert.equal(isStashable('https://example.com/a'), true);
  assert.equal(isStashable('http://example.com'), true);
  assert.equal(isStashable('file:///tmp/x.html'), true);
  assert.equal(isStashable('chrome://settings'), false);
  assert.equal(isStashable('comet://newtab'), false);
  assert.equal(isStashable('chrome-extension://abc/newtab.html'), false);
  assert.equal(isStashable('about:blank'), false);
  assert.equal(isStashable(''), false);
  assert.equal(isStashable(undefined), false);
  assert.equal(isStashable('not a url'), false);
});

test('normalizeUrl makes equivalent urls compare equal', () => {
  assert.equal(normalizeUrl('https://Example.com'), normalizeUrl('https://example.com/'));
  assert.notEqual(normalizeUrl('https://example.com/a'), normalizeUrl('https://example.com/b'));
  assert.equal(normalizeUrl('garbage'), 'garbage');
});

test('domainOf strips www', () => {
  assert.equal(domainOf('https://www.example.com/path?q=1'), 'example.com');
  assert.equal(domainOf('https://docs.example.com'), 'docs.example.com');
});

test('cleanGroupName trims, collapses whitespace and caps length', () => {
  assert.equal(cleanGroupName('  Trip   planning \n'), 'Trip planning');
  assert.equal(cleanGroupName('   '), '');
  assert.equal(cleanGroupName(null), '');
  assert.equal(cleanGroupName('x'.repeat(100)).length, 60);
});

test('ageLabel buckets', () => {
  assert.equal(ageLabel(NOW - 3600_000, NOW), 'today');
  assert.equal(ageLabel(NOW - 3 * DAY, NOW), '3d');
  assert.equal(ageLabel(NOW - 14 * DAY, NOW), '2w');
  assert.equal(ageLabel(NOW - 90 * DAY, NOW), '3mo');
  assert.equal(ageLabel(NOW + DAY, NOW), 'today'); // clock skew never goes negative
});

test('isStale flips at the threshold', () => {
  assert.equal(isStale(NOW - 13 * DAY, NOW), false);
  assert.equal(isStale(NOW - 14 * DAY, NOW), true);
  assert.equal(isStale(NOW - 3 * DAY, NOW, 3), true);
});

test('filterGroups and hasGroupNamed are case-insensitive', () => {
  const groups = [{ title: 'Taxes' }, { title: 'Reading list' }, { title: 'Trip' }];
  assert.deepEqual(filterGroups(groups, 'TA').map((g) => g.title), ['Taxes']);
  assert.equal(filterGroups(groups, '  ').length, 3);
  assert.equal(hasGroupNamed(groups, 'trip'), true);
  assert.equal(hasGroupNamed(groups, 'tri'), false);
});

test('countItems counts pages recursively', () => {
  const tree = {
    children: [
      { url: 'https://a.test' },
      { children: [{ url: 'https://b.test' }, { url: 'https://c.test' }] },
      { children: [] },
    ],
  };
  assert.equal(countItems(tree), 3);
  assert.equal(countItems(null), 0);
});

test('badgeText', () => {
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(100), '99+');
});

test('siteLabel names the site', () => {
  assert.equal(siteLabel('https://docs.github.com/en'), 'Github');
  assert.equal(siteLabel('https://www.bbc.co.uk/news'), 'Bbc');
  assert.equal(siteLabel('http://localhost:3000/'), '');
});

test('suggestGroupNames finds words shared by several titles', () => {
  const tabs = [
    { url: 'https://a.test/1', title: 'Cheap flights to Paris - Kayak' },
    { url: 'https://b.test/2', title: 'Paris flights from Boston | Google' },
    { url: 'https://c.test/3', title: 'Best hotels in Paris' },
  ];
  assert.equal(suggestGroupNames(tabs)[0], 'Paris Flights');
});

test('suggestGroupNames suggests the dominant site', () => {
  const tabs = [
    { url: 'https://github.com/a/b', title: 'one' },
    { url: 'https://github.com/c/d', title: 'two' },
    { url: 'https://example.com/', title: 'three' },
  ];
  assert.deepEqual(suggestGroupNames(tabs), ['Github']);
});

test('suggestGroupNames ignores unstashable tabs and gives nothing when unrelated', () => {
  assert.deepEqual(suggestGroupNames([{ url: 'chrome://settings', title: 'Settings' }]), []);
  assert.deepEqual(
    suggestGroupNames([
      { url: 'https://a.test/', title: 'Alpha' },
      { url: 'https://b.test/', title: 'Bravo' },
    ]),
    [],
  );
});

test('pickItems returns flagged items in board order with their group and index', () => {
  const groups = [
    { id: 'g1', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    { id: 'g2', items: [{ id: 'd' }] },
  ];
  const picked = pickItems(groups, new Set(['d', 'c', 'a', 'gone']));
  assert.deepEqual(picked.map((p) => [p.item.id, p.group.id, p.index]), [['a', 'g1', 0], ['c', 'g1', 2], ['d', 'g2', 0]]);
});
