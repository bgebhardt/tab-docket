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
