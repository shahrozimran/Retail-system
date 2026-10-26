import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { themeBootstrap } from '../src/lib/theme.ts';

function boot(value, systemDark = false, storageBlocked = false) {
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(themeBootstrap, {
    document,
    localStorage: { getItem() { if (storageBlocked) throw new Error('Unavailable'); return value; } },
    window: { matchMedia: () => ({ matches: systemDark }) },
  });
  return document.documentElement.dataset.theme;
}

test('theme bootstrap restores an explicit choice before hydration and otherwise follows the system', () => {
  assert.equal(boot('light', true), 'light');
  assert.equal(boot('dark', false), 'dark');
  assert.equal(boot(null, true), 'dark');
  assert.equal(boot(null, false), 'light');
});

test('invalid stored values and unavailable WebView storage fall back safely', () => {
  assert.equal(boot('unexpected', false), 'light');
  assert.equal(boot('<script>untrusted</script>', true), 'dark');
  assert.equal(boot(null, true, true), 'dark');
  assert.equal(boot(null, false, true), 'light');
});
