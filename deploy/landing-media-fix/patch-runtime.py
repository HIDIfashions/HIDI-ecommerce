"""Surgically repair landing media delivery over an extracted live web runtime."""
from pathlib import Path
import re
import tempfile

OLD_PUBLIC_URL = '''function publicUrl(config, key) {
  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}'''

NEW_PUBLIC_URL = '''function heroAssetUrl(key) {
  return `${HERO_ASSET_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}`;
}

function publicUrl(config, key) {
  // Product photos use MEDIA_PUBLIC_BASE_URL=/media, but that Next route only
  // serves products/*. Brand CMS assets stay private and must use this
  // managed-identity proxy instead of sharing the product-media base URL.
  if (config.provider === "azure") return heroAssetUrl(key);
  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function ownedBrandKeyFromUrl(value, config) {
  if (typeof value !== "string" || !value) return "";
  let parsed;
  try {
    parsed = new URL(value, "https://hidi.invalid");
  } catch {
    return "";
  }
  const { pathname } = parsed;
  const absoluteUrl = /^[a-z][a-z\\d+.-]*:/i.test(value) || value.startsWith("//");
  const publicHosts = new Set([
    // This was HIDI's public media origin when the affected URLs were saved.
    // Keep it as an explicit, bounded migration origin even if the product
    // media base changes later.
    "https://thidigk.thehidi.com",
    config.publicBaseUrl,
    process.env.SITE_URL,
    ...(process.env.WEB_ORIGIN || "").split(","),
  ].flatMap(item => {
    try { return item ? [new URL(item).hostname] : []; } catch { return []; }
  }));

  let encodedKey = "";
  if (pathname.startsWith(HERO_ASSET_PREFIX)) {
    if (absoluteUrl && !publicHosts.has(parsed.hostname)) return "";
    encodedKey = pathname.slice(HERO_ASSET_PREFIX.length);
  } else if (pathname.startsWith("/media/brand/")) {
    if (absoluteUrl && !publicHosts.has(parsed.hostname)) return "";
    encodedKey = pathname.slice("/media/".length);
  } else {
    let blobHost = "";
    try {
      blobHost = new URL(config.blobEndpoint).hostname;
    } catch {
      return "";
    }
    const marker = ALLOWED_MEDIA_KEY_PREFIXES
      .map(prefix => `/${prefix}`)
      .find(prefix => pathname.includes(prefix));
    if (!marker || parsed.hostname !== blobHost) return "";
    encodedKey = pathname.slice(pathname.indexOf(marker) + 1);
  }

  let key;
  try {
    key = encodedKey.split("/").map(decodeURIComponent).join("/");
  } catch {
    return "";
  }
  if (
    !ALLOWED_MEDIA_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
    || key.includes("..")
    || key.includes("\\\\")
    || key.includes("\\0")
  ) return "";
  return key;
}

function canonicalMediaUrl(value) {
  let config;
  try {
    config = storageConfig();
  } catch {
    return value;
  }
  // R2 uses its public origin directly; /api/hidi/hero-asset is Azure-only.
  if (config.provider !== "azure") return value;
  const key = ownedBrandKeyFromUrl(value, config);
  return key ? heroAssetUrl(key) : value;
}'''

OLD_PUBLIC_ITEM = '  return { assetId: typeof raw.assetId === "string" ? raw.assetId : "", type: raw.type, url: raw.url,'
NEW_PUBLIC_ITEM = '  return { assetId: typeof raw.assetId === "string" ? raw.assetId : "", type: raw.type, url: canonicalMediaUrl(raw.url),'
OLD_LANDING_SLOT = '''    type: "image",
    url: raw.url,
    originalName: typeof raw.originalName === "string" ? raw.originalName : "",'''
NEW_LANDING_SLOT = '''    type: "image",
    url: canonicalMediaUrl(raw.url),
    originalName: typeof raw.originalName === "string" ? raw.originalName : "",'''
OLD_HERO_LIBRARY = '''      && ["image", "video"].includes(item.type)
    )
    : [];'''
NEW_HERO_LIBRARY = '''      && ["image", "video"].includes(item.type)
    ).map(item => ({ ...item, url: canonicalMediaUrl(item.url) }))
    : [];'''
