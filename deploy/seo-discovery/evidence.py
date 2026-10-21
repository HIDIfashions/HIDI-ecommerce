"""Pure, read-only assertions for the SEO candidate evidence bundle."""
from datetime import datetime
import json
import math
from pathlib import Path


def _read(root, name):
    return json.loads((Path(root) / name).read_text())


def _matrix():
    return [
        (engine, width, height)
        for engine in ['chromium', 'firefox', 'webkit']
        for width, height in (
            [(390, 844), (1440, 900)]
            + ([(320, 568), (620, 844), (621, 844), (568, 320), (844, 390), (768, 1024)] if engine == 'webkit' else [])
        )
    ]


def _rectangle(prior, candidate):
    assert (prior is None) == (candidate is None), 'Presentation element presence changed'
    if prior is None:
        return
    for key in ['x', 'y', 'right', 'bottom', 'width', 'height']:
        assert all(type(value[key]) in (int, float) and math.isfinite(value[key]) for value in [prior, candidate])
        assert abs(prior[key] - candidate[key]) <= 1, 'Presentation geometry changed: ' + key


def _price_announcement(value, page):
    assert page in ['home', 'catalogue', 'product', 'bag', 'checkout']
    private_note = page in ['bag', 'checkout']
    expected = {
        'selector': 'body > aside.hidi-price-announcement[data-hidi-price-announcement="true"][aria-label="HIDI price offer"]',
        'count': 1,
        'text': ('Your product prices already include 15% off. No additional percentage discount is applied at checkout.'
                 if private_note else '15% off across HIDI · Prices already reduced · No code needed'),
        'privateNote': private_note, 'visible': True,
    }
    assert isinstance(value, dict), 'Retained pricing readiness evidence is required'
    assert type(value.get('count')) is int
    assert type(value.get('privateNote')) is bool and type(value.get('visible')) is bool
    assert value == expected, 'Retained price announcement must be ready before presentation measurement'


def _collection_readiness(value):
    assert isinstance(value, dict), 'Retained client navigation requires collection readiness evidence'
    assert type(value.get('hydrated')) is bool, 'Collection hydration readiness must be a boolean'
    assert value == {
        'selector': '.collection-page[data-hidi-collection-hydrated="true"]',
        'hydrated': True,
    }, 'Retained client navigation must wait for the existing collection hydration marker'


def _footer(prior, candidate, page):
    variant = 'landing' if page == 'home' else 'storefront'
    selector, link_selector, controls = {
        'landing': (
            'footer.site-footer#footer',
            '.footer-grid > .footer-column:nth-child(4) > :is(a, button):not([hidden])',
            [
                ('a', None, 'Shipping', '/shipping'),
                ('a', None, 'Returns & exchanges', '/returns'),
                ('a', None, 'Privacy policy', '/privacy'),
                ('button', 'button', 'Terms of use', None),
                ('a', None, 'Contact HIDI', '/contact'),
            ],
        ),
        'storefront': (
            'footer.footer', '.footer-bottom a',
            [
                ('a', None, 'Delivery', '/shipping'),
                ('a', None, 'Returns & exchanges', '/returns'),
                ('a', None, 'Order support', '/contact'),
                ('a', None, 'Privacy policy', '/privacy'),
            ],
        ),
    }[variant]
    for value in [prior, candidate]:
        assert value['variant'] == variant, 'Footer variant does not match its route'
        assert value['selector'] == selector and value['linkSelector'] == link_selector
        assert [(link['tag'], link['type'], link['text'], link['href']) for link in value['links']] == controls, \
            'Footer must contain every reviewed policy/support control in order'
    assert isinstance(prior['markup'], str) and prior['markup'].startswith('<footer')
    assert isinstance(prior['styles']['paddingBottom'], str)
    exclude = {'footer', 'bar', 'links'}
    assert {key: value for key, value in candidate.items() if key not in exclude} == {
        key: value for key, value in prior.items() if key not in exclude
    }, 'Footer markup or styling changed'
    assert prior['footer'] is not None
    for key in ['footer', 'bar']:
        _rectangle(prior[key], candidate[key])
    assert len(prior['links']) == len(candidate['links']) == len(controls)
    for before, after in zip(prior['links'], candidate['links']):
        assert {key: value for key, value in before.items() if key != 'rect'} == {
            key: value for key, value in after.items() if key != 'rect'
        }, 'Footer link or tappability changed'
        _rectangle(before['rect'], after['rect'])


