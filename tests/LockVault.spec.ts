import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano } from '@ton/core';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import '@ton/test-utils';

describe('LockVault', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let lockVault: SandboxContract<LockVault>;
    let tokenAddress: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
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
    });

    it('records deposit receipt data for backend verification', async () => {
        const result = await lockVault.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Deposit',
                queryId: 1n,
                waveId: 7n,
                amountRaw: 1000n,
                positionId: 42n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });

        const state = await lockVault.getVaultState();
        expect(state.owner.equals(deployer.address)).toBe(true);
        expect(state.tokenAddress.equals(tokenAddress)).toBe(true);
        expect(state.totalDepositedRaw).toBe(1000n);
        expect(state.depositCount).toBe(1n);
        expect(state.lastDepositor?.equals(user.address)).toBe(true);
        expect(state.lastWaveId).toBe(7n);
        expect(state.lastAmountRaw).toBe(1000n);
        expect(state.lastPositionId).toBe(42n);
    });

    it('allows the owner to pause deposits', async () => {
        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetPaused', paused: true },
        );

        const result = await lockVault.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Deposit',
                queryId: 1n,
                waveId: 7n,
                amountRaw: 1000n,
                positionId: 42n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: false,
            exitCode: 1001,
        });
    });
});
