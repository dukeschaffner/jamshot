import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const previewSecret = searchParams.get('previewSecret')
  const path = searchParams.get('path')
  const slug = searchParams.get('slug')

  if (!process.env.PREVIEW_SECRET || previewSecret !== process.env.PREVIEW_SECRET) {
    return new Response('Invalid preview secret', { status: 403 })
  }

  const resolvedPath = path || (slug === 'home' ? '/' : slug ? `/${slug}` : null)

  if (!resolvedPath || !resolvedPath.startsWith('/')) {
    return new Response('Missing or invalid preview path', { status: 400 })
  }

  const draft = await draftMode()
  draft.enable()

  redirect(resolvedPath)
}
