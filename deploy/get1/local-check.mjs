import {startOfferPreview} from './preview.mjs';
import {probe} from './probe.mjs';
const fixture=await startOfferPreview();
try{await probe(fixture,{output:'../outputs/get1-rollout/preview'});}finally{await fixture.close();}
