import type { NextConfig } from "next";
import { fileURLToPath } from 'node:url';

const nativeBuild = process.env.CAPACITOR_BUILD === '1';

const nextConfig: NextConfig = {
  output: nativeBuild ? 'export' : undefined,
  poweredByHeader: false,
  trailingSlash: true,     // Each route becomes /route/index.html
  images: {
    unoptimized: true,     // Next/Image optimization requires a server; disable for static export
  },
  turbopack: {
    root: fileURLToPath(new URL('..', import.meta.url)),
  },
};

export default nextConfig;
