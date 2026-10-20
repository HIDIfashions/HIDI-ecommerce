import test from 'node:test';import assert from 'node:assert/strict';import {fixtureCommands} from './network-fixture.mjs';
test('latency fixture delays only the pinned local HTTP2 port in both directions',()=>{
 assert.deepEqual(fixtureCommands[0].slice(-17),['priomap',...Array(16).fill('0')]);assert(fixtureCommands.every(args=>args[args.indexOf('dev')+1]==='lo'));
 assert.deepEqual(fixtureCommands[1].slice(-5),['netem','limit','10000','delay','125ms']);assert.equal(fixtureCommands.length,4);
 for(const [index,direction] of ['dport','sport'].entries()){const command=fixtureCommands[index+2];assert.deepEqual(command.slice(-7),['match','ip',direction,'3190','0xffff','flowid','7:3']);assert(command.join(' ').includes('match ip protocol 6 0xff'));}
});
