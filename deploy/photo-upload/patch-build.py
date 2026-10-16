"""Patch only photo limits in a captured live Next build; rehash changed assets."""
import hashlib
import json
from pathlib import Path
import re

MAX_PHOTO = 12 * 1024 * 1024
MAX_BODY = 14 * 1024 * 1024
LABELS = {
    "choose a non-empty photo no larger than 5 MB": "choose a non-empty photo no larger than 12 MB",
    "Image exceeds 5 MB.": "Image exceeds 12 MB.",
    "up to 5 MB each": "up to 12 MB each",
    "max 5 MB each": "max 12 MB each",
    "Image must be smaller than 8 MB": "Image must be no larger than 12 MB",
}
RULES = [
    (r"(\.size\s*>\s*)5242880(?=[^\n]{0,130}choose a non-empty photo no larger than 5 MB)", "sku"),
    (r"(\.size\s*>\s*)5242880(?=[^\n]{0,40}Image exceeds 5 MB)", "bulk"),
    (r"(\.size\s*>\s*)8388608(?=[^\n]{0,100}Image must be smaller than 8 MB)", "route"),
]


def patch_web(base: Path, overlay: Path) -> dict:
    tree = base / "apps/web/.next"
    assert tree.is_dir() and (base / "apps/web/server.js").is_file(), "Retained standalone Next build required"
    original = {}
    for file in tree.rglob("*"):
        if file.is_file() and not file.is_symlink() and file.suffix in {".js", ".json", ".html", ".rsc", ".meta"}:
            original[file.relative_to(base).as_posix()] = file.read_text()
    original["apps/web/server.js"] = (base / "apps/web/server.js").read_text()
    semantic = dict(original)
    counts = {"sku": 0, "bulk": 0, "route": 0}
    numeric_changes = {}
    for name, text in original.items():
        changed = text
        for pattern, kind in RULES:
            changed, count = re.subn(pattern, lambda m: m[1] + str(MAX_PHOTO), changed)
            counts[kind] += count
            if count:
                numeric_changes.setdefault(name, []).append(kind)
        for before, after in LABELS.items():
            changed = changed.replace(before, after)
        if name in {"apps/web/server.js", "apps/web/.next/required-server-files.json"}:
            changed, count = re.subn(r'("proxyClientMaxBodySize":\s*)10485760',
                                    lambda m: m[1] + str(MAX_BODY), changed)
            assert count == 1, "Expected single retained 10 MB proxy buffer: " + name
        semantic[name] = changed
    assert all(counts[k] > 0 for k in counts), "Photo validator not found in captured build: " + str(counts)

    # Keep old immutable assets for already-open tabs; fresh HTML gets new URLs.
    static = lambda name: name.startswith("apps/web/.next/static/") and name.endswith(".js")
    mapping = {}
    final = dict(semantic)
    for _ in range(8):
        final = dict(semantic)
        for name, text in semantic.items():
            for old, new in mapping.items():
                old_hash = re.search(r"-([a-f0-9]{16})\.js$", old)[1]
                new_hash = re.search(r"-([a-f0-9]{16})\.js$", new)[1]
                text = text.replace(old_hash, new_hash)
            final[name] = text
        updated = {}
        for name, text in final.items():
            if static(name) and text != original[name]:
                match = re.search(r"-([a-f0-9]{16})\.js$", name)
                assert match, "Changed static asset has no content hash: " + name
                new_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
                updated[name] = name[:match.start(1)] + new_hash + name[match.end(1):]
        if updated == mapping:
            break
        mapping = updated
    else:
        raise AssertionError("Static asset reference hashes did not settle")

    changes = {}
    for name, text in final.items():
        if text == original[name]:
            continue
        destination = mapping.get(name, name)
        if destination != name:
            assert not (base / destination).exists(), "New asset already exists"
        target = overlay / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        changes[destination] = {"source": name, "oldSha256": hashlib.sha256(original[name].encode()).hexdigest(),
                                "newSha256": hashlib.sha256(text.encode()).hexdigest(),
                                "photoValidators": numeric_changes.get(name, [])}
    assert mapping and "apps/web/server.js" in changes, "Changed assets and proxy configuration required"
    return {"passed": True, "photoBytes": MAX_PHOTO, "requestBodyBytes": MAX_BODY,
            "validatorChanges": counts, "renamedAssets": mapping, "files": changes,
            "oldAssetsRetained": True, "unrelatedLimitsPreserved": True}


if __name__ == "__main__":
    import sys
    report = patch_web(Path(sys.argv[1]), Path(sys.argv[2]))
    Path(sys.argv[3]).write_text(json.dumps(report, indent=2))

