'use client'

import { RefreshRouteOnSave as PayloadRefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'

export default function RefreshRouteOnSave() {
  const router = useRouter()
  const serverURL =
    process.env.NEXT_PUBLIC_CMS_URL ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : '')

  if (!serverURL) {
    return null
  }

  return (
    <PayloadRefreshRouteOnSave
      refresh={() => router.refresh()}
      serverURL={serverURL.replace(/\/$/, '')}
    />
  )
}
