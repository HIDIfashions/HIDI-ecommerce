// Public disclosure projection only. Redemption policy and stored state are untouched.
export function offerDetails(value,phone,now,placement='landing'){
 if(!['landing','checkout'].includes(placement))throw fail(400,'Choose landing or checkout');
 const state=independentState(value),flag=placement==='landing'?'landingEnabled':'checkoutEnabled';
 const entries=codes.flatMap(code=>{const config=live(state,code,phone,now);return config?.[flag]?[{code,title:config.title,terms:config.terms,endsAt:config.endsAt}]:[];});
 return {version:state.version,entries};
}
