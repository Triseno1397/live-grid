import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // logo_url and hero_image_url are editorial content: an editor points them at whatever
    // host the asset lives on, so the allowlist cannot be enumerated ahead of time. Writes
    // to those columns are already restricted to editor/admin by RLS, which is where the
    // trust boundary belongs. Narrow this to named hosts once assets move to Supabase
    // Storage in Phase 2.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
