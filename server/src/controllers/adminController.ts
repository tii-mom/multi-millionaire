import { Request, Response, NextFunction } from 'express';
import {
  AdminListOptions,
  getAdminDashboard,
  listAdminRewards,
  listAdminRiskFlags,
  listAdminSquads,
  listAdminWaves,
} from '../models/adminReadModel';
import { createAdminAuditLog, listAdminAuditLogs, listAppControls, setAppControl } from '../models/opsModel';
import { listChainEvents } from '../models/chainEventModel';
import { listMerkleRewardBatches, listMerkleRewardProofs } from '../models/merkleRewardModel';
import { getReceiptVerifierDiagnostics } from '../services/receiptVerifier';
import { createDraftMerkleRewardBatch, getMerkleClaimVerifierDiagnostics } from '../services/merkleRewards';
import { getWalletSignatureVerifierDiagnostics } from '../services/walletSignatureVerifier';
import {
  getContractArtifactStatuses,
  getContractIntegrationDiagnostics,
  loadContractIntegrationConfig,
} from '../services/contracts/config';
import { readPublicV3Tokenomics } from '../services/contracts/v3Tokenomics';
import { currentRuntimePath, merkleDraftWritesEnabled } from '../services/runtimeModes';

function readAdminListOptions(req: Request): AdminListOptions {
  const pageSizeInput = typeof req.query.page_size === 'string'
    ? req.query.page_size
    : typeof req.query.pageSize === 'string'
      ? req.query.pageSize
      : undefined;
  return {
    page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
    pageSize: pageSizeInput ? Number(pageSizeInput) : undefined,
    search: typeof req.query.search === 'string'
      ? req.query.search
      : typeof req.query.q === 'string'
        ? req.query.q
        : undefined,
  };
}

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getAdminDashboard();
    return res.json({ request_id: req.id || '', data: dashboard });
  } catch (err) {
    return next(err);
  }
}

export async function getWaves(req: Request, res: Response, next: NextFunction) {
  try {
    const waves = await listAdminWaves(readAdminListOptions(req));
    return res.json({ request_id: req.id || '', data: waves });
  } catch (err) {
    return next(err);
  }
}

export async function getRiskFlags(req: Request, res: Response, next: NextFunction) {
  try {
    const flags = await listAdminRiskFlags(readAdminListOptions(req));
    return res.json({ request_id: req.id || '', data: flags });
  } catch (err) {
    return next(err);
  }
}

export async function getRewards(req: Request, res: Response, next: NextFunction) {
  try {
    const rewards = await listAdminRewards(readAdminListOptions(req));
    return res.json({ request_id: req.id || '', data: rewards });
  } catch (err) {
    return next(err);
  }
}

export async function getSquads(req: Request, res: Response, next: NextFunction) {
  try {
    const squads = await listAdminSquads(readAdminListOptions(req));
    return res.json({ request_id: req.id || '', data: squads });
  } catch (err) {
    return next(err);
  }
}

export async function getControls(req: Request, res: Response, next: NextFunction) {
  try {
    const controls = await listAppControls();
    return res.json({ request_id: req.id || '', data: controls });
  } catch (err) {
    return next(err);
  }
}

export async function patchControl(req: Request, res: Response, next: NextFunction) {
  try {
    const { enabled, reason } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'enabled boolean is required' } });
    }

    const control = await setAppControl({
      key: req.params.key,
      enabled,
      reason: reason === undefined ? null : String(reason),
      actorUserId: req.user?.id || null,
    });
    await createAdminAuditLog({
      actorUserId: req.user?.id || null,
      actorEmail: req.user?.email || null,
      action: 'app_control.update',
      entityType: 'app_control',
      entityId: req.params.key,
      metadata: { enabled, reason: reason || null },
    });

    return res.json({ request_id: req.id || '', data: control });
  } catch (err) {
    return next(err);
  }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const logs = await listAdminAuditLogs(Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50);
    return res.json({ request_id: req.id || '', data: logs });
  } catch (err) {
    return next(err);
  }
}

export async function getChainEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const applyStatus = typeof req.query.apply_status === 'string' ? req.query.apply_status : undefined;
    const events = await listChainEvents({
      applyStatus: applyStatus as any,
      limit: 50,
    });
    return res.json({ request_id: req.id || '', data: events });
  } catch (err) {
    return next(err);
  }
}

export async function getOpsDiagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    const contractConfig = loadContractIntegrationConfig();
    const v3Tokenomics = readPublicV3Tokenomics();
    return res.json({
      request_id: req.id || '',
      data: {
        receipt_verifier: getReceiptVerifierDiagnostics(),
        wallet_signature_verifier: getWalletSignatureVerifierDiagnostics(),
        merkle_claim_verifier: getMerkleClaimVerifierDiagnostics(),
        contract_integration: getContractIntegrationDiagnostics(contractConfig),
        contract_artifacts: getContractArtifactStatuses(contractConfig),
        season_vault: v3Tokenomics.season_vault_address,
        season_claim: v3Tokenomics.season_claim_v2_address,
        season_claim_v2: v3Tokenomics.season_claim_v2_address,
        current_tokenomics: v3Tokenomics,
        v3_tokenomics: v3Tokenomics,
        runtime_path: currentRuntimePath(),
        merkle_draft_writes_enabled: merkleDraftWritesEnabled(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function getMerkleBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const batches = await listMerkleRewardBatches(Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50);
    return res.json({ request_id: req.id || '', data: batches });
  } catch (err) {
    return next(err);
  }
}

export async function getMerkleProofs(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = typeof req.query.batch_id === 'string' ? req.query.batch_id : undefined;
    const userId = typeof req.query.user_id === 'string' ? req.query.user_id : undefined;
    const proofs = await listMerkleRewardProofs({ batchId, userId, limit: 50 });
    return res.json({ request_id: req.id || '', data: proofs });
  } catch (err) {
    return next(err);
  }
}

export async function postMerkleDraftBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const chainId = String(req.body.chainId || process.env.CHAIN_ID || '').trim();
    const tokenAddress = String(req.body.tokenAddress || process.env.TOKEN_ADDRESS || '').trim();
    if (!merkleDraftWritesEnabled()) {
      return res.status(403).json({
        request_id: req.id || '',
        error: {
          code: 'MERKLE_DRAFT_WRITES_DISABLED',
          message: 'Merkle draft writes require admin operations and an approved production canary gate in production',
        },
      });
    }
    if (!chainId || !tokenAddress) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'chainId and tokenAddress are required' } });
    }
    const result = await createDraftMerkleRewardBatch({
      chainId,
      tokenAddress,
      createdBy: req.user?.id || null,
    });
    await createAdminAuditLog({
      actorUserId: req.user?.id || null,
      actorEmail: req.user?.email || null,
      action: 'merkle_reward_batch.create_draft',
      entityType: 'merkle_reward_batch',
      entityId: result.batch.id,
      metadata: { reward_count: result.proofs.length, chainId, tokenAddress },
    });
    return res.status(201).json({ request_id: req.id || '', data: result });
  } catch (err) {
    return next(err);
  }
}
