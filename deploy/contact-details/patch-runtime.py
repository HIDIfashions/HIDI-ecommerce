"""Add only four contact label icons to the reviewed live business contact card."""
from pathlib import Path
import json

PAGE = 'apps/web/.next/server/app/contact/page.js'
PLAIN_DETAILS = '<p><strong>WhatsApp:</strong> <a href="https://wa.me/917093709353" target="_blank" rel="noopener noreferrer">+91 70937 09353</a></p><p><strong>Mobile:</strong> <a href="tel:+917093709353">+91 70937 09353</a></p><p><strong>Email:</strong> <a href="mailto:Contact@hidiindia.com">Contact@hidiindia.com</a></p><address style="font-style:normal;line-height:1.6"><strong>Contact Address:</strong><br>Flat No. 704, Hyma Arcade<br>Khanamet, Ayyappa Society, Madhapur<br>Hyderabad, Telangana – 500081<br>India</address>'
ICONS = {'whatsapp': ['M3 21l1.65-3.8a9 9 0 1 1 3.15 3.15L3 21', 'M9 8h1l1 3-1 1a6 6 0 0 0 2 2l1-1 3 1v1a1 1 0 0 1-1 1 8 8 0 0 1-7-7 1 1 0 0 1 1-1Z'], 'phone': ['M5 4h4l2 5-2 1.5a11 11 0 0 0 4.5 4.5L15 13l5 2v4a1 1 0 0 1-1 1C10.7 20 4 13.3 4 5a1 1 0 0 1 1-1Z'], 'email': ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'm3 7 9 6 9-6'], 'address': ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z', 'M15 10a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z']}

def icon(kind):
    paths = ''.join('<path d="'+path+'" />' for path in ICONS[kind])
    return '<svg data-hidi-contact-icon="'+kind+'" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px;flex-shrink:0">'+paths+'</svg>'

DETAILS = PLAIN_DETAILS
for label, kind in [('WhatsApp','whatsapp'),('Mobile','phone'),('Email','email'),('Contact Address','address')]:
    DETAILS = DETAILS.replace('<strong>'+label+':</strong>', '<strong>'+icon(kind)+label+':</strong>', 1)

def patch_text(source):
    original = json.dumps(PLAIN_DETAILS, ensure_ascii=False)
    updated = json.dumps(DETAILS, ensure_ascii=False)
    assert source.count(original) == 1, 'One reviewed live contact card required'
    result = source.replace(original, updated, 1)
    assert result.replace(updated, original, 1) == source, 'Unrelated compiled page bytes changed'
    return result

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    target = overlay/PAGE
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(patch_text((base/PAGE).read_text()))
    return {'passed':True,'allowedFiles':[PAGE],'contactIconsOnly':True,'icons':list(ICONS),
            'phone':'+917093709353','email':'Contact@hidiindia.com',
            'contactTextPreserved':True,'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
