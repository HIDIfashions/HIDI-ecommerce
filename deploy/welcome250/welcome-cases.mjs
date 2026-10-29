// Additional scenarios run inside the real retained CheckoutService fixture.
published.config={...published.config,audience:'EVERYONE',checkoutEnabled:true,welcomeEnabled:true,dressEnabled:false,eligibleProductIds:[]};
for(const price of [149899,149900,249900,399900]){
 f=fixture({price});body=input({kind:'WELCOME250',code:'WELCOME250',version:1},price,price-25000);
 if(price<149900){await assert.rejects(f.service.prepare(body,auth),/1,499/);assert.equal(f.gateway.length,0);assert.equal(f.state().orders.length,0);}
 else{result=await f.service.prepare(body,auth);assert.equal(result.amountPaise,price-25000);assert.equal(f.gateway[0].amountPaise,price-25000);assert.equal(f.state().orders[0].discountPaise,25000);assert.equal(f.state().orders[0].totalPaise,price-25000);}
 checks++;
}
f=fixture({price:79950,quantity:2});result=await f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},159900,134900),auth);assert.equal(result.amountPaise,134900);assert.equal(f.state().orders[0].items.create.reduce((sum,item)=>sum+item.totalPaise,0),134900);checks++;
f=fixture({price:399900});await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'GET1'},auth),/not currently available/);assert.equal(f.gateway.length,0);checks++;
f=fixture({price:149900});result=await f.service.prepare(input({kind:'NONE'},149900,149900),auth);assert.equal(result.amountPaise,149900);assert.equal(f.gateway[0].amountPaise,149900);checks++;
process.env.HIDI_COD_ENABLED='true';f=fixture({price:149900});result=await f.service.prepare({...input({kind:'WELCOME250',code:'WELCOME250',version:1},149900,124900),paymentMethod:'COD'},auth);assert.equal(result.provider,'COD');assert.equal(result.amountPaise,124900);assert.equal(f.gateway.length,0);delete process.env.HIDI_COD_ENABLED;checks++;
