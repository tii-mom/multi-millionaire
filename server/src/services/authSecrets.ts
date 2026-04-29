import { isProductionRuntime } from './productionGuards';

export class AuthSecretConfigurationError extends Error {
  status = 503;
  code = 'JWT_SECRET_NOT_CONFIGURED';

  constructor(message = 'JWT_SECRET is required') {
    super(message);
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new AuthSecretConfigurationError();
  }
  if (isProductionRuntime() && secret === 'secret') {
    throw new AuthSecretConfigurationError('JWT_SECRET must not use the development default in production');
  }
  return secret;
}

