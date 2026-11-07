import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSafeDomain,
  normalizeDomain,
  getActiveDomains,
  urlMatchesApp
} from '../utils/matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

describe('Security: Prototype Pollution Prevention', () => {
  test('rejects prototype poisoning keywords', () => {
    assert.strictEqual(isSafeDomain('__proto__'), false);
    assert.strictEqual(isSafeDomain('constructor'), false);
    assert.strictEqual(isSafeDomain('prototype'), false);
    assert.strictEqual(isSafeDomain('__proto__.polluted'), false);
  });

  test('normalizes prototype keywords to empty string', () => {
    assert.strictEqual(normalizeDomain('__proto__'), '');
    assert.strictEqual(normalizeDomain('constructor'), '');
    assert.strictEqual(normalizeDomain('prototype'), '');
    assert.strictEqual(normalizeDomain('https://__proto__/'), '');
  });

  test('getActiveDomains purges dangerous keys from custom inputs', () => {
    const custom = ['__proto__', 'constructor', 'prototype', 'https://slack.com/'];
    const active = getActiveDomains([], custom);
    assert.deepStrictEqual(active, ['slack.com']);
  });
});

describe('Security: Strict Protocol Enforcement & Execution Vectors', () => {
  const activeDomains = ['youtube.com', 'google.com'];

  test('rejects javascript: and data: pseudo-protocols', () => {
    assert.strictEqual(urlMatchesApp('javascript:alert(1)', activeDomains), false);
    assert.strictEqual(urlMatchesApp('javascript://youtube.com/%0Aalert(1)', activeDomains), false);
    assert.strictEqual(urlMatchesApp('data:text/html,<script>alert(1)</script>', activeDomains), false);
    assert.strictEqual(urlMatchesApp('vbscript:msgbox(1)', activeDomains), false);
  });

  test('rejects local file and blob schemes', () => {
    assert.strictEqual(urlMatchesApp('file:///etc/passwd', activeDomains), false);
    assert.strictEqual(urlMatchesApp('file://youtube.com/video', activeDomains), false);
    assert.strictEqual(urlMatchesApp('blob:https://youtube.com/uuid-string', activeDomains), false);
  });

  test('requires strict http: or https: scheme', () => {
    assert.strictEqual(urlMatchesApp('ftp://youtube.com/files', activeDomains), false);
    assert.strictEqual(urlMatchesApp('ssh://youtube.com', activeDomains), false);
    assert.strictEqual(urlMatchesApp('//youtube.com/test', activeDomains), false);
  });
});

describe('Security: Static Code Audit (Forbidden Dangerous Sinks)', () => {
  const jsFiles = [
    'background.js',
    'background/badge.js',
    'background/tab-query.js',
    'background/tab-mover.js',
    'popup/popup.js',
    'popup/dom.js',
    'popup/tab-list.js',
    'popup/settings-view.js',
    'utils/matcher.js',
    'utils/window-matcher.js'
  ];

  test('zero usage of eval() or new Function()', () => {
    for (const relPath of jsFiles) {
      const fullPath = path.join(rootDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(!content.includes('eval('), `Forbidden eval() detected in ${relPath}`);
      assert.ok(!content.includes('new Function('), `Forbidden new Function() detected in ${relPath}`);
      assert.ok(!content.includes('document.write('), `Forbidden document.write() detected in ${relPath}`);
    }
  });

  test('zero usage of innerHTML assignments (DOM XSS Immunity)', () => {
    for (const relPath of jsFiles) {
      const fullPath = path.join(rootDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for any innerHTML =
      assert.ok(!/\.innerHTML\s*=/.test(content), `Dangerous .innerHTML assignment detected in ${relPath}`);
    }
  });
});

describe('Security: Manifest V3 & Least Privilege Audit', () => {
  test('manifest.json conforms to Manifest V3 security rules', () => {
    const manifestPath = path.join(rootDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');

    // Ensure no excessive or dangerous host permissions
    assert.ok(!manifest.host_permissions, 'Must not request broad host_permissions');
    assert.ok(!manifest.permissions.includes('<all_urls>'), 'Must not request <all_urls>');
    assert.ok(!manifest.permissions.includes('scripting'), 'Must not request unnecessary scripting permission');

    // Only allow expected minimal permissions
    const allowedPermissions = new Set(['tabs', 'storage', 'contextMenus', 'management', 'nativeMessaging']);
    for (const p of manifest.permissions) {
      assert.ok(allowedPermissions.has(p), `Unexpected permission requested: ${p}`);
    }
  });
});
