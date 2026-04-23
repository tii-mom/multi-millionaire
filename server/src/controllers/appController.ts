import { Request, Response, NextFunction } from 'express';
import { getCurrentWave } from '../models/waveModel';
import { getLatestConfirmedPrice } from '../models/priceModel';

/**
 * Handles GET /v1/app/bootstrap
 *
 * Returns a snapshot of core platform state for client initialization. This includes
 * contract addresses (if configured), the current or upcoming wave, the latest
 * confirmed price and a placeholder for user information. In a full implementation
 * the user details would be resolved from an authenticated session.
 */
export async function bootstrap(req: Request, res: Response, next: NextFunction) {
  try {
    const wave = await getCurrentWave();
    const price = await getLatestConfirmedPrice();
    // TODO: Resolve actual user from auth token. Here we provide a minimal stub.
    const me = null;
    const contracts = {
      chain_id: process.env.CHAIN_ID || 'ton-mainnet',
      token: process.env.TOKEN_ADDRESS || 'EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8',
      vault: process.env.VAULT_ADDRESS || '',
      oracle: process.env.ORACLE_ADDRESS || '',
      reward_distributor: process.env.REWARD_DISTRIBUTOR_ADDRESS || '',
    };
    return res.json({
      request_id: req.id || '',
      data: {
        server_time: new Date().toISOString(),
        contracts,
        current_wave: wave,
        latest_price: price,
        me,
        feature_flags: {
          permit_supported: false,
          poster_enabled: false,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}
