"""Technical-only overlay regression tests; retain the existing CI entry point."""
import hashlib
import importlib.util
import json
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest import mock

HERE=Path(__file__).resolve().parent

def load_module(name, filename):
    spec=importlib.util.spec_from_file_location(name,HERE/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

patch=load_module('seo_discovery_patch','patch-runtime.py')

SERVER_IMPORT='import { normalizeSeoIdentity, clientMetadataScript, createSeoIdentityStream, shouldIndexPublishedImage } from "./seo-discovery/metadata.mjs";'
SERVER_ROUTE='  if (handleGuide(request, response, pathname, isProductionRequest(request))) return;'
SERVER_FOOTER='body:has([class*="add-to-cart_mobileBar__"]) footer.footer { padding-bottom: 24px; }'
SERVER_FIXTURE='\n'.join([
    SERVER_IMPORT,
    'createSeoIdentityStream(incoming, isProductionRequest(request) ? pathname : undefined), status, responseHeaders',
    SERVER_ROUTE,
    SERVER_FOOTER,
    '/* retained commerce, analytics and privacy code */',
])+'\n'


class TechnicalOverlayTest(unittest.TestCase):
    def baseline(self):
        data=(HERE/'fixtures/collection-all-before.js').read_bytes()
        self.assertEqual(len(data),4099)
        self.assertEqual(hashlib.sha256(data).hexdigest(),patch.COLLECTION_ALL_SHA)
        return data

    def fixture_runtime(self, base):
        # Synthetic wrapper/dependencies exercise the actual overlay composer.
        # Only the Shop All renderer is the exact captured production fixture.
        sources={name:('retained '+name+'\n').encode() for name in patch.BASELINE_SHA256}
        sources.update({
            'server.mjs':SERVER_FIXTURE.encode(),
            patch.COLLECTION_ALL_PATH:self.baseline(),
            'dist/index.html':b'<script type="module" crossorigin src="/assets/index-fixture.js"></script>',
            'dist/assets/index-fixture.js':b'function HidiSeoLinkProps() {} // Introduced by actress Ananya Nagalla\n',
        })
        for name,data in sources.items():
            target=base/name
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
        hashes={name:hashlib.sha256(sources[name]).hexdigest() for name in patch.BASELINE_SHA256}
        landing_hash=hashlib.sha256(sources['dist/assets/index-fixture.js']).hexdigest()
        return sources,hashes,landing_hash

    def test_shop_all_remains_a_protected_baseline_outside_the_overlay(self):
        text=self.baseline().decode()
        self.assertEqual(patch.BASELINE_SHA256[patch.COLLECTION_ALL_PATH],patch.COLLECTION_ALL_SHA)
        self.assertNotIn(patch.COLLECTION_ALL_PATH,patch.ALLOWED_FILES)
        self.assertEqual(text.count('i="All Products"'),1)
        self.assertEqual(text.count('(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'),1)
        self.assertEqual(text.count('position:2,name:i,item:(0,g.rf)("/collections/all")'),1)
        self.assertIn('(0,d.jsx)(e.CollectionBrowser,{products:a})',text)
        self.assertNotIn('hidi-collection-intro',text)

    def test_server_changes_only_redirect_import_and_dispatch(self):
        result=patch.patch_current_server(SERVER_FIXTURE)
        expected=SERVER_FIXTURE.replace(
            'shouldIndexPublishedImage }','shouldIndexPublishedImage, handleCanonicalHostRedirect }',1
        ).replace(SERVER_ROUTE,'  if (handleCanonicalHostRedirect(request, response)) return;\n'+SERVER_ROUTE,1)
        self.assertEqual(result,expected)
        self.assertIn(SERVER_FOOTER,result)
        self.assertNotIn('body:has([aria-label="Mobile purchase actions"])',result)

    def test_missing_duplicate_and_already_applied_server_anchors_fail_closed(self):
        for source in [
            SERVER_FIXTURE.replace(SERVER_IMPORT,'// missing import'),
            SERVER_FIXTURE+SERVER_IMPORT,
            SERVER_FIXTURE.replace(SERVER_ROUTE,'// missing route'),
            SERVER_FIXTURE+SERVER_ROUTE,
            patch.patch_current_server(SERVER_FIXTURE),
        ]:
            with self.subTest(source=source),self.assertRaises(AssertionError):
                patch.patch_current_server(source)

    def test_actual_composer_outputs_only_three_files_and_preserves_baseline(self):
        with tempfile.TemporaryDirectory() as temporary:
            base,overlay=Path(temporary)/'base',Path(temporary)/'overlay'
            sources,hashes,landing_hash=self.fixture_runtime(base)
            with mock.patch.object(patch,'BASELINE_SHA256',hashes),mock.patch.object(patch,'FOUNDATION_BUNDLE_SHA',landing_hash):
                report=patch.patch_runtime(base,overlay)
            expected={'server.mjs','seo-discovery/metadata.mjs','seo-discovery/published-product-images.json'}
            self.assertEqual(set(report['allowedFiles']),expected)
            self.assertEqual({p.relative_to(overlay).as_posix() for p in overlay.rglob('*') if p.is_file()},expected)
            self.assertEqual((overlay/'server.mjs').read_text(),patch.patch_current_server(SERVER_FIXTURE))
            for name,data in sources.items():
                self.assertEqual((base/name).read_bytes(),data,name)
            self.assertTrue(report['collectionAllRendererPreserved'])
            self.assertTrue(report['mobileFooterLayoutPreserved'])
            self.assertEqual(report['reviewedCollectionBodyDelta'],'none')
            self.assertEqual(report['retainedBodyRoutes'],['/','/privacy','/collections/all'])
            self.assertEqual(report['publishedImageCount'],238)
            self.assertFalse(report['databaseWrites'])
            self.assertFalse(report['blobWrites'])

    def test_changed_shop_all_baseline_and_stale_overlay_are_rejected(self):
        for change in ['renderer','stale-overlay']:
            with self.subTest(change=change),tempfile.TemporaryDirectory() as temporary:
                base,overlay=Path(temporary)/'base',Path(temporary)/'overlay'
                _,hashes,landing_hash=self.fixture_runtime(base)
                if change=='renderer':
                    renderer=base/patch.COLLECTION_ALL_PATH
                    renderer.write_bytes(renderer.read_bytes().replace(b'All Products',b'Changed Products',1))
                else:
                    unexpected=overlay/patch.COLLECTION_ALL_PATH
                    unexpected.parent.mkdir(parents=True)
                    unexpected.write_bytes(b'unapproved renderer')
                with mock.patch.object(patch,'BASELINE_SHA256',hashes),mock.patch.object(patch,'FOUNDATION_BUNDLE_SHA',landing_hash):
                    with self.assertRaises(AssertionError):
                        patch.patch_runtime(base,overlay)


class CandidateEvidenceTest(unittest.TestCase):
    """Synthetic producer-shaped evidence; these are not live browser results."""

    MATRIX = [
        ('chromium', 390, 844), ('chromium', 1440, 900),
        ('firefox', 390, 844), ('firefox', 1440, 900),
        ('webkit', 390, 844), ('webkit', 1440, 900),
        ('webkit', 320, 568), ('webkit', 620, 844),
        ('webkit', 621, 844), ('webkit', 568, 320),
        ('webkit', 844, 390), ('webkit', 768, 1024),
    ]

    @staticmethod
    def rect(x=0, y=0, width=100, height=20):
        return {'x': x, 'y': y, 'right': x + width, 'bottom': y + height,
                'width': width, 'height': height}

    def footer(self, width, height, product):
        top = height - 200
        return {
            'markup': '<footer class="site-footer">Synthetic retained footer</footer>',
            'styles': {'paddingBottom': '24px', 'display': 'block'},
            'padding': '24px',
            'footer': self.rect(0, top, width, 200),
            'bar': self.rect(0, height - 72, width, 72) if product and width <= 620 else None,
            'pageHasPurchaseBar': product,
            'documentWidth': width, 'viewportWidth': width,
            'links': [
                {'text': text, 'href': href, 'tappable': True,
                 'rect': self.rect(8, top + 80 + index * 20, 80, 18)}
                for index, (text, href) in enumerate([
                    ('Privacy', '/privacy'), ('Shipping', '/shipping'),
                    ('Returns', '/returns'), ('Contact', '/contact'),
                ])
            ],
        }

    def bundle(self):
        # Digests come from explicit synthetic bytes. No production snapshot or
        # opaque runtime fixture is needed to exercise the release evidence gate.
        body = (b'<body><header class="collection-header"><h1>All Products</h1></header>'
                + b'<article>Synthetic product</article>' * 54 + b'</body>')
        digest = {'length': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
        raw = {'headerCount': 1, 'headerStyle': '', 'heading': 'All Products',
               'introCount': 0, 'intro': None, 'introStyle': None,
               'breadcrumbLabel': 'All Products', 'productArticleCount': 54}
        sample = {'status': 200, 'contentType': 'text/html; charset=utf-8',
                  'body': deepcopy(digest), **raw}
        baseline = {
            'schemaVersion': 1, 'kind': 'hidi-seo-presentation-baseline',
            'passed': True, 'readOnly': True, 'liveWrites': 0,
            'base': 'http://127.0.0.1:4100', 'capturedAt': '2026-10-21T12:00:00.000Z',
            'results': [],
        }
        candidate = {
            'passed': True, 'engines': ['chromium', 'firefox', 'webkit'],
            'liveWrites': 0, 'catalogueProductCount': 54, 'catalogueImageAssociations': 238,
            'collectionAllBodyPreserved': True, 'collectionAllPresentationPreserved': True,
            'collectionAllBreadcrumbPreserved': True, 'footerLayoutPreserved': True,
            'presentationBaselineVerified': True, 'collectionAllMatrixCases': 12,
            'reviewedCollectionBodyDelta': 'none',
            'presentationBaseline': {
                'source': 'isolated-prior-runtime', 'base': baseline['base'],
                'capturedAt': baseline['capturedAt'], 'matrixCases': 12,
            },
            'results': [],
        }
        for engine, width, height in self.MATRIX:
            pages = ['home', 'catalogue', 'product', 'bag', 'checkout'] if width in [390, 1440] else ['catalogue', 'product']
            routes = {'home': '/', 'catalogue': '/collections/all',
                      'product': '/products/synthetic-retained-product', 'bag': '/cart', 'checkout': '/checkout'}
            before = {'engine': engine, 'width': width, 'height': height, 'passed': True, 'checks': []}
            for page in pages:
                collection = None
                if page == 'catalogue':
                    rendered = {
                        'headerCount': 1, 'headingCount': 1, 'heading': 'All Products',
                        'introCount': 0, 'intro': None, 'breadcrumbLabel': 'All Products',
                        'headerDisplay': '', 'collectionNavigationCount': 0, 'productArticleCount': 54,
                        'headerVisible': False, 'headingVisible': False, 'introVisible': False,
                        'styles': {'header': {'display': 'none'}, 'heading': {'display': 'block'}, 'intro': None},
                        'header': self.rect(width=0, height=0), 'headingBox': self.rect(width=0, height=0),
                        'introBox': None, 'firstProduct': self.rect(0, 80, min(width, 300), 400),
                    }
                    collection = {'raw': deepcopy(raw), 'body': deepcopy(digest), 'rendered': rendered}
                before['checks'].append({'page': page, 'path': routes[page], 'passed': True,
                                         'footer': self.footer(width, height, page == 'product'),
                                         'collectionAll': collection})
            after = deepcopy(before)
            for check in after['checks']:
                check['footerLayoutPreserved'] = True
                if check['collectionAll'] is not None:
                    check['collectionAll']['preserved'] = True
            if width in [390, 1440]:
                scenarios = [('fresh-immediate-pointer', False, True), ('fresh-settled-pointer', True, True)] if engine == 'firefox' else [('retained-context-pointer', False, False)]
                for scenario, settled, fresh in scenarios:
                    after['checks'].append({'page': 'client-navigation', 'path': routes['product'],
                                            'scenario': scenario, 'settled': settled, 'freshContext': fresh, 'passed': True})
                scenario = 'fresh-settled-pointer' if engine == 'firefox' else 'retained-context-pointer'
                after['checks'].append({'page': 'back-forward-reload-metadata', 'scenario': scenario,
                                        'freshContext': engine == 'firefox', 'passed': True})
            baseline['results'].append(before)
            candidate['results'].append(after)
        checks = [check for row in candidate['results'] for check in row['checks']]
        navigation = [check for check in checks if check['page'] == 'client-navigation']
        candidate.update({
            'clientNavigationCases': len(navigation),
            'freshFirefoxClientNavigationCases': sum(check['freshContext'] for check in navigation),
            'immediateFirefoxClientNavigationCases': sum(check['scenario'] == 'fresh-immediate-pointer' for check in navigation),
            'settledFirefoxClientNavigationCases': sum(check['scenario'] == 'fresh-settled-pointer' for check in navigation),
            'backForwardReloadCases': sum(check['page'] == 'back-forward-reload-metadata' for check in checks),
        })
        return {
            'candidate/report.json': candidate,
            'candidate/prior/report.json': baseline,
            'candidate-collection-body-delta.json': {
                'passed': True, 'readOnly': True, 'liveWrites': 0, 'sampleCount': 3,
                'route': '/collections/all', 'reviewedDelta': 'none',
                'retainedExactBodyRoutes': ['/', '/privacy', '/collections/all'],
                'exactBodyMatch': True, 'normalization': {'mode': 'none', 'operations': []},
                'body': {'prior': deepcopy(digest), 'candidate': deepcopy(digest)},
                'prior': {'stable': True, 'samples': [deepcopy(sample) for _ in range(3)]},
                'candidate': {'stable': True, 'samples': [deepcopy(sample) for _ in range(3)]},
                'fixtureCatalogue': {'products': 54, 'imageAssociations': 238},
                'expected': {'heading': 'All Products', 'introCount': 0, 'breadcrumbLabel': 'All Products'},
            },
            'foundation-candidate/report.json': {
                'passed': True, 'liveWrites': 0,
                'results': [{'appearancePreserved': True, 'collectionRetainedWhileAboutVerified': True} for _ in self.MATRIX],
            },
            'candidate-body-preservation.json': {
                'passed': True, 'readOnly': True, 'liveWrites': 0, 'sampleCount': 3,
                'routes': [{'route': route, 'prior': {'normalizedStable': True},
                            'candidate': {'normalizedStable': True}, 'exactNormalizedMatch': True}
                           for route in ['/', '/privacy']],
            },
        }

    def verify(self, bundle):
        evidence = load_module('seo_discovery_evidence_test', 'evidence.py')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, value in bundle.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(value))
            return evidence.verify_candidate_evidence(root)

    @staticmethod
    def collection_check(bundle):
        return next(check for check in bundle['candidate/report.json']['results'][0]['checks'] if check['page'] == 'catalogue')

    def test_minimal_current_bundle_matches_the_js_report_contract(self):
        bundle = self.bundle()
        self.assertEqual(len(bundle['candidate/prior/report.json']['results']), 12)
        self.assertEqual(sum(len(row['checks']) for row in bundle['candidate/prior/report.json']['results']), 42)
        result = self.verify(bundle)
        self.assertTrue(result['passed'])
        self.assertTrue(result['collectionAllBodyPreserved'])
        self.assertTrue(result['footerLayoutPreserved'])
        self.assertEqual(result['clientNavigationCases'], 8)

    def test_legacy_visible_delta_and_normalization_evidence_are_rejected(self):
        for legacy in ['visible-delta', 'inverse-transforms']:
            with self.subTest(legacy=legacy):
                bundle = self.bundle()
                report = bundle['candidate-collection-body-delta.json']
                if legacy == 'visible-delta':
                    report['reviewedDelta'] = 'exact collection search copy, breadcrumb label, header visibility and intro insertion'
                    bundle['candidate/report.json']['reviewedCollectionBodyDelta'] = report['reviewedDelta']
                else:
                    report['normalization'] = {'mode': 'count-locked inverse transforms followed by byte equality',
                                               'operations': [{'label': 'visible header, H1 and intro', 'occurrences': 1}]}
                with self.assertRaises(AssertionError):
                    self.verify(bundle)

    def test_claimed_preservation_cannot_hide_changed_heading_visibility_or_breadcrumb(self):
        for field, value in [('heading', 'Changed heading'), ('headerVisible', True),
                             ('headerDisplay', 'block'), ('breadcrumbLabel', 'Changed breadcrumb')]:
            with self.subTest(field=field):
                bundle = self.bundle()
                check = self.collection_check(bundle)
                check['collectionAll']['rendered'][field] = value
                self.assertTrue(check['collectionAll']['preserved'])
                with self.assertRaises(AssertionError):
                    self.verify(bundle)
        bundle = self.bundle()
        self.collection_check(bundle)['collectionAll']['raw']['heading'] = 'Changed crawler heading'
        with self.assertRaises(AssertionError):
            self.verify(bundle)

    def test_claimed_preservation_cannot_hide_footer_style_geometry_or_link_changes(self):
        for change in ['padding', 'geometry', 'markup', 'destination', 'tappability']:
            with self.subTest(change=change):
                bundle = self.bundle()
                check = self.collection_check(bundle)
                footer = check['footer']
                if change == 'padding':
                    footer['styles']['paddingBottom'] = '126px'
                elif change == 'geometry':
                    footer['footer']['y'] += 12
                elif change == 'markup':
                    footer['markup'] = '<footer class="altered-footer">Changed</footer>'
                elif change == 'destination':
                    footer['links'][0]['href'] = '/different-policy'
                else:
                    footer['links'][0]['tappable'] = False
                self.assertTrue(check['footerLayoutPreserved'])
                with self.assertRaises(AssertionError):
                    self.verify(bundle)

    def test_body_hashes_and_samples_are_checked_beyond_true_pass_flags(self):
        for change in ['browser-body', 'collection-body', 'sample-body']:
            with self.subTest(change=change):
                bundle = self.bundle()
                report = bundle['candidate-collection-body-delta.json']
                if change == 'browser-body':
                    body = self.collection_check(bundle)['collectionAll']['body']
                elif change == 'collection-body':
                    body = report['body']['candidate']
                else:
                    body = report['candidate']['samples'][0]['body']
                body['sha256'] = 'b' * 64
                self.assertTrue(report['exactBodyMatch'])
                with self.assertRaises(AssertionError):
                    self.verify(bundle)

    def test_missing_independent_baseline_is_not_replaced_by_pass_flags(self):
        bundle = self.bundle()
        del bundle['candidate/prior/report.json']
        self.assertTrue(bundle['candidate/report.json']['presentationBaselineVerified'])
        with self.assertRaises(FileNotFoundError):
            self.verify(bundle)

    def test_missing_or_duplicated_viewports_and_samples_fail_closed(self):
        for report_name in ['candidate/report.json', 'candidate/prior/report.json']:
            for change in ['missing', 'duplicate']:
                with self.subTest(report=report_name, change=change):
                    bundle = self.bundle()
                    rows = bundle[report_name]['results']
                    if change == 'missing':
                        rows.pop()
                    else:
                        rows[1] = deepcopy(rows[0])
                    with self.assertRaises(AssertionError):
                        self.verify(bundle)
        for side in ['prior', 'candidate']:
            for change in ['missing', 'duplicate']:
                with self.subTest(samples=side, change=change):
                    bundle = self.bundle()
                    samples = bundle['candidate-collection-body-delta.json'][side]['samples']
                    if change == 'missing':
                        samples.pop()
                    else:
                        samples.append(deepcopy(samples[0]))
                    with self.assertRaises(AssertionError):
                        self.verify(bundle)


if __name__=='__main__':
    unittest.main()
