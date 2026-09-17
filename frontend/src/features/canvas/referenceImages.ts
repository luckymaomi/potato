export function addReferenceImage(current: string[], candidate: string): string[] {
  const value = candidate.trim()
  if (!isReferenceImageSource(value)) {
    throw new Error('请输入 http(s) 图片地址，或使用“上传本地图片”')
  }
  return [...new Set([...current, value])]
}

export function removeReferenceImage(current: string[], target: string): string[] {
  return current.filter((source) => source !== target)
}

function isReferenceImageSource(value: string): boolean {
  return /^https?:\/\/\S+$/iu.test(value) || /^\/static\/\S+$/iu.test(value)
}
