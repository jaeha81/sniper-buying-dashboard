import type { SniperScoreResult } from '@/lib/types'
import { getSniperGrade } from '@/lib/calculator'

interface SniperScoreBarProps {
  score: number
  breakdown?: SniperScoreResult['breakdown']
  showBreakdown?: boolean
}

const scoreItems = [
  { key: 'demand', label: '국내수요', max: 20, color: 'bg-blue-500' },
  { key: 'priceCompetitiveness', label: '가격경쟁력', max: 20, color: 'bg-indigo-500' },
  { key: 'margin', label: '마진율', max: 20, color: 'bg-green-500' },
  { key: 'shippingStability', label: '배송안정성', max: 15, color: 'bg-teal-500' },
  { key: 'customsRisk', label: '통관리스크', max: 10, color: 'bg-orange-500' },
  { key: 'competition', label: '경쟁강도', max: 5, color: 'bg-pink-500' },
  { key: 'pageConvincing', label: '페이지설득력', max: 5, color: 'bg-purple-500' },
  { key: 'automation', label: '자동화적합도', max: 5, color: 'bg-yellow-500' },
]

export function SniperScoreBar({ score, breakdown, showBreakdown = false }: SniperScoreBarProps) {
  const { grade, label, color } = getSniperGrade(score)

  return (
    <div className="space-y-3">
      {/* 총점 표시 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">스나이퍼 스코어</span>
          <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold text-white ${
              score >= 80
                ? 'bg-green-500'
                : score >= 65
                ? 'bg-blue-500'
                : score >= 50
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
          >
            {grade}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
          <span className="text-sm text-gray-400">/100</span>
        </div>
      </div>

      {/* 전체 바 */}
      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            score >= 80
              ? 'bg-green-500'
              : score >= 65
              ? 'bg-blue-500'
              : score >= 50
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="text-xs text-gray-500 text-right">{label}</div>

      {/* 세부 항목별 바 */}
      {showBreakdown && breakdown && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">항목별 점수</p>
          {scoreItems.map((item) => {
            const value = breakdown[item.key as keyof typeof breakdown]
            const pct = (value / item.max) * 100
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="font-medium text-gray-800">
                    {value}
                    <span className="text-gray-400">/{item.max}</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${item.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