def _collection(prior, candidate, body):
    assert candidate['preserved'] is True
    assert prior['raw'] == candidate['raw'], 'Crawler Shop All semantics changed'
    assert prior['body'] == candidate['body'] == body, 'Streamed Shop All body digest changed'
    for value in [prior['raw'], candidate['raw']]:
        assert value['heading'] == value['breadcrumbLabel'] == 'All Products'
        assert value['headerCount'] == 1 and value['headerStyle'] == ''
        assert value['introCount'] == 0 and value['intro'] is None
        assert value['productArticleCount'] == 54
    geometry = {'header', 'headingBox', 'introBox', 'firstProduct'}
    before, after = prior['rendered'], candidate['rendered']
    for value in [before, after]:
        assert value['headerCount'] == value['headingCount'] == 1
        assert value['heading'] == value['breadcrumbLabel'] == 'All Products'
        assert value['introCount'] == 0 and value['intro'] is None
        assert value['headerDisplay'] == '' and value['collectionNavigationCount'] == 0
        assert value['productArticleCount'] == 54
    assert {key: value for key, value in before.items() if key not in geometry} == {
        key: value for key, value in after.items() if key not in geometry
    }, 'Rendered Shop All copy, visibility or styles changed'
    for key in geometry:
        _rectangle(before[key], after[key])


