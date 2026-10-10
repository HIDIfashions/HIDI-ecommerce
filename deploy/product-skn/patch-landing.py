"""Add Ananya's Pick links to the exact retained Vite bundle, without rebuilding."""
import hashlib
import json
from pathlib import Path

BASE_BUNDLE = "dist/assets/index-BQ9NoW0w.js"
BASE_SHA256 = "c1c65750a9707d9a0fed1b62031f405bc4c004a50400980474e3f30ab1d1db31"
CTA_BEFORE = 'className:"button button--gold meet-cinematic__button",href:"/collections/all"'
CTA_AFTER = CTA_BEFORE.replace('/collections/all', '/collections/ananyas-pick')
MENU_BEFORE = ('o.jsxs("nav",{className:"campaign-panel-nav","aria-label":"Explore HIDI",children:['
               'o.jsxs("a",{href:Ar(),children:["Our Collections ",o.jsx(ie,{name:"arrow"})]}),'
               'o.jsxs("a",{href:Ar("occasion"),children:["Occasion Collection ",o.jsx(ie,{name:"arrow"})]})]})')
MENU_LINK = 'o.jsxs("a",{href:"/collections/ananyas-pick",children:["Ananya\'s Pick ",o.jsx(ie,{name:"arrow"})]})'
MENU_AFTER = MENU_BEFORE[:-3] + ',' + MENU_LINK + ']})'
BANNER_CTA = 'className:"button button--burgundy edit-campaign__button",href:"/collections/all"'


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def patch_bundle(content: bytes) -> bytes:
    assert sha256(content) == BASE_SHA256, "Retained landing bundle differs from the verified backup; stop for review"
    text = content.decode("utf-8")
    assert text.count(CTA_BEFORE) == text.count(MENU_BEFORE) == 1, "Ananya CTA/menu anchors must each occur once"
    assert text.count(BANNER_CTA) == 1, "Separate Shop All campaign CTA must be present"
    cta_at = text.index(CTA_BEFORE)
    assert 'className:"ananya-section-heading"' in text[max(0, cta_at - 700):cta_at], "CTA is not inside Ananya's Pick"
    assert 'children:"Ananya\'s Pick"' in text[max(0, cta_at - 700):cta_at], "Ananya heading context missing"
    changed = text.replace(CTA_BEFORE, CTA_AFTER).replace(MENU_BEFORE, MENU_AFTER)
    assert changed.count(BANNER_CTA) == 1, "Unrelated campaign CTA changed"
    assert changed.count('href:"/collections/ananyas-pick"') == 2, "Expected exactly two Ananya links"
    assert changed.replace(CTA_AFTER, CTA_BEFORE).replace(MENU_AFTER, MENU_BEFORE) == text, "Unexpected landing edit"
    return changed.encode("utf-8")


def patch_landing(base: Path, overlay: Path) -> dict:
    bundle = base / BASE_BUNDLE
    index = base / "dist/index.html"
    assert bundle.is_file() and not bundle.is_symlink(), "Verified retained landing bundle required"
    assert index.is_file() and not index.is_symlink(), "Retained landing index required"
    old = bundle.read_bytes()
    new = patch_bundle(old)
    destination = "dist/assets/index-" + sha256(new)[:16] + ".js"
    assert not (base / destination).exists(), "New immutable landing asset already exists; stop for review"
    html = index.read_bytes()
    before = ("./assets/" + Path(BASE_BUNDLE).name).encode("ascii")
    after = ("./assets/" + Path(destination).name).encode("ascii")
    assert html.count(before) == 1, "Live landing index must reference the verified bundle exactly once"
    updated_html = html.replace(before, after)
    assert updated_html.replace(after, before) == html, "Unrelated landing index edit"
    files = {}
    for target_name, source_name, content, original in [
        (destination, BASE_BUNDLE, new, old),
        ("dist/index.html", "dist/index.html", updated_html, html),
    ]:
        target = overlay / target_name
        assert not target.exists(), "Landing overlay target already exists: " + target_name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        files[target_name] = {"source": source_name, "oldSha256": sha256(original), "newSha256": sha256(content)}
    assert bundle.read_bytes() == old and index.read_bytes() == html, "Captured baseline changed"
    return {
        "passed": True,
        "changes": {"ananyaShopCta": 1, "ananyaMenuLink": 1},
        "files": files,
        "allowedFiles": sorted(files),
        "renamedAssets": {BASE_BUNDLE: destination},
        "oldAssetsRetained": True,
        "existingCategoryViewsRetained": True,
        "unrelatedBannerRetained": True,
        "otherStylesMediaAndDataPreserved": True,
    }


if __name__ == "__main__":
    import sys
    report = patch_landing(Path(sys.argv[1]), Path(sys.argv[2]))
    Path(sys.argv[3]).write_text(json.dumps(report, indent=2) + "\n")
