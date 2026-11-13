import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerPwaServiceWorker } from '@/shared/pwa/pwaManager';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { App } from './App';
import './index.css';

async function bootstrap() {
  await Promise.race([
    Promise.all([
      useProjectStore.getState().hydrateFromStorage(),
      useUiStore.getState().hydrateUiStorage(),
    ]),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1500);
    }),
  ]);

  registerPwaServiceWorker();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
