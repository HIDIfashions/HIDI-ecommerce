import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const out = path.join(root, 'evidence'); fs.mkdirSync(out, { recursive: true });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const registry = fs.readFileSync('src/spec/screenRegistry.ts', 'utf8');
const entries = [...registry.matchAll(/id: "(H\d{3})", title: "([^"]+)"[^\n]*priority: "(P[01])", phase: (\d+)/g)].map(m => ({ id: m[1], title: m[2], priority: m[3], phase: Number(m[4]) }));
if (entries.length !== 132 || new Set(entries.map(x => x.id)).size !== 132) throw new Error('Screen registry must contain 132 unique IDs');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (/\.(tsx?|jsx?|swift|kt|java)$/.test(p)) files.push(p); } }
walk('src');
const texts = new Map(files.map(p => [p, fs.readFileSync(p, 'utf8')]));
write('screen-coverage.json', { commit: sha, note: 'Source traceability inventory, NOT proof of 132 executed screen journeys or approved pixel diffs.', screens: entries.map(e => ({ ...e, sourceFiles: [...texts].filter(([p, text]) => !p.includes('screenRegistry') && text.includes(e.id)).map(([p]) => p), physicalDevice: 'NOT_EXECUTED', approvedVisualDiff: 'NOT_EXECUTED' })) });
const patterns = [ /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bsk_live_[A-Za-z0-9]{16,}\b/ ];
const secretFindings = [];
for (const [file, text] of texts) for (let i = 0; i < patterns.length; i++) if (patterns[i].test(text)) secretFindings.push({ file, patternId: i + 1 });
write('secret-scan.json', { commit: sha, scope: 'Application source; pattern-based scan, not a historical credential audit.', findings: secretFindings });
if (secretFindings.length) throw new Error('Possible private credentials found; inspect secret-scan.json (values deliberately redacted)');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const components = Object.entries(lock.packages).filter(([p, value]) => p && value.version && !value.link).map(([p, value]) => {
  const name = value.name ?? p.slice(p.lastIndexOf('node_modules/') + 13);
  return { type: 'library', 'bom-ref': p, name, version: value.version, purl: 'pkg:npm/' + name.replace('@', '%40') + '@' + value.version, ...(value.integrity?.startsWith('sha512-') ? { hashes: [{ alg: 'SHA-512', content: Buffer.from(value.integrity.slice(7), 'base64').toString('hex') }] } : {}), properties: [{ name: 'hidi:install-path', value: p }, { name: 'hidi:development-only', value: String(Boolean(value.dev)) }] };
});
write('sbom.cdx.json', { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, serialNumber: 'urn:uuid:' + crypto.randomUUID(), metadata: { timestamp: new Date().toISOString(), component: { type: 'application', name: '@hidi/mobile', version: lock.version }, tools: [{ vendor: 'HIDI', name: 'resolved-lock-inventory', version: '1.0' }] }, components });
write('provenance.json', { sourceCommit: sha, workflowInputCommit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, environment: 'staging', productionDeployment: false, optionalGrowthEnabled: false, packageLockSha256: crypto.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'), sbomScope: 'Resolved npm dependencies. Native Gradle and CocoaPods inventories are separate artifacts.' });
write('release-readiness.json', { decision: 'BLOCKED', basis: 'Blueprint pages 92-95 and 98. CI/build success does not waive live-service, merchant or real-device approval.', blockers: [
  { id: 'LIVE-PAYMENT', screens: 'H045-H060', detail: 'No native payment bridge or approved live callback-loss reconciliation evidence. New payment preparation is blocked in this internal app.' },
  { id: 'LIVE-IDENTITY', screens: 'H004-H008', detail: 'Live OTP/session verification and current auth provider contract need end-to-end validation.' },
  { id: 'ACCOUNT-ISOLATION', screens: 'H083-H102', detail: 'Legacy local checkout/address caches are not fully identity-scoped. Cross-account and logout isolation must be closed before customer release.' },
  { id: 'AFTER-SALES', screens: 'H061-H082/H128-H131', detail: 'Missing server capabilities and approved carrier/refund/exchange operations remain; no real partial refund or split-shipment test is claimed.' },
  { id: 'PRIVACY-OPERATIONS', screens: 'H094-H101/H126', detail: 'Server support, deletion/export and guest access challenge plus operational ownership require approval.' },
  { id: 'PHYSICAL-A11Y', screens: 'All P0', detail: 'TalkBack/VoiceOver, Switch Access, 2-4 GB devices and physical-device sign-off have not been executed.' },
  { id: 'VISUAL-BASELINES', screens: 'H001-H132', detail: 'Captured simulator screens are initial evidence, not approved baseline comparisons for every screen.' },
  { id: 'PERFORMANCE-SLO', screens: 'H001/H009/H023', detail: 'Emulator launch measurements are not mid-range-device p95, production load, crash-free-session or jank SLO evidence.' },
  { id: 'PRODUCTION-SIGNING', screens: 'Release', detail: 'Internal artifacts use an ephemeral test-only signer. Store keys/custody, listings, policy URLs, commercial rules and staged rollout require approval.' }
] });
console.log(JSON.stringify({ commit: sha, registryEntries: entries.length, npmComponents: components.length, secretFindings: secretFindings.length, releaseDecision: 'BLOCKED' }));
