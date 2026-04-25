import { Request, Response, NextFunction } from 'express';
import { Address, JettonMaster, TonClient } from '@ton/ton';
import { getWaveById } from '../models/waveModel';
import { withTransaction } from '../db';
import { insertChainEvent } from '../models/chainEventModel';
import { findVerifiedWalletBinding } from '../models/walletBindingModel';
import { isControlEnabled } from '../services/productionGuards';
import { applyDeposit } from '../services/depositApplyService';
import { ReceiptVerificationError, verifyDepositReceipt } from '../services/receiptVerifier';

function receiptPayload(receipt: Awaited<ReturnType<typeof verifyDepositReceipt>>): Record<string, unknown> {
  return {
    chainId: receipt.chainId,
    txHash: receipt.txHash,
    logIndex: receipt.logIndex,
    walletAddress: receipt.walletAddress,
    contractAddress: receipt.contractAddress,
    amountRaw: receipt.amountRaw,
    positionId: receipt.positionId,
    blockNumber: receipt.blockNumber,
    blockTime: receipt.blockTime,
    finalized: receipt.finalized,
  };
}

function optionalToncenterApiKey(): string | undefined {
  return process.env.TONCENTER_API_KEY?.trim() || process.env.TONCENTER_TESTNET_API_KEY?.trim() || undefined;
}

export async function deriveJettonWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const owner = typeof req.query.owner === 'string' ? req.query.owner.trim() : '';
    if (!owner) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'owner is required' } });
    }
    const rpcUrl = process.env.CHAIN_RPC_URL?.trim();
    const tokenAddress = process.env.TOKEN_ADDRESS?.trim();
    if (!rpcUrl || !tokenAddress) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'CHAIN_CONFIG_NOT_READY', message: 'CHAIN_RPC_URL and TOKEN_ADDRESS are required' } });
    }

    const ownerAddress = Address.parse(owner);
    const masterAddress = Address.parse(tokenAddress);
    const client = new TonClient({ endpoint: rpcUrl, apiKey: optionalToncenterApiKey() });
    const jettonMaster = client.open(JettonMaster.create(masterAddress));
    const jettonWallet = await jettonMaster.getWalletAddress(ownerAddress);

    return res.json({
      request_id: req.id || '',
      data: {
        owner: ownerAddress.toRawString().toLowerCase(),
        token: masterAddress.toString(),
        jetton_wallet: jettonWallet.toString({ bounceable: true, testOnly: (process.env.CHAIN_ID || '').includes('testnet') }),
        jetton_wallet_raw: jettonWallet.toRawString().toLowerCase(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function depositReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (await isControlEnabled('pause_deposits')) {
      return res.status(423).json({ request_id: req.id || '', error: { code: 'DEPOSITS_PAUSED', message: 'Deposits are temporarily paused' } });
    }

    const waveId = Number(req.params.waveId);
    const wave = await getWaveById(waveId);
    if (!wave || wave.status !== 'live' || wave.deposits_disabled) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WAVE', message: 'Wave is not live for deposits' } });
    }

    const receipt = await verifyDepositReceipt({ ...req.body, waveId });
    if (receipt.amountRaw !== String(req.body.amount || receipt.amountRaw)) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'AMOUNT_MISMATCH', message: 'Receipt amount does not match submitted amount' } });
    }

    const wallet = await findVerifiedWalletBinding(receipt.chainId, receipt.walletAddress);
    if (!wallet || wallet.user_id !== user.id) {
      const inserted = await insertChainEvent({
        chainId: receipt.chainId,
        contractAddress: receipt.contractAddress,
        contractRole: 'lock_vault',
        eventName: 'Deposited',
        txHash: receipt.txHash,
        logIndex: receipt.logIndex,
        blockNumber: receipt.blockNumber,
        blockTime: receipt.blockTime,
        finalized: receipt.finalized,
        payload: receiptPayload(receipt),
        applyStatus: 'review_required',
        reviewReason: 'wallet_not_bound_to_user',
      });
      return res.status(409).json({
        request_id: req.id || '',
        error: { code: 'WALLET_REVIEW_REQUIRED', message: 'Receipt wallet is not verified for this user' },
        data: { chain_event_id: inserted.event.id },
      });
    }

    const { eventResult, position } = await withTransaction(async (tx) => {
      const appliedEvent = await insertChainEvent({
        chainId: receipt.chainId,
        contractAddress: receipt.contractAddress,
        contractRole: 'lock_vault',
        eventName: 'Deposited',
        txHash: receipt.txHash,
        logIndex: receipt.logIndex,
        blockNumber: receipt.blockNumber,
        blockTime: receipt.blockTime,
        finalized: receipt.finalized,
        payload: receiptPayload(receipt),
        applyStatus: 'applied',
        executor: tx,
      });
      if (!appliedEvent.inserted) {
        return { eventResult: appliedEvent, position: null };
      }

      const appliedDeposit = await applyDeposit({
        userId: user.id,
        wave,
        amountRaw: receipt.amountRaw,
        onchainPositionId: receipt.positionId,
        unlockMultiplierBps: wave.unlock_multiplier_bps,
        source: 'chain_receipt',
        trackRapidDepositBurst: false,
        executor: tx,
      });

      return { eventResult: appliedEvent, position: appliedDeposit.position };
    });

    if (!eventResult.inserted || !position) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'DUPLICATE_CHAIN_EVENT', message: 'Deposit receipt was already submitted' } });
    }

    return res.status(201).json({ request_id: req.id || '', data: { position, chain_event: eventResult.event } });
  } catch (err) {
    if (err instanceof ReceiptVerificationError) {
      return res.status(err.status).json({ request_id: req.id || '', error: { code: err.code, message: err.message } });
    }
    return next(err);
  }
}
