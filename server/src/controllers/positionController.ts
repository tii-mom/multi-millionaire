import { Request, Response, NextFunction } from 'express';
import { getLatestConfirmedPrice } from '../models/priceModel';
import { getCurrentWave, getWaveById } from '../models/waveModel';
import { withTransaction } from '../db';
import { getUserWavePositionTotal } from '../models/positionModel';
import { applyDeposit } from '../services/depositApplyService';
import { isControlEnabled, productionChainRequired } from '../services/productionGuards';
import { currentRuntimePath, stagingMvpEnabled } from '../services/runtimeModes';

/**
 * Deposit precheck endpoint.
 *
 * Examines whether the user may deposit into the current wave.  In this stub
 * implementation it merely returns the current wave settings and latest price.
 * A full implementation should verify the user’s inviter binding, squad
 * membership and wind up any qualifying rules.
 */
export async function depositPrecheck(req: Request, res: Response, next: NextFunction) {
  try {
    const wave = await getCurrentWave();
    const price = await getLatestConfirmedPrice();
    if (!wave || !price) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'NO_WAVE_OR_PRICE', message: 'No active wave or price data available' } });
    }
    // Basic precheck: ensure wave is live and price is fresh. For now we only check status.
    const ok = wave.status === 'live';
    const reasons: string[] = [];
    if (!ok) {
      reasons.push('Wave not live');
    }
    return res.json({
      request_id: req.id || '',
      data: {
        ok,
        reasons,
        wave_status: wave.status,
        min_lock_amount: wave.min_lock_amount,
        price: price,
        referral: null,
        squad: null,
        wallet: {
          bound: !!req.user,
          primary_wallet: null,
        },
        runtime_path: currentRuntimePath(),
        notes: productionChainRequired()
          ? ['Production deposits require wallet binding and a verified chain receipt.']
          : ['Current deposit endpoint records a staging-mvp off-chain deposit stub.'],
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function myWavePositionTotal(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const waveId = Number(req.params.waveId);
    const total = await getUserWavePositionTotal(user.id, waveId);
    return res.json({
      request_id: req.id || '',
      data: {
        user_id: user.id,
        wave_id: waveId,
        ...total,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Off-chain recorded deposit endpoint.
 *
 * Sprint 1 does not perform a real on-chain token lock. A full implementation
 * should accept or verify a signed transaction and derive the position ID from
 * the chain receipt. This MVP stub records a database position and triggers
 * downstream product rules only.
 */
export async function deposit(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (productionChainRequired()) {
      return res.status(409).json({
        request_id: req.id || '',
        error: {
          code: 'CHAIN_RECEIPT_REQUIRED',
          message: 'Production deposits must use /v1/waves/:waveId/deposit-receipt with a verified chain receipt',
        },
      });
    }
    if (!stagingMvpEnabled()) {
      return res.status(404).json({
        request_id: req.id || '',
        error: {
          code: 'STAGING_MVP_DISABLED',
          message: 'The off-chain staging-mvp deposit endpoint is not enabled in this runtime',
        },
      });
    }
    if (await isControlEnabled('pause_deposits')) {
      return res.status(423).json({ request_id: req.id || '', error: { code: 'DEPOSITS_PAUSED', message: 'Deposits are temporarily paused' } });
    }
    const waveId = Number(req.params.waveId);
    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Amount is required' } });
    }
    let amountRaw: bigint;
    try {
      amountRaw = BigInt(amount);
    } catch {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Amount must be a whole-number raw token amount' } });
    }
    if (amountRaw <= BigInt(0)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Amount must be greater than zero' } });
    }
    // Ensure the wave is valid and live
    const wave = await getWaveById(waveId);
    if (!wave || wave.status !== 'live' || wave.deposits_disabled) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WAVE', message: 'Wave is not live' } });
    }
    // Generate a fake on-chain position ID. In a real implementation this would come from the transaction receipt.
    const onchainPositionId = (Date.now() + Math.floor(Math.random() * 1000)).toString();
    const { position } = await withTransaction(async (tx) => applyDeposit({
      userId: user.id,
      wave,
      amountRaw: amount,
      onchainPositionId,
      unlockMultiplierBps: 15000,
      source: 'offchain_stub',
      trackRapidDepositBurst: true,
      executor: tx,
    }));
    return res.status(201).json({ request_id: req.id || '', data: position });
  } catch (err) {
    return next(err);
  }
}
