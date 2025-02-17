/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/audio2text',
  experimental: {
    outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || process.cwd(),
  },
}

module.exports = nextConfig
