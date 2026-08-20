// localStorage shim matching the claude.ai artifact storage API,
// so App.jsx runs unchanged outside the artifact sandbox.
if (!window.storage) {
  const LS = window.localStorage, P = "caddie:";
  window.storage = {
    async get(key) {
      const v = LS.getItem(P + key);
      if (v == null) throw new Error("key not found: " + key);
      return { key, value: v, shared: false };
    },
    async set(key, value) { LS.setItem(P + key, value); return { key, value, shared: false }; },
    async delete(key) { const had = LS.getItem(P + key) != null; LS.removeItem(P + key); return { key, deleted: had, shared: false }; },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k.startsWith(P + prefix)) keys.push(k.slice(P.length)); }
      return { keys, prefix, shared: false };
    },
  };
}
