import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  BranchesOutlined,
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
import { projectsApi } from '../../api/projects'
import { createStarterWorkspace } from '../templates/starterWorkspace'
import { useWorkbenchStore, type CanvasNode, type CanvasNodeKind, type WorkflowGroup } from '../../store/workbenchStore'
import { CanvasInspector } from './CanvasInspector'
import { CanvasNodeView } from './CanvasNode'
import { downstreamNodeIds, executeCanvasNode, orderByConnections, prepareNodeForExecution, waitForTask } from './workflow'

const nodeTypes = { canvas: CanvasNodeView }

const nodeTools: Array<{ kind: CanvasNodeKind; label: string; icon: ReactNode }> = [
  { kind: 'text', label: '添加文本节点', icon: <FileTextOutlined /> },
  { kind: 'image', label: '添加图片节点', icon: <PictureOutlined /> },
  { kind: 'video', label: '添加视频节点', icon: <VideoCameraOutlined /> },
  { kind: 'character', label: '添加角色节点', icon: <UserOutlined /> },
  { kind: 'scene', label: '添加场景节点', icon: <EnvironmentOutlined /> },
  { kind: 'prop', label: '添加道具节点', icon: <ToolOutlined /> },
  { kind: 'storyboard', label: '添加分镜节点', icon: <ApartmentOutlined /> },
]

