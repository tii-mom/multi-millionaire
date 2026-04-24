import { Request, Response, NextFunction } from 'express';
import { getCurrentWave } from '../models/waveModel';
import { getLatestConfirmedPrice } from '../models/priceModel';
import { listAppControls } from '../models/opsModel';
import { loadContractIntegrationConfig } from '../services/contracts/config';
import { getReceiptVerifierDiagnostics } from '../services/receiptVerifier';

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
    const controls = await listAppControls().catch(() => []);
    const contractConfig = loadContractIntegrationConfig();
    // TODO: Resolve actual user from auth token. Here we provide a minimal stub.
    const me = null;
    const contracts = {
      chain_id: process.env.CHAIN_ID || 'ton-mainnet',
      token: process.env.TOKEN_ADDRESS || 'EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8',
      vault: process.env.LOCK_VAULT_ADDRESS || process.env.VAULT_ADDRESS || '',
      oracle: process.env.ORACLE_ADDRESS || '',
      reward_distributor: process.env.REWARD_DISTRIBUTOR_ADDRESS || '',
    };
    const controlMap = Object.fromEntries(controls.map((control) => [control.key, { enabled: control.enabled, reason: control.reason }]));
    const receiptVerifier = getReceiptVerifierDiagnostics();
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
          wallet_binding_enabled: process.env.WALLET_BINDING_ENABLED === 'true',
          receipt_verification_enabled: contractConfig.receipt.enabled,
          chain_mainline_writes_enabled: contractConfig.mainlineWritesEnabled,
        },
        ops: {
          receipt_verifier: {
            configured: receiptVerifier.configured,
            status: receiptVerifier.status,
            mode: receiptVerifier.mode,
          },
        },
        controls: controlMap,
      },
    });
  } catch (err) {
    return next(err);
  }
}
