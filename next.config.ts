import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // For Hostinger static hosting: uncomment the line below and run `npm run build`
  // output: 'export',
};

export default nextConfig;
