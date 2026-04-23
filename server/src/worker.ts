import { handleAsNodeRequest } from 'cloudflare:node';
import { setRuntimeBindings, type RuntimeBindings } from './runtime';

const workerPort = 3000;
let appReady: Promise<void> | null = null;

async function ensureWorkerApp() {
  if (!appReady) {
    appReady = loadWorkerApp();
  }

  return appReady;
}

async function loadWorkerApp() {
  const versionsDescriptor = Object.getOwnPropertyDescriptor(process, 'versions');

  if (versionsDescriptor) {
    Object.defineProperty(process, 'versions', {
      ...versionsDescriptor,
      value: {
        ...process.versions,
        node: undefined,
      },
    });
  }

  try {
    const { default: app } = await import('./app');
    app.listen(workerPort);
  } finally {
    if (versionsDescriptor) {
      Object.defineProperty(process, 'versions', versionsDescriptor);
    }
  }
}

export default {
  async fetch(request: Request, env: RuntimeBindings): Promise<Response> {
    setRuntimeBindings(env);
    await ensureWorkerApp();
    return handleAsNodeRequest(workerPort, request);
  },
};
