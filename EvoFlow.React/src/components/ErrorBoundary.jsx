import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#fff3f3', border: '1px solid #fecaca', borderRadius: 8,
          padding: '14px 18px', fontSize: 13, color: '#dc2626'
        }}>
          {this.props.fallback || `⚠ Failed to render: ${this.state.error?.message || 'Unknown error'}`}
        </div>
      )
    }
    return this.props.children
  }
}
