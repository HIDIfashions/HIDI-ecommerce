import {Get,Headers,Header} from '@nestjs/common';
export function attachOffersIdentity(AuthController) {
  if(AuthController.prototype.offersIdentity)throw new Error('Offer identity endpoint already installed');
  Object.defineProperty(AuthController.prototype,'offersIdentity',{configurable:true,value:async function(authorization){
    const user=await this.auth.requireUser(authorization);
    return {phoneVerified:user.phoneVerified===true,phone:user.phoneVerified===true?user.phone:null};
  }});
  const descriptor=Object.getOwnPropertyDescriptor(AuthController.prototype,'offersIdentity');
  Get('offers-identity')(AuthController.prototype,'offersIdentity',descriptor);
  Header('Cache-Control','private, no-store')(AuthController.prototype,'offersIdentity',descriptor);
  Headers('authorization')(AuthController.prototype,'offersIdentity',0);
}
