'use client';
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; message: string }

/** Catches render/runtime errors in a screen and shows a recoverable fallback
 *  instead of unmounting the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : 'Unexpected error' };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('SalesBook screen error:', err);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div role="alert" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 34px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--redT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={1.9} strokeLinecap="round"><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>حدث خطأ غير متوقع · Something went wrong</div>
        <div style={{ fontSize: 12, color: 'var(--sub)', maxWidth: 260 }}>{this.state.message}</div>
        <button onClick={this.reset} style={{ cursor: 'pointer', border: 'none', height: 44, padding: '0 22px', borderRadius: 12, background: 'var(--pri)', color: 'var(--onPri)', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>إعادة المحاولة · Try again</button>
      </div>
    );
  }
}
