import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose", "canvas"],
  // Telegram grafiklari uchun shrift — serverless funksiyaga qo'shilsin.
  outputFileTracingIncludes: {
    "/api/**": ["./lib/server/assets/fonts/**/*"],
  },
};

export default nextConfig;
