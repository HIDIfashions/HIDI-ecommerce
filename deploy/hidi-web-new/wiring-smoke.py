#!/usr/bin/env python3
"""Read-only smoke checks for the landing page wired to the Azure storefront.

Default requests are GET only; unknown cart sessions are deliberately not read.
The optional --invalid-newsletter-probe sends an empty object, which the audited
newsletter controller rejects before accessing its database. Never sends an OTP,
creates an account/cart/order, subscribes an email, or starts payment.
"""
import argparse
import concurrent.futures
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

LIMIT = 8 * 1024 * 1024
COLLECTIONS = ("all", "new-arrivals", "work-edit", "everyday", "occasion")


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = set()
        self.styles = set()

    def handle_starttag(self, tag, values):
        attrs = dict(values)
        if tag == "script" and attrs.get("src"):
            self.scripts.add(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split() and attrs.get("href"):
            self.styles.add(attrs["href"])


def refs(html):
    parser = References()
    parser.feed(html)
    return parser


def require(value, message):
    if not value:
        raise AssertionError(message)


def origin(url):
    parsed = urllib.parse.urlsplit(url)
    return parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://thidigk.thehidi.com")
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--invalid-newsletter-probe", action="store_true")
    parser.add_argument("--expect-validation", action="store_true",
                        help="Require the optional invalid newsletter probe to remain blocked with HTTP 503")
    args = parser.parse_args()
    base = args.url.rstrip("/") + "/"
    parsed = urllib.parse.urlsplit(base)
    require(parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username,
            "--url must be an HTTP(S) origin")
    results = []
    assets = {}
    html_pages = {}
    auth_findings = []

    def fetch(path, data=None):
        url = urllib.parse.urljoin(base, path)
        require(origin(url) == origin(base), "Cross-origin request refused")
        headers = {"User-Agent": "HIDI-wiring-smoke/1.0", "Accept-Encoding": "identity"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, headers=headers, data=data)
        try:
            response = urllib.request.urlopen(request, timeout=args.timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            require(origin(response.url) == origin(base), "Unexpected cross-origin redirect")
            body = response.read(LIMIT + 1)
            require(len(body) <= LIMIT, "Response exceeds smoke-check limit")
            return response.status, response.headers, body

    def check(label, operation):
        try:
            detail = operation()
            results.append({"check": label, "passed": True, "detail": detail})
        except Exception as error:
            results.append({"check": label, "passed": False, "error": str(error)})

    def page(path, landing=False):
        status, headers, body = fetch(path)
        require(status == 200, "HTTP " + str(status))
        require("text/html" in headers.get("Content-Type", ""), "Expected HTML")
        html = body.decode("utf-8")
        references = refs(html)
        if landing:
            require('id="root"' in html and any("/assets/" in ref for ref in references.scripts),
                    "Root did not return the Vite landing build")
        else:
            require(any("/_next/" in ref for ref in references.scripts),
                    "Route did not return the Next storefront")
            require('self.__next_f' in html or 'id="__NEXT_DATA__"' in html,
                    "Next hydration output is missing")
        html_pages[path] = html
        for reference in references.scripts | references.styles:
            url = urllib.parse.urljoin(base, reference)
            if origin(url) == origin(base):
                assets[url] = "script" if reference in references.scripts else "style"
        return {"status": status, "scripts": len(references.scripts), "styles": len(references.styles)}

    check("landing-root", lambda: page("/", landing=True))
    config = ""

    def runtime_config():
        nonlocal config
        status, headers, body = fetch("/config.js")
        require(status == 200, "HTTP " + str(status))
        require("javascript" in headers.get("Content-Type", ""), "Expected JavaScript config")
        require("no-cache" in headers.get("Cache-Control", ""), "Runtime config must revalidate")
        config = body.decode("utf-8")
        require("HIDI_CONFIG" in config, "HIDI_CONFIG is missing")
        return {"status": status}

    check("runtime-config", runtime_config)

    def configured_url(key, expected_path):
        match = re.search(r'[\"\']?' + re.escape(key) + r'[\"\']?\s*:\s*([\"\'])(.*?)\1', config)
        require(match and match.group(2), "Missing runtime setting " + key)
        target = urllib.parse.urljoin(base, match.group(2))
        require(origin(target) == origin(base), key + " must use the storefront origin")
        require(urllib.parse.urlsplit(target).path == expected_path, key + " has unexpected destination")
        return {"path": expected_path}

    for key, path in [("signInUrl", "/account"), ("signUpUrl", "/account"),
                      ("newsletterEndpoint", "/api/store/marketing/newsletter")]:
        check("config:" + key, lambda key=key, path=path: configured_url(key, path))

    def declared_mapping(path):
        # Some deployments declare mapping in config; others put it in the app
        # action layer. Check both without executing untrusted JavaScript.
        source = config + "\n" + "\n".join(landing_scripts)
        require(path in source, "No declared mapping for " + path)
        return {"path": path}

    landing_scripts = []
    for url, kind in list(assets.items()):
        if kind == "script" and "/assets/" in urllib.parse.urlsplit(url).path:
            def load_landing(url=url):
                status, headers, body = fetch(url)
                require(status == 200 and "javascript" in headers.get("Content-Type", ""),
                        "Landing script not downloadable")
                landing_scripts.append(body.decode("utf-8"))
                return {"bytes": len(body)}
            check("landing-script:" + urllib.parse.urlsplit(url).path, load_landing)
    for path in ["/account", "/cart", "/search", "/shipping", "/returns", "/contact",
                 "/api/store/marketing/newsletter"] + [
            "/collections/" + slug for slug in COLLECTIONS]:
        check("mapping:" + path, lambda path=path: declared_mapping(path))

    paths = ["/account", "/cart", "/search?q=sage", "/shipping", "/returns", "/contact"] + [
        "/collections/" + slug for slug in COLLECTIONS]
    # Keep data fetches moderate; catalogue pages can make upstream database reads.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {pool.submit(page, path): path for path in paths}
        for future in concurrent.futures.as_completed(pending):
            check("storefront:" + pending[future], future.result)

    def health():
        status, headers, body = fetch("/healthz")
        require(status == 200 and "json" in headers.get("Content-Type", ""), "Next health is unavailable")
        value = json.loads(body)
        require(value.get("status") == "ok" and value.get("service") == "hidi-web", "Unexpected Next health output")
        return value

    def catalogue():
        status, headers, body = fetch("/api/store/products")
        require(status == 200 and "json" in headers.get("Content-Type", ""), "Catalogue API HTTP " + str(status))
        products = json.loads(body)
        require(isinstance(products, list) and products, "Expected nonempty current catalogue")
        require(all(isinstance(item, dict) and item.get("id") and item.get("slug") and item.get("name")
                    and isinstance(item.get("variants"), list) for item in products), "Product contract mismatch")
        require(products[0]["slug"] in html_pages.get("/collections/all", ""),
                "Next catalogue HTML does not include the current API catalogue")
        return {"products": len(products), "first_slug": products[0]["slug"]}

    def auth_config():
        status, headers, body = fetch("/api/store/auth/config")
        require(status == 200 and "json" in headers.get("Content-Type", ""), "Auth config HTTP " + str(status))
        value = json.loads(body)
        require(value.get("phoneOtp") is True and value.get("provider") == "firebase", "Firebase phone OTP is not configured")
        return value

    def account_boundary():
        status, headers, body = fetch("/api/store/account/orders")
        require(status == 401 and "json" in headers.get("Content-Type", ""),
                "Unauthenticated account request must return JSON 401; got " + str(status))
        json.loads(body)
        return {"status": status}

    for label, operation in [("next-health", health), ("api-current-catalogue", catalogue),
                             ("api-firebase-config", auth_config), ("api-account-auth-boundary", account_boundary)]:
        check(label, operation)

    account_refs = refs(html_pages.get("/account", "")).scripts
    def download(url, kind):
        path = urllib.parse.urlsplit(url).path
        status, headers, body = fetch(url)
        require(status == 200, "Asset HTTP " + str(status))
        mime = headers.get("Content-Type", "")
        require(("javascript" in mime) if kind == "script" else ("text/css" in mime), "Incorrect asset Content-Type")
        require(body, "Empty asset")
        if kind == "script" and "/_next/" in path and any(
                urllib.parse.urlsplit(urllib.parse.urljoin(base, ref)).path == path for ref in account_refs):
            text = body.decode("utf-8")
            if "hidi_supabase_session" in text or "hidi-firebase-recaptcha" in text:
                api_urls = sorted(set(re.findall(r'https?://[^\s\"\'<>\\]+/api/store', text)))
                marker = text.find("hidi_supabase_session")
                nearby = text[max(0, marker - 1500):marker] if marker >= 0 else text
                normalized = 'window.location.origin' in nearby and 'endsWith("/api/store")' in nearby
                cross_origin = [url for url in api_urls if origin(url) != origin(base)]
                finding = {"path": path, "declared_api_urls": api_urls,
                           "same_origin_normalization": normalized, "cross_origin_literals": cross_origin}
                auth_findings.append(finding)
                require(not cross_origin or normalized, "Auth chunk sends requests to another origin without normalization")
        return {"bytes": len(body)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        pending = {pool.submit(download, url, kind): urllib.parse.urlsplit(url).path
                   for url, kind in sorted(assets.items())}
        for future in concurrent.futures.as_completed(pending):
            check("asset:" + pending[future], future.result)

    check("account-auth-chunk-audited", lambda: require(auth_findings, "No loaded account auth chunk found"))
    if args.invalid_newsletter_probe:
        def invalid_newsletter():
            status, headers, body = fetch("/api/store/marketing/newsletter", data=b"{}")
            allowed = (503,) if args.expect_validation else (400, 503)
            require(status in allowed and "json" in headers.get("Content-Type", ""),
                    "Empty newsletter payload should be rejected; got HTTP " + str(status))
            json.loads(body)
            return {"status": status, "payload": "empty object; no email submitted"}
        check("newsletter-empty-payload-rejected", invalid_newsletter)
    failed = [result for result in results if not result["passed"]]
    print(json.dumps({"ok": not failed, "url": base, "passed": len(results) - len(failed),
                      "failed": len(failed), "checks": results, "auth_origin_findings": auth_findings,
                      "not_exercised": ["OTP send/verify", "cart-session creation", "account creation",
                                        "newsletter subscription", "orders", "payments"]}, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
