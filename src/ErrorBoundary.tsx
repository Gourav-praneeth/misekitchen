import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Leaf, RefreshCw, TriangleAlert } from 'lucide-react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mise could not render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="recovery-page">
      <span className="brand-mark"><Leaf /></span>
      <TriangleAlert />
      <h1>Your kitchen hit a snag</h1>
      <p>Your saved ingredients are safe. Reload Mise to recover the screen.</p>
      <button onClick={() => window.location.reload()}><RefreshCw /> Reload Mise</button>
    </main>
  }
}
