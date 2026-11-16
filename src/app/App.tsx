import { lazy, Suspense, useEffect } from 'react';
import { useAppRoute } from '@/shared/lib/router';
import { useAuthStore } from '@/shared/state/authStore';
import { useUiStore } from '@/shared/state/uiStore';
import { AppDialogModal } from '@/widgets/common/AppDialogModal';
import { AppErrorBoundary } from '@/widgets/common/AppErrorBoundary';
import { ToastBanner } from '@/widgets/common/ToastBanner';

const ClientShowcaseView = lazy(() =>
  import('@/widgets/client-showcase/ClientShowcaseView').then((m) => ({
    default: m.ClientShowcaseView,
  }))
);
const AdminLoginView = lazy(() =>
  import('@/widgets/auth/AdminLoginView').then((m) => ({
    default: m.AdminLoginView,
  }))
);
const AdminWorkspace = lazy(() =>
  import('./AdminWorkspace').then((m) => ({
    default: m.AdminWorkspace,
  }))
);

function RouteLoadingFallback({ label }: { label: string }) {
  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-center space-y-2.5 shadow-xs">
        <div className="w-8 h-8 rounded-full border-2 border-sky-600 border-t-transparent animate-spin mx-auto" />
        <div className="text-xs font-semibold text-slate-600">{label}</div>
      </div>
    </div>
  );
}

export function App() {
  const route = useAppRoute();
  const authStatus = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);
  const projectBrowserOpen = useUiStore((s) => s.projectBrowserOpen);
  const adminUiStyle = useUiStore((s) => s.adminUiStyle);

  useEffect(() => {
    if (route.kind !== 'admin') return;
    if (authStatus === 'unknown') {
      void checkSession();
    }
  }, [route.kind, authStatus, checkSession]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const rootEl = document.documentElement;
    if (route.kind === 'admin' && adminUiStyle === 'swiss') {
      rootEl.dataset.adminStyle = 'swiss';
    } else {
      delete rootEl.dataset.adminStyle;
    }
    return () => {
      delete rootEl.dataset.adminStyle;
    };
  }, [route.kind, adminUiStyle]);

  const showAdminBottomNav =
    route.kind === 'admin' && authStatus === 'authenticated' && !projectBrowserOpen;

  return (
    <AppErrorBoundary>
      {route.kind === 'client' ? (
        <Suspense fallback={<RouteLoadingFallback label="Loading client showcase..." />}>
          <ClientShowcaseView slug={route.slug} />
        </Suspense>
      ) : authStatus === 'unknown' ? (
        <RouteLoadingFallback label="Verifying administrator session..." />
      ) : authStatus === 'unauthenticated' ? (
        <Suspense fallback={<RouteLoadingFallback label="Loading administrator sign in..." />}>
          <AdminLoginView />
        </Suspense>
      ) : (
        <Suspense fallback={<RouteLoadingFallback label="Loading workspace..." />}>
          <AdminWorkspace />
        </Suspense>
      )}

      {/* App-Wide Custom Alert / Confirm Modal & Status Toasts */}
      <AppDialogModal />
      <ToastBanner hasBottomNav={showAdminBottomNav} />
    </AppErrorBoundary>
  );
}

export default App;
