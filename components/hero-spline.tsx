'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback } from 'react'

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
  loading: () => <HeroOrbsFallback />,
})

function HeroOrbsFallback() {
  return (
    <div className="w-full h-full relative">
      <div className="hero-orb hero-orb-gold" style={{ top: '-80px', right: '5%' }} />
      <div className="hero-orb hero-orb-purple" style={{ top: '40%', right: '-30px' }} />
      <div className="hero-orb hero-orb-teal" style={{ bottom: '15%', right: '35%' }} />
      {/* Grid lines */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(201,168,76,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(201,168,76,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />
    </div>
  )
}

export default function HeroSpline() {
  const [hasError, setHasError] = useState(false)

  const handleError = useCallback(() => {
    setHasError(true)
  }, [])

  if (hasError) return <HeroOrbsFallback />

  return (
    <Spline
      scene="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode"
      onError={handleError}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
