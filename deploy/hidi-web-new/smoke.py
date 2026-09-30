#!/usr/bin/env python3
"""Check an Azure landing deployment against its locally built Vite dist."""

import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen


TIMEOUT = 30
MIME_TYPES = {
    ".avif": {"image/avif"},
    ".css": {"text/css"},
    ".html": {"text/html"},
    ".ico": {"image/x-icon", "image/vnd.microsoft.icon"},
    ".jpeg": {"image/jpeg"},
    ".jpg": {"image/jpeg"},
    ".js": {"text/javascript", "application/javascript"},
    ".json": {"application/json"},
    ".mp4": {"video/mp4"},
    ".png": {"image/png"},
    ".svg": {"image/svg+xml"},
    ".webmanifest": {"application/manifest+json", "application/json"},
    ".webp": {"image/webp"},
    ".woff": {"font/woff", "application/font-woff"},
    ".woff2": {"font/woff2"},
}


class BundleRefs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("type") == "module" and attrs.get("src"):
            self.refs.add(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split() and attrs.get("href"):
            self.refs.add(attrs["href"])


def bundle_refs(html):
    parser = BundleRefs()
    parser.feed(html)
    # Vite's relative ./ paths and absolute / paths identify the same files.
    return {urlparse(urljoin("https://expected.invalid/", ref)).path.lstrip("/")
            for ref in parser.refs}


def fetch(url, method="GET", headers=None, limit=1024 * 1024):
    request_headers = {"Accept-Encoding": "identity", "User-Agent": "HIDI-deployment-smoke/1.0"}
    request_headers.update(headers or {})
    request = Request(url, method=method, headers=request_headers)
    try:
        response = urlopen(request, timeout=TIMEOUT)
    except HTTPError as error:
        response = error
    with response:
        body = b"" if method == "HEAD" else response.read(limit + 1)
        if len(body) > limit:
            raise AssertionError("response body exceeded the expected size")
        return response.status, response.headers, body


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def verify_headers(headers, path, expected_size):
    content_type = headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    allowed = MIME_TYPES.get(path.suffix.lower(), {"application/octet-stream"})
    require(content_type in allowed, "Content-Type {} is not {}".format(content_type, sorted(allowed)))
    encoding = headers.get("Content-Encoding", "identity").strip().lower()
    require(encoding == "identity", "identity encoding requested but received " + encoding)
    content_length = headers.get("Content-Length")
    if content_length is not None:
        require(int(content_length) == expected_size,
                "Content-Length {} differs from {}".format(content_length, expected_size))


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://thidigk.thehidi.com", help="deployment base URL")
    parser.add_argument("--dist", type=Path,
                        default=Path(__file__).resolve().parents[2] / "azure-deploy/hidi-web-new/dist",
                        help="locally built Vite dist directory")
    args = parser.parse_args()
    dist = args.dist.resolve()
    base = args.url.rstrip("/") + "/"
    failures = []
    passed = []
    files = []

    def asset_url(relative):
        return urljoin(base, quote(relative, safe="/"))

    def check(label, operation):
        try:
            operation()
            passed.append(label)
        except Exception as error:
            failures.append({"check": label, "error": str(error)})

    def prepare():
        require(urlparse(base).scheme in {"https", "http"}, "--url must be HTTP or HTTPS")
        require((dist / "index.html").is_file(), "dist/index.html is missing")
        require((dist / "config.js").is_file(), "dist/config.js is missing")
        files.extend(sorted(path for path in dist.rglob("*") if path.is_file()))
        require(files, "dist contains no files")

    check("dist", prepare)
    if not failures:
        expected_refs = bundle_refs((dist / "index.html").read_text(encoding="utf-8"))

        def health():
            status, headers, body = fetch(asset_url("health"))
            require(status == 200, "HTTP {}".format(status))
            require(headers.get("Content-Type", "").split(";", 1)[0] == "application/json",
                    "health response is not JSON")
            require(json.loads(body).get("status") == "ok", "health status is not ok")

        def index():
            status, headers, body = fetch(base, limit=max((dist / "index.html").stat().st_size * 2, 65536))
            require(status == 200, "HTTP {}".format(status))
            require(headers.get("Content-Type", "").split(";", 1)[0] == "text/html",
                    "index response is not HTML")
            require(expected_refs, "local index contains no Vite bundles")
            require(bundle_refs(body.decode("utf-8")) == expected_refs,
                    "live Vite bundle references differ from the built index")
            for ref in expected_refs:
                require((dist / ref).is_file(), "referenced bundle is absent from dist: " + ref)

        def exact_get(relative, no_cache=False):
            path = dist / relative
            expected = path.read_bytes()
            status, headers, body = fetch(asset_url(relative), limit=len(expected))
            require(status == 200, "HTTP {}".format(status))
            verify_headers(headers, path, len(expected))
            require(sha256(body) == sha256(expected), "SHA256 differs from built file")
            if no_cache:
                directives = {part.strip().lower() for part in headers.get("Cache-Control", "").split(",")}
                require("no-cache" in directives, "config.js lacks Cache-Control: no-cache")

        def missing():
            status, _, _ = fetch(asset_url("assets/images/hidi-smoke-intentionally-missing-86ad1066.png"))
            require(status == 404, "missing PNG returned HTTP {}".format(status))

        check("health", health)
        check("index-bundles", index)
        check("config-sha256-no-cache", lambda: exact_get("config.js", no_cache=True))
        check("missing-png-404", missing)

        def head(path):
            relative = path.relative_to(dist).as_posix()
            status, headers, _ = fetch(asset_url(relative), method="HEAD")
            require(status == 200, "HTTP {}".format(status))
            verify_headers(headers, path, path.stat().st_size)

        with ThreadPoolExecutor(max_workers=6) as pool:
            pending = {pool.submit(head, path): path.relative_to(dist).as_posix() for path in files}
            for future in as_completed(pending):
                relative = pending[future]
                check("head:" + relative, future.result)

        for relative in sorted(expected_refs):
            if Path(relative).suffix in {".js", ".css"} and (dist / relative).is_file():
                check("sha256:" + relative, lambda relative=relative: exact_get(relative))

        def video_range(path):
            relative = path.relative_to(dist).as_posix()
            require(path.stat().st_size >= 1024, "video is shorter than 1024 bytes")
            with path.open("rb") as source:
                expected = source.read(1024)
            status, headers, body = fetch(asset_url(relative), headers={"Range": "bytes=0-1023"}, limit=1024)
            require(status == 206, "range request returned HTTP {}".format(status))
            verify_headers(headers, path, 1024)
            require(headers.get("Content-Range") == "bytes 0-1023/{}".format(path.stat().st_size),
                    "Content-Range differs from the expected 1024-byte slice")
            require(body == expected, "range bytes differ from the built video")

        videos = [path for path in files if path.suffix.lower() == ".mp4"]
        check("video-present", lambda: require(videos, "dist contains no MP4 videos"))
        for path in videos:
            check("range:" + path.relative_to(dist).as_posix(), lambda path=path: video_range(path))

    print(json.dumps({"ok": not failures, "url": base, "dist": str(dist),
                      "files": len(files), "passed": len(passed), "failed": len(failures),
                      "failures": sorted(failures, key=lambda entry: entry["check"])},
                     ensure_ascii=False, separators=(",", ":")))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
