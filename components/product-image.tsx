'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

type Category = 'health' | 'sports' | 'beauty' | 'outdoor' | 'electronics' | string

interface ProductImageProps {
  imageUrl?: string
  category: Category
  alt: string
  className?: string
  fill?: boolean
  sizes?: string
  priority?: boolean
}

// SVG icons per category — drawn as pure SVG paths, no emoji
const CategorySVGIcon: React.FC<{ category: Category }> = ({ category }) => {
  switch (category) {
    case 'health':
      // Pill / capsule shape
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Capsule body */}
          <rect x="8" y="20" width="40" height="16" rx="8" fill="none" stroke="#C9A84C" strokeWidth="2.5" opacity="0.9"/>
          {/* Center divider */}
          <line x1="28" y1="20" x2="28" y2="36" stroke="#C9A84C" strokeWidth="2" opacity="0.6"/>
          {/* Left half fill */}
          <path d="M8 28 Q8 20 16 20 L28 20 L28 36 L16 36 Q8 36 8 28Z" fill="#C9A84C" opacity="0.15"/>
          {/* Plus cross */}
          <line x1="40" y1="24" x2="40" y2="32" stroke="#C9A84C" strokeWidth="2" opacity="0.5"/>
          <line x1="36" y1="28" x2="44" y2="28" stroke="#C9A84C" strokeWidth="2" opacity="0.5"/>
        </svg>
      )
    case 'sports':
      // Dumbbell shape
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Bar */}
          <rect x="16" y="26" width="24" height="4" rx="2" fill="#C9A84C" opacity="0.7"/>
          {/* Left weight plate */}
          <rect x="6" y="20" width="10" height="16" rx="3" fill="none" stroke="#C9A84C" strokeWidth="2.5" opacity="0.9"/>
          <rect x="8" y="22" width="6" height="12" rx="2" fill="#C9A84C" opacity="0.15"/>
          {/* Right weight plate */}
          <rect x="40" y="20" width="10" height="16" rx="3" fill="none" stroke="#C9A84C" strokeWidth="2.5" opacity="0.9"/>
          <rect x="42" y="22" width="6" height="12" rx="2" fill="#C9A84C" opacity="0.15"/>
        </svg>
      )
    case 'beauty':
      // Leaf / organic shape
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Leaf outline */}
          <path
            d="M28 44 C28 44 10 36 10 22 C10 14 18 10 28 10 C38 10 46 14 46 22 C46 36 28 44 28 44Z"
            fill="#C9A84C" opacity="0.12"
            stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"
          />
          {/* Center vein */}
          <line x1="28" y1="42" x2="28" y2="12" stroke="#C9A84C" strokeWidth="1.5" opacity="0.6"/>
          {/* Side veins */}
          <line x1="28" y1="22" x2="18" y2="18" stroke="#C9A84C" strokeWidth="1" opacity="0.4"/>
          <line x1="28" y1="22" x2="38" y2="18" stroke="#C9A84C" strokeWidth="1" opacity="0.4"/>
          <line x1="28" y1="30" x2="20" y2="27" stroke="#C9A84C" strokeWidth="1" opacity="0.4"/>
          <line x1="28" y1="30" x2="36" y2="27" stroke="#C9A84C" strokeWidth="1" opacity="0.4"/>
        </svg>
      )
    case 'outdoor':
      // Mountain silhouette
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Back mountain */}
          <path d="M6 42 L22 16 L38 42Z" fill="#C9A84C" opacity="0.12" stroke="#C9A84C" strokeWidth="1.5" strokeLinejoin="round"/>
          {/* Front mountain */}
          <path d="M18 42 L34 18 L50 42Z" fill="#C9A84C" opacity="0.18" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
          {/* Snow cap */}
          <path d="M28 19 L34 30 L22 30Z" fill="#C9A84C" opacity="0.35"/>
          {/* Sun */}
          <circle cx="44" cy="14" r="4" fill="none" stroke="#C9A84C" strokeWidth="1.5" opacity="0.7"/>
        </svg>
      )
    case 'electronics':
      // Circuit / chip shape
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Chip body */}
          <rect x="18" y="18" width="20" height="20" rx="3" fill="#C9A84C" opacity="0.12" stroke="#C9A84C" strokeWidth="2.5"/>
          {/* Top pins */}
          <line x1="24" y1="18" x2="24" y2="10" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          <line x1="32" y1="18" x2="32" y2="10" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          {/* Bottom pins */}
          <line x1="24" y1="38" x2="24" y2="46" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          <line x1="32" y1="38" x2="32" y2="46" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          {/* Left pins */}
          <line x1="18" y1="24" x2="10" y2="24" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          <line x1="18" y1="32" x2="10" y2="32" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          {/* Right pins */}
          <line x1="38" y1="24" x2="46" y2="24" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          <line x1="38" y1="32" x2="46" y2="32" stroke="#C9A84C" strokeWidth="2" opacity="0.7"/>
          {/* Inner dot */}
          <circle cx="28" cy="28" r="3" fill="#C9A84C" opacity="0.5"/>
        </svg>
      )
    default:
      // Generic box / package
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="20" width="32" height="24" rx="3" fill="none" stroke="#C9A84C" strokeWidth="2.5" opacity="0.8"/>
          <line x1="12" y1="30" x2="44" y2="30" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5"/>
          <path d="M20 20 L16 12 L40 12 L44 20" stroke="#C9A84C" strokeWidth="2" fill="none" opacity="0.6"/>
          <line x1="24" y1="30" x2="24" y2="44" stroke="#C9A84C" strokeWidth="1.5" opacity="0.4"/>
        </svg>
      )
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  health: '건강식품',
  sports: '운동용품',
  beauty: '뷰티',
  outdoor: '아웃도어',
  electronics: '전자기기',
}

