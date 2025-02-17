/** @type {import('next').NextConfig} */
const nextConfig = {
  target: 'serverless',
  output: 'export',
  basePath: '/audio2text',
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
