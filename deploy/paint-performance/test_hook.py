import unittest
from patch import reviewed_home_hook

class HomeHookTests(unittest.TestCase):
    def test_preserves_both_reviewed_homepage_wrappers(self):
        plain='    if (pathname === "/") html = optimizeHomeHead(html);'
        seo='    if (pathname === "/") html = addHomeDiscovery(optimizeHomeHead(html));'
        for anchor,expected in [(plain,False),(seo,True)]:
            runtime='before\n'+anchor+'\nafter'
            self.assertEqual(reviewed_home_hook(runtime),(anchor,expected))
    def test_ambiguous_or_changed_wrappers_cannot_be_released(self):
        plain='    if (pathname === "/") html = optimizeHomeHead(html);'
        seo='    if (pathname === "/") html = addHomeDiscovery(optimizeHomeHead(html));'
        for runtime in ['',plain+plain,plain+seo,seo+seo]:
            with self.assertRaises(AssertionError):reviewed_home_hook(runtime)

if __name__=='__main__':unittest.main()
