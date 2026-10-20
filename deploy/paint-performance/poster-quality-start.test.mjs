import test from 'node:test';import assert from 'node:assert/strict';
import {posterQualityStart} from './poster-quality-start.mjs';
test('changed or new poster originals retain the complete quality search',()=>{for(const bytes of [Buffer.alloc(0),Buffer.from('changed photo'),Buffer.from('a5faaf768e77493172a63221a53348df6c59ee2cb2f42fee20587c326ada1aa3')])assert.equal(posterQualityStart(bytes),60);});
