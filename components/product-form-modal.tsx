'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Toast from '@radix-ui/react-toast'
import { X, Plus, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import type { Product } from '@/lib/types'

type ProductFormData = {
  name: string
  category: Product['category']
  description: string
  overseasPrice: number
  domesticExpectedPrice: number
  internationalShippingCost: number
  domesticShippingCost: number
  taxEstimate: number
  paymentFee: number
  otherCosts: number
  demandScore: number
  priceCompetitivenessScore: number
  shippingStabilityScore: number
  competitionLevel: Product['competitionLevel']
  pageConvincingScore: number
  automationScore: number
  riskLevel: Product['riskLevel']
  sourceUrl: string
  status: Product['status']
  imageUrl: string
}

const DEFAULT_FORM: ProductFormData = {
  name: '',
  category: 'health',
  description: '',
  overseasPrice: 0,
  domesticExpectedPrice: 0,
  internationalShippingCost: 0,
  domesticShippingCost: 3000,
  taxEstimate: 0,
  paymentFee: 0,
  otherCosts: 0,
  demandScore: 3,
  priceCompetitivenessScore: 3,
  shippingStabilityScore: 3,
  competitionLevel: 'medium',
  pageConvincingScore: 3,
  automationScore: 3,
  riskLevel: 'LOW',
  sourceUrl: '',
  status: 'candidate',
  imageUrl: '',
}

interface ProductFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  onSuccess: () => void
}

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all'

const labelClass = 'text-xs text-muted-foreground tracking-wide uppercase mb-1.5 block'

