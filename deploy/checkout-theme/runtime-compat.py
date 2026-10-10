"""Preserve the live runtime while letting checkout own its phone validation."""

def patch_checkout_phone(source):
    original = '    if (phone) {\n      phone.setAttribute("pattern", '
    updated = '    if (phone && !phone.hasAttribute("pattern")) {\n      phone.setAttribute("pattern", '
    if source.count(updated) == 1 and original not in source:
        return source
    assert source.count(original) == 1 and updated not in source, "Unexpected legacy phone enhancer; refusing runtime change"
    result = source.replace(original, updated, 1)
    assert result.replace(updated, original, 1) == source
    return result
