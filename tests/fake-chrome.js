// Minimal in-memory stand-in for the chrome.* APIs that lib/stash.js uses.
// Bookmark ids: '1' = Bookmarks bar, '2' = Other bookmarks (default parent), like real Chromium.

export function installFakeChrome() {
  let nextId = 100;
  const nodes = new Map();
  const sync = {}; // storage.local contents
  const tabs = [];
  const calls = { removeFailures: 0, tabsRemoved: [], tabsCreated: [], tabsUpdated: [], windowsUpdated: [] };

  const add = (node) => {
    nodes.set(node.id, node);
    return node;
  };
  add({ id: '0', title: '', children: [] });
  add({ id: '1', parentId: '0', title: 'Bookmarks bar', children: [] });
  add({ id: '2', parentId: '0', title: 'Other bookmarks', children: [] });

  const pub = (n) => {
    const { children, ...rest } = n;
    return { ...rest, index: nodes.get(n.parentId)?.children.indexOf(n) };
  };
  const tree = (n) => ({ ...pub(n), ...(n.children ? { children: n.children.map((id) => tree(nodes.get(id))) } : {}) });
  const need = (id) => {
    const n = nodes.get(id);
    if (!n) throw new Error(`No node ${id}`);
    return n;
  };
  const detach = (n) => {
    const parent = nodes.get(n.parentId);
    parent.children = parent.children.filter((id) => id !== n.id);
  };

  // Children are stored as ids; helper to resolve.
  const kids = (parent) => parent.children.map((id) => nodes.get(id));

  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in sync).map((k) => [k, sync[k]]));
        },
        async set(patch) {
          Object.assign(sync, patch);
        },
      },
    },
    bookmarks: {
      async get(id) {
        return [pub(need(id))];
      },
      async getChildren(id) {
        return kids(need(id)).map(pub);
      },
      async getSubTree(id) {
        const build = (n) => ({
          ...pub(n),
          ...(n.children ? { children: kids(n).map(build) } : {}),
        });
        return [build(need(id))];
      },
      async search({ title }) {
        return [...nodes.values()].filter((n) => n.title === title && n.id !== '0').map(pub);
      },
      async create({ parentId = '2', title = '', url, index }) {
        const parent = need(parentId);
        const node = add({ id: String(nextId++), parentId, title, dateAdded: Date.now(), ...(url ? { url } : { children: [] }) });
        parent.children.splice(index ?? parent.children.length, 0, node.id);
        return pub(node);
      },
      async move(id, { parentId, index }) {
        const node = need(id);
        detach(node);
        node.parentId = parentId ?? node.parentId;
        const parent = need(node.parentId);
        parent.children.splice(index ?? parent.children.length, 0, node.id);
        return pub(node);
      },
      async update(id, patch) {
        Object.assign(need(id), patch);
      },
      async remove(id) {
        const node = need(id);
        detach(node);
        nodes.delete(id);
      },
      async removeTree(id) {
        const node = need(id);
        const drop = (n) => {
          (n.children ?? []).forEach((c) => drop(nodes.get(c)));
          nodes.delete(n.id);
        };
        detach(node);
        drop(node);
      },
    },
    runtime: { getURL: (path) => `chrome-extension://fake/${path}` },
    windows: {
      async update(id, props) {
        calls.windowsUpdated.push({ id, ...props });
      },
    },
    tabs: {
      async query({ windowId, url }) {
        return tabs.filter((t) => (windowId === undefined || t.windowId === windowId) && (!url || t.url === url));
      },
      async get(id) {
        const found = tabs.find((t) => t.id === id);
        if (!found) throw new Error(`No tab with id: ${id}`);
        return found;
      },
      async update(id, props) {
        calls.tabsUpdated.push({ id, ...props });
      },
      async create(props) {
        calls.tabsCreated.push(props);
        return props;
      },
      async remove(ids) {
        if (calls.removeFailures > 0) {
          calls.removeFailures--;
          throw new Error('Tabs cannot be edited right now (user may be dragging a tab).');
        }
        for (const id of [ids].flat()) {
          if (calls.ignoreRemove) continue; // simulates a browser that resolves without closing
          calls.tabsRemoved.push(id);
          const i = tabs.findIndex((t) => t.id === id);
          if (i >= 0) tabs.splice(i, 1);
        }
      },
    },
  };

  return { nodes, sync, tabs, calls, tree: (id) => tree(need(id)) };
}
