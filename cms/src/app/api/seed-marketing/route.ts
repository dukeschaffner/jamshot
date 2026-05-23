import { getPayload } from 'payload'
import config from '@payload-config'
import { seedMarketingPages } from '@/lib/marketing/seedMarketingPages'

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Seeding is disabled in production.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'

  try {
    const payload = await getPayload({ config })
    const result = await seedMarketingPages(payload, { force })

    return Response.json(result)
  } catch (error) {
    console.error('Marketing seed failed:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Marketing seed failed' },
      { status: 500 },
    )
  }
}
