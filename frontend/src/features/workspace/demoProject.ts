import { projectsApi } from '../../api/projects'
import { RAINY_NIGHT_DEMO } from '../production/rainyNightDemoDefinition'

export async function openRainyNightDemo(): Promise<number> {
  const result = await projectsApi.list({ page: 1, page_size: 200 })
  const demo = result.items.find((item) => item.metadata?.demo === true)
  if (!demo) throw new Error('尚未初始化《红女王》Demo，请先在项目根目录运行 python init_demo.py')

  const project = await projectsApi.get(demo.id)
  const assetCount = RAINY_NIGHT_DEMO.characters.length + RAINY_NIGHT_DEMO.scenes.length + RAINY_NIGHT_DEMO.props.length
  const complete = project.metadata.demo_contract === RAINY_NIGHT_DEMO.contract
    && project.project_assets?.length === assetCount
    && project.episodes?.[0]?.storyboards?.length === RAINY_NIGHT_DEMO.storyboards.length
  if (!complete) throw new Error('《红女王》Demo 尚未完整初始化，请重新运行 python init_demo.py')
  return project.id
}