export function ProductFormModal({ open, onOpenChange, product, onSuccess }: ProductFormModalProps) {
  const isEdit = !!product
  const [form, setForm] = useState<ProductFormData>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  })

  useEffect(() => {
    if (open) {
      if (product) {
        setForm({
          name: product.name,
          category: product.category,
          description: product.description,
          overseasPrice: product.overseasPrice,
          domesticExpectedPrice: product.domesticExpectedPrice,
          internationalShippingCost: product.internationalShippingCost,
          domesticShippingCost: product.domesticShippingCost,
          taxEstimate: product.taxEstimate,
          paymentFee: product.paymentFee,
          otherCosts: product.otherCosts,
          demandScore: product.demandScore,
          priceCompetitivenessScore: product.priceCompetitivenessScore,
          shippingStabilityScore: product.shippingStabilityScore,
          competitionLevel: product.competitionLevel,
          pageConvincingScore: product.pageConvincingScore,
          automationScore: product.automationScore,
          riskLevel: product.riskLevel,
          sourceUrl: product.sourceUrl,
          status: product.status,
          imageUrl: product.imageUrl ?? '',
        })
      } else {
        setForm(DEFAULT_FORM)
      }
      setConfirmDelete(false)
    }
  }, [open, product])

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ open: true, message, type })
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const url = isEdit ? `/api/products/${product!.id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'

      const body = isEdit
        ? { ...form, imageUrl: form.imageUrl || undefined }
        : {
            id: `prod-${Date.now()}`,
            ...form,
            imageUrl: form.imageUrl || undefined,
            localShippingCost: 0,
            competitorUrl: '',
            sniperScore: 0,
            totalCost: 0,
            expectedMargin: 0,
            marginRate: 0,
          }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '오류가 발생했습니다.')
      }

      showToast(isEdit ? '상품이 수정되었습니다.' : '상품이 추가되었습니다.', 'success')
      onSuccess()
      setTimeout(() => onOpenChange(false), 1000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '오류가 발생했습니다.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!product) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '삭제 중 오류가 발생했습니다.')
      }
      showToast('상품이 삭제되었습니다.', 'success')
      onSuccess()
      setTimeout(() => onOpenChange(false), 1000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Toast.Provider swipeDirection="right">
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-luxury-surface border border-white/10 rounded-2xl shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
                {isEdit ? (
                  <><Save className="w-4 h-4 text-gold" /> 상품 수정</>
                ) : (
                  <><Plus className="w-4 h-4 text-gold" /> 상품 추가</>
                )}
              </Dialog.Title>
              <Dialog.Close className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <X className="w-4 h-4" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
              {/* Basic Info */}
              <section>
                <h3 className="text-xs font-semibold text-gold tracking-widest uppercase mb-4">기본 정보</h3>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>상품명 *</label>
                    <input
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="상품명을 입력하세요"
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>카테고리 *</label>
                      <select name="category" value={form.category} onChange={handleChange} className={inputClass}>
                        <option value="health">건강식품</option>
                        <option value="sports">운동용품</option>
                        <option value="beauty">뷰티</option>
                        <option value="outdoor">아웃도어</option>
                        <option value="electronics">전자기기</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>상태 *</label>
                      <select name="status" value={form.status} onChange={handleChange} className={inputClass}>
                        <option value="candidate">검토중</option>
                        <option value="active">판매중</option>
                        <option value="paused">일시중지</option>
                        <option value="discontinued">단종</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>상품 설명</label>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      rows={3}
                      placeholder="상품 설명을 입력하세요"
                      className={inputClass + ' resize-none'}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>소싱 URL</label>
                    <input
                      name="sourceUrl"
                      type="text"
                      value={form.sourceUrl}
                      onChange={handleChange}
                      placeholder="https://www.iherb.com/..."
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>이미지 URL (선택)</label>
                    <input
                      name="imageUrl"
                      type="text"
                      value={form.imageUrl}
                      onChange={handleChange}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              {/* Pricing */}
              <section>
                <h3 className="text-xs font-semibold text-gold tracking-widest uppercase mb-4">가격 / 비용</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>해외 판매가 (USD)</label>
                    <input name="overseasPrice" type="number" step="0.01" min="0" value={form.overseasPrice} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>국내 판매 예정가 (KRW)</label>
                    <input name="domesticExpectedPrice" type="number" min="0" value={form.domesticExpectedPrice} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>국제 배송비 (KRW)</label>
                    <input name="internationalShippingCost" type="number" min="0" value={form.internationalShippingCost} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>국내 배송비 (KRW)</label>
                    <input name="domesticShippingCost" type="number" min="0" value={form.domesticShippingCost} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>관세·부가세 예상 (KRW)</label>
                    <input name="taxEstimate" type="number" min="0" value={form.taxEstimate} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>결제 수수료 (KRW)</label>
                    <input name="paymentFee" type="number" min="0" value={form.paymentFee} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>기타 비용 (KRW)</label>
                    <input name="otherCosts" type="number" min="0" value={form.otherCosts} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
              </section>

              {/* Sniper Scores */}
              <section>
                <h3 className="text-xs font-semibold text-gold tracking-widest uppercase mb-4">스나이퍼 스코어 지표</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>수요도 (1-5)</label>
                    <input name="demandScore" type="number" min="1" max="5" value={form.demandScore} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>가격 경쟁력 (1-5)</label>
                    <input name="priceCompetitivenessScore" type="number" min="1" max="5" value={form.priceCompetitivenessScore} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>배송 안정성 (1-5)</label>
                    <input name="shippingStabilityScore" type="number" min="1" max="5" value={form.shippingStabilityScore} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>페이지 설득력 (1-5)</label>
                    <input name="pageConvincingScore" type="number" min="1" max="5" value={form.pageConvincingScore} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>자동화 가능성 (1-5)</label>
                    <input name="automationScore" type="number" min="1" max="5" value={form.automationScore} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>경쟁 강도</label>
                    <select name="competitionLevel" value={form.competitionLevel} onChange={handleChange} className={inputClass}>
                      <option value="low">낮음</option>
                      <option value="medium">보통</option>
                      <option value="high">높음</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>통관 위험도</label>
                    <select name="riskLevel" value={form.riskLevel} onChange={handleChange} className={inputClass}>
                      <option value="LOW">낮음</option>
                      <option value="MEDIUM">보통</option>
                      <option value="HIGH">높음</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                {isEdit ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-all disabled:opacity-50 ${
                      confirmDelete
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'text-red-400 border border-red-500/30 hover:bg-red-500/10'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting ? '삭제 중...' : confirmDelete ? '정말 삭제할까요?' : '삭제'}
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-3">
                  <Dialog.Close className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all">
                    취소
                  </Dialog.Close>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2 bg-gold-gradient text-luxury-bg text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-gold-glow"
                  >
                    {submitting ? (
                      <span className="w-3.5 h-3.5 border-2 border-luxury-bg/30 border-t-luxury-bg rounded-full animate-spin" />
                    ) : isEdit ? (
                      <Save className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {submitting ? '처리 중...' : isEdit ? '저장' : '추가'}
                  </button>
                </div>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast */}
      <Toast.Root
        open={toast.open}
        onOpenChange={(o) => setToast((prev) => ({ ...prev, open: o }))}
        className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 ${
          toast.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}
        duration={3000}
      >
        {toast.type === 'success' ? (
          <CheckCircle className="w-4 h-4 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0" />
        )}
        <Toast.Title>{toast.message}</Toast.Title>
      </Toast.Root>
      <Toast.Viewport />
    </Toast.Provider>
  )
}
