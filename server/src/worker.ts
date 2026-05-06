import { handleAsNodeRequest } from 'cloudflare:node';
import { setRuntimeBindings, type RuntimeBindings } from './runtime';
import { assertWorkerStartupConfig } from './services/startupConfig';

const workerPort = 3000;
let appReady: Promise<void> | null = null;

async function ensureWorkerApp(env: RuntimeBindings) {
  if (!appReady) {
    appReady = loadWorkerApp(env).catch((error) => {
      appReady = null;
      throw error;
    });
  }

  return appReady;
}

function startupFailureResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'unknown startup configuration error';
  // eslint-disable-next-line no-console
  console.error(`Worker startup configuration failed: ${message}`);
  return new Response('Worker startup configuration failed', { status: 503 });
}

async function loadWorkerApp(env: RuntimeBindings) {
  assertWorkerStartupConfig(env as Record<string, unknown>);

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
    try {
      await ensureWorkerApp(env);
    } catch (error) {
      return startupFailureResponse(error);
    }
    return handleAsNodeRequest(workerPort, request);
  },
};
