import unittest
from patch import reviewed_home_hook,with_landing_card_sizes

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

    def test_landing_card_sizes_change_is_scoped_to_media_slots(self):
        anchor='    sizes: props.sizes || "(max-width: 700px) 100vw, (max-width: 1100px) 60vw, 50vw",'
        result=with_landing_card_sizes('before\n'+anchor+'\nafter')
        self.assertIn('props["data-landing-media-slot"]',result)
        self.assertIn('25vw',result)
        self.assertEqual(result.count('25vw'),1)
        with self.assertRaises(AssertionError):with_landing_card_sizes(anchor+anchor)

if __name__=='__main__':unittest.main()
