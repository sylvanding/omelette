import { Component, type ReactNode, type ErrorInfo } from 'react';
import i18n from '@/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const t = (key: string) => i18n.t(key);
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-foreground">
              {t('error.boundary.title')}
            </h1>
            <p className="text-sm text-muted-foreground max-w-md text-center">
              {this.state.error?.message || t('error.boundary.description')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t('error.boundary.reload')}
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
