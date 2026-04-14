import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@cryptopay/shared"],
  outputFileTracingRoot: path.join(__dirname, "../..")
};

export default nextConfig;
