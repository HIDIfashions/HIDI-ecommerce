"""Append only the approved desktop CSS to the freshly captured live wrapper."""
from pathlib import Path
import hashlib
import re

HERE = Path(__file__).resolve().parent
MARKER = "/* hidi-desktop-option2-20261015 */"

def approved_css():
    css = (HERE / "desktop-option2.css").read_text()
    plain = re.sub(r"/\*.*?\*/", "", css, flags=re.S).strip()
    expected = """@media (min-width: 1051px) {
  .container.collection-page [class*="collection-browser_content__"] {
    max-width: calc(1080px + clamp(48px, 6vw, 104px));
    margin-inline: auto;
  }
}"""
    assert plain == expected, "Only the reviewed desktop sizing rule is allowed"
    return css

def patch_text(original):
    anchor = 'const storefrontLayerFix = `'
    assert original.count(anchor) == 1, "One retained storefront CSS injection block required"
    assert MARKER not in original, "Desktop Option 2 is already installed"
    start = original.index(anchor) + len(anchor)
    end = original.index("</style>", start)
    assert original[start:end].lstrip().startswith('<style data-hidi-storefront-layer-fix="true">'), "Retained style block differs"
    addition = "\n" + MARKER + "\n" + approved_css() + "\n"
    updated = original[:end] + addition + original[end:]
    assert updated.replace(addition, "", 1) == original, "Unrelated live bytes changed"
    return updated

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    source = base / "server.mjs"
    assert source.is_file() and not source.is_symlink(), "Regular live wrapper required"
    original = source.read_text()
    updated = patch_text(original)
    destination = overlay / "server.mjs"
    assert not destination.exists() and not overlay.is_symlink(), "Fresh regular overlay required"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(updated)
    return {"passed": True, "allowedFiles": ["server.mjs"], "catalogueCssOnly": True,
            "desktopOnly": True, "breakpointPx": 1051, "maxCardWidthPx": 360,
            "beforeSha256": hashlib.sha256(original.encode()).hexdigest(),
            "afterSha256": hashlib.sha256(updated.encode()).hexdigest(),
            "inverseTransformsVerified": True, "applicationJavaScriptUnchanged": True,
            "compiledNextUnchanged": True, "apiUnchanged": True, "databaseWrites": False,
            "storageWrites": False, "deploymentPerformed": False}
