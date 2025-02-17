/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/audio2text',
  images: {
    unoptimized: true
  },
  trailingSlash: true
}

module.exports = nextConfig
