import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  BranchesOutlined,
  BulbOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  StopOutlined,
  ToolOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Button,
  Drawer,
  Dropdown,
  Empty,
  Input,
  List,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tooltip,
  Typography,
  type MenuProps,
} from 'antd'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { productionApi } from '../../api/production'
import { userErrorMessage } from '../../errors/appError'
import { productionRoles, type ProductionRole, type ProductionRoleDefinition } from '../production/catalog'
import { createStarterWorkspace } from '../production/starterWorkspace'
import { waitForTask } from '../production/executor'
import { useCanvasStore, type CanvasNode, type WorkflowGroup } from '../../store/canvasStore'
import { CanvasInspector } from './CanvasInspector'
import { CanvasNodeView } from './CanvasNode'
import type { CanvasSaveState } from './canvasSaveCoordinator'
import { downstreamNodeIds } from './canvasGraph'
import { CanvasRunSession, CanvasRunStoppedError } from './runSession'
import { runWorkflow, WorkflowRunTerminatedError } from './workflowRunner'

const nodeTypes = { canvas: CanvasNodeView }

function saveStateLabel(state: CanvasSaveState): string {
  if (state === 'dirty') return '待保存'
  if (state === 'saving') return '保存中'
  if (state === 'error') return '保存失败'
  if (state === 'conflict') return '保存冲突'
  return '已保存'
}

function templateIcon(template: ProductionRoleDefinition): ReactNode {
  if (template.stage === 'assets') {
    if (template.assetKind === 'character') return <UserOutlined />
    if (template.assetKind === 'scene') return <EnvironmentOutlined />
    if (template.assetKind === 'prop') return <ToolOutlined />
  }
  if (template.stage === 'storyboard') return <ApartmentOutlined />
  if (template.role === 'story') return <BulbOutlined />
  if (template.material === 'image') return <PictureOutlined />
  if (template.material === 'video') return <VideoCameraOutlined />
  return <FileTextOutlined />
}

const nodeTools = productionRoles.map((template) => ({
  key: template.role,
  label: `添加${template.label}`,
  description: template.description,
  icon: templateIcon(template),
}))

