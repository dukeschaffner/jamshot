import { isPreviewMode } from '@/lib/marketing/getMarketingPage'
import PreviewBanner from './PreviewBanner'
import RefreshRouteOnSave from './RefreshRouteOnSave'

export default async function MarketingPreviewTools({ page }) {
  const preview = await isPreviewMode()

  return (
    <>
      {preview && <RefreshRouteOnSave />}
      {preview && <PreviewBanner />}
    </>
  )
}
