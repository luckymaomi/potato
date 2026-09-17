import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AiConfigPage } from './pages/AiConfigPage'
import { CanvasPage } from './features/canvas/CanvasPage'
import { ProjectsPage } from './pages/ProjectsPage'

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
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/ai-config" element={<AiConfigPage />} />
          </Route>
          <Route path="/film/:id/canvas" element={<CanvasPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}
