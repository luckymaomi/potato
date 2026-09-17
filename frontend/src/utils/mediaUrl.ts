export function mediaUrl(value?: string | null): string {
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (/^(https?:|data:|blob:)/i.test(text)) return text
  return text.startsWith('/static/') ? text : `/static/${text.replace(/^\/+/, '')}`
}