OLD_LANDING_LIBRARY = '''      && item.type === "image"
    )
    : [];'''
NEW_LANDING_LIBRARY = '''      && item.type === "image"
    ).map(item => ({ ...item, url: canonicalMediaUrl(item.url) }))
    : [];'''

LEGACY_SLOTS = '''const slots = [
  { id:"hero", group:"Hero", name:"Homepage hero media", type:"hero", preview:"hero", accept:heroAccept, fallback:{ type:"video", url:"/assets/video/hidi-hero-desktop-luminous-v1.mp4", originalName:"Built-in cinematic hero" }, help:"Main first-screen media. Add up to 20 videos or images, arrange the order and choose automatic rotation." },
  { id:"ananya", group:"Ananya", name:"Ananya's Pick photos", preview:"ananya", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/ananya-top-picks/ananya-green.webp", originalName:"Built-in Ananya photo" }, help:"One full-page photo at a time below the Ananya’s Pick heading. Add up to 20 images and arrange the order." },
  { id:"range-occasion", group:"Range", name:"Range 01 - Occasion", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/occasion-set.webp", originalName:"Built-in occasion card" }, help:"Circular range carousel card. Use a tall product photo with breathing room." },
  { id:"range-new-arrivals", group:"Range", name:"Range 02 - New arrivals", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/peach-set.webp", originalName:"Built-in new arrivals card" }, help:"Circular range carousel card. Use a tall product photo with breathing room." },
  { id:"range-work-edit", group:"Range", name:"Range 03 - Work edit", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/cream-set.webp", originalName:"Built-in work edit card" }, help:"Circular range carousel card. Use a tall product photo with breathing room." },
  { id:"range-everyday", group:"Range", name:"Range 04 - Everyday", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/burgundy-set.webp", originalName:"Built-in everyday card" }, help:"Circular range carousel card. Use a tall product photo with breathing room." },
  { id:"range-shop-all", group:"Range", name:"Range 05 - Shop all", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/hero-portrait.webp", originalName:"Built-in shop all card" }, help:"Circular range carousel card. Use a tall product photo with breathing room." },
  { id:"hidi-edit-banner", group:"Banner", name:"Shop HIDI banner", preview:"banner", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/hidi-premium-ai-full-banner-lossless.png", originalName:"Built-in shop banner" }, help:"Wide shop banner below the range carousel. Use a clean horizontal composition." },
];'''

CURRENT_SLOTS = '''const slots = [
  { id:"hero", group:"Hero", name:"Homepage hero media", type:"hero", preview:"hero", accept:heroAccept, fallback:{ type:"video", url:"/assets/video/hidi-hero-desktop-luminous-v1.mp4", originalName:"Built-in cinematic hero" }, help:"Main first-screen media. Add up to 20 videos or images, arrange the order and choose automatic rotation." },
  { id:"range-everyday", group:"Explore our range", name:"Casual Wear category card", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/burgundy-set.webp", originalName:"Built-in casual wear card" }, help:"Casual Wear card in Explore our range. Use a tall product photo with breathing room." },
  { id:"range-work-edit", group:"Explore our range", name:"Work Wear category card", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/cream-set.webp", originalName:"Built-in work wear card" }, help:"Work Wear card in Explore our range. Use a tall product photo with breathing room." },
  { id:"range-occasion", group:"Explore our range", name:"Occasional Wear category card", preview:"carousel", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/occasion-set.webp", originalName:"Built-in occasional wear card" }, help:"Occasional Wear card in Explore our range. Use a tall product photo with breathing room." },
  { id:"ananya", group:"Ananya's Pick", name:"Ananya's Pick photos", preview:"ananya", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/ananya-top-picks/ananya-green.webp", originalName:"Built-in Ananya photo" }, help:"Full-page photos below Ananya’s Pick. The first active photo also powers the Ananya’s Pick category card." },
  { id:"hidi-edit-banner", group:"Banner", name:"Shop HIDI banner", preview:"banner", accept:imageAccept, fallback:{ type:"image", url:"/assets/images/hidi-premium-ai-full-banner-lossless.png", originalName:"Built-in shop banner" }, help:"Wide shop banner below the range carousel. Use a clean horizontal composition." },
];'''


