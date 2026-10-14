"""Prepare the image-only source changes; never deploy or change a production ref.
All pinned inputs are validated before writing any output. Safe to rerun.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

BASE = '586efc65657a0070475ac0e47e1fb29e79d8a821'
PINS = {
    'apps/web/next.config.ts': '55fdab0e79e2b0a6ae4bb98e18bbfb8bd2f0b987',
    'apps/web/lib/sku-photo-batch.ts': 'b7223fb172dc3a226c264df2c9af18cbabfcb6b0',
    'apps/web/lib/hidi-bulk-photos.ts': '317ca97ac49ab85bcfec8c530fa6ef79a72c032a',
    'deploy/admin-tools/image-sku-client.mjs': 'bd0ba281a707b431ea538b3664aa45477fad4589',
    'apps/api/src/admin/admin-inventory.service.ts': '91557c782b3b41ec36b76a7babb86ca48af6e5b3',
    'apps/web/app/api/admin/inventory/[variantId]/images/route.ts': 'b7aa20ae9578276355ed64d3bb09473c873ff402',
    'apps/web/lib/product-image.ts': 'a82298fc2026888cf5044f744d655f203f3eabae',
    'deploy/launch-image-repair/recovery.test.mjs': '64103fed1ce92ca49675151e5f30345014c331f4',
}

def blob_hash(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Expected exactly one source anchor: ' + old[:120])
    return text.replace(old, new, 1)

def transform(name, text):
    if name.endswith('next.config.ts'):
        text = once(text, 'Allow a 12 MB photo', 'Allow a 40 MiB photo')
        return once(text, 'proxyClientMaxBodySize: 14 * 1024 * 1024', 'proxyClientMaxBodySize: 42 * 1024 * 1024')
    if name.endswith('product-image.ts'):
        # Preserve the established display URL path; invalidate browser/CDN image
        # caches using the already-supported, non-secret hidi_image query hint.
        return once(text, '  return url.pathname + url.search;', '  url.searchParams.set("hidi_image", "3");\n  return url.pathname + url.search;')
    if name.endswith('recovery.test.mjs'):
        return once(text,
            '.rotate().resize({width:640,withoutEnlargement:true}).webp({quality:75,effort:2})',
            ".rotate().resize({width:640,height:1280,fit:'inside',withoutEnlargement:true}).withIccProfile('srgb').webp({quality:75,effort:2})")
    text = once(text, '12 * 1024 * 1024', '40 * 1024 * 1024')
    if '12 MB' not in text:
        raise ValueError('Photo size label missing: ' + name)
    text = text.replace('12 MB', '40 MiB')
    if name.endswith('sku-photo-batch.ts'):
        text = once(text, '90_000', '180_000')
    if name.endswith('image-sku-client.mjs'):
        text = once(text, 'AbortSignal.timeout(90000)', 'AbortSignal.timeout(180000)')
    if name.endswith('/images/route.ts'):
        text = once(text, 'export const runtime = "nodejs";',
            'import { readPhotoForm, acquirePhotoUploadSlot, PhotoUploadError } from "@/lib/product-photo-upload.mjs";\n\nexport const runtime = "nodejs";')
        text = once(text, '  const { variantId } = await context.params;\n\n  try {',
            '  const { variantId } = await context.params;\n  let releasePhotoUpload: (() => void) | undefined;\n\n  try {')
        text = once(text, '    const form = await request.formData();',
            '    releasePhotoUpload = acquirePhotoUploadSlot();\n    const form = await readPhotoForm(request);')
        text = once(text,
            '      { message: error instanceof Error ? error.message : "Unable to upload SKU photo" },\n      { status: 502 },\n    );\n  }',
            '      { message: error instanceof Error ? error.message : "Unable to upload SKU photo" },\n      { status: error instanceof PhotoUploadError ? error.status : 502 },\n    );\n  } finally {\n    releasePhotoUpload?.();\n  }')
    return text

def prepare(root):
    plans = {}
    for name, expected in PINS.items():
        original = subprocess.check_output(['git', 'show', BASE + ':' + name], cwd=root)
        if blob_hash(original) != expected:
            raise ValueError('Pinned source hash differs: ' + name)
        desired = transform(name, original.decode()).encode()
        actual = (root / name).read_bytes()
        if actual not in (original, desired):
            raise ValueError('Concurrent source change; review before applying: ' + name)
        if actual != desired:
            plans[name] = desired
    # Copy-only admin instructions. ZIP, video, document and other limits stay intact.
    labels = {'up to 12 MB each': 'up to 40 MiB each', 'max 12 MB each': 'max 40 MiB each'}
    for folder in (root / 'apps/web/components', root / 'apps/web/app/admin'):
        if not folder.exists():
            continue
        for file in folder.rglob('*.tsx'):
            name = file.relative_to(root).as_posix()
            original = file.read_text()
            desired = original
            for before, after in labels.items():
                desired = desired.replace(before, after)
            if original != desired:
                plans[name] = desired.encode()
    return plans

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', default='image-source-report.json')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    plans = prepare(root)  # Validate EVERY input before the first write.
    if args.apply:
        for name, data in plans.items():
            (root / name).write_bytes(data)
    report = {'base': BASE, 'applied': args.apply, 'productionDeployment': False,
              'files': {name: {'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(plans.items())}}
    (root / args.report).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
