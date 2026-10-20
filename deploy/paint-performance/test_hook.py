import unittest
from patch import reviewed_home_hook,with_landing_card_sizes,with_deferred_media_margin,with_painted_desktop_video,REVIEWED_VIDEO_GUARD,DESKTOP_VIDEO_AFTER_PAINT,HERE

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

    def test_below_fold_media_uses_a_bounded_prefetch_margin(self):
        self.assertEqual(with_deferred_media_margin('rootMargin: "350px"'),'rootMargin: "150px"')
        with self.assertRaises(AssertionError):with_deferred_media_margin('rootMargin: "350px"\nrootMargin: "350px"')

    def test_desktop_shortcut_follows_unchanged_policy_guard_and_keeps_mobile_delay(self):
        delay=(HERE/'video-delay.txt').read_text()
        original=REVIEWED_VIDEO_GUARD+delay
        self.assertEqual(with_painted_desktop_video('before\n'+original+'after'),
                         'before\n'+REVIEWED_VIDEO_GUARD+DESKTOP_VIDEO_AFTER_PAINT+delay+'after')
        for text in ['',original+original,original.replace('|| reduced ||','||'),original.replace('mobile ? 300 : 1200','mobile ? 0 : 1200')]:
            with self.assertRaises(AssertionError):with_painted_desktop_video(text)

if __name__=='__main__':unittest.main()
