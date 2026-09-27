// Copies only existing public catalogue images to the private Azure media container.
import sql from 'mssql';
import {DefaultAzureCredential} from '@azure/identity';
import {BlobServiceClient} from '@azure/storage-blob';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const digest=b=>createHash('sha256').update(b).digest('hex');
const types=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);
const pool=await new sql.ConnectionPool({server:process.env.AZURE_SQL_SERVER,database:process.env.AZURE_SQL_DATABASE,authentication:{type:'azure-active-directory-default',options:{clientId:process.env.AZURE_CLIENT_ID}},options:{encrypt:true,trustServerCertificate:false},pool:{max:2,min:0},requestTimeout:120000}).connect();
const container=new BlobServiceClient(`https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,new DefaultAzureCredential()).getContainerClient('product-media');
let copied=0, archivedMissing=0;
try {
 for(const table of ['ProductImage','ProductVariantImage']) {
  const rows=(await pool.request().query(table==='ProductImage' ? 'SELECT i.[id],i.[url],p.[status] AS productStatus FROM [dbo].[ProductImage] i JOIN [dbo].[Product] p ON p.id=i.productId' : 'SELECT i.[id],i.[url],p.[status] AS productStatus FROM [dbo].[ProductVariantImage] i JOIN [dbo].[ProductVariant] v ON v.id=i.variantId JOIN [dbo].[Product] p ON p.id=v.productId')).recordset;
  for(const row of rows) {
   if(row.url.startsWith('/media/products/')) continue;
   const url=new URL(row.url,'https://www.thehidi.com');
   const allowed=url.protocol==='https:' && !url.username && !url.password && !url.search &&
     ((url.hostname==='cxncbuducljauadcuvnu.supabase.co' && url.pathname.startsWith('/storage/v1/object/public/hidi-products/')) ||
     (url.hostname==='www.thehidi.com' && url.pathname.startsWith('/products/')));
   if(!allowed) throw new Error('Source image outside catalogue allowlist');
   let bytes,type;
   if(url.hostname==='www.thehidi.com') {
     const relative=decodeURIComponent(url.pathname);
     if(relative.split('/').some(p=>p==='..'||p==='.'||p.includes('\\'))) throw new Error('Unsafe source path');
     const file=path.join('/app/catalogue-public',relative);
     try {bytes=await readFile(file);} catch(e) {
       if(e.code==='ENOENT'&&row.productStatus==='ARCHIVED'){archivedMissing++;continue;}
       throw new Error('Required source image is missing');
     }
     type=({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif'})[path.extname(file).toLowerCase()];
   } else {
     const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
     type=response.headers.get('content-type')?.split(';')[0];
     if(!response.ok || !types.has(type) || Number(response.headers.get('content-length'))>8*1024*1024) throw new Error('Image fetch failed validation');
     const chunks=[];let size=0;
     for await(const part of response.body){size+=part.length;if(size>8*1024*1024)throw new Error('Image size exceeds migration limit');chunks.push(part);}
     bytes=Buffer.concat(chunks);
   }
   if(!types.has(type)||!bytes.length||bytes.length>8*1024*1024) throw new Error('Invalid catalogue image');
   const sha=digest(bytes),key=`products/migrated/${sha}.${types.get(type)}`;
   const blob=container.getBlockBlobClient(key);
   if(!(await blob.exists())) await blob.uploadData(bytes,{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:type,blobCacheControl:'public, max-age=31536000, immutable'},metadata:{sha256:sha}});
   if(digest(await blob.downloadToBuffer())!==sha) throw new Error('Copied image checksum mismatch');
   const req=pool.request().input('id',sql.NVarChar(64),row.id).input('old',sql.NVarChar(sql.MAX),row.url).input('url',sql.NVarChar(sql.MAX),`/media/${key}`);
   if(table==='ProductVariantImage') req.input('path',sql.NVarChar(sql.MAX),`azure://product-media/${key}`);
   const result=await req.query(`UPDATE [dbo].[${table}] SET [url]=@url${table==='ProductVariantImage'?', [storagePath]=@path':''} WHERE [id]=@id AND [url]=@old`);
   if(result.rowsAffected[0]!==1) throw new Error('Image changed during migration');
   copied++;
  }
 }
 console.log(JSON.stringify({verifiedImages:copied,preExistingMissingArchivedImages:archivedMissing,destination:'product-media'}));
} catch(e) {console.error(JSON.stringify({failed:true,code:e.code??'VALIDATION',message:e.code?'Media operation failed':e.message}));process.exitCode=1;}
finally {await pool.close();}
