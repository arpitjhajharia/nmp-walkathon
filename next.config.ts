import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages that were folded into others. Old links and bookmarks still work.
  async redirects() {
    return [
      { source: "/players", destination: "/teams?view=players", permanent: true },
      { source: "/leaderboard", destination: "/teams?view=players", permanent: true },
      { source: "/standings", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
