import 'dotenv/config';
import { Address, toNano } from '@ton/core';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    function requiredAddress(name: string) {
        const value = process.env[name]?.trim();
        if (!value) {
            throw new Error(`${name} is required`);
        }
        return Address.parse(value);
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
    const rewardJettonWallet = requiredAddress('REWARD_JETTON_WALLET_ADDRESS');
    const merkleClaim = provider.open(await MerkleClaim.fromInit(owner, tokenAddress, rewardJettonWallet));

    await merkleClaim.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(merkleClaim.address);

    console.log(JSON.stringify({
        contract: 'MerkleClaim',
        owner: owner.toString(),
        tokenAddress: tokenAddress.toString(),
        rewardJettonWallet: rewardJettonWallet.toString(),
        merkleClaimAddress: merkleClaim.address.toString(),
    }, null, 2));
}
