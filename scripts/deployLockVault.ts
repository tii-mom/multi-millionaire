import 'dotenv/config';
import { Address, toNano } from '@ton/core';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address;
    if (!owner) {
        throw new Error('Sender address is required');
    }
    const expectedOwner = process.env.CHAIN_ADMIN_ADDRESS ? Address.parse(process.env.CHAIN_ADMIN_ADDRESS) : null;
    if (expectedOwner && !owner.equals(expectedOwner)) {
        throw new Error(`Connected wallet ${owner.toString()} does not match CHAIN_ADMIN_ADDRESS ${expectedOwner.toString()}`);
    }
    const tokenAddress = Address.parse(process.env.TOKEN_ADDRESS || process.env.TOKEN_ADDRESS_MAINNET || owner.toString());
    const lockVault = provider.open(await LockVault.fromInit(owner, tokenAddress));

    await lockVault.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(lockVault.address);

    console.log(JSON.stringify({
        contract: 'LockVault',
        owner: owner.toString(),
        tokenAddress: tokenAddress.toString(),
        lockVaultAddress: lockVault.address.toString(),
    }, null, 2));
}
