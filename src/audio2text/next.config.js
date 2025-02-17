/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/audio2text',
  images: {
    unoptimized: true
  },
  trailingSlash: true
}

module.exports = nextConfig
