'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Scan, ExternalLink, CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react'
import { formatKRW, getCategoryLabel } from '@/lib/utils'
import { getSniperGrade } from '@/lib/calculator'

type Candidate = {
  id: string
  name: string
  category: string
  source_url: string
  source_site: string
  sniper_score: number
  margin_rate: number
  expected_margin: number
  domestic_expected_price: number
  overseas_price: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  ai_confidence: number
  exchange_rate_snapshot: number
  image_url?: string
  created_at: string
}

type ScanJob = {
  id: string
  job_type: string
  source_site: string
  category: string
  status: string
  total_items: number
  processed_items: number
  created_at: string
}

export default function DiscoverPage() {
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlResult, setUrlResult] = useState<string | null>(null)

  const [scanSite, setScanSite] = useState('iherb')
  const [scanCategory, setScanCategory] = useState('health')
  const [scanLoading, setScanLoading] = useState(false)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const [candRes, jobsRes] = await Promise.all([
      fetch('/api/discover/candidates'),
      fetch('/api/discover/jobs'),
    ])
    if (candRes.ok) {
      const d = await candRes.json()
      setCandidates(d.candidates ?? [])
    }
    if (jobsRes.ok) {
      const d = await jobsRes.json()
      setJobs(d.jobs ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleUrlAnalyze() {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    setUrlResult(null)
    try {
      const res = await fetch('/api/discover/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const data = await res.json()
      if (res.status === 201) {
        setUrlResult(`발굴 완료: Sniper Score ${data.result.sniperScore}점`)
        fetchData()
      } else if (res.status === 200) {
        setUrlResult('이미 등록된 상품입니다.')
      } else {
        setUrlResult(`실패: ${data.result?.reason ?? data.error}`)
      }
    } catch {
      setUrlResult('네트워크 오류')
    }
    setUrlLoading(false)
  }

  async function handleCategoryScan() {
    setScanLoading(true)
    try {
      const res = await fetch('/api/discover/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: scanSite, category: scanCategory }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(`스캔 등록 완료: ${data.totalItems}개 항목. Make.com이 처리합니다.`)
        fetchData()
      }
    } catch {
      alert('스캔 등록 실패')
    }
    setScanLoading(false)
  }

  async function handleApprove(productId: string) {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    if (res.ok) {
      setCandidates((prev) => prev.filter((c) => c.id !== productId))
    }
  }

  async function handleExclude(productId: string) {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    })
    if (res.ok) {
      setCandidates((prev) => prev.filter((c) => c.id !== productId))
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">상품 발굴</h1>
        <p className="text-muted-foreground mt-1">해외 상품을 자동 분석해 수익 후보를 발굴합니다</p>
      </div>

      {/* URL 단건 분석 */}
      <div className="card-luxury p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-gold" />
          URL 직접 분석
        </h2>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://www.iherb.com/pr/..."
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold/50"
            onKeyDown={(e) => e.key === 'Enter' && handleUrlAnalyze()}
          />
          <button
            onClick={handleUrlAnalyze}
            disabled={urlLoading}
            className="px-4 py-2 bg-gold-gradient text-luxury-bg text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {urlLoading ? '분석 중...' : '분석'}
          </button>
        </div>
        {urlResult && (
          <p className="mt-2 text-sm text-muted-foreground">{urlResult}</p>
        )}
      </div>

      {/* 카테고리 스캔 */}
      <div className="card-luxury p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Scan className="w-4 h-4 text-gold" />
          카테고리 자동 스캔
        </h2>
        <div className="flex gap-2 flex-wrap">
          <select
            value={scanSite}
            onChange={(e) => setScanSite(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground"
          >
            <option value="iherb">iHerb</option>
            <option value="amazon">Amazon</option>
            <option value="vitacost">Vitacost</option>
            <option value="costco">Costco</option>
          </select>
          <select
            value={scanCategory}
            onChange={(e) => setScanCategory(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground"
          >
            <option value="health">건강식품</option>
            <option value="sports">운동용품</option>
            <option value="beauty">뷰티</option>
            <option value="outdoor">아웃도어</option>
          </select>
          <button
            onClick={handleCategoryScan}
            disabled={scanLoading}
            className="px-4 py-2 border border-gold/20 text-gold text-sm rounded-lg hover:bg-gold/5 disabled:opacity-50"
          >
            {scanLoading ? '등록 중...' : '스캔 시작'}
          </button>
        </div>
      </div>

      {/* 스캔 현황 */}
      {jobs.length > 0 && (
        <div className="card-luxury p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            스캔 현황
          </h2>
          <div className="space-y-2">
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between text-xs py-2 border-b border-white/5">
                <span className="text-muted-foreground">
                  {job.source_site} / {job.category}
                </span>
                <span className="text-muted-foreground">
                  {job.processed_items}/{job.total_items}
                </span>
                <span className={
                  job.status === 'completed' ? 'text-green-400' :
                  job.status === 'failed' ? 'text-red-400' :
                  'text-yellow-400'
                }>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 검증된 후보 목록 */}
      <div className="card-luxury">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold" />
            검증된 후보 ({candidates.length}개, Sniper Score 순)
          </h2>
          <button onClick={fetchData} className="text-xs text-muted-foreground hover:text-foreground">
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">로딩 중...</div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            발굴된 후보가 없습니다. URL을 입력하거나 카테고리 스캔을 실행하세요.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {candidates.map((c) => {
              const { grade } = getSniperGrade(c.sniper_score)
              return (
                <div key={c.id} className="p-4 hover:bg-white/2">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex flex-col items-center justify-center shrink-0 text-white ${
                      c.sniper_score >= 75 ? 'bg-green-500' :
                      c.sniper_score >= 60 ? 'bg-blue-500' :
                      c.sniper_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}>
                      <span className="text-xs font-bold">{grade}</span>
                      <span className="text-xs">{c.sniper_score}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{getCategoryLabel(c.category as never)}</span>
                        <span>원가 ${c.overseas_price}</span>
                        <span>판매가 {formatKRW(c.domestic_expected_price)}</span>
                        <span className={c.margin_rate >= 25 ? 'text-green-400' : c.margin_rate >= 15 ? 'text-blue-400' : 'text-red-400'}>
                          마진 {c.margin_rate.toFixed(1)}%
                        </span>
                        <span className={c.risk_level === 'LOW' ? 'text-green-400' : c.risk_level === 'HIGH' ? 'text-red-400' : 'text-yellow-400'}>
                          {c.risk_level}
                        </span>
                        <span className="text-white/30">AI신뢰도 {(c.ai_confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-muted-foreground hover:text-gold"
                        title="원문 확인"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleExclude(c.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400"
                        title="제외"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleApprove(c.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 text-green-400 text-xs font-semibold rounded-lg hover:bg-green-500/20"
                        title="판매 승인"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
