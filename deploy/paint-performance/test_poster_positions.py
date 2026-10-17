import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('paint_patch',Path(__file__).with_name('patch.py'));patch=importlib.util.module_from_spec(s);s.loader.exec_module(patch)

class PosterPositions(unittest.TestCase):
    def test_reviewed_property_and_both_visibility_branches_keep_their_semantics(self):
        call='HidiMediaPoster(liveHero.url)'
        source='poster: '+call+',\n'+'\n'.join(['visibility: liveReady || (liveHero.type === "video" && '+call+') ? "visible" : "hidden"']*2)
        result=patch.with_poster_positions(source)
        self.assertEqual(result.replace('HidiMediaPoster(liveHero.url,liveHero.mobilePosition)',call),source)
        self.assertEqual(result.count('HidiMediaPoster(liveHero.url,liveHero.mobilePosition)'),3)
        for value in [source+'\n'+call,source.replace('poster: ', 'other: '),source.replace('liveHero.type === "video"','otherCheck',1),source.replace(call,'missing',1)]:
            with self.assertRaises(AssertionError):patch.with_poster_positions(value)

if __name__=='__main__':unittest.main()
