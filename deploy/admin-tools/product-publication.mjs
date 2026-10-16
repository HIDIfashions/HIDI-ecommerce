// Uses the existing authenticated, version-checked product status API.
export function publicationState(product) {
  if (product.status === 'ACTIVE') return {ready:false, state:'published', message:'Already published'};
  if (product.status !== 'DRAFT') return {ready:false, state:'blocked', message:'Archived products cannot be published here'};
  const variants=(product.variants||[]).filter(variant=>variant.active);
  if (!variants.length) return {ready:false, state:'blocked', message:'Add at least one active size / SKU'};
  if (variants.some(v=>!Number.isSafeInteger(v.pricePaise)||v.pricePaise<=0||!Number.isSafeInteger(v.mrpPaise)||v.mrpPaise<v.pricePaise))
    return {ready:false, state:'blocked', message:'Correct selling price and MRP'};
  if (!(product.images||[]).length && !variants.some(v=>(v.images||[]).length))
    return {ready:false, state:'blocked', message:'Upload a product or SKU photo, then review this batch again'};
  return {ready:true, state:'ready', message:'Ready to publish'};
}

export async function publishProducts(ids, api, progress=()=>{}) {
  const results=[];
  for (const id of [...new Set(ids)]) {
    let result;
    try {
      const product=await api('/'+encodeURIComponent(id));
      if(product?.id!==id || typeof product.updatedAt!=='string') throw new Error('Product response is incomplete. Review the batch before retrying.');
      const state=publicationState(product);
      if (!state.ready) result={id,name:product.name,...state};
      else {
        const saved=await api('/'+encodeURIComponent(id)+'/status','POST',{status:'ACTIVE',expectedUpdatedAt:product.updatedAt});
        if (saved?.id!==id || saved.status!=='ACTIVE') throw new Error('Publish response is incomplete. Review the batch to confirm before retrying.');
        result={id,name:saved.name,ready:false,state:'published',message:'Published'};
      }
    } catch(error) {
      result={id,ready:false,state:'failed',message:error.message||'Publishing failed',status:error.status};
    }
    results.push(result); progress(result,results.length);
    if ([401,403].includes(result.status)) break;
  }
  return results;
}

// Nonblank imported details update existing products without clearing other saved data.
export function importDetails(row, product, categoryId) {
  const payload={name:row.productName,slug:product.slug,categoryId:row.category?categoryId:product.categoryId,
    collectionIds:(product.collections||[]).map(value=>value.collectionId),expectedUpdatedAt:product.updatedAt};
  let changed=payload.name!==product.name || payload.categoryId!==product.categoryId;
  for (const field of ['shortDescription','description','fabric','care']) {
    payload[field]=row[field] || product[field] || null;
    if (payload[field]!==product[field]) changed=true;
  }
  return changed?payload:null;
}
