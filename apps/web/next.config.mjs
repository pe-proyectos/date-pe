/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'r2.date.pe' }],
  },
};

export default nextConfig;
