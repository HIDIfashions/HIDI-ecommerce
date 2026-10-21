import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyFirefoxNavigation, DESTINATION_TIMEOUT_MS} from './firefox-navigation-diagnostic.mjs';

const attempt = (precondition, activation, navigated, settle = false) => ({precondition, activation, navigated, settle});

test('classification separates a clean recovered baseline from an intermittent original sequence', () => {
  const passed = [
    attempt('original-history', 'pointer', true), attempt('original-history', 'pointer', true),
    attempt('cold', 'pointer', true), attempt('cold', 'pointer', true, true),
    attempt('cold', 'keyboard', true, true), attempt('cold', 'dom-click', true, true),
  ];
  assert.equal(classifyFirefoxNavigation(passed, {passed: true}), 'not-reproduced-on-recovered-live-baseline');
  const intermittent = [...passed]; intermittent[0] = attempt('original-history', 'pointer', false);
  assert.equal(classifyFirefoxNavigation(intermittent, {passed: true}), 'intermittent-original-history-navigation');
});

test('classification distinguishes history, hydration, pointer and destination controls', () => {
  assert.equal(classifyFirefoxNavigation([
    attempt('original-history', 'pointer', false), attempt('original-history', 'pointer', false),
    attempt('cold', 'pointer', true), attempt('cold', 'pointer', true, true),
    attempt('cold', 'keyboard', true, true), attempt('cold', 'dom-click', true, true),
  ], {passed: true}), 'history-or-timing-sensitive-navigation');
  assert.equal(classifyFirefoxNavigation([
    attempt('original-history', 'pointer', false), attempt('original-history', 'pointer', false),
    attempt('cold', 'pointer', false), attempt('cold', 'pointer', true, true),
    attempt('cold', 'keyboard', true, true), attempt('cold', 'dom-click', true, true),
  ], {passed: true}), 'hydration-timing-sensitive-navigation');
  assert.equal(classifyFirefoxNavigation([
    attempt('original-history', 'pointer', false), attempt('original-history', 'pointer', false),
    attempt('cold', 'pointer', false), attempt('cold', 'pointer', false, true),
    attempt('cold', 'keyboard', true, true), attempt('cold', 'dom-click', true, true),
  ], {passed: true}), 'pointer-activation-specific-navigation');
  assert.equal(classifyFirefoxNavigation([
    attempt('original-history', 'pointer', false), attempt('cold', 'pointer', false),
    attempt('cold', 'pointer', false, true), attempt('cold', 'keyboard', false, true), attempt('cold', 'dom-click', false, true),
  ], {passed: true}), 'link-activation-defect-reproduced');
  assert.equal(classifyFirefoxNavigation([], {passed: false}), 'destination-or-browser-document-control-failed');
  assert.equal(classifyFirefoxNavigation([{...attempt('cold', 'pointer', false), infrastructureError: {message: 'fixture'}}], {passed: true}), 'diagnostic-infrastructure-error');
});

test('every diagnostic timeout stays within the original 45-second navigation limit', async () => {
  assert.equal(DESTINATION_TIMEOUT_MS, 45_000);
  const source = await readFile(new URL('./firefox-navigation-diagnostic.mjs', import.meta.url), 'utf8');
  const timeoutValues = [
    ...source.matchAll(/\b[A-Z_]*TIMEOUT[A-Z_]*\s*=\s*(\d[\d_]*)/g),
    ...source.matchAll(/\btimeout:\s*(\d[\d_]*)/g),
    ...source.matchAll(/\b(?:setDefaultTimeout|waitForTimeout|AbortSignal\.timeout)\(\s*(\d[\d_]*)/g),
  ].map(match => Number(match[1].replaceAll('_', '')));
  assert(timeoutValues.length >= 8, 'Static timeout scan must cover constants, fetch bounds and Playwright waits');
  assert(timeoutValues.every(value => value <= 45_000), `Diagnostic timeout exceeds 45,000ms: ${timeoutValues}`);
  assert.match(source, /method: 'HEAD', redirect: 'manual', signal: AbortSignal\.timeout\(45_000\)/);
});

test('the fixed diagnostic matrix always includes a like-for-like settled pointer control', async () => {
  const source = await readFile(new URL('./firefox-navigation-diagnostic.mjs', import.meta.url), 'utf8');
  const matrix = source.slice(source.indexOf('const specifications = ['), source.indexOf('const attempts = [];'));
  for (const name of ['original-history-title-click-1', 'original-history-title-click-2', 'cold-title-click', 'cold-settled-title-click', 'cold-settled-title-enter', 'cold-settled-dom-click']) {
    assert.equal(matrix.split(name).length - 1, 1, `${name} is a single mandatory matrix entry`);
  }
  assert.doesNotMatch(matrix, /\bif\b|\bretry\b/, 'Diagnostic cases are not conditional retries');
});

test('workflow has no cloud credentials or production mutation commands', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/seo-firefox-navigation-diagnostic.yml', import.meta.url), 'utf8');
  const triggerBlock = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('\npermissions:'));
  assert.match(triggerBlock, /^on:\n  push:/);
  assert.doesNotMatch(triggerBlock, /workflow_dispatch|workflow_call|pull_request|schedule/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /id-token|azure\/login|\baz\s|docker|release\.py|patch-runtime|containerapp|workflow_call/);
  assert.match(workflow, /firefox-navigation-diagnostic\.mjs https:\/\/hidiindia\.com/);
});
