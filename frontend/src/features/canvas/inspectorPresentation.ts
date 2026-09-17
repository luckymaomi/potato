import type { MediaGenerationHistory } from '../../api/media'
import type { ProviderModel } from '../../types/domain'

export function modelOptionLabel(model: ProviderModel): string {
  return model.id || model.label
}

export function historyVersionLabels(
  rows: MediaGenerationHistory[],
  kind: 'image' | 'video',
): Map<number, string> {
  const noun = kind === 'image' ? '图片' : '视频'
  const ordered = [...rows].sort((left, right) => (
    Date.parse(left.created_at) - Date.parse(right.created_at) || left.id - right.id
  ))
  return new Map(ordered.map((item, index) => [
    item.id,
    `${localTime(item.created_at)} - ${noun}${String(index + 1).padStart(2, '0')}`,
  ]))
}

function localTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}
