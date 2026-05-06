export interface RuntimeBindings {
  HYPERDRIVE?: {
    connectionString: string;
  } | null;
  [key: string]: unknown;
}

let bindings: RuntimeBindings = {};

export function setRuntimeBindings(nextBindings?: RuntimeBindings | null) {
  bindings = nextBindings || {};
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }
}

export function getRuntimeEnvValue(name: string): string | undefined {
  const bindingValue = bindings[name];
  if (typeof bindingValue === 'string') {
    return bindingValue;
  }
  return process.env[name];
}

export function getRuntimeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}

export function getHyperdriveConnectionString(): string | null {
  const connectionString = bindings.HYPERDRIVE?.connectionString?.trim();
  return connectionString || null;
}