def verify_candidate_evidence(root):
    root = Path(root)
    candidate_report = _read(root, 'candidate/report.json')
    assert candidate_report['passed'] is True
    assert candidate_report['engines'] == ['chromium', 'firefox', 'webkit']
    assert [(row['engine'], row['width'], row['height']) for row in candidate_report['results']] == _matrix()
    assert all(row['passed'] is True for row in candidate_report['results'])
    assert candidate_report['liveWrites'] == 0
    assert candidate_report['catalogueProductCount'] == 54
    assert candidate_report['catalogueImageAssociations'] == 238
    assert candidate_report['clientNavigationCases'] == 8
    assert candidate_report['freshFirefoxClientNavigationCases'] == 4
    assert candidate_report['immediateFirefoxClientNavigationCases'] == 2
    assert candidate_report['settledFirefoxClientNavigationCases'] == 2
    assert candidate_report['backForwardReloadCases'] == 6
    firefox_results = [result for result in candidate_report['results'] if result['engine'] == 'firefox']
    assert len(firefox_results) == 2
    for result in firefox_results:
        navigation = [check for check in result['checks'] if check['page'] == 'client-navigation']
        assert [(check['scenario'], check['settled'], check['freshContext']) for check in navigation] == [
            ('fresh-immediate-pointer', False, True),
            ('fresh-settled-pointer', True, True),
        ]
        for check in navigation:
            assert check['passed'] is True
            assert type(check['settled']) is bool and check['freshContext'] is True
            assert 'collectionReadiness' in check and check['collectionReadiness'] is None, \
                'Fresh Firefox navigation cases must remain free of the retained-context readiness wait'
        history = [check for check in result['checks'] if check['page'] == 'back-forward-reload-metadata']
        assert len(history) == 1
        assert history[0]['scenario'] == 'fresh-settled-pointer'
        assert history[0]['freshContext'] is True
    retained_navigation = [
        (result, check)
        for result in candidate_report['results'] if result['engine'] != 'firefox'
        for check in result['checks'] if check['page'] == 'client-navigation'
    ]
    assert [(row['engine'], row['width'], row['height']) for row, _ in retained_navigation] == [
        ('chromium', 390, 844), ('chromium', 1440, 900),
        ('webkit', 390, 844), ('webkit', 1440, 900),
    ], 'Exactly four reviewed retained-context navigation cases are required'
    for _, check in retained_navigation:
        assert check['passed'] is True and check['scenario'] == 'retained-context-pointer'
        assert check['settled'] is False and check['freshContext'] is False
        _collection_readiness(check.get('collectionReadiness'))
    for field in ['collectionAllBodyPreserved', 'collectionAllPresentationPreserved', 'collectionAllBreadcrumbPreserved',
                  'footerLayoutPreserved', 'presentationBaselineVerified']:
        assert candidate_report[field] is True
    assert candidate_report['collectionAllMatrixCases'] == 12
    assert candidate_report['reviewedCollectionBodyDelta'] == 'none'

    collection_report = _read(root, 'candidate-collection-body-delta.json')
    assert collection_report['passed'] is True
    assert collection_report['readOnly'] is True and collection_report['liveWrites'] == 0 and collection_report['sampleCount'] == 3
    assert collection_report['route'] == '/collections/all'
    assert collection_report['reviewedDelta'] == 'none'
    assert collection_report['retainedExactBodyRoutes'] == ['/', '/privacy', '/collections/all']
    assert collection_report['prior']['stable'] is True and collection_report['candidate']['stable'] is True
    assert collection_report['exactBodyMatch'] is True
    assert collection_report['fixtureCatalogue'] == {'products': 54, 'imageAssociations': 238}
    assert collection_report['normalization'] == {'mode': 'none', 'operations': []}
    assert collection_report['body']['prior'] == collection_report['body']['candidate']
    retained_body = collection_report['body']['prior']
    assert retained_body['length'] > 0 and len(retained_body['sha256']) == 64
    assert all(value in '0123456789abcdef' for value in retained_body['sha256'])
    for name in ['prior', 'candidate']:
        samples = collection_report[name]['samples']
        assert len(samples) == 3
        for sample in samples:
            assert sample['status'] == 200 and sample['contentType'].startswith('text/html')
            assert sample['body'] == retained_body
            assert sample['heading'] == sample['breadcrumbLabel'] == 'All Products'
            assert sample['headerCount'] == 1 and sample['headerStyle'] == ''
            assert sample['introCount'] == 0 and sample['intro'] is None and sample['introStyle'] is None
            assert sample['productArticleCount'] == 54
    assert collection_report['expected'] == {'heading': 'All Products', 'introCount': 0, 'breadcrumbLabel': 'All Products'}

    # Check the saved independent snapshots as well as the probe's pass flags.
    # This baseline is included in the release evidence manifest.
    baseline = _read(root, 'candidate/prior/report.json')
    assert baseline['schemaVersion'] == 1 and baseline['kind'] == 'hidi-seo-presentation-baseline'
    assert baseline['passed'] is True and baseline['readOnly'] is True and baseline['liveWrites'] == 0
    assert baseline['base'].startswith('http://127.0.0.1:')
    assert datetime.fromisoformat(baseline['capturedAt'].replace('Z', '+00:00')).tzinfo is not None
    assert candidate_report['presentationBaseline'] == {
        'source': 'isolated-prior-runtime', 'base': baseline['base'],
        'capturedAt': baseline['capturedAt'], 'matrixCases': 12,
    }
    assert [(row['engine'], row['width'], row['height']) for row in baseline['results']] == _matrix()
    for prior, candidate in zip(baseline['results'], candidate_report['results']):
        assert prior['passed'] is True
        pages = ['home', 'catalogue', 'product', 'bag', 'checkout'] if prior['width'] in [390, 1440] else ['catalogue', 'product']
        checks = [check for check in candidate['checks'] if check['page'] in pages]
        assert [check['page'] for check in prior['checks']] == [check['page'] for check in checks] == pages
        product = next(check['path'] for check in prior['checks'] if check['page'] == 'product')
        assert product.startswith('/products/')
        routes = {'home': '/', 'catalogue': '/collections/all', 'product': product, 'bag': '/cart', 'checkout': '/checkout'}
        for before, after in zip(prior['checks'], checks):
            assert before['passed'] is True and after['passed'] is True and after['footerLayoutPreserved'] is True
            assert before['path'] == after['path'] == routes[before['page']]
            _price_announcement(before.get('priceAnnouncement'), before['page'])
            _price_announcement(after.get('priceAnnouncement'), before['page'])
            _footer(before['footer'], after['footer'], before['page'])
            if before['page'] == 'catalogue':
                _collection(before['collectionAll'], after['collectionAll'], retained_body)
            else:
                assert before['collectionAll'] is None and after['collectionAll'] is None

    foundation_report = _read(root, 'foundation-candidate/report.json')
    assert foundation_report['passed'] is True
    assert len(foundation_report['results']) == 12
    assert foundation_report['liveWrites'] == 0
    assert all(value['appearancePreserved'] for value in foundation_report['results'])
    assert all(value['collectionRetainedWhileAboutVerified'] is True for value in foundation_report['results'])

    body_report = _read(root, 'candidate-body-preservation.json')
    assert body_report['passed'] is True
    assert body_report['readOnly'] and body_report['liveWrites'] == 0 and body_report['sampleCount'] == 3
    assert [route['route'] for route in body_report['routes']] == ['/', '/privacy']
    assert all(route['prior']['normalizedStable'] and route['candidate']['normalizedStable'] and route['exactNormalizedMatch'] for route in body_report['routes'])

    return {
        'passed': True,
        'catalogueProductCount': candidate_report['catalogueProductCount'],
        'catalogueImageAssociations': candidate_report['catalogueImageAssociations'],
        'clientNavigationCases': candidate_report['clientNavigationCases'],
        'freshFirefoxClientNavigationCases': candidate_report['freshFirefoxClientNavigationCases'],
        'collectionAllBodyPreserved': True,
        'collectionAllPresentationPreserved': True,
        'footerLayoutPreserved': True,
    }
