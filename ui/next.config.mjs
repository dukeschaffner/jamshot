/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static export for now - we'll use a different approach
  // output: 'export',
  // trailingSlash: true,
  images: {
    domains: ['sterio-test.s3.us-east-2.amazonaws.com','sterio.s3.us-east-2.amazonaws.com'],
  },
  // Ensure all assets are properly handled
  assetPrefix: process.env.NODE_ENV === 'production' ? './' : '',
};

export default nextConfig;
