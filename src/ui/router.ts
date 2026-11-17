import { useEffect, useState } from 'preact/hooks';

export interface Route {
  /** First path segment, e.g. '' for home, 'order', 'history'. */
  name: string;
  /** Remaining path segments. */
  params: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [name = '', ...params] = path.split('/').filter(Boolean);
  return { name, params, query: new URLSearchParams(qs) };
}

export function navigate(path: string) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
