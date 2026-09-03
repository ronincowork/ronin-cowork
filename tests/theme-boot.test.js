import test from 'node:test';
import assert from 'node:assert/strict';

// theme.js is a browser module. These are the small boot-time browser contracts it and
// state.js read while loading; no DOM is mounted and no live machine is involved.
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux' }, configurable: true });
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null };

test('theme boot keeps the cached Campaign dark shell before the server answers', async () => {
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
  };
  globalThis.localStorage = {
    getItem: (key) => key === 'tmuxgrid.theme.system' ? 'dark' : null,
    setItem: () => {},
  };

  const theme = await import(`../public/js/theme.js?dark-boot=${Date.now()}`);
  assert.equal(theme.currentTheme(), 'auto');
  assert.equal(theme.resolvedTheme(), 'dark');
});
