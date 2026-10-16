const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.resolve(__dirname, '../apps/web/app/storefront-surfaces.css'), 'utf8');

test('ivory size and colour fills exclude selected and disabled states', () => {
  assert.match(css, /#main-content \.sizes button:not\(\.selected\):not\(:disabled\),/);
  assert.match(css, /#main-content \.colour-options button:not\(\.selected\):not\(:disabled\),/);
});
