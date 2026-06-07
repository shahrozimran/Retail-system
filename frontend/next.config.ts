import type { NextConfig } from "next";
import path from 'path';

const isBuild = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: isBuild ? 'export' : undefined,        // Generates static files in out/ for Capacitor
  trailingSlash: true,     // Each route becomes /route/index.html
  images: {
    unoptimized: true,     // Next/Image optimization requires a server; disable for static export
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
