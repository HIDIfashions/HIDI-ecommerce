import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const tests=['tests/typography.test.mjs','tests/typography-font-library.test.mjs','tests/typography-storage.test.mjs','tests/typography-wrapper.test.mjs','tests/typography-patch.test.mjs'];
const result=spawnSync(process.execPath,['--test',...tests],{encoding:'utf8'});
mkdirSync('evidence/typography',{recursive:true});writeFileSync('evidence/typography/unit.log',result.stdout+'\n'+result.stderr);writeFileSync('evidence/typography/unit.json',JSON.stringify({passed:result.status===0,tests},null,2));
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
