/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode: false,
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
    domains: ['sterio-test.s3.us-east-2.amazonaws.com','sterio.s3.us-east-2.amazonaws.com'],
  },
};

export default nextConfig;
