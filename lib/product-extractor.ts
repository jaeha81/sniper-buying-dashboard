export interface ExtractedProduct {
  name: string
  overseasPrice: number
  currency: string
  category: 'health' | 'sports' | 'beauty' | 'outdoor' | 'electronics' | 'food' | 'medicine' | 'other'
  description: string
  brand: string
  reviewCount: number
  avgRating: number
  demandScore: number
  priceCompetitivenessScore: number
  shippingStabilityScore: number
  competitionLevel: 'low' | 'medium' | 'high'
  pageConvincingScore: number
  automationScore: number
  imageUrl: string
  confidence: number
  confidenceReasons: string[]
}

export interface ExtractResult {
  success: true
  product: ExtractedProduct
}

export interface ExtractError {
  success: false
  error: string
}

const EXTRACTION_PROMPT = `You are a product data extractor for a Korean import reselling business.

Analyze the following product page markdown and extract structured data.
Return ONLY valid JSON matching the schema below. No explanation, no markdown.

SCHEMA:
{
  "name": "full product name in Korean if possible, otherwise English",
  "overseasPrice": number (USD, numeric only, no currency symbol),
  "currency": "USD",
  "category": one of ["health","sports","beauty","outdoor","electronics","food","medicine","other"],
  "description": "1-2 sentence product description in Korean",
  "brand": "brand name",
  "reviewCount": number (0 if not found),
  "avgRating": number 0.0-5.0 (0 if not found),
  "demandScore": number 1-5 (estimate from review count: <100=1, <500=2, <2000=3, <5000=4, >=5000=5),
  "priceCompetitivenessScore": number 1-5 (how cheap vs Korean market: very cheap=5, similar=3, expensive=1),
  "shippingStabilityScore": number 1-5 (iHerb/Amazon=4, unknown=3),
  "competitionLevel": one of ["low","medium","high"],
  "pageConvincingScore": number 1-5 (product page quality: many photos+reviews=5),
  "automationScore": number 1-5 (simple product=5, complex options=2),
  "imageUrl": "main product image URL or empty string",
  "confidence": number 0.0-1.0 (how confident you are in price accuracy),
  "confidenceReasons": ["reason1 if confidence < 0.8"]
}

CONFIDENCE RULES (reduce confidence for):
- Price not clearly visible: -0.4
- Price in non-USD currency: -0.2
- Multiple price options (size/flavor): -0.1
- Product name unclear: -0.2
- Page is a category/list page (not single product): -0.5

PRODUCT PAGE MARKDOWN:
`

export async function extractProductData(
  markdown: string,
  sourceUrl: string
): Promise<ExtractResult | ExtractError> {
  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'

  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY not configured' }
  }

  const trimmedMarkdown = markdown.slice(0, 4000)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://sniper-buying-dashboard.vercel.app',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: EXTRACTION_PROMPT + trimmedMarkdown,
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      return { success: false, error: `OpenRouter ${res.status}` }
    }

    const json = await res.json()
    const content = json.choices?.[0]?.message?.content

    if (!content) {
      return { success: false, error: 'OpenRouter returned empty content' }
    }

    const parsed = JSON.parse(content) as ExtractedProduct

    if (!parsed.name || !parsed.overseasPrice || parsed.overseasPrice <= 0) {
      return {
        success: false,
        error: `Extraction failed: name="${parsed.name}" price=${parsed.overseasPrice}`,
      }
    }

    if (parsed.overseasPrice > 10000) {
      return {
        success: false,
        error: `Price out of range: $${parsed.overseasPrice} — likely extraction error`,
      }
    }

    return { success: true, product: parsed }
  } catch (err) {
    return { success: false, error: `Parse error: ${String(err)}` }
  }
}
