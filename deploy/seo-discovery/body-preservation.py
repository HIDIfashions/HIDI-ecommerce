"""Exact retained-body analysis for the guarded HIDI SEO release."""
import hashlib
import json
import re
from pathlib import Path

CONFIG = json.loads((Path(__file__).with_name('body-preservation-config.json')).read_text(encoding='utf-8'))
ANNOUNCEMENT = CONFIG['announcementHtml'].encode('utf-8')
HEAD_MARKER = b'</head>'


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def analyze(path, document):
    assert path in CONFIG['routes'], 'Unreviewed retained-body route: ' + path
    assert document.count(HEAD_MARKER) == 1, path + ' must contain exactly one lowercase </head> marker'
    marker = document.index(HEAD_MARKER)
    head = document[:marker + len(HEAD_MARKER)]
    body = document[marker + len(HEAD_MARKER):]
    count = body.count(ANNOUNCEMENT)
    optional = CONFIG['routes'][path]['optionalAnnouncement']
    assert count in ({0, 1} if optional else {0}), path + ' has an unexpected HIDI price announcement'
    position = body.find(ANNOUNCEMENT) if count else None
    if count:
        body_tag = re.search(br'<body\b[^>]*>', body, re.I)
        assert body_tag and position == body_tag.end(), 'Optional announcement must occur once immediately after <body>'
        normalized = body[:position] + body[position + len(ANNOUNCEMENT):]
    else:
        normalized = body
    return normalized, {
        'document': {'length': len(document), 'sha256': sha256(document)},
        'head': {'length': len(head), 'sha256': sha256(head)},
        'body': {'length': len(body), 'sha256': sha256(body)},
        'normalizedBody': {'length': len(normalized), 'sha256': sha256(normalized)},
        'announcement': {'count': count, 'position': position, 'exactReviewedLiteral': count == 1},
    }


def first_difference(before, after, radius=80):
    shared = min(len(before), len(after))
    offset = next((index for index in range(shared) if before[index] != after[index]), shared)
    if offset == shared and len(before) == len(after):
        return None
    start, end = max(0, offset - radius), offset + radius
    return {
        'offset': offset,
        'beforeSnippet': before[start:min(len(before), end)].decode('utf-8', 'replace'),
        'afterSnippet': after[start:min(len(after), end)].decode('utf-8', 'replace'),
    }
