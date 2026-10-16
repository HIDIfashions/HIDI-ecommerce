"""Reuse pinned, tested release safeguards without editing an existing release."""
from pathlib import Path
import hashlib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PINNED = {
    "release.py": "89411091be6ac2d50595ea2602833d6e96e1f945",
    "candidate.mjs": "69cbeb8f067502504685c75373b0804d393fb99e",
    "commerce.mjs": "02fcec26de8d7603258dfc95e3b27eb662085624",
    "guard-browser.mjs": "31d4d657fd3dbd1da3b0f7202c9c50f11cf33d26",
}

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def main():
    for name, expected in PINNED.items():
        data = (HERE.parent / "catalogue-polish" / name).read_bytes()
        assert git_blob(data) == expected, "Pinned safety helper changed: " + name
        text = data.decode().replace("catalogue-polish", "desktop-option2").replace("cataloguepolish", "desktopoption2")
        if name == "release.py":
            guard = 'len(preview["measurements"]) == 24'
            assert text.count(guard) == 1, "Responsive release gate changed"
            text = text.replace(guard, 'len(preview["measurements"]) == 72')
        (HERE / name).write_text(text)
    css = (ROOT / "apps/web/app/collections/desktop-option2.css").read_bytes()
    (HERE / "desktop-option2.css").write_bytes(css)
    print("PASS: pinned rollback, immutable-image, settings and commerce guards retained; 72 viewport gates required")

if __name__ == "__main__":
    main()
