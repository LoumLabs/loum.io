/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/audio2text',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/audio2text' : '',
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
