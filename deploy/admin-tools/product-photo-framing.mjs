// Framing is reviewed per photograph, never inferred from a dress name or colour.
export const REVIEWED_PORTRAIT_PHOTO = 'batch-f115ef69cca4240ff00d138c9e7f813b2edb36b7d64d7c2c69e93b2cd3e36ca9';
export function reviewedPortraitPhoto(source) {
 let value=String(source??'');try{value=decodeURIComponent(value);}catch{}
 return value.includes(REVIEWED_PORTRAIT_PHOTO);
}
export function photoFraming(source,requested='auto') {
 return requested==='auto'?(reviewedPortraitPhoto(source)?'portrait':'original'):requested;
}
