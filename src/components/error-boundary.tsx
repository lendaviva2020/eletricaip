import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException, maskSensitiveString } from "@/lib/error-capture";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const captured = captureException(error, {
      source: "ErrorBoundary",
      componentStack: info.componentStack,
    });
    console.error("[ErrorBoundary ORIGINAL EXCEPTION]", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      cause: (error as Error & { cause?: unknown })?.cause,
    });
    console.error("[ErrorBoundary]", captured.message, info.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] grid place-items-center bg-background">
          <div className="text-center max-w-md px-6">
            <div className="text-5xl font-mono text-destructive mb-4">!</div>
            <h2 className="text-lg font-semibold">Erro no componente</h2>
            <p className="mt-2 text-sm text-muted-foreground break-all" role="alert">
              {maskSensitiveString(this.state.error.message)}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
