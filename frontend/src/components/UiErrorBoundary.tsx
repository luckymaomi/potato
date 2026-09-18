import { Component, type ErrorInfo, type ReactNode } from 'react'

interface UiErrorBoundaryProps {
  children: ReactNode
  title: string
}

interface UiErrorBoundaryState {
  error: Error | null
}

export class UiErrorBoundary extends Component<UiErrorBoundaryProps, UiErrorBoundaryState> {
  state: UiErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): UiErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('界面模块渲染失败', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="ui-error-boundary" role="alert">
        <strong>{this.props.title}</strong>
        <span>{this.state.error.message || '界面渲染发生异常'}</span>
        <button type="button" onClick={() => this.setState({ error: null })}>重新加载此区域</button>
      </div>
    )
  }
}
