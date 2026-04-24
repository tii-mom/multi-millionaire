import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import '@ton/test-utils';

const TOKEN_SCALE = 1_000_000_000n;
const ONE_YEAR_SECONDS = 31_536_000;

function depositPayload(waveId: bigint, positionId: bigint) {
    return beginCell()
        .storeBit(false)
        .storeUint(waveId, 32)
        .storeUint(positionId, 64)
        .asSlice();
}

describe('LockVault', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let other: SandboxContract<TreasuryContract>;
    let vaultJettonWallet: SandboxContract<TreasuryContract>;
    let lockVault: SandboxContract<LockVault>;
    let tokenAddress: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1_700_000_000;
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        other = await blockchain.treasury('other');
        vaultJettonWallet = await blockchain.treasury('vaultJettonWallet');
        tokenAddress = (await blockchain.treasury('token')).address;

        lockVault = blockchain.openContract(await LockVault.fromInit(deployer.address, tokenAddress));

        const deployResult = await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockVault.address,
            deploy: true,
            success: true,
        });

        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetVaultJettonWallet', queryId: 1n, vaultJettonWallet: vaultJettonWallet.address },
        );
    });

    it('records deposits only from the configured vault Jetton wallet', async () => {
        const result = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 1n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(7n, 42n),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: true,
        });

        const state = await lockVault.getVaultState();
        expect(state.owner.equals(deployer.address)).toBe(true);
        expect(state.tokenAddress.equals(tokenAddress)).toBe(true);
        expect(state.vaultJettonWallet?.equals(vaultJettonWallet.address)).toBe(true);
        expect(state.totalDepositedRaw).toBe(1000n);
        expect(state.totalActiveRaw).toBe(1000n);
        expect(state.depositCount).toBe(1n);
        expect(state.lastDepositor?.equals(user.address)).toBe(true);
        expect(state.lastWaveId).toBe(7n);
        expect(state.lastAmountRaw).toBe(1000n);
        expect(state.lastPositionId).toBe(42n);

        const position = await lockVault.getPosition(42n);
        expect(position.owner.equals(user.address)).toBe(true);
        expect(position.amountRaw).toBe(1000n);
        expect(position.waveId).toBe(7n);
        expect(position.withdrawn).toBe(false);

        const userState = await lockVault.getUserState(user.address);
        expect(userState.activeRaw).toBe(1000n);
        expect(userState.goalReached).toBe(false);
    });

    it('rejects forged deposit notifications', async () => {
        const result = await lockVault.send(
            other.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 1n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(7n, 42n),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: other.address,
            to: lockVault.address,
            success: false,
            exitCode: 1003,
        });
    });

    it('lets only the position owner withdraw after the price target is reached', async () => {
        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetPrice', queryId: 1n, priceUsdE6: 1000n },
        );

        const oneBillionTokensRaw = 1_000_000_000n * TOKEN_SCALE;
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 2n,
                amount: oneBillionTokensRaw,
                sender: user.address,
                forwardPayload: depositPayload(1n, 100n),
            },
        );

        const rejected = await lockVault.send(
            other.getSender(),
            { value: toNano('0.1') },
            { $$type: 'WithdrawPosition', queryId: 3n, positionId: 100n },
        );

        expect(rejected.transactions).toHaveTransaction({
            from: other.address,
            to: lockVault.address,
            success: false,
            exitCode: 1021,
        });

        const result = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 4n, positionId: 100n },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: lockVault.address,
            to: vaultJettonWallet.address,
            success: true,
        });

        const position = await lockVault.getPosition(100n);
        expect(position.withdrawn).toBe(true);
        const state = await lockVault.getVaultState();
        expect(state.totalWithdrawnRaw).toBe(oneBillionTokensRaw);
        expect(state.totalActiveRaw).toBe(0n);
    });

    it('blocks new deposits after a user reaches the target until the active cycle is withdrawn', async () => {
        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetPrice', queryId: 1n, priceUsdE6: 1000n },
        );

        const oneBillionTokensRaw = 1_000_000_000n * TOKEN_SCALE;
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 2n,
                amount: oneBillionTokensRaw,
                sender: user.address,
                forwardPayload: depositPayload(1n, 101n),
            },
        );

        const blockedTopUp = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 3n,
                amount: 1n,
                sender: user.address,
                forwardPayload: depositPayload(1n, 102n),
            },
        );

        expect(blockedTopUp.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: false,
            exitCode: 1008,
        });

        await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 4n, positionId: 101n },
        );

        const nextCycleDeposit = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 5n,
                amount: 1n,
                sender: user.address,
                forwardPayload: depositPayload(1n, 103n),
            },
        );

        expect(nextCycleDeposit.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: true,
        });
    });

    it('keeps funds locked until either target or one-year time lock is satisfied', async () => {
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 1n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n, 200n),
            },
        );

        const early = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 2n, positionId: 200n },
        );
        expect(early.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: false,
            exitCode: 1023,
        });

        blockchain.now = 1_700_000_000 + ONE_YEAR_SECONDS + 1;
        const mature = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 3n, positionId: 200n },
        );
        expect(mature.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });
    });

    it('allows users to set a custom target before deposits and prevents lowering it with active funds', async () => {
        await lockVault.send(
            user.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetUserTarget', queryId: 1n, targetUsdE6: 2_000_000_000_000n },
        );

        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 2n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n, 300n),
            },
        );

        const lowering = await lockVault.send(
            user.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetUserTarget', queryId: 3n, targetUsdE6: 1_000_000_000_000n },
        );

        expect(lowering.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: false,
            exitCode: 1011,
        });
    });

    it('pauses new deposits without blocking valid withdrawals', async () => {
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 1n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n, 400n),
            },
        );

        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetPaused', paused: true },
        );

        const blockedDeposit = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 2n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n, 401n),
            },
        );
        expect(blockedDeposit.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: false,
            exitCode: 1001,
        });

        blockchain.now = 1_700_000_000 + ONE_YEAR_SECONDS + 1;
        const withdrawal = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 3n, positionId: 400n },
        );
        expect(withdrawal.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });
    });
});
