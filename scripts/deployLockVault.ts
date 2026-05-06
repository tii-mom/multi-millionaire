import 'dotenv/config';
import type { NetworkProvider } from '@ton/blueprint';

const { Address, toNano } = require('@ton/core');
const { JettonMaster, TonClient } = require('@ton/ton');
const { LockVault } = require('../build/LockVault/LockVault_LockVault');

export async function run(provider: NetworkProvider) {
    function required(name: string) {
        const value = process.env[name]?.trim();
        if (!value) {
            throw new Error(`${name} is required`);
        }
        return value;
    }

    function optionalAddress(...names: string[]) {
        for (const name of names) {
            const value = process.env[name]?.trim();
            if (value) {
                return Address.parse(value);
            }
        }
        return null;
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
    required('CHAIN_ID');
    required('CHAIN_RPC_URL');
    if (required('TOKEN_DECIMALS') !== '9') {
        throw new Error('TOKEN_DECIMALS must be 9 for the 72H token');
    }
    const expectedOwner = process.env.CHAIN_ADMIN_ADDRESS ? Address.parse(process.env.CHAIN_ADMIN_ADDRESS) : null;
    if (expectedOwner && !owner.equals(expectedOwner)) {
        throw new Error(`Connected wallet ${owner.toString()} does not match CHAIN_ADMIN_ADDRESS ${expectedOwner.toString()}`);
    }
    const tokenAddress = Address.parse(required('TOKEN_ADDRESS'));
    const vaultJettonWallet = optionalAddress('LOCK_VAULT_JETTON_WALLET_ADDRESS', 'VAULT_JETTON_WALLET_ADDRESS');
    const lockVault = provider.open(await LockVault.fromInit(owner, tokenAddress));
    const derivedVaultJettonWallet = await deriveJettonWallet(tokenAddress, lockVault.address);
    if (vaultJettonWallet && !vaultJettonWallet.equals(derivedVaultJettonWallet)) {
        throw new Error(`LOCK_VAULT_JETTON_WALLET_ADDRESS ${vaultJettonWallet.toString()} does not match derived wallet ${derivedVaultJettonWallet.toString()}`);
    }

    await lockVault.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(lockVault.address);

    if (vaultJettonWallet) {
        await lockVault.send(
            provider.sender(),
            { value: toNano('0.05') },
            { $$type: 'SetVaultJettonWallet', queryId: BigInt(Date.now()), vaultJettonWallet },
        );
    }

    console.log(JSON.stringify({
        contract: 'LockVault',
        owner: owner.toString(),
        tokenAddress: tokenAddress.toString(),
        vaultJettonWallet: vaultJettonWallet ? vaultJettonWallet.toString() : null,
        derivedVaultJettonWallet: derivedVaultJettonWallet.toString(),
        lockVaultAddress: lockVault.address.toString(),
        followUp: vaultJettonWallet
            ? 'Vault Jetton wallet was set from env.'
            : 'Set LOCK_VAULT_JETTON_WALLET_ADDRESS after deriving the Jetton wallet owned by lockVaultAddress.',
    }, null, 2));
}
