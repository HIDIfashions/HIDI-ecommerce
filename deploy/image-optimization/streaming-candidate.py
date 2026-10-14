"""Guarded source integration. No cloud mutations; generated schema is build-only."""
from pathlib import Path
import subprocess,re,json
BASE='5db8cdf5aab8ce797d56c5d0373dd83967e67d01'
root=Path.cwd();plans={}
def once(text,old,new):
    if text.count(old)!=1:raise ValueError('Expected one anchor: '+old[:120])
    return text.replace(old,new,1)
def patch(name,fn):
    original=subprocess.check_output(['git','show',BASE+':'+name]).decode()
    desired=fn(original)
    actual=(root/name).read_text()
    if actual not in (original,desired):raise ValueError('Concurrent change: '+name)
    if actual!=desired:plans[name]=desired

def route(s):
    s=once(s,'import { uploadProductImage }','import { uploadProductImageFile }')
    s=once(s,'import { readPhotoForm, acquirePhotoUploadSlot, PhotoUploadError } from "@/lib/product-photo-upload.mjs";', 'import { readStreamedPhotoForm, acquirePhotoUploadSlot, PhotoUploadError, type DiskPhoto, type StreamedPhotoForm } from "@/lib/photo-upload-stream.mjs";\nimport { createReadStream } from "node:fs";\nimport { middleware as uploadDomainPolicy } from "@/middleware";')
    s=once(s,'const MAX_IMAGE_BYTES = 40 * 1024 * 1024;','// No fixed per-photo byte cap. Streamed ingestion checks available storage.')
    s=s.replace('file: File','file: DiskPhoto')
    s=once(s,'  const body = Buffer.from(await file.arrayBuffer());\n  const payloadHash = sha256Hex(body);','  const body = createReadStream(file.path);\n  const payloadHash = file.sha256;')
    s=once(s,'      "Content-Type": file.type,','      "Content-Type": file.type,\n      "Content-Length": String(file.size),')
    s=once(s,'    signal: AbortSignal.timeout(90_000),\n  });','    signal: AbortSignal.timeout(600_000),\n    duplex: "half",\n  } as RequestInit & { duplex: "half" });')
    s=once(s,'    body,\n    signal:', '    body: body as unknown as BodyInit,\n    signal:')
    # Reuse the identical domain/validation policy after bypassing only the
    # middleware upload-body clone. This is NOT an authentication bypass.
    s=s.replace('  if (!isAdminRequest(request)) return NextResponse.json', '  const domainPolicy = uploadDomainPolicy(request);\n  if (domainPolicy.status !== 200) return domainPolicy;\n  if (!isAdminRequest(request)) return NextResponse.json')
    s=once(s,'  let releasePhotoUpload: (() => void) | undefined;','  let releasePhotoUpload: (() => void) | undefined;\n  let photoForm: StreamedPhotoForm | undefined;')
    s=once(s,'    const form = await readPhotoForm(request);','    const form = await readStreamedPhotoForm(request);\n    photoForm = form;')
    s=once(s,'    if (!(file instanceof File))','    if (!file || typeof file === "string")')
    s=once(s,'    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {\n      return NextResponse.json({ message: "Image must be no larger than 40 MiB" }, { status: 400 });\n    }','    if (!Number.isSafeInteger(file.size) || file.size < 1) {\n      return NextResponse.json({ message: "Choose a valid non-empty photo" }, { status: 400 });\n    }')
    s=once(s,'sha256Hex(Buffer.from(await file.arrayBuffer()))','file.sha256')
    s=once(s,'await uploadProductImage(objectKey(variantId, file.type, uploadKey), Buffer.from(await file.arrayBuffer()), file.type)','await uploadProductImageFile(objectKey(variantId, file.type, uploadKey), file, file.type)')
    s=once(s,'  } finally {\n    releasePhotoUpload?.();','  } finally {\n    try { await photoForm?.cleanup(); } finally { releasePhotoUpload?.(); }')
    return s
patch('apps/web/app/api/admin/inventory/[variantId]/images/route.ts',route)

def azure(s):
    return s+'\nimport { uploadDiskPhotoToBlob } from "./photo-azure-stream.mjs";\nimport type { DiskPhoto } from "./photo-upload-stream.mjs";\n\nexport async function uploadProductImageFile(key: string, photo: DiskPhoto, contentType: string) {\n  if (!key.startsWith("products/") || key.includes("..")) throw new Error("Invalid product image key");\n  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\\/$/, "");\n  if (!base || !base.startsWith("https://")) throw new Error("MEDIA_PUBLIC_BASE_URL must be an HTTPS media origin");\n  const blob = productMediaContainer().getBlockBlobClient(key);\n  await uploadDiskPhotoToBlob(blob, photo, contentType);\n  return { url: `${base}/${key}`, storagePath: `azure://product-media/${key}` };\n}\n'
