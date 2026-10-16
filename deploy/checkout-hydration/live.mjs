import {probe} from './probe.mjs';
import {probe as productProbe} from '../product-preview/probe.mjs';
import {probe as pricingProbe} from './pricing-probe.mjs';
const base='https://hidiindia.com',out='evidence/checkout-hydration-release/live';
await probe(base,out);
await productProbe(base,out+'/product');
await pricingProbe(base,out+'/pricing');
