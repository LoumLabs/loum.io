/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/audio2text',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/audio2text' : '',
  distDir: '../../audio2text',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  rewrites: async () => {
    return [
      {
        source: '/audio2text/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
}

module.exports = nextConfig
