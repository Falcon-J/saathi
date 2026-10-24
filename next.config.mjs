/** @type {import('next').NextConfig} */
const nextConfig = {
  logging: {
    serverFunctions: false,
  },
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