interface SVGPlaceholderProps {
  category: Category
  className?: string
}

function SVGPlaceholder({ category, className }: SVGPlaceholderProps) {
  const label = CATEGORY_LABELS[category] ?? category

  return (
    <div
      className={cn('relative w-full h-full flex flex-col items-center justify-center overflow-hidden', className)}
      style={{
        background: 'linear-gradient(145deg, #1a1610 0%, #0f0d08 50%, #1a1610 100%)',
      }}
    >
      {/* Subtle radial glow behind icon */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(201,168,76,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Gold corner accents */}
      <div
        className="absolute top-0 left-0 w-8 h-8 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(201,168,76,0.18) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none"
        style={{
          background: 'linear-gradient(315deg, rgba(201,168,76,0.18) 0%, transparent 60%)',
        }}
      />

      {/* Border glow — implemented as box-shadow on an inset element */}
      <div
        className="absolute inset-0 rounded-inherit pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.15)',
        }}
      />

      {/* Icon */}
      <div className="relative z-10 mb-2 opacity-90">
        <CategorySVGIcon category={category} />
      </div>

      {/* Category label */}
      <span
        className="relative z-10 text-xs font-semibold tracking-widest uppercase"
        style={{
          color: '#C9A84C',
          opacity: 0.75,
          letterSpacing: '0.12em',
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        {label}
      </span>
    </div>
  )
}

export function ProductImage({
  imageUrl,
  category,
  alt,
  className,
  fill = true,
  sizes,
  priority = false,
}: ProductImageProps) {
  const [imgError, setImgError] = useState(false)

  // Show placeholder if no URL or if image failed to load
  if (!imageUrl || imgError) {
    return (
      <SVGPlaceholder
        category={category}
        className={className}
      />
    )
  }

  if (fill) {
    return (
      <Image
        src={imageUrl}
        alt={alt}
        fill
        className={cn('object-cover', className)}
        sizes={sizes ?? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
        priority={priority}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={600}
      height={450}
      className={cn('object-cover w-full h-full', className)}
      sizes={sizes ?? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
      priority={priority}
      onError={() => setImgError(true)}
    />
  )
}
