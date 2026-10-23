"""Allow only the reviewed native image allocator setting in the web image.

Sharp recommends limiting glibc arenas for long-lived image workloads:
https://sharp.pixelplumbing.com/performance/#parallelism-and-concurrency
All unrelated image settings remain subject to the existing preservation guard.
"""
from copy import deepcopy

NAME = 'MALLOC_ARENA_MAX'
VALUE = '2'


def environment(entries):
    assert isinstance(entries, list), 'Image environment must be a list'
    values = {}
    for entry in entries:
        assert isinstance(entry, str) and '=' in entry, 'Invalid image environment entry'
        name, value = entry.split('=', 1)
        assert name and name not in values, 'Duplicate image environment name'
        values[name] = value
    return values


def verify_app_override(entries):
    matches = [item for item in entries if item.get('name') == NAME]
    assert len(matches) <= 1, 'Duplicate runtime allocator override'
    if matches:
        assert not matches[0].get('secretRef') and matches[0].get('value') == VALUE, 'Runtime configuration would override the tested image allocator'


def preservation_configs(configs):
    """Return expected base config plus actual candidate for the original guard.

    The actual candidate is never normalized or modified. The only permitted
    expected-config difference is the exact allocator value tested in isolation.
    """
    assert isinstance(configs, list) and len(configs) == 2
    baseline, candidate = configs
    original_env = baseline['Config']['Env']
    before = environment(original_env)
    environment(candidate['Config']['Env'])
    assert before.get(NAME) in (None, VALUE), 'Unexpected baseline allocator policy'
    expected = deepcopy(baseline)
    if NAME not in before:
        expected['Config']['Env'] = original_env + [NAME + '=' + VALUE]
    assert expected['Config'] == candidate['Config'], 'Unreviewed image runtime configuration change'
    return [expected, candidate], {
        'name': NAME,
        'before': before.get(NAME),
        'after': VALUE,
        'allOtherRuntimeConfigurationPreserved': True,
    }
