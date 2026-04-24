import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';
import '@ton/test-utils';

function leafHash(batchId: bigint, ledgerIdHash: bigint, recipient: Address, amountRaw: bigint) {
    return cellHashInt(beginCell()
        .storeUint(batchId, 64)
        .storeUint(ledgerIdHash, 256)
        .storeAddress(recipient)
        .storeCoins(amountRaw)
        .endCell());
}

function pairHash(left: bigint, right: bigint) {
    return cellHashInt(beginCell()
        .storeUint(left, 256)
        .storeUint(right, 256)
        .endCell());
}

function cellHashInt(cell: Cell) {
    return BigInt(`0x${cell.hash().toString('hex')}`);
}

function emptyProof(): Cell {
    return beginCell().endCell();
}

function oneSiblingProof(siblingOnRight: boolean, siblingHash: bigint): Cell {
    return beginCell()
        .storeUint(1, 8)
        .storeBit(siblingOnRight)
        .storeUint(siblingHash, 256)
        .endCell();
}

describe('MerkleClaim', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let other: SandboxContract<TreasuryContract>;
    let rewardJettonWallet: SandboxContract<TreasuryContract>;
    let merkleClaim: SandboxContract<MerkleClaim>;
    let tokenAddress: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        other = await blockchain.treasury('other');
        rewardJettonWallet = await blockchain.treasury('rewardJettonWallet');
        tokenAddress = (await blockchain.treasury('token')).address;

        merkleClaim = blockchain.openContract(await MerkleClaim.fromInit(
            deployer.address,
            tokenAddress,
            rewardJettonWallet.address,
        ));

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

    it('verifies a Merkle proof and sends reward Jettons to the claimant', async () => {
        const batchId = 1n;
        const ledgerIdHash = 22n;
        const amountRaw = 500n;
        const root = leafHash(batchId, ledgerIdHash, user.address, amountRaw);

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );

        const contractLeafHash = await merkleClaim.getProofLeafHash(batchId, ledgerIdHash, user.address, amountRaw);
        expect(contractLeafHash).toBe(root);

        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: merkleClaim.address,
            to: rewardJettonWallet.address,
            success: true,
        });

        const state = await merkleClaim.getClaimState();
        expect(state.owner.equals(deployer.address)).toBe(true);
        expect(state.tokenAddress.equals(tokenAddress)).toBe(true);
        expect(state.rewardJettonWallet.equals(rewardJettonWallet.address)).toBe(true);
        expect(state.activeBatchId).toBe(batchId);
        expect(state.merkleRoot).toBe(root);
        expect(state.totalClaimedRaw).toBe(amountRaw);
        expect(state.claimCount).toBe(1n);
        expect(state.lastClaimer?.equals(user.address)).toBe(true);
        expect(state.lastLedgerIdHash).toBe(ledgerIdHash);
        expect(state.lastAmountRaw).toBe(amountRaw);
        expect(state.lastLeafHash).toBe(root);
        expect(await merkleClaim.getIsClaimed(ledgerIdHash)).toBe(true);
    });

    it('supports non-empty proofs with deterministic pair hashing', async () => {
        const batchId = 1n;
        const ledgerIdHash = 44n;
        const amountRaw = 700n;
        const leftLeaf = leafHash(batchId, ledgerIdHash, user.address, amountRaw);
        const rightLeaf = leafHash(batchId, 45n, other.address, 900n);
        const root = pairHash(leftLeaf, rightLeaf);

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );

        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: oneSiblingProof(true, rightLeaf),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: true,
        });
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
                recipient: user.address,
                amountRaw: 500n,
                proof: emptyProof(),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1202,
        });
    });

    it('rejects wrong recipient, wrong proof, and duplicate claims', async () => {
        const batchId = 1n;
        const ledgerIdHash = 22n;
        const amountRaw = 500n;
        const root = leafHash(batchId, ledgerIdHash, user.address, amountRaw);

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );

        const wrongRecipient = await merkleClaim.send(
            other.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );
        expect(wrongRecipient.transactions).toHaveTransaction({
            from: other.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1206,
        });

        const wrongProof = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 2n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw: amountRaw + 1n,
                proof: emptyProof(),
            },
        );
        expect(wrongProof.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1208,
        });

        await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 3n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );

        const duplicate = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 4n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );
        expect(duplicate.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1207,
        });
    });
});
