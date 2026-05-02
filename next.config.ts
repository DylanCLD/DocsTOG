import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["yjs", "y-protocols", "lib0"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      },
      {
        protocol: "https",
        hostname: "img.youtube.com"
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com"
      }
    ]
  }
};

export default nextConfig;
