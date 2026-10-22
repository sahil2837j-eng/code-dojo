/* Code Dojo - tests/mock-chrome.js
   A dependency-free fake of the chrome.* surface dojo.js touches, so the
   worker's math can be tested without a browser:
     storage.local / storage.session (get / set / remove / clear),
     runtime.onMessage + getURL + getManifest,
     alarms (create / clear / onAlarm), notifications, idle.queryState,
     tabs.create / update / onRemoved.
   Node: require('./mock-chrome.js').chrome - assign to globalThis.chrome
   BEFORE requiring ../dojo.js, and set globalThis.__DOJO_TEST__ = true.
   Browser: tests/run.html loads this first and does the same. */

(function (root) {
  'use strict';

  const listeners = { message: [], alarm: [], tabRemoved: [], notificationClicked: [] };
  const stores = { local: {}, session: {} };

  /* chrome.storage get() semantics: null -> all, string key, array, or an
     object of defaults */
  function subset(from, keys) {
    if (keys == null) return Object.assign({}, from);
    if (typeof keys === 'string') return keys in from ? { [keys]: from[keys] } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) if (k in from) out[k] = from[k];
      return out;
    }
    const out = {};
    for (const k of Object.keys(keys)) out[k] = k in from ? from[k] : keys[k];
    return out;
  }

  function area(name) {
    const store = stores[name];
    return {
      async get(keys) {
        return subset(store, keys);
      },
      async set(obj) {
        Object.assign(store, obj);
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete store[k];
      },
      async clear() {
        for (const k of Object.keys(store)) delete store[k];
      },
    };
  }

  const chrome = {
    runtime: {
      id: 'mock-extension-id',
      onMessage: { addListener(fn) { listeners.message.push(fn); } },
      getURL(path) { return 'chrome-extension://mock/' + path; },
      getManifest() { return { version: '1.11.0' }; },
      /* page -> worker, exactly like the real thing: delivered to the
         listener the worker registered, resolved with its response */
      async sendMessage(msg) {
        return api.sendToWorker(msg);
      },
    },
    storage: {
      local: area('local'),
      session: area('session'),
    },
    alarms: {
      created: {},
      async create(name, info) { chrome.alarms.created[name] = info || {}; },
      async clear(name) { delete chrome.alarms.created[name]; return true; },
      onAlarm: { addListener(fn) { listeners.alarm.push(fn); } },
    },
    notifications: {
      created: [],
      async create(opts) { chrome.notifications.created.push(opts); return 'mock-notification'; },
      onClicked: { addListener(fn) { listeners.notificationClicked.push(fn); } },
    },
    idle: {
      state: 'active',
      queryState(seconds, cb) {
        const p = Promise.resolve(chrome.idle.state);
        if (typeof cb === 'function') cb(chrome.idle.state);
        return p;
      },
      setDetectionInterval() {},
    },
    tabs: {
      created: [],
      async create(opts) { chrome.tabs.created.push(opts); return { id: 77 }; },
      async update() { return {}; },
      onRemoved: { addListener(fn) { listeners.tabRemoved.push(fn); } },
    },
  };

  const api = {
    chrome,
    listeners,
    /* wipe the stores + logs between tests (listeners stay wired) */
    async fresh(seed) {
      for (const k of Object.keys(stores.local)) delete stores.local[k];
      for (const k of Object.keys(stores.session)) delete stores.session[k];
      if (seed) Object.assign(stores.local, seed);
      chrome.notifications.created.length = 0;
      chrome.tabs.created.length = 0;
      for (const k of Object.keys(chrome.alarms.created)) delete chrome.alarms.created[k];
      chrome.idle.state = 'active';
    },
    seed(obj) {
      Object.assign(stores.local, obj);
    },
    async snapshot() {
      return Object.assign({}, stores.local);
    },
    fireAlarm(name) {
      for (const fn of listeners.alarm) fn({ name });
    },
    /* deliver a message exactly as chrome.runtime would, through the
       listener the worker registered; resolves with the response */
    sendToWorker(msg, sender) {
      return new Promise((resolve) => {
        for (const fn of listeners.message) fn(msg, sender || {}, resolve);
      });
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MockChrome = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