export function CanvasPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const project = useWorkbenchStore((state) => state.project)
  const nodes = useWorkbenchStore((state) => state.nodes)
  const edges = useWorkbenchStore((state) => state.edges)
  const workflowGroups = useWorkbenchStore((state) => state.workflowGroups)
  const loading = useWorkbenchStore((state) => state.loading)
  const saving = useWorkbenchStore((state) => state.saving)
  const error = useWorkbenchStore((state) => state.error)
  const load = useWorkbenchStore((state) => state.load)
  const setNodes = useWorkbenchStore((state) => state.setNodes)
  const setEdges = useWorkbenchStore((state) => state.setEdges)
  const addNode = useWorkbenchStore((state) => state.addNode)
  const addEdgeToStore = useWorkbenchStore((state) => state.addEdge)
  const save = useWorkbenchStore((state) => state.save)
  const setSelectedNode = useWorkbenchStore((state) => state.setSelectedNode)
  const duplicateNodes = useWorkbenchStore((state) => state.duplicateNodes)
  const removeNodes = useWorkbenchStore((state) => state.removeNodes)
  const replaceWorkspace = useWorkbenchStore((state) => state.replaceWorkspace)
  const createWorkflowGroup = useWorkbenchStore((state) => state.createWorkflowGroup)
  const updateWorkflowGroup = useWorkbenchStore((state) => state.updateWorkflowGroup)
  const removeWorkflowGroup = useWorkbenchStore((state) => state.removeWorkflowGroup)
  const updateNodeData = useWorkbenchStore((state) => state.updateNodeData)

  const [running, setRunning] = useState(false)
  const [workflowDrawerOpen, setWorkflowDrawerOpen] = useState(false)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<WorkflowGroup | null>(null)
  const [groupName, setGroupName] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeEpisodeId, setFinalizeEpisodeId] = useState<number>()
  const initialized = useRef(false)
  const selection = nodes.filter((node) => node.selected).map((node) => node.id)

  useEffect(() => {
    const projectId = Number(id)
    if (!Number.isFinite(projectId)) return
    initialized.current = false
    void load(projectId).then(() => { initialized.current = true })
  }, [id, load])

  useEffect(() => {
    if (!initialized.current || !project) return
    const timer = window.setTimeout(() => { void save().catch(() => undefined) }, 900)
    return () => window.clearTimeout(timer)
  }, [nodes, edges, workflowGroups, project, save])

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

  const add = (kind: CanvasNodeKind) => {
    addNode(kind, { x: 110 + (nodes.length % 5) * 290, y: 120 + Math.floor(nodes.length / 5) * 230 })
  }

  const runNodeIds = useCallback(async (ids: string[], label: string) => {
    const state = useWorkbenchStore.getState()
    if (!state.project) return
    const uniqueIds = [...new Set(ids)].filter((nodeId) => state.nodes.some((node) => node.id === nodeId))
    if (!uniqueIds.length) {
      message.info('当前运行范围没有节点')
      return
    }
    setRunning(true)
    let completed = 0
    let failed = 0
    const failedIds = new Set<string>()
    try {
      const ordered = orderByConnections(state.nodes, state.edges, uniqueIds)
      for (const orderedNode of ordered) {
        const current = useWorkbenchStore.getState()
        const node = current.nodes.find((item) => item.id === orderedNode.id)
        if (!node) continue
        const blockedBy = current.edges.find((edge) => edge.target === node.id && failedIds.has(edge.source))
        if (blockedBy) {
          failedIds.add(node.id)
          failed += 1
          updateNodeData(node.id, { status: 'failed', error: '上游节点失败，本节点未运行' })
          continue
        }
        const prepared = prepareNodeForExecution(node, current.nodes, current.edges)
        updateNodeData(node.id, prepared.data)
        try {
          await executeCanvasNode(prepared, current.project as NonNullable<typeof current.project>, updateNodeData)
          completed += 1
        } catch (runError) {
          failedIds.add(node.id)
          failed += 1
          updateNodeData(node.id, { status: 'failed', error: (runError as Error).message })
        }
      }
      await useWorkbenchStore.getState().save()
      if (failed) message.warning(`${label}完成：${completed} 个成功，${failed} 个失败`)
      else message.success(`${label}完成：${completed} 个节点成功`)
    } catch (runError) {
      message.error((runError as Error).message)
    } finally {
      setRunning(false)
    }
  }, [updateNodeData])

  const runNode = useCallback(async (nodeId: string) => {
    await runNodeIds([nodeId], '当前节点')
  }, [runNodeIds])
  const runDownstream = useCallback(async (nodeId: string) => {
    const state = useWorkbenchStore.getState()
    await runNodeIds(downstreamNodeIds([nodeId], state.edges), '下游分支')
  }, [runNodeIds])

  const saveNow = async () => {
    try {
      await save()
      message.success('画布已保存')
    } catch (saveError) {
      message.error((saveError as Error).message)
    }
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
    await useWorkbenchStore.getState().save()
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
    await useWorkbenchStore.getState().save()
    setRestoreOpen(false)
    message.success('默认短剧工作流已恢复')
  }

  const finalize = async () => {
    if (!finalizeEpisodeId) { message.info('请选择要合成的剧集'); return }
    setFinalizing(true)
    try {
      await useWorkbenchStore.getState().save()
      const submitted = await projectsApi.finalizeEpisode(finalizeEpisodeId)
      const task = await waitForTask(submitted.task_id, () => undefined)
      if (task.status !== 'completed') throw new Error(task.error || task.message || '整集合成失败')
      message.success('整集合成完成')
      setFinalizeOpen(false)
    } catch (finalizeError) {
      message.error((finalizeError as Error).message)
    } finally {
      setFinalizing(false)
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

  return (
    <div className="canvas-page">
      <header className="canvas-topbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>项目</Button>
        <div className="canvas-project-title">
          <Typography.Text type="secondary">画布工作台</Typography.Text>
          <strong>{project?.title || '加载中…'}</strong>
        </div>
        <div className="canvas-top-actions">
          <Tooltip title="AI 配置"><Button icon={<SettingOutlined />} onClick={() => navigate('/ai-config')} /></Tooltip>
          <Tooltip title="工作流管理"><Button icon={<BranchesOutlined />} onClick={() => setWorkflowDrawerOpen(true)} /></Tooltip>
          <Tooltip title="恢复默认模板"><Button icon={<ReloadOutlined />} onClick={() => setRestoreOpen(true)} /></Tooltip>
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => void saveNow()}>保存</Button>
          <Space.Compact>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={running}
              disabled={!nodes.length}
              onClick={() => void runNodeIds(nodes.map((node) => node.id), '整个画布')}
            >运行全部</Button>
            <Dropdown menu={runMenu} disabled={running}><Button type="primary" icon={<DownOutlined />} aria-label="选择运行范围" /></Dropdown>
          </Space.Compact>
          <Button icon={<VideoCameraOutlined />} onClick={() => { setFinalizeEpisodeId(project?.episodes?.[0]?.id); setFinalizeOpen(true) }}>合成整集</Button>
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
                  <Tooltip title="添加节点" placement="right"><div className="node-tool-palette-heading"><PlusOutlined /></div></Tooltip>
                  {nodeTools.map((tool) => (
                    <Tooltip title={tool.label} placement="right" key={tool.kind}>
                      <Button type="text" icon={tool.icon} aria-label={tool.label} onClick={() => add(tool.kind)} />
                    </Tooltip>
                  ))}
                </Panel>

                {selection.length > 0 && (
                  <Panel position="bottom-center" className="selection-command-bar">
                    <span className="selection-count">已选 {selection.length}</span>
                    <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void runNodeIds(selection, '所选节点')}>运行所选</Button>
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
        <CanvasInspector running={running} onRunNode={runNode} onRunDownstream={runDownstream} />
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
                <Tooltip title="运行这个工作流"><Button type="text" icon={<PlayCircleOutlined />} loading={running} onClick={() => void runNodeIds(group.nodeIds, group.name)} /></Tooltip>
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
        onCancel={() => setFinalizeOpen(false)}
        okText="提交合成"
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
