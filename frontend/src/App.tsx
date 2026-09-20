import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { UiErrorBoundary } from './components/UiErrorBoundary'
import { AiConfigPage } from './pages/AiConfigPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { AssetWorkspace } from './features/workspace/AssetWorkspace'
import { ProduceWorkspace } from './features/workspace/ProduceWorkspace'
import { ProjectShell } from './features/workspace/ProjectShell'
import { ScriptWorkspace } from './features/workspace/ScriptWorkspace'
import { StoryboardWorkspace } from './features/workspace/StoryboardWorkspace'

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#5b9bd4',
          colorInfo: '#5b9bd4',
          colorSuccess: '#3d8f6e',
          colorWarning: '#c4873a',
          colorError: '#c45b56',
          colorText: '#243039',
          colorTextSecondary: '#6a7a88',
          colorBorder: '#d5e2ef',
          colorBgLayout: '#f3f7fb',
          borderRadius: 8,
          fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: { controlHeight: 36, fontWeight: 600 },
          Card: { borderRadiusLG: 10 },
          Modal: { borderRadiusLG: 10 },
          Table: { headerBg: '#eef4fa', headerColor: '#5a6b7a' },
        },
      }}
    >
      <AntdApp>
        <UiErrorBoundary title="页面显示失败">
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<ProjectsPage />} />
                <Route path="/ai-config" element={<AiConfigPage />} />
                <Route path="/film/:id" element={<ProjectShell />}>
                  <Route index element={<Navigate to="script" replace />} />
                  <Route path="script" element={<ScriptWorkspace />} />
                  <Route path="assets" element={<AssetWorkspace />} />
                  <Route path="storyboard" element={<StoryboardWorkspace />} />
                  <Route path="produce" element={<ProduceWorkspace />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </UiErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  )
}
