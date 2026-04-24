import { toNano } from '@ton/core';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address;
    if (!owner) {
        throw new Error('Sender address is required');
    }
    const merkleClaim = provider.open(await MerkleClaim.fromInit(owner, owner));

    await merkleClaim.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(merkleClaim.address);

    // run methods on `merkleClaim`
}