def replace_once(text, old, new, label, changes):
    assert text.count(old) == 1, "Expected one exact " + label
    changes.append((old, new, label))
    return text.replace(old, new)


def patch_hero(source):
    text = source.decode()
    changes = []
    text = replace_once(text, OLD_PUBLIC_URL, NEW_PUBLIC_URL, "brand public URL helper", changes)
    text = replace_once(text, OLD_PUBLIC_ITEM, NEW_PUBLIC_ITEM, "public sequence item URL", changes)
    text = replace_once(text, OLD_LANDING_SLOT, NEW_LANDING_SLOT, "public landing slot URL", changes)
    text = replace_once(text, OLD_HERO_LIBRARY, NEW_HERO_LIBRARY, "hero library URL map", changes)
    text = replace_once(text, OLD_LANDING_LIBRARY, NEW_LANDING_LIBRARY, "landing library URL map", changes)
    restored = text
    for old, new, _ in reversed(changes):
        assert restored.count(new) == 1
        restored = restored.replace(new, old)
    assert restored.encode() == source, "Hero runtime inverse transform changed unrelated bytes"
    assert text.count("canonicalMediaUrl(") == 5, "Unexpected brand URL normalization surface"
    return text.encode(), [label for _, _, label in changes]


def patch_admin(source):
    text = source.decode()
    assert text.count(LEGACY_SLOTS) == 1, "Fresh Admin slots differ from the exact reviewed retained runtime"
    ids = re.findall(r'id:"([^"]+)"', LEGACY_SLOTS)
    after = text.replace(LEGACY_SLOTS, CURRENT_SLOTS)
    assert after.replace(CURRENT_SLOTS, LEGACY_SLOTS, 1) == text, "Admin slot patch changed unrelated bytes"
    assert all(label in after for label in (
        "Casual Wear category card", "Work Wear category card",
        "Occasional Wear category card", "Ananya's Pick photos",
    ))
    assert all(label not in after for label in ("Range 02 - New arrivals", "Range 05 - Shop all"))
    return after.encode(), ids


def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    hero_name = "hero-media.mjs"
    admin_name = "dist/landing-media-control.html"
    for name in (hero_name, admin_name):
        assert (base / name).is_file(), "Retained landing runtime file missing: " + name

    hero, hero_changes = patch_hero((base / hero_name).read_bytes())
    admin, retired_ids = patch_admin((base / admin_name).read_bytes())
    files = {hero_name: hero, admin_name: admin}
    for name, content in files.items():
        target = overlay / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    return {
        "passed": True,
        "allowedFiles": sorted(files),
        "heroChanges": hero_changes,
        "retiredAdminSlotIds": [value for value in retired_ids if value in {"range-new-arrivals", "range-shop-all"}],
        "activeAdminSlotIds": ["hero", "range-everyday", "range-work-edit", "range-occasion", "ananya", "hidi-edit-banner"],
        "inverseTransformsVerified": True,
        "unrelatedRuntimeBytesPreserved": True,
    }


def self_test():
    hero = "\n".join((
        OLD_PUBLIC_URL,
        "function a(){\n" + OLD_PUBLIC_ITEM + "\n}",
        "function b(){\n" + OLD_LANDING_SLOT + "\n}",
        "function c(){\n" + OLD_HERO_LIBRARY + "\n}",
        "function d(){\n" + OLD_LANDING_LIBRARY + "\n}",
    )).encode()
    patched, _ = patch_hero(hero)
    assert b'config.provider !== "azure"' in patched
    admin_fixture = ("<script>\n" + LEGACY_SLOTS + "\n</script>").encode()
    admin, _ = patch_admin(admin_fixture)
    assert b"range-shop-all" not in admin and b"Ananya's Pick photos" in admin
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        for name, content in (("hero-media.mjs", hero), ("dist/landing-media-control.html", admin_fixture)):
            path = root / "base" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        report = patch_runtime(root / "base", root / "overlay")
        assert set(report["allowedFiles"]) == {"hero-media.mjs", "dist/landing-media-control.html"}
    print("PASS: landing media patch anchors, inverse transforms and exact allowlist verified")


if __name__ == "__main__":
    self_test()
