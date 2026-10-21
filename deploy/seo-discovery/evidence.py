"""Pure, read-only assertions for the SEO candidate evidence bundle."""
import json
from pathlib import Path


def _read(root, name):
    return json.loads((Path(root) / name).read_text())


def verify_candidate_evidence(root):
    root = Path(root)
    candidate_report = _read(root, 'candidate/report.json')
    assert candidate_report['passed'] is True
    assert candidate_report['engines'] == ['chromium', 'firefox', 'webkit']
    assert len(candidate_report['results']) == 12
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
        history = [check for check in result['checks'] if check['page'] == 'back-forward-reload-metadata']
        assert len(history) == 1
        assert history[0]['scenario'] == 'fresh-settled-pointer'
        assert history[0]['freshContext'] is True
    assert candidate_report['collectionAllIntroVerified']
    assert candidate_report['collectionAllBreadcrumbVerified']
    assert candidate_report['collectionAllExactCopy']
    assert candidate_report['collectionAllMatrixCases'] == 12
    assert candidate_report['reviewedCollectionBodyDelta'] == '/collections/all exact search copy, breadcrumb label, header visibility and intro insertion'
    assert all(any(
        check['page'] == 'catalogue'
        and check['collectionIntro']['heading'] == 'Women\u2019s Kurta Sets & Indian Wear'
        and check['collectionIntro']['intro'] == 'Browse HIDI women\u2019s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.'
        and check['collectionIntro']['breadcrumbLabel'] == 'Women\u2019s Kurta Sets & Indian Wear'
        for check in result['checks']
    ) for result in candidate_report['results'])

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

    collection_report = _read(root, 'candidate-collection-body-delta.json')
    assert collection_report['passed'] is True
    assert collection_report['readOnly'] and collection_report['liveWrites'] == 0 and collection_report['sampleCount'] == 3
    assert collection_report['route'] == '/collections/all'
    assert collection_report['reviewedDelta'] == 'exact collection search copy, breadcrumb label, header visibility and intro insertion'
    assert collection_report['retainedExactBodyRoutes'] == ['/', '/privacy']
    assert collection_report['prior']['stable'] and collection_report['candidate']['stable'] and collection_report['exactNormalizedBodyMatch']
    assert collection_report['fixtureCatalogue'] == {'products': 54, 'imageAssociations': 238}
    assert all(sample['productArticleCount'] == 54 for sample in collection_report['candidate']['samples'])
    expected_operations = [
        'visible header, H1 and intro', 'serialized header, H1 and intro', 'document title',
        'Open Graph title', 'Twitter title', 'document description', 'Open Graph description',
        'Twitter description', 'visible BreadcrumbList position 2 label',
        'serialized BreadcrumbList position 2 label',
    ]
    assert collection_report['normalization']['mode'] == 'count-locked inverse transforms followed by byte equality'
    assert collection_report['normalization']['operations'] == [{'label': label, 'occurrences': 1} for label in expected_operations]
    assert collection_report['normalizedBody']['prior'] == collection_report['normalizedBody']['candidateAfterApprovedTransforms']
    assert all(sample['breadcrumbLabel'] == 'All Products' for sample in collection_report['prior']['samples'])
    assert all(sample['breadcrumbLabel'] == 'Women\u2019s Kurta Sets & Indian Wear' for sample in collection_report['candidate']['samples'])
    assert collection_report['expected'] == {
        'title': 'Women\u2019s Kurta Sets & Indian Wear',
        'description': 'Browse HIDI women\u2019s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.',
    }
    return {
        'passed': True,
        'catalogueProductCount': candidate_report['catalogueProductCount'],
        'catalogueImageAssociations': candidate_report['catalogueImageAssociations'],
        'clientNavigationCases': candidate_report['clientNavigationCases'],
        'freshFirefoxClientNavigationCases': candidate_report['freshFirefoxClientNavigationCases'],
    }
