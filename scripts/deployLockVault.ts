import { toNano } from '@ton/core';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address;
    if (!owner) {
        throw new Error('Sender address is required');
    }
    const lockVault = provider.open(await LockVault.fromInit(owner, owner));

    await lockVault.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(lockVault.address);

    // run methods on `lockVault`
}
