// tests/setup.js
// Provides a mock implementation for browser APIs not available in Node.
import { vi } from 'vitest';

const localStorageMock = (() => {
  let store = {};
  return {
    _store: store,
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});
