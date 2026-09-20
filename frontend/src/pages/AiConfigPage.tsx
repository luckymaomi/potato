import { ReloadOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { aiConfigsApi } from '../api/aiConfigs'
import { userErrorMessage } from '../errors/appError'
import type { AiModelPresets, ProviderCatalogStatus, ProviderModel, ServiceType } from '../types/domain'
import { modelCapabilityLabels, supportsService } from '../features/providers/catalog'
import { emptyModelPresets, modelPresetFromKey, modelPresetKey, modelPresetOptions } from '../features/providers/modelPresets'

const serviceLabels: Record<ServiceType, string> = { image: '图片', video: '视频' }

export function AiConfigPage() {
  const { message } = AntdApp.useApp()
  const [serviceType, setServiceType] = useState<ServiceType>('image')
  const [providers, setProviders] = useState<ProviderCatalogStatus[]>([])
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState<string[]>([])
  const [presets, setPresets] = useState<AiModelPresets>(emptyModelPresets)
  const [savingPresets, setSavingPresets] = useState(false)
  const saveTimer = useRef<number>()
  const presetsRef = useRef(presets)

  useEffect(() => {
    presetsRef.current = presets
  }, [presets])

  useEffect(() => {
    let active = true
    void Promise.all([aiConfigsApi.providers(), aiConfigsApi.models(), aiConfigsApi.modelPresets()])
      .then(([providerItems, modelItems, savedPresets]) => {
        if (!active) return
        setProviders(providerItems)
        setModels(modelItems)
        setPresets(savedPresets)
      })
      .catch((error: unknown) => { if (active) message.error(userErrorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [message])

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
  }, [])

  const refresh = async (provider: ProviderCatalogStatus) => {
    setRefreshing((current) => [...current, provider.id])
    try {
      const refreshed = await aiConfigsApi.refreshModels(provider.id)
      setModels((current) => [
        ...current.filter((model) => model.provider !== provider.id),
        ...refreshed,
      ])
      setProviders(await aiConfigsApi.providers())
      message.success(`${provider.label} 已同步 ${refreshed.length} 个实时模型`)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setRefreshing((current) => current.filter((id) => id !== provider.id))
    }
  }

  const visibleProviders = useMemo(
    () => providers.filter((provider) => supportsService(provider.capabilities, serviceType)),
    [providers, serviceType],
  )
  const presetOptions = useMemo(() => Object.fromEntries(
    (Object.keys(serviceLabels) as ServiceType[]).map((type) => [
      type,
      modelPresetOptions(type, models, providers, presets[type]),
    ]),
  ) as Record<ServiceType, ReturnType<typeof modelPresetOptions>>, [models, presets, providers])

  const queueSavePresets = (next: AiModelPresets) => {
    setPresets(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        setSavingPresets(true)
        try {
          const saved = await aiConfigsApi.saveModelPresets(presetsRef.current)
          setPresets(saved)
          message.success('默认模型已自动保存')
        } catch (error) {
          message.error(userErrorMessage(error))
        } finally {
          setSavingPresets(false)
        }
      })()
    }, 280)
  }

  return (
    <>
      <header className="page-heading">
        <div><h1>AI 供应商</h1></div>
      </header>
      <section className="settings-surface model-preset-surface">
        <div className="model-preset-heading">
          <div>
            <h2>默认模型预设</h2>
            <Typography.Text type="secondary">{savingPresets ? '正在保存…' : '选择后自动保存'}</Typography.Text>
          </div>
        </div>
        <div className="model-preset-grid">
          {(Object.keys(serviceLabels) as ServiceType[]).map((type) => (
            <label className="model-preset-field" key={type}>
              <span>{serviceLabels[type]}模型</span>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={loading}
                value={modelPresetKey(presets[type])}
                options={presetOptions[type]}
                placeholder="不预设（自动选择）"
                onChange={(value) => queueSavePresets({ ...presets, [type]: modelPresetFromKey(value) })}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="settings-surface">
        <Tabs
          activeKey={serviceType}
          onChange={(key) => setServiceType(key as ServiceType)}
          items={(Object.keys(serviceLabels) as ServiceType[]).map((key) => ({ key, label: `${serviceLabels[key]}模型` }))}
        />
        <div className="settings-toolbar">
          <span>{visibleProviders.length} 个供应商支持{serviceLabels[serviceType]}能力</span>
          <Typography.Text type="secondary">修改 config.yaml 后重启服务，再刷新模型目录</Typography.Text>
        </div>
        <Table<ProviderCatalogStatus>
          rowKey="id"
          loading={loading}
          pagination={false}
          dataSource={visibleProviders}
          expandable={{
            expandedRowRender: (provider) => {
              const entries = models.filter((model) => model.provider === provider.id && model.kind === serviceType)
              return entries.length ? (
                <div className="provider-model-list">
                  {entries.map((model) => (
                    <div className="provider-model-card" key={`${model.provider}-${model.kind}-${model.id}`}>
                      <strong className="provider-model-label" title={model.label}>{model.label}</strong>
                      <Space size={[4, 4]} wrap>
                        {modelCapabilityLabels(model).map((label) => <Tag key={label}>{label}</Tag>)}
                      </Space>
                    </div>
                  ))}
                </div>
              ) : <Typography.Text type="secondary">尚未同步此类型的模型</Typography.Text>
            },
          }}
          columns={[
            { title: '供应商', dataIndex: 'label', render: (label) => <strong>{label}</strong> },
            {
              title: '根配置',
              dataIndex: 'configured',
              render: (configured, provider) => (
                <Space size={6}>
                  <Tag color={provider.enabled ? 'green' : 'default'}>{provider.enabled ? '已启用' : '已停用'}</Tag>
                  <Tag color={configured ? 'blue' : 'default'}>{configured ? 'Key 已配置' : 'Key 未配置'}</Tag>
                </Space>
              ),
            },
            {
              title: `${serviceLabels[serviceType]}模型`,
              render: (_, provider) => `${provider.model_counts[serviceType]} 个`,
            },
            {
              title: '最近同步',
              dataIndex: 'synchronized_at',
              render: (value) => value ? new Date(value).toLocaleString() : '尚未同步',
            },
            {
              title: '操作',
              width: 120,
              render: (_, provider) => (
                <Tooltip title="从供应商实时接口重新读取全部模型类型">
                  <Button
                    icon={<ReloadOutlined />}
                    loading={refreshing.includes(provider.id)}
                    disabled={!provider.enabled}
                    onClick={() => void refresh(provider)}
                  >刷新</Button>
                </Tooltip>
              ),
            },
          ]}
        />
      </section>
    </>
  )
}
