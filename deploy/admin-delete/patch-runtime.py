"""Pass the retained fixed storefront origin to the new admin-only handler."""

def patch(source):
    old = '  if (await handleQuickTools(request, response, pathname)) return;'
    new = '  if (await handleQuickTools(request, response, pathname, { origin, hasStorefront })) return;'
    if source.count(new) == 1:
        assert old not in source, 'Mixed admin handler runtime anchors'
        return source
    assert source.count(old) == 1, 'Expected exactly one retained admin tools handler'
    assert 'const hasStorefront =' in source and 'const origin = new URL(' in source, 'Retained fixed origin missing'
    return source.replace(old, new, 1)

if __name__ == '__main__':
    import pathlib, sys
    pathlib.Path(sys.argv[2]).write_text(patch(pathlib.Path(sys.argv[1]).read_text()))
