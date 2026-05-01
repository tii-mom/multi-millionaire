import { Request, Response, NextFunction } from 'express';
import { getCurrentWave } from '../models/waveModel';
import { getLatestConfirmedPrice } from '../models/priceModel';
import { listAppControls } from '../models/opsModel';
import { loadContractIntegrationConfig } from '../services/contracts/config';
import { getReceiptVerifierDiagnostics } from '../services/receiptVerifier';
import { getMerkleClaimVerifierDiagnostics } from '../services/merkleRewards';
import { currentRuntimePath } from '../services/runtimeModes';
import { readPublicV3Tokenomics } from '../services/contracts/v3Tokenomics';
import { getRuntimeEnv } from '../runtime';

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
    const env = getRuntimeEnv();
    const contractConfig = loadContractIntegrationConfig();
    const productionMainnetConfigRequired = ['production', 'prod'].includes((env.NODE_ENV || '').trim().toLowerCase())
      || contractConfig.mainlineWritesEnabled
      || (env.CHAIN_ID || '').trim().toLowerCase() === 'ton-mainnet';
    const readBootstrapAddress = (primaryName: string, testnetName: string) => {
      const primary = env[primaryName]?.trim();
      if (primary) return primary;
      if (productionMainnetConfigRequired && env[testnetName]?.trim()) return '';
      return env[testnetName]?.trim() || '';
    };
    // TODO: Resolve actual user from auth token. Here we provide a minimal stub.
    const me = null;
    const v3Tokenomics = readPublicV3Tokenomics();
    const chainId = env.CHAIN_ID || v3Tokenomics.chain_id;
    const tokenAddress = chainId.trim().toLowerCase() === 'ton-mainnet'
      ? v3Tokenomics.token_address
      : env.TOKEN_ADDRESS?.trim() || v3Tokenomics.token_address;
    const contracts = {
      chain_id: chainId,
      token: tokenAddress,
      token_address: tokenAddress,
      token_address_mainnet: v3Tokenomics.token_address,
      token_decimals: env.TOKEN_DECIMALS || '9',
      token_metadata_uri: v3Tokenomics.metadata_uri,
      token_logo_uri: v3Tokenomics.logo_uri,
      vault: env.LOCK_VAULT_ADDRESS || (productionMainnetConfigRequired ? '' : env.VAULT_ADDRESS) || '',
      oracle: env.ORACLE_ADDRESS || '',
      reward_distributor: env.REWARD_DISTRIBUTOR_ADDRESS || '',
      merkle_claim: readBootstrapAddress('MERKLE_CLAIM_ADDRESS', 'MERKLE_CLAIM_ADDRESS_TESTNET'),
      merkle_claim_role: 'legacy_reward_claim_path',
      season_vault: v3Tokenomics.season_vault_address,
      season_claim: v3Tokenomics.season_claim_v2_address,
      season_claim_v2: v3Tokenomics.season_claim_v2_address,
      token_contract_metadata: '/contracts/72h-v3-mainnet.json',
    };
    const controlMap = Object.fromEntries(controls.map((control) => [control.key, { enabled: control.enabled, reason: control.reason }]));
    const receiptVerifier = getReceiptVerifierDiagnostics();
    const merkleClaimVerifier = getMerkleClaimVerifierDiagnostics();
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
          wallet_binding_enabled: env.WALLET_BINDING_ENABLED === 'true',
          receipt_verification_enabled: contractConfig.receipt.enabled,
          chain_mainline_writes_enabled: contractConfig.mainlineWritesEnabled,
          staging_mvp_enabled: currentRuntimePath() === 'staging-mvp',
        },
        ops: {
          runtime_path: currentRuntimePath(),
          receipt_verifier: {
            configured: receiptVerifier.configured,
            status: receiptVerifier.status,
            mode: receiptVerifier.mode,
          },
          merkle_claim_verifier: {
            configured: merkleClaimVerifier.configured,
            status: merkleClaimVerifier.status,
            model: merkleClaimVerifier.model,
          },
        },
        controls: controlMap,
      },
    });
  } catch (err) {
    return next(err);
  }
}
