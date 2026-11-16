import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_UI_STYLE_STORAGE_KEY,
  persistAdminUiStyle,
  readSavedAdminUiStyle,
  useUiStore,
} from '../src/shared/state/uiStore';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

describe('Admin UI Style Persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ adminUiStyle: 'classic' });
  });

  it('defaults to classic when no saved style exists or value is invalid', () => {
    expect(readSavedAdminUiStyle(null)).toBe('classic');
    expect(readSavedAdminUiStyle(createMemoryStorage())).toBe('classic');
    expect(
      readSavedAdminUiStyle(
        createMemoryStorage({ [ADMIN_UI_STYLE_STORAGE_KEY]: 'unexpected' })
      )
    ).toBe('classic');
  });

  it('persists and restores classic and swiss styles', () => {
    const storage = createMemoryStorage();
    persistAdminUiStyle('swiss', storage);
    expect(storage.getItem(ADMIN_UI_STYLE_STORAGE_KEY)).toBe('swiss');
    expect(readSavedAdminUiStyle(storage)).toBe('swiss');

    persistAdminUiStyle('classic', storage);
    expect(readSavedAdminUiStyle(storage)).toBe('classic');
  });

  it('writes selected style to window.localStorage when setAdminUiStyle is called', () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage });

    useUiStore.getState().setAdminUiStyle('swiss');
    expect(useUiStore.getState().adminUiStyle).toBe('swiss');
    expect(localStorage.getItem(ADMIN_UI_STYLE_STORAGE_KEY)).toBe('swiss');
    expect(readSavedAdminUiStyle(localStorage)).toBe('swiss');

    useUiStore.getState().setAdminUiStyle('classic');
    expect(useUiStore.getState().adminUiStyle).toBe('classic');
    expect(localStorage.getItem(ADMIN_UI_STYLE_STORAGE_KEY)).toBe('classic');
  });
});
