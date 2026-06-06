import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    console.error("[ErrorBoundary]", error, info.componentStack);
    // Auto-reload on chunk fetch failures (stale service worker cache)
    if (error?.name === "ChunkLoadError" || /failed to fetch dynamically imported/i.test(error?.message ?? "")) {
      window.location.reload();
      return;
    }
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <p className="font-bold text-foreground">Terjadi kesalahan</p>
            <p className="text-sm text-muted-foreground mt-1">
              Halaman ini mengalami error. Coba muat ulang atau kembali ke dashboard.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-3 text-left text-xs bg-muted rounded-xl p-3 max-w-sm overflow-auto text-red-600">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Coba Lagi
            </Button>
            <Button onClick={() => (window.location.href = "/")}>
              Ke Dashboard
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
