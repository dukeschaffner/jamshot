declare module '@payloadcms/next/css'

declare module '*.scss' {
  const content: Record<string, string>
  export default content
}
