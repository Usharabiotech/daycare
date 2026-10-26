/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PGlite ships WASM files that must be loaded from node_modules at runtime, not bundled.
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
  },
};

export default nextConfig;
