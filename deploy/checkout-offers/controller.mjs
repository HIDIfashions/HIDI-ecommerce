import {Post,Body,Headers,Header} from '@nestjs/common';
import {quote} from './offers-engine.mjs';
export function attachCheckoutOffers(Controller){
 if(Controller.prototype.offerQuote)throw Error('Checkout offers already installed');
 Controller.prototype.offerQuote=async function(body,authorization){const auth=authorization===undefined?null:await this.auth.requireUser(authorization);return quote(this.checkout.prisma,body,auth);};
 const descriptor=Object.getOwnPropertyDescriptor(Controller.prototype,'offerQuote');Post('offers/quote')(Controller.prototype,'offerQuote',descriptor);Header('Cache-Control','private, no-store')(Controller.prototype,'offerQuote',descriptor);Body()(Controller.prototype,'offerQuote',0);Headers('authorization')(Controller.prototype,'offerQuote',1);
}
