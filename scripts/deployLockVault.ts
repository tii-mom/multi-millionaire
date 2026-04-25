import 'dotenv/config';
import type { NetworkProvider } from '@ton/blueprint';

const { Address, toNano } = require('@ton/core');
const { LockVault } = require('../build/LockVault/LockVault_LockVault');

export async function run(provider: NetworkProvider) {
    function optionalAddress(...names: string[]) {
        for (const name of names) {
            const value = process.env[name]?.trim();
            if (value) {
                return Address.parse(value);
            }
        }
        return null;
    }

    const owner = provider.sender().address;
    if (!owner) {
        throw new Error('Sender address is required');
    }
    const expectedOwner = process.env.CHAIN_ADMIN_ADDRESS ? Address.parse(process.env.CHAIN_ADMIN_ADDRESS) : null;
    if (expectedOwner && !owner.equals(expectedOwner)) {
        throw new Error(`Connected wallet ${owner.toString()} does not match CHAIN_ADMIN_ADDRESS ${expectedOwner.toString()}`);
    }
    const tokenAddress = Address.parse(process.env.TOKEN_ADDRESS || process.env.TOKEN_ADDRESS_MAINNET || owner.toString());
    const vaultJettonWallet = optionalAddress('LOCK_VAULT_JETTON_WALLET_ADDRESS', 'VAULT_JETTON_WALLET_ADDRESS');
    const lockVault = provider.open(await LockVault.fromInit(owner, tokenAddress));

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
        lockVaultAddress: lockVault.address.toString(),
        followUp: vaultJettonWallet
            ? 'Vault Jetton wallet was set from env.'
            : 'Set LOCK_VAULT_JETTON_WALLET_ADDRESS after deriving the Jetton wallet owned by lockVaultAddress.',
    }, null, 2));
}
