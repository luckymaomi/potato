import { ApiOutlined, AppstoreOutlined, AudioOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../theme/ThemeContext'

export function AppShell() {
  const location = useLocation()
  const { mode, toggle } = useTheme()
  const inProject = location.pathname.startsWith('/comic/')
  return (
    <div className={`app-shell${inProject ? ' project-mode' : ''}`}>
      <header className="app-header">
        <div className="app-brand">
          <img className="app-brand-mark" src="/favicon.svg" width={22} height={22} alt="" />
          <span>土豆漫画</span>
        </div>
        <nav className="app-nav" aria-label="主导航">
          <NavLink to="/" end><AppstoreOutlined />项目</NavLink>
          <NavLink to="/ai-config"><ApiOutlined />AI 配置</NavLink>
          <NavLink to="/tts-config"><AudioOutlined />配音配置</NavLink>
        </nav>
        <Button
          className="theme-toggle"
          type="text"
          icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          aria-label={mode === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          title={mode === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          onClick={toggle}
        />
      </header>
      <main className="app-content"><Outlet /></main>
    </div>
  )
}
