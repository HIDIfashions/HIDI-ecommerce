const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
test('checkout gate precedes all business-state operations and grant consumption is inside order transaction',()=>{
  const code=read('apps/api/src/checkout/checkout.service.ts');
  const start=code.indexOf('async prepare('), gate=code.indexOf('this.phoneVerification.authorize(input, auth)',start);
  for(const call of ['this.wallet.ensureWallet','this.releaseExpiredReservations','this.prisma.order.findUnique','withSerializableRetry(this.prisma']){
    const index=code.indexOf(call,start); if(index>=0) assert(gate<index,call);
  }
  assert(code.indexOf('this.phoneVerification.consume(tx, phoneGrant',start)>code.indexOf('withSerializableRetry(this.prisma',start));
});
test('guest field is compact, ten digits, labelled and sends only from explicit buttons',()=>{
  const code=read('apps/web/components/checkout-phone-verification.tsx');
  assert.match(code,/maxLength=\{10\}/); assert.match(code,/autoComplete="tel-national"/);
  assert.match(code,/autoComplete="one-time-code"/); assert.match(code,/maxLength=\{6\}/);
  assert.match(code,/>\+91<\/span>/); assert.match(code,/onClick=\{\(\) => void c.send\(\)\}/);
  assert.doesNotMatch(code,/sendPhoneOtp|verifyPhoneOtp|localStorage\.setItem|saveSession/);
  const css=read('apps/web/components/checkout-phone-verification.module.css');assert.match(css,/252px/);
});
test('frontend disabled state and prepare carry verification independently of visible button',()=>{
  const code=read('apps/web/components/checkout-client.tsx');
  assert.match(code,/if \(!phoneVerification.canContinue\)/);
  assert.match(code,/disabled=\{busy \|\| !phoneVerification.canContinue/);
  assert.match(code,/phoneVerificationToken: phoneVerification.proof.token/);
});
test('verification schema stores hashes, and additive SQL is not a PostgreSQL migration',()=>{
  const schema=read('apps/api/prisma/schema.prisma').split('model CheckoutPhoneChallenge')[1];
  assert.match(schema,/phoneHash/);assert.match(schema,/grantHash/);assert.doesNotMatch(schema,/\botp\s+String/);
  const sql=read('deploy/sql/checkout-phone-verification.sql');
  assert.match(sql,/BEGIN TRANSACTION/);assert.match(sql,/NVARCHAR/);assert.doesNotMatch(sql,/DROP TABLE|ALTER TABLE \[dbo\]\.\[Order\]/);
});
