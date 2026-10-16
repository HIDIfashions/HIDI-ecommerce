"""Overlay three reviewed source changes onto the retained live Next build."""
import hashlib
import json
from pathlib import Path
import re


COLLECTION_FILE = "apps/web/.next/server/app/collections/[slug]/page.js"
PHOTO_FILE = "apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js"
IMPORT_FILE = "apps/web/.next/server/app/admin/import/page.js"
CURRENT_LABELS = (
    '{all:{title:"Shop All",copy:"Explore the complete HIDI edit in one place."},'
    '"new-arrivals":{title:"New Arrivals",copy:"Fresh HIDI pieces, added in small considered edits."},'
    '"work-edit":{title:"Workwear Edit",copy:"Polished Indian wear for meetings, commutes and everything after."},'
    'everyday:{title:"Everyday",copy:"Easy silhouettes designed to earn their place in your weekly rotation."},'
    'occasion:{title:"Occasion",copy:"Elevated colour and detail, without the noise."}}'
)
NEW_LABELS = {
    "casual-wear": {"title": "Casual Wear", "copy": "Easy HIDI styles for everyday plans."},
    "work-wear": {"title": "Work Wear", "copy": "Considered Indian wear for your working week."},
    "occasional-wear": {"title": "Occasional Wear", "copy": "HIDI styles for celebrations and special occasions."},
    "ananyas-pick": {"title": "Ananya’s Pick", "copy": "Ananya’s selected styles from Casual, Work and Occasional Wear."},
}
IDENTIFIER = r"[A-Za-z_$][\w$]*"
PHOTO_ANCHOR = re.compile(r'applyToColor:"true"===String\((?P<form>' + IDENTIFIER + r')\.get\("applyToColor"\)\?\?"false"\)')
REPORT_ANCHOR = re.compile(
    r'message:`\$\{(?P<product>' + IDENTIFIER + r')\.name\} \\xb7 '
    r'\$\{(?P<variant>' + IDENTIFIER + r')\.color\}/\$\{(?P=variant)\.size\} \\xb7 '
    r'\$\{(?P=variant)\.sku\}: \$\{' + IDENTIFIER + r'\}\.`'
)


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def patch_web(base: Path, overlay: Path) -> dict:
    base, overlay = Path(base), Path(overlay)
    tree = base / "apps/web/.next"
    assert tree.is_dir() and (base / "apps/web/server.js").is_file(), "Retained standalone Next build required"
    original = {}
    for file in tree.rglob("*"):
        if file.is_file() and not file.is_symlink() and file.suffix in {".js", ".json", ".html", ".rsc", ".meta"}:
            original[file.relative_to(base).as_posix()] = file.read_bytes().decode("utf-8")
    for name in (COLLECTION_FILE, PHOTO_FILE, IMPORT_FILE):
        assert name in original, "Expected retained module is missing: " + name

    semantic = dict(original)
    changes_by_file = {}
    counts = {"collectionLabels": 0, "mainPhotoPayload": 0, "nativeImportReport": 0}
    # Match the entire known labels object, including its five existing entries.
    # A different live taxonomy aborts rather than guessing where to inject keys.
    label_pattern = re.compile(r"(?P<assignment>\b" + IDENTIFIER + r"\s*=\s*)" + re.escape(CURRENT_LABELS))
    label_matches = list(label_pattern.finditer(original[COLLECTION_FILE]))
    assert len(label_matches) == 1, "Expected one exact retained collection-label object"
    extra = json.dumps(NEW_LABELS, ensure_ascii=True, separators=(",", ":"))[1:-1]
    labels = CURRENT_LABELS[:-1] + "," + extra + "}"
    semantic[COLLECTION_FILE] = label_pattern.sub(lambda match: match["assignment"] + labels, original[COLLECTION_FILE])
    counts["collectionLabels"] = 1
    changes_by_file[COLLECTION_FILE] = ["collectionLabels"]

    photo_matches = list(PHOTO_ANCHOR.finditer(original[PHOTO_FILE]))
    assert len(photo_matches) == 1, "Expected one exact retained colour photo payload"
    match = photo_matches[0]
    assert 'storagePath:' in original[PHOTO_FILE][max(0, match.start() - 150):match.start()], "Photo anchor is outside upload attachment payload"
    semantic[PHOTO_FILE] = PHOTO_ANCHOR.sub(
        lambda found: found[0] + ',isMain:"true"===String(' + found["form"] + '.get("isMain")??"false")',
        original[PHOTO_FILE],
    )
    counts["mainPhotoPayload"] = 1
    changes_by_file[PHOTO_FILE] = ["mainPhotoPayload"]

    import_files = [name for name in original if name == IMPORT_FILE or re.fullmatch(r"apps/web/\.next/static/chunks/app/admin/import/page-[a-f0-9]{16}\.js", name)]
    assert len(import_files) >= 2, "Retained native import server and browser modules required"
    for name in import_files:
        matches = list(REPORT_ANCHOR.finditer(original[name]))
        assert len(matches) == 1, "Expected one exact product/colour/size import result: " + name
        assert 'startsWith("Opening stock already")?"SKIPPED":"DONE",' in original[name][max(0, matches[0].start() - 110):matches[0].start()], "Import report anchor is outside confirmed product result"
        semantic[name] = REPORT_ANCHOR.sub(
            lambda found: 'message:`SKN ${' + found["product"] + '.skn} \\xb7 ' + found[0][len('message:`'):],
            original[name],
        )
        counts["nativeImportReport"] += 1
        changes_by_file[name] = ["nativeImportReport"]
    assert all(value > 0 for value in counts.values()), "A required source change was not found"

    # Preserve previous immutable URLs. Rewrite all retained build references,
    # including webpack's compact chunk-hash table, to new SHA-256 asset names.
    static = lambda name: name.startswith("apps/web/.next/static/") and name.endswith(".js")
    mapping = {}
    final = dict(semantic)
    for _ in range(8):
        final = dict(semantic)
        for name, value in semantic.items():
            for old, new in mapping.items():
                old_hash = re.search(r"-([a-f0-9]{16})\.js$", old)[1]
                new_hash = re.search(r"-([a-f0-9]{16})\.js$", new)[1]
                value = value.replace(old_hash, new_hash)
            final[name] = value
        updated = {}
        for name, value in final.items():
            if static(name) and value != original[name]:
                match = re.search(r"-([a-f0-9]{16})\.js$", name)
                assert match, "Changed public asset has no retained content hash: " + name
                updated[name] = name[:match.start(1)] + sha(value)[:16] + name[match.end(1):]
        if updated == mapping:
            break
        mapping = updated
    else:
        raise AssertionError("Static asset reference hashes did not settle")
    assert mapping, "Native import browser assets must receive fresh immutable URLs"

    files = {}
    for name, value in final.items():
        if value == original[name]:
            continue
        destination = mapping.get(name, name)
        if destination != name:
            assert not (base / destination).exists(), "New asset already exists: " + destination
        target = overlay / destination
        assert not target.exists(), "Another overlay already owns this retained build file: " + destination
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(value.encode("utf-8"))
        files[destination] = {"source": name, "oldSha256": sha(original[name]), "newSha256": sha(value), "sourceChanges": changes_by_file.get(name, []), "referenceOnly": name not in changes_by_file}
    return {"passed": True, "sourceChanges": counts, "renamedAssets": mapping, "files": files,
            "allowedFiles": sorted(files), "oldAssetsRetained": True, "unchangedUploadLimits": True,
            "collectionAliases": list(NEW_LABELS), "unrelatedBuildFilesPreserved": True}


if __name__ == "__main__":
    import sys
    report = patch_web(Path(sys.argv[1]), Path(sys.argv[2]))
    Path(sys.argv[3]).write_text(json.dumps(report, indent=2))
