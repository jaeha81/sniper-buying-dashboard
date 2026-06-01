const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'

export interface FirecrawlResult {
  markdown: string
  title: string
  url: string
  statusCode: number
}

export type FirecrawlResponse =
  | { success: true; data: FirecrawlResult }
  | { success: false; error: string }

export async function scrapeUrl(url: string): Promise<FirecrawlResponse> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return { success: false, error: 'FIRECRAWL_API_KEY not configured' }
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
        timeout: 30000,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `Firecrawl ${res.status}: ${body}` }
    }

    const json = await res.json()

    if (!json.success || !json.data?.markdown) {
      return { success: false, error: 'Firecrawl returned empty content' }
    }

    return {
      success: true,
      data: {
        markdown: json.data.markdown as string,
        title: (json.data.metadata?.title as string) ?? '',
        url: (json.data.metadata?.sourceURL as string) ?? url,
        statusCode: (json.data.metadata?.statusCode as number) ?? 200,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function getIherbCategoryUrl(category: string): string {
  const categoryMap: Record<string, string> = {
    health: 'https://www.iherb.com/c/vitamins?sort=6',
    beauty: 'https://www.iherb.com/c/beauty?sort=6',
    sports: 'https://www.iherb.com/c/sports?sort=6',
  }
  return categoryMap[category] ?? `https://www.iherb.com/c/${category}?sort=6`
}
