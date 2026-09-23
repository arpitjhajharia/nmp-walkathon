import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Players and the leaderboard now live on the Teams & players page. Old links still work.
  async redirects() {
    return [
      { source: "/players", destination: "/teams?view=players", permanent: true },
      { source: "/leaderboard", destination: "/teams?view=players", permanent: true },
    ];
  },
};

export default nextConfig;
