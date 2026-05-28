import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-luxury p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — product list */}
        <div className="lg:col-span-2 card-luxury">
          <div className="px-5 pt-5 pb-4 border-b border-white/5">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="p-4 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Category breakdown */}
          <div className="card-luxury p-5 space-y-3">
            <Skeleton className="h-4 w-28 mb-4" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="card-luxury p-5 space-y-3">
            <Skeleton className="h-4 w-20 mb-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
