"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

export class SelfHealingBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorCount: 0,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true, errorCount: 1 };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Self-healing boundary caught an unexpected UI error:", error, errorInfo);
    // Silent auto-heal attempt on first error tick
    if (this.state.errorCount <= 1) {
      setTimeout(() => {
        this.setState({ hasError: false, errorCount: this.state.errorCount + 1 });
      }, 1500);
    }
  }

  public render() {
    if (this.state.hasError && this.state.errorCount > 1) {
      return (
        <div className="p-6 bg-slate-900 border border-indigo-900/40 rounded-2xl text-center space-y-3 my-4 shadow-xl">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <h4 className="text-sm font-bold text-white">{this.props.fallbackTitle || "Module Auto-Recovery"}</h4>
          <p className="text-xs text-slate-400">An unexpected telemetry handshake error occurred. Click below to reconnect.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorCount: 0 })}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white transition-all shadow-md active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reconnect Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
