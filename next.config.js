/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/audio2text',
  output: 'export',
  images: {
    unoptimized: true,
  },
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: '100mb',
  },
}

module.exports = nextConfig