export function CanvasPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const project = useCanvasStore((state) => state.project)
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const workflowGroups = useCanvasStore((state) => state.workflowGroups)
  const loading = useCanvasStore((state) => state.loading)
  const error = useCanvasStore((state) => state.error)
  const saveState = useCanvasStore((state) => state.saveState)
  const saveError = useCanvasStore((state) => state.saveError)
  const load = useCanvasStore((state) => state.load)
  const setNodes = useCanvasStore((state) => state.setNodes)
  const setEdges = useCanvasStore((state) => state.setEdges)
  const addNode = useCanvasStore((state) => state.addNode)
  const addEdgeToStore = useCanvasStore((state) => state.addEdge)
  const queueSave = useCanvasStore((state) => state.queueSave)
  const save = useCanvasStore((state) => state.save)
  const hasUnsavedChanges = useCanvasStore((state) => state.hasUnsavedChanges)
  const disposeSaveCoordinator = useCanvasStore((state) => state.disposeSaveCoordinator)
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode)
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes)
  const removeNodes = useCanvasStore((state) => state.removeNodes)
  const replaceWorkspace = useCanvasStore((state) => state.replaceWorkspace)
  const createWorkflowGroup = useCanvasStore((state) => state.createWorkflowGroup)
  const updateWorkflowGroup = useCanvasStore((state) => state.updateWorkflowGroup)
  const removeWorkflowGroup = useCanvasStore((state) => state.removeWorkflowGroup)
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)

  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [workflowDrawerOpen, setWorkflowDrawerOpen] = useState(false)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<WorkflowGroup | null>(null)
  const [groupName, setGroupName] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeEpisodeId, setFinalizeEpisodeId] = useState<number>()
  const runSessionRef = useRef<CanvasRunSession | null>(null)
  const selection = nodes.filter((node) => node.selected).map((node) => node.id)
  const projectId = project?.id
  const activeRun = running || finalizing

  useEffect(() => {
    const projectId = Number(id)
    if (!Number.isFinite(projectId)) return
    void load(projectId)
  }, [id, load])

  useEffect(() => {
    if (loading || !projectId) return
    queueSave()
  }, [nodes, edges, workflowGroups, projectId, loading, queueSave])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => () => {
    void disposeSaveCoordinator().catch(() => undefined)
  }, [disposeSaveCoordinator])

  useEffect(() => () => {
    void runSessionRef.current?.stop().catch(() => undefined)
  }, [])

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => setNodes(changes), [setNodes])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges(changes), [setEdges])
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const next: Edge = {
      ...connection,
      source: connection.source,
      target: connection.target,
      id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
      type: 'bezier',
    }
    addEdgeToStore(next)
  }, [addEdgeToStore])
  const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    const ids = selectedNodes.map((node) => node.id)
    setSelectedNode(ids.length === 1 ? ids[0] : null)
  }, [setSelectedNode])

  const add = (role: ProductionRole) => {
    addNode(role, { x: 110 + (nodes.length % 5) * 290, y: 120 + Math.floor(nodes.length / 5) * 230 })
  }

  const runNodeIds = useCallback(async (ids: string[], label: string) => {
    if (runSessionRef.current) {
      message.info('已有任务正在运行，请先停止或等待完成')
      return
    }
    const state = useCanvasStore.getState()
    if (!state.project) return
    const uniqueIds = [...new Set(ids)].filter((nodeId) => state.nodes.some((node) => node.id === nodeId))
    if (!uniqueIds.length) {
      message.info('当前运行范围没有节点')
      return
    }
    const session = new CanvasRunSession()
    runSessionRef.current = session
    setRunning(true)
    try {
      await useCanvasStore.getState().save()
      const result = await runWorkflow({
        ids: uniqueIds,
        label,
        session,
        getState: () => {
          const current = useCanvasStore.getState()
          if (!current.project) throw new Error('项目已经关闭')
          return { project: current.project, nodes: current.nodes, edges: current.edges }
        },
        updateNode: updateNodeData,
      })
      message.success(`${label}完成：${result.completed} 个节点成功`)
    } catch (runError) {
      if (runError instanceof CanvasRunStoppedError || session.stopped) {
        message.info(`${label}已停止，后续节点没有运行`)
      } else if (runError instanceof WorkflowRunTerminatedError) {
        message.error(runError.message)
      } else {
        message.error(userErrorMessage(runError))
      }
    } finally {
      try {
        await useCanvasStore.getState().save()
      } catch (saveError) {
        message.error(`运行结果尚未保存：${userErrorMessage(saveError)}`)
      }
      if (runSessionRef.current === session) runSessionRef.current = null
      setRunning(false)
      setStopping(false)
    }
  }, [updateNodeData])

  const stopRunning = useCallback(async () => {
    const session = runSessionRef.current
    if (!session || session.stopped) return
    setStopping(true)
    try {
      await session.stop()
    } catch (stopError) {
      message.warning(`本地编排已停止，但后端取消请求失败：${userErrorMessage(stopError)}`)
    }
  }, [])

  const runNode = useCallback(async (nodeId: string) => {
    await runNodeIds([nodeId], '当前节点')
  }, [runNodeIds])
  const runDownstream = useCallback(async (nodeId: string) => {
    const state = useCanvasStore.getState()
    await runNodeIds(downstreamNodeIds([nodeId], state.edges), '下游分支')
  }, [runNodeIds])

  const saveNow = async () => {
    try {
      await save()
      message.success('画布已保存')
    } catch (saveError) {
      message.error(userErrorMessage(saveError))
    }
  }

  const navigateAfterSave = async (target: string) => {
    try {
      await save()
      navigate(target)
    } catch (saveError) {
      message.error(`尚未离开画布：${userErrorMessage(saveError)}`)
    }
  }

  const reloadAfterConflict = async () => {
    const nextProjectId = Number(id)
    if (!Number.isFinite(nextProjectId)) return
    await load(nextProjectId)
    const loadError = useCanvasStore.getState().error
    if (loadError) {
      message.error(loadError)
      return
    }
    message.success('已重新加载服务端画布')
  }

  const saveGroup = async () => {
    const name = groupName.trim()
    if (!name) { message.info('请输入工作流名称'); return }
    if (editingGroup) updateWorkflowGroup(editingGroup.id, { name })
    else {
      if (selection.length < 2) { message.info('请先选择至少两个节点'); return }
      createWorkflowGroup(selection, name)
    }
    setGroupModalOpen(false)
    setEditingGroup(null)
    setGroupName('')
    await useCanvasStore.getState().save()
    message.success(editingGroup ? '工作流已重命名' : '所选节点已保存为工作流')
  }

  const openCreateGroup = () => {
    if (selection.length < 2) { message.info('请先选择至少两个节点'); return }
    setEditingGroup(null)
    setGroupName(`工作流 ${workflowGroups.length + 1}`)
    setGroupModalOpen(true)
  }

  const openEditGroup = (group: WorkflowGroup) => {
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupModalOpen(true)
  }

  const selectGroup = (group: WorkflowGroup) => {
    const selectedIds = new Set(group.nodeIds)
    setNodes(nodes.map((node) => ({ id: node.id, type: 'select' as const, selected: selectedIds.has(node.id) })))
    setSelectedNode(group.nodeIds.length === 1 ? group.nodeIds[0] : null)
    setWorkflowDrawerOpen(false)
  }

  const restoreStarter = async () => {
    if (!project) return
    replaceWorkspace(createStarterWorkspace(project))
    await useCanvasStore.getState().save()
    setRestoreOpen(false)
    message.success('默认短剧工作流已恢复')
  }

  const finalize = async () => {
    if (!finalizeEpisodeId) { message.info('请选择要合成的剧集'); return }
    if (runSessionRef.current) { message.info('已有任务正在运行，请先停止或等待完成'); return }
    const session = new CanvasRunSession()
    runSessionRef.current = session
    setFinalizing(true)
    try {
      await useCanvasStore.getState().save()
      if (!project) throw new Error('项目已经关闭')
      const submitted = await productionApi.execute({ kind: 'finalize', project_id: project.id, episode_id: finalizeEpisodeId })
      if (!submitted.task_id) throw new Error('后端没有返回整集合成任务 ID')
      await waitForTask(submitted.task_id, () => undefined, session)
      message.success('整集合成完成')
      setFinalizeOpen(false)
    } catch (finalizeError) {
      if (finalizeError instanceof CanvasRunStoppedError || session.stopped) message.info('整集合成已停止')
      else message.error(userErrorMessage(finalizeError))
    } finally {
      if (runSessionRef.current === session) runSessionRef.current = null
      setFinalizing(false)
      setStopping(false)
    }
  }

  const runMenu: MenuProps = {
    items: [
      { key: 'selection', label: `运行所选节点${selection.length ? `（${selection.length}）` : ''}`, disabled: !selection.length },
      { key: 'downstream', label: '从当前节点运行后续', disabled: selection.length !== 1 },
      { key: 'all', label: `运行整个画布（${nodes.length}）`, disabled: !nodes.length },
    ],
    onClick: ({ key }) => {
      if (key === 'selection') void runNodeIds(selection, '所选节点')
      if (key === 'downstream' && selection[0]) void runDownstream(selection[0])
      if (key === 'all') void runNodeIds(nodes.map((node) => node.id), '整个画布')
    },
  }

  const addNodeMenu: MenuProps = {
    items: [
      {
        type: 'group',
        label: '短剧生产链',
        children: nodeTools.filter((tool) => !tool.key.startsWith('generic-')).map((tool) => ({
          key: tool.key,
          icon: tool.icon,
          label: tool.label.replace(/^添加/u, ''),
          extra: tool.description,
        })),
      },
      {
        type: 'group',
        label: '通用材料',
        children: nodeTools.filter((tool) => tool.key.startsWith('generic-')).map((tool) => ({
          key: tool.key,
          icon: tool.icon,
          label: tool.label.replace(/^添加/u, ''),
          extra: tool.description,
        })),
      },
    ],
    onClick: ({ key }) => add(key as ProductionRole),
  }

  return (
    <div className="canvas-page">
      <header className="canvas-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => void navigateAfterSave('/')}>项目</Button>
        <div className="canvas-project-title">
          <Typography.Text type="secondary">画布工作台</Typography.Text>
          <strong>{project?.title || '加载中…'}</strong>
        </div>
        <div className="canvas-top-actions">
          <Tooltip title="AI 配置"><Button icon={<SettingOutlined />} onClick={() => void navigateAfterSave('/ai-config')} /></Tooltip>
          <Tooltip title="工作流管理"><Button icon={<BranchesOutlined />} onClick={() => setWorkflowDrawerOpen(true)} /></Tooltip>
          <Tooltip title="恢复默认模板"><Button icon={<ReloadOutlined />} onClick={() => setRestoreOpen(true)} /></Tooltip>
          <Tooltip title={saveError || saveStateLabel(saveState)}>
            <span className={`canvas-save-state is-${saveState}`}>{saveStateLabel(saveState)}</span>
          </Tooltip>
          {saveState === 'conflict' ? (
            <Popconfirm
              title="重新加载会放弃本页尚未保存的修改，是否继续？"
              okText="重新加载"
              cancelText="保留当前页"
              okButtonProps={{ danger: true }}
              onConfirm={() => void reloadAfterConflict()}
            >
              <Button danger icon={<ReloadOutlined />}>处理冲突</Button>
            </Popconfirm>
          ) : (
            <Button
              danger={saveState === 'error'}
              icon={<SaveOutlined />}
              loading={saveState === 'saving'}
              onClick={() => void saveNow()}
            >{saveState === 'error' ? '重试保存' : '保存'}</Button>
          )}
          {activeRun ? (
            <Button danger icon={<StopOutlined />} loading={stopping} onClick={() => void stopRunning()}>停止运行</Button>
          ) : (
            <Space.Compact>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                disabled={!nodes.length}
                onClick={() => void runNodeIds(nodes.map((node) => node.id), '整个画布')}
              >运行全部</Button>
              <Dropdown menu={runMenu}><Button type="primary" icon={<DownOutlined />} aria-label="选择运行范围" /></Dropdown>
            </Space.Compact>
          )}
          <Button disabled={activeRun} icon={<VideoCameraOutlined />} onClick={() => { setFinalizeEpisodeId(project?.episodes?.[0]?.id); setFinalizeOpen(true) }}>合成整集</Button>
        </div>
      </header>

      <div className="canvas-body">
        <div className="canvas-main">
          <Spin spinning={loading} tip="加载项目…" className="canvas-spin">
            {error ? (
              <div className="canvas-error">
                <Empty description={error} />
                <Button icon={<ReloadOutlined />} onClick={() => void load(Number(id))}>重新加载</Button>
              </div>
            ) : (
              <ReactFlow<CanvasNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onSelectionChange={onSelectionChange}
                fitView
                minZoom={0.15}
                maxZoom={2}
                selectionOnDrag
                selectNodesOnDrag
                panOnDrag
                nodesConnectable
                nodesDraggable
                elementsSelectable
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: 'bezier' }}
              >
                <Background color="#d8ddd9" gap={24} size={1} />
                <Controls position="bottom-left" />
                <MiniMap position="bottom-right" nodeColor="#9ca8a2" maskColor="rgb(245 246 243 / 76%)" />

                <Panel position="top-left" className="node-tool-palette">
                  <Dropdown menu={addNodeMenu} trigger={['click']} placement="bottomLeft">
                    <Tooltip title="添加节点"><Button type="text" icon={<PlusOutlined />} aria-label="添加节点" /></Tooltip>
                  </Dropdown>
                </Panel>

                {selection.length > 0 && (
                  <Panel position="bottom-center" className="selection-command-bar">
                    <span className="selection-count">已选 {selection.length}</span>
                    {running ? (
                      <Button danger icon={<StopOutlined />} loading={stopping} onClick={() => void stopRunning()}>停止</Button>
                    ) : (
                      <Button type="primary" icon={<PlayCircleOutlined />} disabled={finalizing} onClick={() => void runNodeIds(selection, '所选节点')}>运行所选</Button>
                    )}
                    <Tooltip title="保存为工作流"><Button icon={<FolderOpenOutlined />} aria-label="保存为工作流" disabled={selection.length < 2} onClick={openCreateGroup} /></Tooltip>
                    <Tooltip title="复制所选"><Button icon={<CopyOutlined />} aria-label="复制所选" onClick={() => duplicateNodes(selection)} /></Tooltip>
                    <Popconfirm
                      title={`删除所选 ${selection.length} 个节点？`}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => removeNodes(selection)}
                    >
                      <Tooltip title="删除所选"><Button danger icon={<DeleteOutlined />} aria-label="删除所选" /></Tooltip>
                    </Popconfirm>
                  </Panel>
                )}
              </ReactFlow>
            )}
          </Spin>
        </div>
        <CanvasInspector
          running={activeRun}
          stopping={stopping}
          onRunNode={runNode}
          onRunDownstream={runDownstream}
          onStop={stopRunning}
        />
      </div>

      <Drawer title="工作流" width={380} open={workflowDrawerOpen} onClose={() => setWorkflowDrawerOpen(false)}>
        <div className="workflow-drawer-toolbar">
          <span>{workflowGroups.length} 个已保存工作流</span>
          <Button type="primary" icon={<PlusOutlined />} disabled={selection.length < 2} onClick={openCreateGroup}>保存所选</Button>
        </div>
        <List
          dataSource={workflowGroups}
          locale={{ emptyText: '还没有保存的工作流' }}
          renderItem={(group) => (
            <List.Item className="workflow-list-item">
              <div className="workflow-list-main" role="button" tabIndex={0} onClick={() => selectGroup(group)} onKeyDown={(event) => { if (event.key === 'Enter') selectGroup(group) }}>
                <strong>{group.name}</strong>
                <span>{group.nodeIds.length} 个节点</span>
              </div>
              <Space size={2}>
                <Tooltip title="运行这个工作流"><Button type="text" icon={<PlayCircleOutlined />} disabled={activeRun} onClick={() => void runNodeIds(group.nodeIds, group.name)} /></Tooltip>
                <Tooltip title="重命名"><Button type="text" icon={<EditOutlined />} onClick={() => openEditGroup(group)} /></Tooltip>
                <Popconfirm title="删除这个工作流？" onConfirm={() => removeWorkflowGroup(group.id)}>
                  <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
                </Popconfirm>
              </Space>
            </List.Item>
          )}
        />
      </Drawer>

      <Modal
        title={editingGroup ? '重命名工作流' : '保存为工作流'}
        open={groupModalOpen}
        onOk={() => void saveGroup()}
        onCancel={() => setGroupModalOpen(false)}
        okText="保存"
      >
        <Input value={groupName} maxLength={60} autoFocus onChange={(event) => setGroupName(event.target.value)} onPressEnter={() => void saveGroup()} />
      </Modal>

      <Modal
        title="恢复默认模板"
        open={restoreOpen}
        okText="恢复模板"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onOk={() => void restoreStarter()}
        onCancel={() => setRestoreOpen(false)}
      >
        <Typography.Paragraph>当前节点、连线和已保存工作流会被默认短剧工作流替换。</Typography.Paragraph>
      </Modal>

      <Modal
        title="合成整集"
        open={finalizeOpen}
        confirmLoading={finalizing}
        onOk={() => void finalize()}
        onCancel={() => { if (finalizing) void stopRunning(); else setFinalizeOpen(false) }}
        okText="提交合成"
        cancelText={finalizing ? '停止合成' : '取消'}
      >
        <Select
          style={{ width: '100%' }}
          value={finalizeEpisodeId}
          onChange={setFinalizeEpisodeId}
          placeholder="选择剧集"
          options={(project?.episodes || []).map((episode) => ({ value: episode.id, label: episode.title || `第 ${episode.episode_number} 集` }))}
        />
      </Modal>
    </div>
  )
}
