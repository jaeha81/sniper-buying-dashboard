import { Skeleton } from '@/components/ui/skeleton'

function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/6 bg-luxury-surface p-5 space-y-4">
      {/* Image placeholder */}
      <Skeleton className="w-full h-40 rounded-xl" />
      {/* Badge row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
      {/* Title */}
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
      {/* Price row */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  )
}

export default function ProductsLoading() {
  return (
    <div className="min-h-screen bg-luxury-bg">
      {/* Page header skeleton */}
      <div className="border-b border-white/5 bg-luxury-surface">
        <div className="container mx-auto px-6 py-12 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Filter panel skeleton */}
        <div className="border border-white/6 bg-luxury-surface rounded-2xl p-5 mb-8 space-y-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-14 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-36 rounded-lg" />
          </div>
        </div>

        {/* Results count skeleton */}
        <Skeleton className="h-4 w-32 mb-6" />

        {/* Product grid — 8 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
