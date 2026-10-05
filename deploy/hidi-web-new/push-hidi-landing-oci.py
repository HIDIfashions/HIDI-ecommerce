#!/usr/bin/env python3
"""Append the tested landing build to the existing storefront image, without Docker.

Example (run in Azure Cloud Shell after importing the base into the same repo):
  python3 push-hidi-landing-oci.py --registry REGISTRY --payload hidi-landing-runtime.tar.gz \
      --base hidi-web:500b78d4898e707d38b58f1010167d340948538d --tag landing-connected-<version>

Tokens stay in process memory and are never printed or written to files.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ACCEPT = ", ".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return "sha256:" + h.hexdigest()


def make_layer(payload, directory):
    raw = pathlib.Path(directory) / "landing-layer.tar"
    compressed = pathlib.Path(directory) / "landing-layer.tar.gz"
    with tarfile.open(payload, "r:gz") as source, tarfile.open(raw, "w", format=tarfile.PAX_FORMAT) as target:
        app = tarfile.TarInfo("app")
        app.type = tarfile.DIRTYPE
        app.mode = 0o755
        target.addfile(app)
        found_server = False
        found_index = False
        for entry in sorted(source.getmembers(), key=lambda member: member.name):
            name = entry.name.removeprefix("./").rstrip("/")
            parts = pathlib.PurePosixPath(name).parts
            if not name or name == ".":
                continue
            if name.startswith("/") or ".." in parts or "\\" in name:
                raise ValueError("Unsafe payload path")
            if name not in {"server.mjs", "hero-media.mjs", "dist"} and not name.startswith("dist/"):
                raise ValueError("Unexpected payload file: " + name)
            if not entry.isfile() and not entry.isdir():
                raise ValueError("Payload must contain only regular files and directories")
            item = tarfile.TarInfo("app/" + name)
            item.uid = item.gid = 0
            item.uname = item.gname = "root"
            item.mtime = 0
            item.mode = 0o755 if entry.isdir() else 0o644
            item.type = tarfile.DIRTYPE if entry.isdir() else tarfile.REGTYPE
            item.size = entry.size if entry.isfile() else 0
            target.addfile(item, source.extractfile(entry) if entry.isfile() else None)
            found_server |= name == "server.mjs"
            found_index |= name == "dist/index.html"
        if not found_server or not found_index:
            raise ValueError("Payload requires server.mjs and dist/index.html")
    with open(raw, "rb") as src, open(compressed, "wb") as dst:
        with gzip.GzipFile(filename="", mode="wb", fileobj=dst, mtime=0) as zipped:
            shutil.copyfileobj(src, zipped)
    return compressed, digest_file(raw), digest_file(compressed)


def make_config(base, diff_id, created):
    config = json.loads(json.dumps(base))
    if config.get("os") != "linux" or config.get("architecture") != "amd64":
        raise ValueError("The storefront base must target linux/amd64")
    runtime = config.setdefault("config", {})
    runtime["WorkingDir"] = "/app"
    runtime["Cmd"] = ["node", "server.mjs"]
    runtime["Env"] = [value for value in runtime.get("Env", [])
                      if not value.startswith(("NODE_ENV=", "PORT="))] + ["NODE_ENV=production", "PORT=3000"]
    runtime.setdefault("ExposedPorts", {})["3000/tcp"] = {}
    runtime.pop("Healthcheck", None)
    config["created"] = created
    rootfs = config.setdefault("rootfs", {"type": "layers", "diff_ids": []})
    rootfs.setdefault("diff_ids", []).append(diff_id)
    config.setdefault("history", []).append({
        "created": created,
        "created_by": "HIDI landing runtime: tested Vite dist and same-origin storefront proxy",
    })
    # Container runtime consumes config; stale build-time container metadata is unnecessary.
    config.pop("container", None)
    config.pop("container_config", None)
    return config


class CredentialBoundaryRedirect(urllib.request.HTTPRedirectHandler):
    """Keep registry credentials away from signed storage blob redirects."""
    @staticmethod
    def origin(url):
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        return parsed.scheme, parsed.hostname, port

    def redirect_request(self, request, fp, code, message, headers, newurl):
        redirected = super().redirect_request(request, fp, code, message, headers, newurl)
        if redirected is not None and self.origin(request.full_url) != self.origin(newurl):
            redirected.remove_header("Authorization")
            redirected.remove_header("Proxy-Authorization")
        return redirected


class Registry:
    def __init__(self, server, token):
        self.origin = "https://" + server
        self.token = token
        self.opener = urllib.request.build_opener(CredentialBoundaryRedirect())

    def request(self, method, path, data=None, headers=None):
        url = urllib.parse.urljoin(self.origin + "/", path)
        all_headers = {"Authorization": "Bearer " + self.token}
        all_headers.update(headers or {})
        request = urllib.request.Request(url, data=data, headers=all_headers, method=method)
        try:
            with self.opener.open(request, timeout=240) as response:
                return response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            # Registry error bodies can include sensitive contextual data; report status only.
            hostname = urllib.parse.urlsplit(error.url).hostname or "unknown host"
            raise RuntimeError("Registry request failed on " + hostname + " with HTTP " + str(error.code)) from None

    def json(self, path):
        _, _, body = self.request("GET", path, headers={"Accept": ACCEPT})
        return json.loads(body)

    def push_blob(self, repository, content, digest):
        _, headers, _ = self.request("POST", "/v2/" + repository + "/blobs/uploads/", data=b"")
        location = headers.get("Location") or headers.get("location")
        if not location:
            raise RuntimeError("Registry omitted blob upload location")
        separator = "&" if "?" in location else "?"
        location += separator + urllib.parse.urlencode({"digest": digest})
        self.request("PUT", location, data=content, headers={"Content-Type": "application/octet-stream"})


def az_json(*arguments):
    result = subprocess.run(["az", *arguments, "--output", "json"], capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError("Azure CLI command failed: " + " ".join(arguments[:3]))
    return json.loads(result.stdout)


def registry_session(registry, repository):
    login = az_json("acr", "login", "--name", registry, "--expose-token")
    server = login["loginServer"]
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "service": server,
        "scope": "repository:" + repository + ":pull,push",
        "refresh_token": login["accessToken"],
    }).encode()
    request = urllib.request.Request("https://" + server + "/oauth2/token", data=body,
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            token = json.load(response)["access_token"]
    except urllib.error.HTTPError as error:
        raise RuntimeError("Registry token exchange failed with HTTP " + str(error.code)) from None
    return Registry(server, token), server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry")
    parser.add_argument("--payload", default="hidi-landing-runtime.tar.gz")
    parser.add_argument("--base", default="hidi-web@sha256:1bc1614ac79ea6718f94a67d3a2f5525af3a3b228dcf46191c15b75069184a31")
    parser.add_argument("--tag", required=True)
    parser.add_argument("--created", default=datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"))
    parser.add_argument("--dry-run-base-config", help="Assemble only with this local base config JSON; no Azure/network calls")
    args = parser.parse_args()
    if "@" in args.base:
        repository, base_ref = args.base.rsplit("@", 1)
    else:
        repository, base_ref = args.base.rsplit(":", 1)
    with tempfile.TemporaryDirectory(prefix="hidi-oci-") as directory:
        layer, diff_id, compressed_digest = make_layer(args.payload, directory)
        if args.dry_run_base_config:
            base = json.loads(pathlib.Path(args.dry_run_base_config).read_text())
            config = encoded(make_config(base, diff_id, args.created))
            print(json.dumps({"dry_run": True, "layer_digest": compressed_digest, "layer_diff_id": diff_id,
                              "layer_bytes": layer.stat().st_size,
                              "config_digest": "sha256:" + hashlib.sha256(config).hexdigest()}))
            return
        if not args.registry:
            parser.error("--registry is required for pushing")
        registry, server = registry_session(args.registry, repository)
        manifest = registry.json("/v2/" + repository + "/manifests/" + base_ref)
        if "manifests" in manifest:
            descriptor = next((item for item in manifest["manifests"]
                               if item.get("platform", {}).get("os") == "linux"
                               and item.get("platform", {}).get("architecture") == "amd64"), None)
            if not descriptor:
                raise RuntimeError("Imported base lacks a linux/amd64 image")
            manifest = registry.json("/v2/" + repository + "/manifests/" + descriptor["digest"])
        base_descriptor = manifest["config"]
        _, _, base_bytes = registry.request("GET", "/v2/" + repository + "/blobs/" + base_descriptor["digest"])
        if "sha256:" + hashlib.sha256(base_bytes).hexdigest() != base_descriptor["digest"]:
            raise RuntimeError("Base config digest mismatch")
        base_config = json.loads(base_bytes)
        if len(base_config["rootfs"]["diff_ids"]) != len(manifest["layers"]):
            raise RuntimeError("Base manifest layers and config rootfs differ")
        config_bytes = encoded(make_config(base_config, diff_id, args.created))
        config_digest = "sha256:" + hashlib.sha256(config_bytes).hexdigest()
        media_type = manifest.get("mediaType", "application/vnd.docker.distribution.manifest.v2+json")
        is_oci = media_type == "application/vnd.oci.image.manifest.v1+json"
        layer_type = ("application/vnd.oci.image.layer.v1.tar+gzip" if is_oci
                      else "application/vnd.docker.image.rootfs.diff.tar.gzip")
        new_manifest = {
            "schemaVersion": 2,
            "mediaType": media_type,
            "config": {"mediaType": base_descriptor["mediaType"],
                       "digest": config_digest, "size": len(config_bytes)},
            "layers": manifest["layers"] + [{"mediaType": layer_type,
                                             "digest": compressed_digest, "size": layer.stat().st_size}],
        }
        registry.push_blob(repository, layer.read_bytes(), compressed_digest)
        registry.push_blob(repository, config_bytes, config_digest)
        manifest_bytes = encoded(new_manifest)
        registry.request("PUT", "/v2/" + repository + "/manifests/" + args.tag,
                         data=manifest_bytes, headers={"Content-Type": media_type})
        published = registry.json("/v2/" + repository + "/manifests/" + args.tag)
        if published["config"]["digest"] != config_digest:
            raise RuntimeError("Published image config digest did not match")
        print(json.dumps({"image": server + "/" + repository + ":" + args.tag,
                          "manifest_digest": "sha256:" + hashlib.sha256(manifest_bytes).hexdigest(),
                          "config_digest": config_digest, "application_layer_digest": compressed_digest,
                          "architecture": "linux/amd64", "verified": True}))


if __name__ == "__main__":
    main()
