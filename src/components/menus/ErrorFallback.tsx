import React from 'react';

interface ErrorFallbackProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorFallback({
  title = 'Simulation Error',
  message,
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div className="pv-error-screen" role="alert">
      <div className="pv-error-card">
        <div className="pv-error-badge">SYSTEM DIAGNOSTIC</div>
        <h1 className="pv-error-title">{title}</h1>
        <p className="pv-error-message">{message}</p>
        <div className="pv-error-hints">
          <span>Verify WebGL2 &amp; WebAssembly are enabled in your browser.</span>
        </div>
        {onRetry && (
          <button
            type="button"
            className="pv-btn pv-btn-primary"
            onClick={onRetry}
          >
            Reload Simulation
          </button>
        )}
      </div>
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

export class GameErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          title="3D Engine Initialization Failed"
          message={this.state.error.message || 'Unknown rendering or physics error.'}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

