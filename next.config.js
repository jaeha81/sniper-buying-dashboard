/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@splinetool/react-spline', '@splinetool/runtime'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'm.media-amazon.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com', pathname: '/**' },
      { protocol: 'https', hostname: '*.media-amazon.com', pathname: '/**' },
      { protocol: 'https', hostname: 'cf.iherb.com', pathname: '/**' },
      { protocol: 'https', hostname: '*.iherb.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'prod.spline.design', pathname: '/**' },
    ],
  },
  webpack: (config) => {
    config.resolve.conditionNames = [
      'import',
      ...(config.resolve.conditionNames ?? []),
    ]
    return config
  },
}

module.exports = nextConfig
