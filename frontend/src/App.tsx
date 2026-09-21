import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { UiErrorBoundary } from './components/UiErrorBoundary'
import { AiConfigPage } from './pages/AiConfigPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { AssetWorkspace } from './features/workspace/AssetWorkspace'
import { ProjectShell } from './features/workspace/ProjectShell'
import { ScriptWorkspace } from './features/workspace/ScriptWorkspace'
import { StoryboardWorkspace } from './features/workspace/StoryboardWorkspace'
import { ThemeProvider, useTheme } from './theme/ThemeContext'

function ThemedApp() {
  const { mode } = useTheme()
  const isDark = mode === 'dark'
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#7aa7d8' : '#365f83',
          colorInfo: isDark ? '#8db9e8' : '#5b9bd4',
          colorSuccess: isDark ? '#76c49c' : '#3d8f6e',
          colorWarning: isDark ? '#e0aa65' : '#c4873a',
          colorError: isDark ? '#e58a84' : '#c45b56',
          colorText: isDark ? '#e6edf3' : '#243039',
          colorTextSecondary: isDark ? '#aab8c5' : '#6a7a88',
          colorBorder: isDark ? '#394b5a' : '#d5e2ef',
          colorBgLayout: isDark ? '#121a21' : '#f3f7fb',
          colorBgContainer: isDark ? '#1b2730' : '#ffffff',
          colorFillAlter: isDark ? '#22313d' : '#f7fbfe',
          borderRadius: 8,
          fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: { controlHeight: 36, fontWeight: 600 },
          Card: { borderRadiusLG: 10 },
          Modal: { borderRadiusLG: 10 },
          Table: { headerBg: isDark ? '#22313d' : '#eef4fa', headerColor: isDark ? '#b8c6d2' : '#5a6b7a' },
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

export default function App() {
  return <ThemeProvider><ThemedApp /></ThemeProvider>
}
