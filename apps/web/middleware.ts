import { NextResponse, type NextRequest } from "next/server";

const blockedHosts = new Set(["thehidi.com", "www.thehidi.com"]);

function getHostname(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  return host.split(":")[0]?.toLowerCase() ?? "";
}

function blockResponse() {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HIDI is temporarily private</title>
    <style>
      :root {
        color-scheme: light;
        --hidi-mulberry: #591d20;
        --hidi-gold: #d5a24d;
        --hidi-ivory: #f8eee4;
        --hidi-ink: #241415;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 32px;
        background: var(--hidi-ivory);
        color: var(--hidi-ink);
        font-family: Arial, Helvetica, sans-serif;
      }
      main {
        width: min(520px, 100%);
        border: 1px solid rgba(89, 29, 32, 0.2);
        border-radius: 8px;
        padding: 32px;
        background: #fffaf5;
        box-shadow: 0 18px 48px rgba(89, 29, 32, 0.12);
      }
      .eyebrow {
        margin: 0 0 12px;
        color: var(--hidi-gold);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0 0 12px;
        color: var(--hidi-mulberry);
        font-size: clamp(28px, 6vw, 42px);
        line-height: 1.05;
      }
      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Private Testing</p>
      <h1>HIDI is temporarily private.</h1>
      <p>We are preparing the store experience and will reopen this domain soon.</p>
    </main>
  </body>
</html>`,
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "86400",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);

  if (blockedHosts.has(hostname) && process.env.ALLOW_PUBLIC_DOMAIN === "false") {
    return blockResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
