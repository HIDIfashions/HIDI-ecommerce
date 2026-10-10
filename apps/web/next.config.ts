import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    useTypeScriptCli: false,
    // Allow a 12 MB photo plus multipart boundaries and form fields.
    proxyClientMaxBodySize: 14 * 1024 * 1024,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Strict-Transport-Security", value: "max-age=15552000" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.thehidi.com", pathname: "/products/**" },
      { protocol: "https", hostname: "www.thehidi.com", pathname: "/media/products/**" },
      { protocol: "https", hostname: "hidiindia.com", pathname: "/media/products/**" },
      { protocol: "https", hostname: "www.hidiindia.com", pathname: "/media/products/**" },
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
