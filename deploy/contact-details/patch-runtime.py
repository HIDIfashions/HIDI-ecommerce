"""Replace only the compiled Contact HIDI section, preserving all other runtime files."""
from pathlib import Path
import json
import re

PAGE = 'apps/web/.next/server/app/contact/page.js'
INTRO = 'Direct support is not open in this preview.'
GUIDANCE = 'For an order enquiry, keep your order number and the affected item or size ready. Do not share card details, passwords or payment OTPs.'
DETAILS = '<p><strong>WhatsApp:</strong> <a href="https://wa.me/917093709353" target="_blank" rel="noopener noreferrer">+91 70937 09353</a></p><p><strong>Mobile:</strong> <a href="tel:+917093709353">+91 70937 09353</a></p><p><strong>Email:</strong> <a href="mailto:contact@hidiindia.com">contact@hidiindia.com</a></p><address style="font-style:normal;line-height:1.6"><strong>Contact Address:</strong><br>Flat No. 704, Hyma Arcade<br>Khanamet, Ayyappa Society, Madhapur<br>Hyderabad, Telangana – 500081<br>India</address>'
SECTION = re.compile(r'\(0,([\w$]+)\.jsxs\)\("section",\{className:([^,]+),"aria-label":"Contact HIDI",children:\[')

def call_end(source, start):
    stack = []
    quote = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if quote:
            if escaped: escaped = False
            elif char == '\\': escaped = True
            elif char == quote: quote = None
            continue
        if char in '\"\'`': quote = char
        elif char in '([{': stack.append(char)
        elif char in ')]}':
            assert stack and stack.pop() == {')':'(',']':'[','}':'{'}[char], 'Contact expression delimiter mismatch'
            if not stack: return index + 1
    raise AssertionError('Contact expression did not terminate')

def patch_text(source):
    matches = list(SECTION.finditer(source))
    assert len(matches) == 1, 'Exactly one existing Contact HIDI section required'
    match = matches[0]
    jsx, class_name = match.groups()
    end = call_end(source, match.start() + len('(0,'+jsx+'.jsxs)'))
    before = source[match.start():end]
    assert INTRO in before and GUIDANCE in before and 'Talk to HIDI' in before, 'Reviewed contact placeholder and safety guidance required'
    render = lambda tag, props: '(0,'+jsx+'.jsx)('+json.dumps(tag)+','+props+')'
    children = [render('h2','{children:"Talk to HIDI"}'),
                render('div','{dangerouslySetInnerHTML:{__html:'+json.dumps(DETAILS,ensure_ascii=False)+'}}'),
                render('p','{children:'+json.dumps(GUIDANCE)+'}')]
    after = '(0,'+jsx+'.jsxs)("section",{className:'+class_name+',"aria-label":"Contact HIDI",children:['+','.join(children)+']})'
    updated = source[:match.start()] + after + source[end:]
    assert updated[:match.start()] == source[:match.start()]
    assert updated[match.start()+len(after):] == source[end:]
    return updated

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = (base/PAGE).read_text()
    target = overlay/PAGE
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(patch_text(original))
    return {'passed':True,'allowedFiles':[PAGE],'contactSectionOnly':True,
            'phone':'+917093709353','email':'contact@hidiindia.com',
            'address':'Flat No. 704, Hyma Arcade, Khanamet, Ayyappa Society, Madhapur, Hyderabad, Telangana – 500081, India',
            'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
