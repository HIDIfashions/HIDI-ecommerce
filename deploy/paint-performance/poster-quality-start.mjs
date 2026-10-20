import {createHash} from 'node:crypto';
// Previously measured starting points for these exact original WebP bytes.
// Every build still decodes and compares SSIM; changed originals start at 60.
const measured={
 a5faaf768e77493172a63221a53348df6c59ee2cb2f42fee20587c326ada1aa3:68,
 '5c8442386d58af97339832ad456e90ddf6bbb6960a24993d53670ea145bbe523':74
};
export function posterQualityStart(bytes){return measured[createHash('sha256').update(bytes).digest('hex')]||60;}
