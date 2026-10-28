import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const tests=['tests/typography.test.mjs','tests/typography-storage.test.mjs','tests/typography-wrapper.test.mjs','tests/typography-patch.test.mjs','tests/button-theme-handler.test.mjs','tests/button-request-policy.test.mjs','tests/storefront-quality.test.cjs','tests/storefront-surfaces.test.cjs','tests/storefront-surface-states.test.cjs','tests/mobile-menu-layout.test.cjs','tests/admin-dashboard.test.cjs','tests/pdp-information.test.mjs','tests/product-copy.test.mjs'];
const result=spawnSync(process.execPath,['--test',...tests],{encoding:'utf8'});
mkdirSync('evidence/typography',{recursive:true});writeFileSync('evidence/typography/unit.log',result.stdout+'\n'+result.stderr);
writeFileSync('evidence/typography/unit.json',JSON.stringify({passed:result.status===0,tests,output:result.stdout},null,2));
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
