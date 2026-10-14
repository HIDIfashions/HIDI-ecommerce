import {PhotoUploadError} from './product-photo-upload.mjs';
/** Verify the backend's current staff identity before accepting a large body. */
export async function authorizePhotoUpload(request,apiBase,headers,send=fetch){
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))throw new PhotoUploadError('Photo uploads must use this admin storefront.',403);
  let response;
  try{response=await send(apiBase.replace(/\/$/,'')+'/admin/me',{method:'GET',headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch{throw new PhotoUploadError('Unable to verify the admin session. Please retry.',503);}
  if([401,403].includes(response.status))throw new PhotoUploadError('Admin session expired or photo access denied.',response.status);
  if(!response.ok)throw new PhotoUploadError('Unable to verify the admin session. Please retry.',503);
  const value=await response.json().catch(()=>null);
  if(!value?.admin||typeof value.admin.id!=='string'||!value.admin.id)throw new PhotoUploadError('Admin verification response is incomplete.',503);
  // Matches backend catalog:write roles; the actual upload ticket rechecks RBAC.
  if(!['OWNER','CATALOG'].includes(value.admin.role))throw new PhotoUploadError('This staff role cannot upload product photos.',403);
}
