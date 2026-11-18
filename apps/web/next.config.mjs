/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";

const nextConfig = {
  // Browser calls /api/core/* on the same origin; Next forwards them (with the session
  // cookie) to the Express API, which verifies the session and enforces RBAC.
  async rewrites() {
    return [{ source: "/api/core/:path*", destination: `${apiUrl}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
