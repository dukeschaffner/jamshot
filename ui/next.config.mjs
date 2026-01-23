/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@sterio/subscription-utils'],
  // // Enable static export for Amplify deployment
  // output: 'export',
  // trailingSlash: true,
  // images: {
  //   domains: ['sterio-test.s3.us-east-2.amazonaws.com','sterio.s3.us-east-2.amazonaws.com'],
  //   unoptimized: true, // Required for static export
  // },
  // // Ensure all assets are properly handled
  // assetPrefix: process.env.NODE_ENV === 'production' ? './' : '',

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-0b5b4b5c33744ae8907300ffc31c99c9.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'cdn-test.sterio.fm',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sterio.fm',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
