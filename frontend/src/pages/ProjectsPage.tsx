import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Card, Empty, Form, Input, Modal, Popconfirm, Space, Spin, Tag, Tooltip, Upload } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { userErrorMessage } from '../errors/appError'
import { createDemoProject } from '../features/production/demoWorkspace'
import { createStarterWorkspace } from '../features/production/starterWorkspace'
import type { Project } from '../types/domain'

interface ProjectFormValues {
  title: string
  description?: string
  genre?: string
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function nodeCount(project: Project): number {
  const layout = project.metadata?.canvas_layout
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return 0
  const nodes = (layout as { workspace_nodes?: unknown[] }).workspace_nodes
  return Array.isArray(nodes) ? nodes.length : 0
}

export function ProjectsPage() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [creatingDemo, setCreatingDemo] = useState(false)
  const [form] = Form.useForm<ProjectFormValues>()

  const loadProjects = useCallback(async (keyword?: string) => {
    try {
      const result = await projectsApi.list({ page: 1, page_size: 100, keyword: keyword?.trim() || undefined })
      setProjects(result.items)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    let active = true
    void projectsApi.list({ page: 1, page_size: 100 })
      .then((result) => { if (active) setProjects(result.items) })
      .catch((error: unknown) => { if (active) message.error(userErrorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [message])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (project: Project) => {
    setEditing(project)
    form.setFieldsValue({ title: project.title, description: project.description || '', genre: project.genre || '' })
    setModalOpen(true)
  }

  const saveProject = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        const updated = await projectsApi.update(editing.id, values)
        setProjects((current) => current.map((project) => project.id === updated.id ? updated : project))
        message.success('项目信息已更新')
        setModalOpen(false)
        return
      }
      const project = await projectsApi.create({ ...values, style: 'realistic', metadata: { aspect_ratio: '9:16' } })
      const starter = createStarterWorkspace(project)
      await projectsApi.saveCanvasLayout(project.id, starter, project.canvas_revision)
      message.success('项目和默认工作流已创建')
      setModalOpen(false)
      form.resetFields()
      navigate(`/film/${project.id}/canvas`)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const removeProject = async (project: Project) => {
    try {
      await projectsApi.remove(project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
      message.success('项目已删除')
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const importProject = async (file: File) => {
    try {
      const project = await projectsApi.import(file)
      message.success('项目已导入')
      navigate(`/film/${project.id}/canvas`)
    } catch (error) {
      message.error(userErrorMessage(error))
    }
    return false
  }

  const exportProject = async (project: Project) => {
    try {
      const blob = await projectsApi.export(project.id)
      downloadBlob(blob, `${project.title || 'project'}.zip`)
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const openDemo = async () => {
    setCreatingDemo(true)
    try {
      const id = await createDemoProject()
      navigate(`/film/${id}/canvas`)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setCreatingDemo(false)
    }
  }

  return (
    <>
      <header className="page-heading projects-heading">
        <div>
          <span className="page-kicker">CREATIVE WORKSPACE</span>
          <h1>项目工作台</h1>
          <p>每个新项目都会带一条可编辑的默认短剧工作流。</p>
        </div>
        <Space wrap>
          <Upload accept=".zip" showUploadList={false} beforeUpload={importProject}>
            <Button icon={<ImportOutlined />}>导入项目</Button>
          </Upload>
          <Button icon={<PlayCircleOutlined />} loading={creatingDemo} onClick={() => void openDemo()}>完整 Demo</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button>
        </Space>
      </header>

      <div className="project-list-toolbar">
        <Input.Search
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索项目名称或说明"
          onSearch={(value) => { setLoading(true); void loadProjects(value) }}
        />
        <span>{projects.length} 个项目</span>
      </div>

      <Spin spinning={loading}>
        {projects.length ? (
          <div className="project-grid">
            {projects.map((project) => (
              <Card
                className="project-card"
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/film/${project.id}/canvas`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate(`/film/${project.id}/canvas`)
                  }
                }}
                cover={(
                  <div className={`project-cover project-cover-tone-${project.id % 4}`}>
                    {project.thumbnail ? <img src={project.thumbnail} alt="" /> : <VideoCameraOutlined />}
                    <span>{nodeCount(project) ? `${nodeCount(project)} 个节点` : '待初始化'}</span>
                  </div>
                )}
              >
                <div className="project-card-body">
                  <div className="project-title-row">
                    <h2 className="project-title">{project.title}</h2>
                    {project.metadata?.demo === true && <Tag bordered={false}>{project.metadata?.demo_provider === 'pearapi' ? 'PearAPI Demo' : 'Demo'}</Tag>}
                  </div>
                  <p className="project-description">{project.description || '尚未填写项目说明'}</p>
                  <div className="project-meta">
                    <span>{project.genre || '未分类'}</span>
                    <span>{project.updated_at ? new Date(project.updated_at).toLocaleString() : '刚刚创建'}</span>
                  </div>
                  <div className="project-actions" onClick={(event) => event.stopPropagation()}>
                    <Tooltip title="编辑项目信息"><Button type="text" icon={<EditOutlined />} aria-label="编辑项目信息" onClick={() => openEdit(project)} /></Tooltip>
                    <Tooltip title="导出项目"><Button type="text" icon={<DownloadOutlined />} aria-label="导出项目" onClick={() => void exportProject(project)} /></Tooltip>
                    <Popconfirm
                      title="删除项目"
                      description={`确定删除“${project.title}”及其全部画布数据吗？`}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void removeProject(project)}
                    >
                      <Tooltip title="删除项目"><Button type="text" danger icon={<DeleteOutlined />} aria-label="删除项目" /></Tooltip>
                    </Popconfirm>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : !loading ? (
          <div className="empty-band">
            <Empty description="没有找到项目">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建第一个项目</Button>
            </Empty>
          </div>
        ) : null}
      </Spin>

      <Modal
        title={editing ? '编辑项目' : '新建项目'}
        open={modalOpen}
        confirmLoading={saving}
        onOk={() => void saveProject()}
        onCancel={() => setModalOpen(false)}
        okText={editing ? '保存修改' : '创建并打开'}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input autoFocus maxLength={80} />
          </Form.Item>
          <Form.Item name="genre" label="类型"><Input placeholder="悬疑、都市、科幻…" maxLength={40} /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea rows={4} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}