patch('apps/web/lib/azure-blob.ts',azure)
patch('apps/web/middleware.ts',lambda s:once(s,'_next/static|_next/image|favicon.ico','_next/static|_next/image|favicon.ico|api/admin/inventory/[^/]+/images$'))

def batch(s):
    s=once(s,'export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;','// Numeric representation bound, not a file-size policy.\nexport const MAX_PHOTO_BYTES = Number.MAX_SAFE_INTEGER;')
    s=once(s,'file.size < 1 || file.size > MAX_PHOTO_BYTES','!Number.isSafeInteger(file.size) || file.size < 1')
    s=s.replace('choose a non-empty photo no larger than 40 MiB','choose a valid non-empty photo')
    return once(s,'180_000','600_000')
patch('apps/web/lib/sku-photo-batch.ts',batch)
def bulk(s):
    s=once(s,'const MAX_FILE = 40 * 1024 * 1024;','// No per-photo byte cap; batch and ZIP resource protections are retained.')
    s=once(s,'else if (file.size > MAX_FILE) error = "Image exceeds 40 MiB.";','else if (!Number.isSafeInteger(file.size)) error = "Invalid image size.";')
    return s
patch('apps/web/lib/hidi-bulk-photos.ts',bulk)
def mapped(s):
    s='import { photoDigest } from "../../apps/web/lib/photo-digest.mjs";\n'+s
    s=once(s,"item.file.size < 1 || item.file.size > 40 * 1024 * 1024","!Number.isSafeInteger(item.file.size) || item.file.size < 1")
    s=s.replace('Each image must be between 1 byte and 40 MiB.','Choose a valid non-empty image.')
    s=once(s,"const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await item.file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('');","const digest = await photoDigest(item.file);")
    return once(s,'AbortSignal.timeout(180000)','AbortSignal.timeout(600000)')
patch('deploy/admin-tools/image-sku-client.mjs',mapped)
def api(s):
    s=once(s,'const sizeBytes = Number(input.sizeBytes);','const sizeBytes = input.sizeBytes;')
    s=once(s,'!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 40 * 1024 * 1024','typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1')
    s=once(s,'Image must be no larger than 40 MiB','Choose a valid non-empty photo')
    s=once(s,'maxBytes: sizeBytes,','maxBytes: BigInt(sizeBytes),')
    return s
patch('apps/api/src/admin/admin-inventory.service.ts',api)
def schema(s):
    pattern=r'(maxBytes\s+)Int(\b)'
    if len(re.findall(pattern,s))!=1:raise ValueError('Expected exactly one upload-ticket byte-count column')
    return re.sub(pattern,r'\1BigInt\2',s)
patch('apps/api/prisma/schema.prisma',schema)
plans['apps/api/prisma/migrations/20261015020000_photo_ticket_bigint/migration.sql']='-- Expand upload byte accounting; no catalogue or order rows are changed.\nALTER TABLE [dbo].[AdminMediaUploadTicket] ALTER COLUMN [maxBytes] BIGINT NOT NULL;\n'

def images(s):
    s=once(s,"import { createHash } from 'node:crypto';","import { createHash } from 'node:crypto';\nimport { downloadPhotoToDisk } from './photo-disk.mjs';")
    s=once(s,"if (!Buffer.isBuffer(input) || !input.length || input.length > SOURCE_LIMIT) throw new Error('Invalid product photo size');","if (Buffer.isBuffer(input)) {\n    if (!input.length || input.length > SOURCE_LIMIT) throw new Error('Invalid in-memory photo size');\n  } else if (typeof input === 'string') {\n    const file = await stat(input); if (!file.isFile() || file.size < 1) throw new Error('Invalid product photo file');\n  } else throw new Error('Invalid product photo input');")
    s=once(s,'const jpeg = input[0] === 0xff && input[1] === 0xd8;','const jpeg = metadata.format === "jpeg";')
    s=once(s,"const bytes = await resizedImage(sharp,original,width,'webp',92);\n      await save(key,bytes); return bytes;","try {\n        const bytes = await resizedImage(sharp,original?.path || original,width,'webp',92);\n        await save(key,bytes); return bytes;\n      } finally { await original?.cleanup?.(); }")
    s=once(s,"const fetchSource = providedFetch || (async source => boundedBody(await fetch(new URL(source,origin), { signal:AbortSignal.timeout(60000), redirect:'error' })));","const fetchSource = providedFetch || (async source => {\n    const signal = AbortSignal.timeout(300000);\n    return downloadPhotoToDisk(await fetch(new URL(source,origin), {signal,redirect:'error'}), {signal});\n  });")
    return s
