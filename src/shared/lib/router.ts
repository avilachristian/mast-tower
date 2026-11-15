import { useEffect, useState } from 'react';

export type AppRoute =
  | { kind: 'client'; slug?: string }
  | { kind: 'admin' };

export function parseAppRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (
    normalized === '/admin' ||
    normalized.startsWith('/admin/') ||
    normalized === '/login'
  ) {
    return { kind: 'admin' };
  }
  if (normalized.startsWith('/p/')) {
    const slug = decodeURIComponent(normalized.slice(3).split('/')[0] || '').trim();
    return { kind: 'client', slug: slug || undefined };
  }
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const slugParam = params.get('project')?.trim();
    if (slugParam) {
      return { kind: 'client', slug: slugParam };
    }
  }
  return { kind: 'client' };
}

const ROUTE_EVENT = 'mast2:route-change';

export function navigateTo(path: string, replace = false): void {
  if (typeof window === 'undefined') return;
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined'
      ? parseAppRoute(window.location.pathname)
      : { kind: 'client' }
  );

  useEffect(() => {
    const sync = () => {
      setRoute(parseAppRoute(window.location.pathname));
    };
    window.addEventListener('popstate', sync);
    window.addEventListener(ROUTE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(ROUTE_EVENT, sync);
    };
  }, []);

  return route;
}
