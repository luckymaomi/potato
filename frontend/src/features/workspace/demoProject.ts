import { projectsApi } from "../../api/projects";
import { RAINY_NIGHT_DEMO } from "../production/queenAccessionDemoDefinition";

export async function openRainyNightDemo(): Promise<number> {
  const result = await projectsApi.list({ page: 1, page_size: 200 });
  const demo = result.items.find((item) => item.metadata?.demo === true);
  if (!demo)
    throw new Error(
      "尚未初始化《女王登基》示例，请先运行 Demo 初始化脚本",
    );

  const project = await projectsApi.get(demo.id);
  const assetCount =
    RAINY_NIGHT_DEMO.characters.length +
    RAINY_NIGHT_DEMO.scenes.length +
    RAINY_NIGHT_DEMO.props.length;
  const complete =
    project.metadata.demo_contract === RAINY_NIGHT_DEMO.contract &&
    project.project_assets?.length === assetCount &&
    project.episodes?.[0]?.panels?.length === RAINY_NIGHT_DEMO.panels.length;
  if (!complete)
    throw new Error(
      "《女王登基》示例尚未完整初始化，请重新运行 Demo 初始化脚本",
    );
  return project.id;
}
