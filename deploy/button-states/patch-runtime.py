"""Inject the shared palette without changing retained storefront/Admin files."""

def patch_runtime(source):
    changes = [
        ('import { createHeroMediaHandler } from "./hero-media.mjs";',
         'import { createHeroMediaHandler } from "./hero-media.mjs";\nimport { injectButtonTheme, handleButtonTheme, wrapButtonTheme } from "./button-states/handler.mjs";'),
        ('function injectSeo(html, request, pathname) {\n',
         'function injectSeo(html, request, pathname) {\n  html = injectButtonTheme(html);\n'),
        ('  if (await performanceHandler.handle(request, response, pathname)) return;',
         '  if (handleButtonTheme(request, response, pathname)) return;\n  wrapButtonTheme(request, response, pathname);\n  if (await performanceHandler.handle(request, response, pathname)) return;'),
    ]
    result = source
    for before, after in changes:
        assert result.count(before) == 1 and after not in result, 'Unexpected or already patched runtime anchor'
        result = result.replace(before, after, 1)
    restored = result
    for before, after in reversed(changes):
        assert restored.count(after) == 1
        restored = restored.replace(after, before, 1)
    assert restored == source, 'Unreviewed runtime change'
    return result
