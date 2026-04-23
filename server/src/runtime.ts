export interface RuntimeBindings {
  HYPERDRIVE?: {
    connectionString: string;
  } | null;
}

let bindings: RuntimeBindings = {};

export function setRuntimeBindings(nextBindings?: RuntimeBindings | null) {
  bindings = nextBindings || {};
}

export function getHyperdriveConnectionString(): string | null {
  const connectionString = bindings.HYPERDRIVE?.connectionString?.trim();
  return connectionString || null;
}
