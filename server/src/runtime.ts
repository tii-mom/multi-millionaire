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

export function getHyperdriveConnectionString(): string | null {
  const connectionString = bindings.HYPERDRIVE?.connectionString?.trim();
  return connectionString || null;
}
