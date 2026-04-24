import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano } from '@ton/core';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';
import '@ton/test-utils';

describe('MerkleClaim', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let merkleClaim: SandboxContract<MerkleClaim>;
    let tokenAddress: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        tokenAddress = (await blockchain.treasury('token')).address;

        merkleClaim = blockchain.openContract(await MerkleClaim.fromInit(deployer.address, tokenAddress));

        const deployResult = await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: merkleClaim.address,
            deploy: true,
            success: true,
        });
    });

    it('lets the owner publish a root and records claim receipts', async () => {
        const root = 123456789n;
        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId: 1n, merkleRoot: root },
        );

        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId: 1n,
                ledgerIdHash: 22n,
                amountRaw: 500n,
                leafHash: 33n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: true,
        });

        const state = await merkleClaim.getClaimState();
        expect(state.owner.equals(deployer.address)).toBe(true);
        expect(state.tokenAddress.equals(tokenAddress)).toBe(true);
        expect(state.activeBatchId).toBe(1n);
        expect(state.merkleRoot).toBe(root);
        expect(state.totalClaimedRaw).toBe(500n);
        expect(state.claimCount).toBe(1n);
        expect(state.lastClaimer?.equals(user.address)).toBe(true);
        expect(state.lastLedgerIdHash).toBe(22n);
        expect(state.lastAmountRaw).toBe(500n);
        expect(state.lastLeafHash).toBe(33n);
    });

    it('rejects claims before a root is active', async () => {
        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId: 1n,
                ledgerIdHash: 22n,
                amountRaw: 500n,
                leafHash: 33n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1202,
        });
    });
});
