#!/usr/bin/env python3
import argparse
import concurrent.futures
import statistics
import time
import urllib.error
import urllib.request
from collections import Counter
from urllib.parse import urljoin

DEFAULT_PATHS = [
    "/",
    "/collections/all",
    "/collections/new-arrivals",
    "/search?q=kurta",
    "/products/aara-sage-work-kurta",
]

def percentile(values, pct):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((pct / 100) * (len(ordered) - 1))))
    return ordered[index]

def one(base, path, timeout):
    url = urljoin(base.rstrip("/") + "/", path.lstrip("/"))
    started = time.perf_counter()
    status = 0
    size = 0
    error = ""
    try:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "HIDI-Launch-Readiness/1.0",
                "Accept": "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
            },
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = int(response.status)
            body = response.read()
            size = len(body)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        error = str(exc)
    except Exception as exc:
        error = str(exc)
    elapsed_ms = (time.perf_counter() - started) * 1000
    return {
        "path": path,
        "status": status,
        "ms": elapsed_ms,
        "bytes": size,
        "error": error,
    }

def main():
    parser = argparse.ArgumentParser(description="Controlled read-only HIDI storefront load smoke.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--requests", type=int, default=120)
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--p95-ms", type=float, default=3500.0)
    parser.add_argument("--paths", nargs="*", default=DEFAULT_PATHS)
    args = parser.parse_args()

    if args.requests < 1 or args.requests > 1000:
        raise SystemExit("--requests must be between 1 and 1000")
    if args.concurrency < 1 or args.concurrency > 25:
        raise SystemExit("--concurrency must be between 1 and 25")
    if not args.paths:
        raise SystemExit("At least one path is required")

    print(f"Target: {args.url}")
    print(f"Requests: {args.requests}; concurrency: {args.concurrency}")
    print("Paths:", ", ".join(args.paths))

    # Warm each route once. Warmups are excluded from the measured set.
    for path in args.paths:
        result = one(args.url, path, args.timeout)
        print(f"WARM {path}: HTTP {result['status']} {result['ms']:.0f} ms")

    work = [args.paths[index % len(args.paths)] for index in range(args.requests)]
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        results = list(executor.map(lambda path: one(args.url, path, args.timeout), work))
    wall = time.perf_counter() - started

    statuses = Counter(result["status"] for result in results)
    latencies = [result["ms"] for result in results]
    failures = [result for result in results if result["status"] < 200 or result["status"] >= 400]
    throughput = len(results) / wall if wall > 0 else 0

    print("\n=== HIDI LOAD SMOKE ===")
    print("Statuses:", dict(sorted(statuses.items())))
    print(f"Throughput: {throughput:.2f} requests/sec")
    print(f"Latency p50: {percentile(latencies, 50):.0f} ms")
    print(f"Latency p95: {percentile(latencies, 95):.0f} ms")
    print(f"Latency p99: {percentile(latencies, 99):.0f} ms")
    print(f"Latency max: {max(latencies):.0f} ms")
    print(f"Average: {statistics.fmean(latencies):.0f} ms")

    print("\n=== PER ROUTE ===")
    for path in args.paths:
        route = [result for result in results if result["path"] == path]
        route_latency = [result["ms"] for result in route]
        route_failures = sum(1 for result in route if result["status"] < 200 or result["status"] >= 400)
        print(
            f"{path}: n={len(route)} p50={percentile(route_latency, 50):.0f}ms "
            f"p95={percentile(route_latency, 95):.0f}ms failures={route_failures}"
        )

    if failures:
        print("\nFailures:")
        for result in failures[:10]:
            print(f"  {result['path']} HTTP {result['status']} {result['error']}")
        raise SystemExit(f"Load smoke failed: {len(failures)} non-success responses")

    p95 = percentile(latencies, 95)
    if p95 > args.p95_ms:
        raise SystemExit(f"Load smoke failed: p95 {p95:.0f}ms exceeds {args.p95_ms:.0f}ms budget")

    print(f"\nPASS: 0 HTTP failures and p95 {p95:.0f}ms <= {args.p95_ms:.0f}ms")

if __name__ == "__main__":
    main()
