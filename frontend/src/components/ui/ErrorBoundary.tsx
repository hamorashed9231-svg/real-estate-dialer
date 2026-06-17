import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CRITICAL APPLICATION ERROR]', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-6">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center space-y-6 shadow-2xl">
            <div className="inline-flex p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl">
              <ShieldAlert className="h-10 w-10 stroke-[1.5px]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-[280px] mx-auto">
                An unexpected error occurred in this workspace view. Please reload or contact your administrator.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-zinc-950 border border-zinc-855 rounded-xl text-left max-h-32 overflow-y-auto">
                <p className="text-[10px] font-mono text-red-400 font-bold leading-normal break-all">
                  {this.state.error.name}: {this.state.error.message}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={this.handleReload}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-900/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload Application Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
