"""Consistent, read-only Container App state retrieval for this photo release.

The Azure CLI core and an auto-installed extension can serialize optional fields
in different ways. Compare the provider's JSON using the SAME pinned API version
before and after validation; never discard configuration fields to hide drift.
Authentication, snapshot hashing, conditional writes and ownership guards remain
those of the existing release helper. No roles or application settings are edited
by this module.
"""
from urllib.parse import quote

API_VERSION = '2025-07-01'
SUBSCRIPTION = '91d9572d-0f0b-47fe-802d-0eef36d7c719'
GROUP = 'rg-hidi-prod'
APPS = frozenset({'hidi-web', 'hidi-api'})


def install(cloud):
    """Bind app reads to the same ARM version used by conditional image writes."""
    if cloud.GROUP != GROUP:
        raise ValueError('Unexpected photo release resource group')
    original_snapshot = cloud.snapshot
    original_ready = cloud.ready
    original_patch = cloud.image_patch

    def app(name):
        if name not in APPS or cloud.GROUP != GROUP or cloud.API_VERSION != API_VERSION:
            raise ValueError('Unexpected photo release state-read target or API version')
        resource = (
            '/subscriptions/' + SUBSCRIPTION + '/resourceGroups/' + GROUP
            + '/providers/Microsoft.App/containerApps/' + name
        )
        url = 'https://management.azure.com' + quote(resource, safe='/') + '?api-version=' + API_VERSION
        value = cloud.azure('rest', '--method', 'get', '--url', url)
        if not isinstance(value, dict) or str(value.get('id', '')).lower() != resource.lower():
            raise ValueError('ARM returned a different Container App')
        properties = value.get('properties')
        if not isinstance(properties, dict) or not isinstance(properties.get('template'), dict) or not isinstance(properties.get('configuration'), dict):
            raise ValueError('ARM returned incomplete Container App state')
        return value

    cloud.API_VERSION = API_VERSION
    cloud.app = app
    # Explicitly retain all existing comparison, readiness and image-only rules.
    assert cloud.snapshot is original_snapshot
    assert cloud.ready is original_ready
    assert cloud.image_patch is original_patch
    return {'apiVersion': API_VERSION, 'resourceGroup': GROUP, 'apps': sorted(APPS), 'readMethod': 'ARM GET', 'configurationFieldsDiscarded': 0}
