import 'dotenv/config';
import crypto from 'crypto';
import type { NetworkProvider } from '@ton/blueprint';

const { Address, toNano } = require('@ton/core');
const { JettonMaster, TonClient } = require('@ton/ton');
const { MerkleClaim } = require('../build/MerkleClaim/MerkleClaim_MerkleClaim');

export async function run(provider: NetworkProvider) {
    function required(name: string) {
        const value = process.env[name]?.trim();
        if (!value) {
            throw new Error(`${name} is required`);
        }
        return value;
    }

    function optionalAddress(name: string) {
        const value = process.env[name]?.trim();
        if (!value) {
            return null;
        }
        return Address.parse(value);
    }

    function chainIdHash(chainId: string) {
        return BigInt(`0x${crypto.createHash('sha256').update(chainId).digest('hex')}`);
    }

    function optionalToncenterApiKey(): string | undefined {
        return process.env.TONCENTER_API_KEY?.trim() || process.env.TONCENTER_TESTNET_API_KEY?.trim() || undefined;
    }

    async function deriveJettonWallet(tokenAddress: any, ownerAddress: any) {
        const client = new TonClient({ endpoint: required('CHAIN_RPC_URL'), apiKey: optionalToncenterApiKey() });
        const jettonMaster = client.open(JettonMaster.create(tokenAddress));
        return jettonMaster.getWalletAddress(ownerAddress);
    }

    const owner = provider.sender().address;
    if (!owner) {
        throw new Error('Sender address is required');
    }
    const chainId = required('CHAIN_ID');
    required('CHAIN_RPC_URL');
    if (required('TOKEN_DECIMALS') !== '9') {
        throw new Error('TOKEN_DECIMALS must be 9 for the 72H token');
    }
    const expectedOwner = process.env.CHAIN_ADMIN_ADDRESS ? Address.parse(process.env.CHAIN_ADMIN_ADDRESS) : null;
    if (expectedOwner && !owner.equals(expectedOwner)) {
        throw new Error(`Connected wallet ${owner.toString()} does not match CHAIN_ADMIN_ADDRESS ${expectedOwner.toString()}`);
    }
    const tokenAddress = Address.parse(required('TOKEN_ADDRESS'));
    const rewardJettonWallet = optionalAddress('REWARD_JETTON_WALLET_ADDRESS');
    const merkleClaim = provider.open(await MerkleClaim.fromInit(owner, tokenAddress, chainIdHash(chainId)));
    const derivedRewardJettonWallet = await deriveJettonWallet(tokenAddress, merkleClaim.address);
    if (rewardJettonWallet && !rewardJettonWallet.equals(derivedRewardJettonWallet)) {
        throw new Error(`REWARD_JETTON_WALLET_ADDRESS ${rewardJettonWallet.toString()} does not match derived wallet ${derivedRewardJettonWallet.toString()}`);
    }

    await merkleClaim.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(merkleClaim.address);

    if (rewardJettonWallet) {
        await merkleClaim.send(
            provider.sender(),
            { value: toNano('0.05') },
            { $$type: 'SetRewardJettonWallet', queryId: BigInt(Date.now()), rewardJettonWallet },
        );
    }

    console.log(JSON.stringify({
        contract: 'MerkleClaim',
        owner: owner.toString(),
        chainId,
        chainIdHash: chainIdHash(chainId).toString(),
        tokenAddress: tokenAddress.toString(),
        rewardJettonWallet: rewardJettonWallet ? rewardJettonWallet.toString() : null,
        derivedRewardJettonWallet: derivedRewardJettonWallet.toString(),
        merkleClaimAddress: merkleClaim.address.toString(),
        followUp: rewardJettonWallet
            ? 'Reward Jetton wallet was set from env.'
            : 'Set REWARD_JETTON_WALLET_ADDRESS after deriving the Jetton wallet owned by merkleClaimAddress.',
    }, null, 2));
}
