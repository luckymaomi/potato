import { ApiOutlined, AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { NavLink, Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand"><span className="brand-mark"><ThunderboltOutlined /></span><span>tomato-ai-drama</span></div>
        <nav className="app-nav" aria-label="主导航">
          <NavLink to="/" end><AppstoreOutlined />项目</NavLink>
          <NavLink to="/ai-config"><ApiOutlined />AI 配置</NavLink>
        </nav>
      </header>
      <main className="app-content"><Outlet /></main>
    </div>
  )
}
