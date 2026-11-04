// A stand-in for expo-sqlite's key-value store, in memory, for the tests that run phone files in Node.
const data = new Map();
export default {
  getItemSync: (k) => (data.has(k) ? data.get(k) : null),
  setItemSync: (k, v) => void data.set(k, v),
  removeItemSync: (k) => data.delete(k),
};
