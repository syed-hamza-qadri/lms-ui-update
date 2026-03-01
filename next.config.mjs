/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: false,  // ✅ Enable image optimization
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,  // ✅ Enable GZIP compression
  poweredByHeader: false,  // ✅ Remove X-Powered-By header for security
  
  // Turbopack configuration (Turbopack is the default in Next.js 16)
  turbopack: {
    resolveAlias: {
      '@/*': ['./*'],
    },
  },

  // Enable experimental optimizations
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-icons',
      'lucide-react',
    ],
  },
}

export default nextConfig
