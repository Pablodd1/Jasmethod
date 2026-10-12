/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingIncludes: { "/*": ["./public/fonts/BarlowCondensed-SemiBold.ttf"] },
};

export default nextConfig;
