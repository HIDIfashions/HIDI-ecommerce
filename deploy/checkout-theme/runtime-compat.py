"""Preserve legacy features while respecting React hydration and phone validation."""

def patch_checkout_runtime(source):
    changes = [
        ('    if (phone) {\n      phone.setAttribute("pattern", ',
         '    if (phone && !phone.hasAttribute("pattern")) {\n      phone.setAttribute("pattern", '),
        ('    if (!gallery || gallery.dataset.hidiArrows === "true") return;\n    const grid',
         '    if (!gallery || gallery.dataset.hidiArrows === "true") return;\n    const page = gallery.closest(".product-page");\n    if (page?.hasAttribute("data-hidi-react-pdp") && page.dataset.hidiHydrated !== "true") return;\n    const grid'),
        ('  const polishLowerPdp = () => {\n    const page = document.querySelector(".product-page");\n    if (!page) return;',
         '  const polishLowerPdp = () => {\n    const page = document.querySelector(".product-page");\n    if (!page || (page.hasAttribute("data-hidi-react-pdp") && page.dataset.hidiHydrated !== "true")) return;'),
        ('  const observer = new MutationObserver(runEnhancements);',
         '  window.addEventListener("hidi:product-ready", runEnhancements);\n  const observer = new MutationObserver(runEnhancements);'),
    ]
    result = source
    applied = []
    for original, updated in changes:
        if result.count(updated) == 1:
            assert result.count(original) == updated.count(original), "Duplicate legacy enhancer; refusing runtime change"
            continue
        assert result.count(original) == 1 and updated not in result, "Unexpected legacy enhancer; refusing runtime change"
        result = result.replace(original, updated, 1)
        applied.append((original, updated))
    restored = result
    for original, updated in reversed(applied):
        restored = restored.replace(updated, original, 1)
    assert restored == source, "Unreviewed runtime change"
    return result
