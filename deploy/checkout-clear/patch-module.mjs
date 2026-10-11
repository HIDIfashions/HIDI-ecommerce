/** Change only the presentation subtree in the retained compiled checkout. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/web/package.json'));
const ts = require('typescript');
export function patch(source) {
  const tree = ts.createSourceFile('retained.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length, 0, 'Retained module parses');
  const nodes = [];
  const visit = n => { nodes.push(n); ts.forEachChild(n, visit); }; visit(tree);
  const prop = (obj, key) => obj.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(tree).replace(/^['"]|['"]$/g, '') === key);
  const object = name => nodes.filter(n => ts.isObjectLiteralExpression(n) && prop(n, 'className')?.initializer.text === name);
  const form = object('checkout-form');
  const page = object('container checkout-page');
  if (!form.length && !page.length) return null;
  assert(form.length <= 1 && page.length <= 1);
  assert(!source.includes('hidi-checkout-form') && !source.includes('checkout-back-link'), 'Checkout already patched');
  const one = name => { const found = object(name); assert.equal(found.length, 1, name); return found[0]; };
  const edits = [];
  const edit = (start, end, text) => edits.push({start, end, text, original: source.slice(start, end)});
  const rootCall = (form.length ? one('button checkout-pay-button') : page[0]).parent;
  assert(ts.isCallExpression(rootCall));
  const factory = rootCall.expression.getText(tree);
  const render = (tag, props) => `${factory}(${JSON.stringify(tag)},{${props}})`;
  if (form.length) {
  const button = one('button checkout-pay-button'), buttonCall = button.parent;
  assert(ts.isCallExpression(buttonCall));
  const amount = prop(one('checkout-mobile-pay-amount'), 'children').initializer.getText(tree);
  const submit = buttonCall.getText(tree).replace('{className:', '{form:"hidi-checkout-form",className:');
  assert.notEqual(submit, buttonCall.getText(tree));
  const children = prop(form[0], 'children').initializer;
  assert(ts.isArrayLiteralExpression(children)); assert.equal(children.elements.at(-1), buttonCall);
  edit(children.elements.at(-2).end, buttonCall.end, '');
  edit(form[0].getStart(tree) + 1, form[0].getStart(tree) + 1, 'id:"hidi-checkout-form",');
  const aside = prop(one('checkout-summary'), 'children').initializer;
  assert(ts.isArrayLiteralExpression(aside));
  const action = render('div', 'className:"checkout-payment-action",children:[' +
    render('span', 'className:"checkout-action-label",children:"Total to pay"') + ',' +
    render('strong', 'className:"checkout-action-total",children:' + amount) + ',' + submit + ']');
  edit(aside.end - 1, aside.end - 1, ',' + action);
  const prompt = one('checkout-guest-prompt').parent;
  assert(ts.isCallExpression(prompt) && ts.isArrayLiteralExpression(prompt.parent));
  const promptIndex = prompt.parent.elements.indexOf(prompt);
  edit(prompt.getStart(tree), prompt.parent.elements[promptIndex + 1].getStart(tree), '');
  const reservation = object('fine-print left').find(n => n.getText(tree).includes('reserved for 15 minutes'));
  assert(reservation && ts.isCallExpression(reservation.parent));
  const paragraph = reservation.parent;
  edit(paragraph.getStart(tree), paragraph.end,
    render('details', 'className:"checkout-reservation-details",children:[' +
      render('summary', 'children:"About your checkout reservation"') + ',' + paragraph.getText(tree) + ']'));
  const labels = new Map([
    ['Enjoy your HIDI Rewards', 'Use your HIDI Rewards'],
    ['Sign in to access your rewards and redeem available benefits on your order.', 'Sign in to redeem your rewards.'],
    ['UPI, cards, net banking and HIDI rewards', 'UPI, cards & net banking'],
    ['Razorpay secure payment', 'Secure payments powered by Razorpay'],
    [' item(s) · Taxes included', ' item(s)'],
  ]);
  for (const [before, after] of labels) {
    const matches = nodes.filter(n => ts.isStringLiteral(n) && n.text === before);
    assert.equal(matches.length, 1, before);
    edit(matches[0].getStart(tree), matches[0].end, JSON.stringify(after));
  }
  }
  if (page.length) {
    const children = prop(page[0], 'children').initializer;
    assert(ts.isArrayLiteralExpression(children));
    edit(children.getStart(tree) + 1, children.getStart(tree) + 1,
      render('a', 'href:"/cart",className:"checkout-back-link",children:"← Back to bag"') + ',');
  }
  edits.sort((a,b) => a.start - b.start);
  for (let i=1;i<edits.length;i++) assert(edits[i-1].end <= edits[i].start, 'Non-overlapping bounded changes');
  let output = source, restored;
  for (const e of [...edits].reverse()) output = output.slice(0,e.start) + e.text + output.slice(e.end);
  restored = output; let offset=0;
  for (const e of edits) { const start=e.start+offset; assert.equal(restored.slice(start,start+e.text.length),e.text); restored=restored.slice(0,start)+e.original+restored.slice(start+e.text.length); }
  assert.equal(restored, source, 'Every unrelated byte is preserved');
  const check = ts.createSourceFile('patched.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(check.parseDiagnostics.length, 0, 'Patched module parses');
  return {output, changes: edits.length, sourceRestored: true, checkoutBackLink: page.length === 1, clientPresentation: form.length === 1};
}
if (process.argv[2]) {
  const result=patch(readFileSync(process.argv[2], 'utf8'));
  if (!result) process.exit(2);
  writeFileSync(process.argv[3], result.output);
  console.log(JSON.stringify({passed:true,changes:result.changes,sourceRestored:result.sourceRestored,checkoutBackLink:result.checkoutBackLink,clientPresentation:result.clientPresentation}));
}
