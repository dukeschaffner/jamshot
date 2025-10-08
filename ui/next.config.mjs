/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
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
    domains: ['pub-0b5b4b5c33744ae8907300ffc31c99c9.r2.dev', 'cdn-test.sterio.fm', 'cdn.sterio.fm'],
  },
};

export default nextConfig;
