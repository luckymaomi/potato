import type { Logger, SQLiteDatabase } from "../types/core";
import { PanelRepository } from "./panelRepository";
import { ProjectAssetRepository } from "./projectAssetRepository";

export {
  normalizeOutputType,
  normalizeTextProfile,
} from "./projectAssetRepository";
export { normalizeStringArray } from "./workspaceNormalize";

/** 工作区资产+分镜门面：对外仍用 services.assets，内部按变化原因分仓储。 */
export class AssetRepository {
  readonly projectAssets: ProjectAssetRepository;
  readonly panels: PanelRepository;

  constructor(db: SQLiteDatabase, log?: Logger) {
    this.projectAssets = new ProjectAssetRepository(db, log, (assetId) =>
      this.panels.markAssetImageChanged(assetId),
    );
    this.panels = new PanelRepository(db, this.projectAssets, log);
  }

  listProjectAssets(...args: Parameters<ProjectAssetRepository["listProjectAssets"]>) {
    return this.projectAssets.listProjectAssets(...args);
  }
  getProjectAsset(...args: Parameters<ProjectAssetRepository["getProjectAsset"]>) {
    return this.projectAssets.getProjectAsset(...args);
  }
  createProjectAsset(...args: Parameters<ProjectAssetRepository["createProjectAsset"]>) {
    return this.projectAssets.createProjectAsset(...args);
  }
  updateProjectAsset(...args: Parameters<ProjectAssetRepository["updateProjectAsset"]>) {
    return this.projectAssets.updateProjectAsset(...args);
  }
  deleteProjectAsset(...args: Parameters<ProjectAssetRepository["deleteProjectAsset"]>) {
    return this.projectAssets.deleteProjectAsset(...args);
  }

  getPanel(...args: Parameters<PanelRepository["getPanel"]>) {
    return this.panels.getPanel(...args);
  }
  listPanels(...args: Parameters<PanelRepository["listPanels"]>) {
    return this.panels.listPanels(...args);
  }
  episode(...args: Parameters<PanelRepository["episode"]>) {
    return this.panels.episode(...args);
  }
  createPanel(...args: Parameters<PanelRepository["createPanel"]>) {
    return this.panels.createPanel(...args);
  }
  updatePanel(...args: Parameters<PanelRepository["updatePanel"]>) {
    return this.panels.updatePanel(...args);
  }
  deletePanel(...args: Parameters<PanelRepository["deletePanel"]>) {
    return this.panels.deletePanel(...args);
  }
  syncPanels(...args: Parameters<PanelRepository["syncPanels"]>) {
    return this.panels.syncPanels(...args);
  }
  markAssetImageChanged(...args: Parameters<PanelRepository["markAssetImageChanged"]>) {
    return this.panels.markAssetImageChanged(...args);
  }
  markPanelImageChanged(...args: Parameters<PanelRepository["markPanelImageChanged"]>) {
    return this.panels.markPanelImageChanged(...args);
  }
}
