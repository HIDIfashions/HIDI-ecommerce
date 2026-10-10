"""Add narrow policy hooks to the current live runtime; never replace its contents."""
import json
import pathlib
import sys

HOOKS = [
    ('import { createHeroMediaHandler } from "./hero-media.mjs";', 'import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";'),
    ('const handleHeroMedia = createHeroMediaHandler({ origin, hasStorefront });', 'const handlePrivacyPolicy = createPrivacyPolicyHandler({ origin, hasStorefront });\nconst privacyPolicyLinkScript = \'<script defer data-hidi-privacy-links src="/privacy-policy-assets/links.js"></script>\';\nfunction injectPrivacyPolicyLinks(html) {\n  if (html.includes("data-hidi-privacy-links")) return html;\n  return /<\\/body>/i.test(html) ? html.replace(/<\\/body>/i, privacyPolicyLinkScript + "</body>") : html + privacyPolicyLinkScript;\n}'),
    ('  if (await handleHeroMedia(request, response, pathname)) return;', '  if (await handlePrivacyPolicy(request, response, pathname)) return;'),
    ('function injectStorefrontLayerFix(html) {', '  html = injectPrivacyPolicyLinks(html);'),
    ('    html = injectSeo(html, request, pathname);', '    html = injectPrivacyPolicyLinks(html);'),
]

def patch(source):
    if 'createPrivacyPolicyHandler' in source:
        raise ValueError('Policy hooks already exist; review the live release before replacing')
    result = source
    for anchor, addition in HOOKS:
        assert result.count(anchor) == 1, 'Live runtime hook must occur exactly once: ' + anchor
        if anchor.startswith('  if (await handleHeroMedia'):
            result = result.replace(anchor, addition + '\n' + anchor)
        else:
            result = result.replace(anchor, anchor + '\n' + addition)
    # Removing the five added strings must reproduce the complete live file.
    restored = result
    for anchor, addition in reversed(HOOKS):
        sequence = addition + '\n' + anchor if anchor.startswith('  if (await handleHeroMedia') else anchor + '\n' + addition
        restored = restored.replace(sequence, anchor)
    assert restored == source, 'Existing runtime bytes changed'
    return result

if __name__ == '__main__':
    path = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    output.write_text(patch(path.read_text()))
