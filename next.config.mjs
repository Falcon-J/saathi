/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional build-only cap for memory-constrained development machines.
  ...(process.env.SAATHI_BUILD_WORKERS === "1" ? { experimental: { cpus: 1 } } : {}),
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