patch('deploy/collection-speed/images.mjs',images)

# Declarations preserve full Next type checking for shared ESM helpers.
plans['apps/web/lib/photo-upload-stream.d.mts']='''export type DiskPhoto = { path: string; size: number; type: string; name: string; sha256: string; cleanup: () => Promise<void> };
export type StreamedPhotoForm = { get(name: string): DiskPhoto | string | null; cleanup(): Promise<void> };
export { PhotoUploadError, acquirePhotoUploadSlot } from './product-photo-upload.mjs';
export function readStreamedPhotoForm(request: Request): Promise<StreamedPhotoForm>;
'''
plans['apps/web/lib/photo-azure-stream.d.mts']='''import type { BlockBlobClient } from '@azure/storage-blob';
import type { DiskPhoto } from './photo-upload-stream.mjs';
export function uploadDiskPhotoToBlob(blob: BlockBlobClient, photo: DiskPhoto, contentType: string, options?: { signal?: AbortSignal }): Promise<void>;
'''
plans['apps/web/lib/photo-digest.d.mts']='export function photoDigest(file: Blob): Promise<string>;\n'

def uploadtests(s):
    s=once(s,'assert.equal(batch.MAX_PHOTO_BYTES,max);','assert.equal(batch.MAX_PHOTO_BYTES,Number.MAX_SAFE_INTEGER);')
    s=once(s,'for(const size of [max+1,0,-1])','for(const size of [0,-1,NaN,Infinity,1.5])')
    s=s.replace('/no larger than 40 MiB/','/valid non-empty photo/')
    s=s.replace('single-SKU photo selection accepts exactly 40 MiB and still rejects a larger member before the batch starts','single-SKU selection accepts large photos and rejects invalid sizes before uploading')
    s=once(s,'batch.validatePhotoSelection([{name:"photo",size:max,type}]);','for (const size of [1,max,max+1,100*1024*1024,3*1024*1024*1024]) batch.validatePhotoSelection([{name:"photo",size,type}]);')
    s=s.replace('const [accepted,rejected]','const [accepted,larger]')
    s=once(s,'  assert.equal(rejected.error,"Each image must be between 1 byte and 40 MiB.");\n  assert.equal(rejected.variantId,"fixture_variant");','  assert.equal(larger.error,null);\n  assert.equal(larger.variantId,"fixture_variant");\n  assert.equal(larger.sequence,2);')
    s=s.replace('bulk photos accept the 40 MiB boundary without changing SKU matching or batch limits','bulk photos accept files above the former 40 MiB cap with correct SKU mapping')
    return s
patch('tests/photo-upload-client.test.cjs',uploadtests)
def apitests(s):
    s=s.replace('[5, 8, 10, 12, 30, 40].map(n => n * 1024 * 1024)','[5, 8, 10, 12, 30, 40, 41, 60, 100, 3072].map(n => n * 1024 * 1024)')
    s=s.replace('writes.at(-1).maxBytes, sizeBytes','writes.at(-1).maxBytes, BigInt(sizeBytes)').replace('writes.length, 24','writes.length, 40')
    s=s.replace('[MAX + 1, 41 * 1024 * 1024, 0, -1, NaN, Infinity, 1.5]','[0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]')
    s=s.replace('/no larger than 40 MiB/','/valid non-empty photo/').replace('oversize, empty and malformed sizes','empty, unrepresentable and malformed sizes')
    s=s.replace('photo tickets accept 5, 8, 10, 12, 30 and exactly 40 MiB for all retained formats','photo tickets accept 5 through 100 MiB and 3 GiB declarations for retained formats')
    return s
patch('tests/photo-upload-limit.test.ts',apitests)
# Existing 40 MiB buffered-parser compatibility tests stay intact. The production
# route now uses the streamed parser, tested separately above and below 40 MiB.
for folder in ['apps/web/components','apps/web/app/admin']:
    for p in (root/folder).rglob('*.tsx'):
        text=p.read_text();desired=text.replace('up to 40 MiB each','no fixed file-size cap').replace('max 40 MiB each','no fixed file-size cap')
        if desired!=text:plans[str(p.relative_to(root))]=desired
for name,text in plans.items():
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
Path('streaming-source-report.json').write_text(json.dumps({'base':BASE,'files':list(plans),'productionChanged':False,'databaseMigrationApplied':False},indent=2))
print(json.dumps({'preparedFiles':list(plans),'productionChanged':False}))
