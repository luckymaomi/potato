import type { Edge } from '@xyflow/react'
import type { CanvasNode } from '../canvas/canvasTypes'
import { isReusableProductionNode } from './lifecycle'
import {
  productionPlugin,
  type AssetReferenceKind,
  type AssetReferences,
  type ContextKind,
  type ResolvedProductionContext,
} from './catalog'

const assetContextKinds: readonly AssetReferenceKind[] = ['episodes', 'characters', 'scenes', 'props', 'storyboards']

export function resolveNodeContext(
  node: CanvasNode,
  nodes: CanvasNode[],
  edges: Array<Pick<Edge, 'source' | 'target'>>,
): ResolvedProductionContext {
  const plugin = productionPlugin(node.data.role)
  const upstream = directUpstreamNodes(node.id, nodes, edges)
  const assetRefs: AssetReferences = cloneRefs(node.data.assetRefs)
  const values: ResolvedProductionContext['values'] = {}
  const texts: string[] = []
  const images: string[] = []
  const videos: string[] = []

  for (const requirement of plugin.inputs) {
    const kind = requirement.kind
    if (isAssetKind(kind)) {
      const refs = upstream.filter((candidate) => reusable(candidate) && produces(candidate, kind)).flatMap((candidate) => (
        candidate.data.result.assetRefs?.[kind] || candidate.data.assetRefs[kind] || []
      ))
      if (refs.length) assetRefs[kind] = [...new Set([...(assetRefs[kind] || []), ...refs])]
      continue
    }
    if (kind === 'story' || kind === 'script' || kind === 'text') {
      const found = upstream.filter((candidate) => reusable(candidate) && produces(candidate, kind)).flatMap((candidate) => nodeText(candidate) || [])
      found.forEach((text) => { if (!texts.includes(text)) texts.push(text) })
      if (found.length) values[kind] = found.join('\n\n')
      continue
    }
    if (kind === 'image' || kind === 'storyboard-image') {
      upstream.filter((candidate) => reusable(candidate) && produces(candidate, kind)).forEach((candidate) => {
        const url = candidate.data.result.outputUrl
        if (url && !images.includes(url)) images.push(url)
        mergeAssetRefs(assetRefs, candidate.data.result.assetRefs || candidate.data.assetRefs)
      })
      continue
    }
    if (kind === 'shot-videos') {
      upstream.filter((candidate) => reusable(candidate) && produces(candidate, kind)).forEach((candidate) => {
        const url = candidate.data.result.outputUrl
        if (url && !videos.includes(url)) videos.push(url)
      })
    }
  }

  return { values, texts, images, videos, assetRefs }
}

function directUpstreamNodes(
  targetId: string,
  nodes: CanvasNode[],
  edges: Array<Pick<Edge, 'source' | 'target'>>,
): CanvasNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return edges
    .filter((edge) => edge.target === targetId)
    .flatMap((edge) => nodesById.get(edge.source) || [])
}

function produces(node: CanvasNode, kind: ContextKind): boolean {
  return productionPlugin(node.data.role).outputs.some((output) => output.kind === kind)
}

function nodeText(node: CanvasNode): string | undefined {
  return node.data.result.text?.trim() || undefined
}

function reusable(node: CanvasNode): boolean {
  return isReusableProductionNode(node.data)
}

function isAssetKind(value: ContextKind): value is AssetReferenceKind {
  return assetContextKinds.includes(value as AssetReferenceKind)
}

function cloneRefs(refs: AssetReferences): AssetReferences {
  return Object.fromEntries(Object.entries(refs).map(([key, values]) => [key, values ? [...values] : values])) as AssetReferences
}

function mergeAssetRefs(target: AssetReferences, source: AssetReferences): void {
  for (const kind of assetContextKinds) {
    const values = source[kind] || []
    if (values.length) target[kind] = [...new Set([...(target[kind] || []), ...values])]
  }
}
