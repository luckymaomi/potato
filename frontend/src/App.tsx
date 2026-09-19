import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { UiErrorBoundary } from './components/UiErrorBoundary'
import { AiConfigPage } from './pages/AiConfigPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { AssetLibraryWorkspace } from './features/workspace/AssetLibraryWorkspace'
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
          colorPrimary: '#4868a7',
          colorInfo: '#4868a7',
          colorSuccess: '#34765b',
          colorWarning: '#a6652d',
          colorError: '#b94d48',
          colorText: '#222629',
          colorTextSecondary: '#697078',
          colorBorder: '#d9dde2',
          colorBgLayout: '#f3f4f5',
          borderRadius: 7,
          fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: { controlHeight: 36, fontWeight: 600 },
          Card: { borderRadiusLG: 8 },
          Modal: { borderRadiusLG: 8 },
          Table: { headerBg: '#f5f6f7', headerColor: '#535b63' },
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
                  <Route path="assets/library" element={<AssetLibraryWorkspace />} />
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
