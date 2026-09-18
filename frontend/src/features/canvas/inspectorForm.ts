import type { ProductionNodeData, ProductionNodeParameters } from '../production/catalog'

export interface InspectorFormValues {
  title?: string
  parameters: ProductionNodeParameters
}

export function createInspectorFormValues(
  data: ProductionNodeData,
  defaultEpisodeId?: number,
): InspectorFormValues {
  return {
    title: data.title,
    parameters: {
      ...data.parameters,
      referenceImages: [...(data.parameters.referenceImages || [])],
      episodeId: data.parameters.episodeId ?? data.assetRefs.episodes?.[0] ?? defaultEpisodeId,
    },
  }
}
