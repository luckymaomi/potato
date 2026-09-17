import type { Edge } from '@xyflow/react'
import type { CanvasNode } from './canvasTypes'

export function downstreamNodeIds(startIds: string[], edges: Array<Pick<Edge, 'source' | 'target'>>): string[] {
  const visited = new Set(startIds)
  const queue = [...startIds]
  while (queue.length) {
    const source = queue.shift() as string
    for (const edge of edges) {
      if (edge.source !== source || visited.has(edge.target)) continue
      visited.add(edge.target)
      queue.push(edge.target)
    }
  }
  return [...visited]
}

export function orderByConnections(
  nodes: CanvasNode[],
  edges: Array<Pick<Edge, 'source' | 'target'>>,
  selectedIds: string[],
): CanvasNode[] {
  const selected = new Set(selectedIds)
  const nodeMap = new Map(nodes.filter((node) => selected.has(node.id)).map((node) => [node.id, node]))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  nodeMap.forEach((_, id) => { incoming.set(id, 0); outgoing.set(id, []) })
  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })
  const queue = [...nodeMap.keys()].filter((id) => incoming.get(id) === 0)
  const ordered: CanvasNode[] = []
  while (queue.length) {
    const id = queue.shift() as string
    ordered.push(nodeMap.get(id) as CanvasNode)
    outgoing.get(id)?.forEach((target) => {
      const next = (incoming.get(target) || 0) - 1
      incoming.set(target, next)
      if (next === 0) queue.push(target)
    })
  }
  if (ordered.length < nodeMap.size) throw new Error('运行范围中存在循环连线，请先删除形成闭环的连线')
  return ordered
}
