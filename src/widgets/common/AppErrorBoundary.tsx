import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, Download, RefreshCw } from 'lucide-react';
import { idbGet, WORKSPACE_STORAGE_KEY } from '@/shared/storage/indexedDb';
import { todayLocalIso } from '@/shared/lib/dateUtils';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  exporting: boolean;
  exportSuccess: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      exporting: false,
      exportSuccess: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled application crash in React tree:', error, errorInfo);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleExportBackup = async () => {
    this.setState({ exporting: true });
    try {
      const rawData = await idbGet(WORKSPACE_STORAGE_KEY);
      const jsonStr = JSON.stringify(rawData ?? {}, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mast-tower-emergency-backup-${todayLocalIso()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.setState({ exporting: false, exportSuccess: true });
    } catch (err) {
      console.error('Failed to export emergency backup:', err);
      this.setState({ exporting: false });
      alert('Could not export backup automatically. Please check browser console or contact support.');
    }
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  Application Encountered an Error
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  An unexpected issue occurred while rendering the workspace.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-mono text-red-700 break-words line-clamp-3">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Application
              </button>

              <button
                type="button"
                onClick={this.handleExportBackup}
                disabled={this.state.exporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                {this.state.exporting
                  ? 'Exporting Local Backup...'
                  : this.state.exportSuccess
                    ? 'Backup Downloaded!'
                    : 'Download Local Data Backup (JSON)'}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Your offline data in local storage is safe. Downloading a backup ensures you have your records before reloading or clearing cache.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
