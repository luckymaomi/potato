import { ApiOutlined, AppstoreOutlined } from '@ant-design/icons'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

export function AppShell() {
  const location = useLocation()
  const inProject = location.pathname.startsWith('/film/')
  return (
    <div className={`app-shell${inProject ? ' project-mode' : ''}`}>
      <header className="app-header">
        <div className="app-brand"><span>番茄短剧</span></div>
        <nav className="app-nav" aria-label="主导航">
          <NavLink to="/" end><AppstoreOutlined />项目</NavLink>
          <NavLink to="/ai-config"><ApiOutlined />AI 配置</NavLink>
        </nav>
      </header>
      <main className="app-content"><Outlet /></main>
    </div>
  )
}
