import "@stdlib/ownable";

message(0x4c4f434b) Deposit {
    queryId: Int as uint64;
    waveId: Int as uint32;
    amountRaw: Int as uint128;
    positionId: Int as uint64;
}

message(0x50415553) SetPaused {
    paused: Bool;
}

contract LockVault with Ownable {
    owner: Address;
    tokenAddress: Address;
    paused: Bool;
    totalDepositedRaw: Int as uint128;
    depositCount: Int as uint64;
    lastDepositor: Address?;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as uint128;
    lastPositionId: Int as uint64;

    init(owner: Address, tokenAddress: Address) {
        self.owner = owner;
        self.tokenAddress = tokenAddress;
        self.paused = false;
        self.totalDepositedRaw = 0;
        self.depositCount = 0;
        self.lastDepositor = null;
        self.lastWaveId = 0;
        self.lastAmountRaw = 0;
        self.lastPositionId = 0;
    }

    receive() {}

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: Deposit) {
        throwIf(1001, self.paused);
        throwUnless(1002, msg.amountRaw > 0);

        self.totalDepositedRaw += msg.amountRaw;
        self.depositCount += 1;
        self.lastDepositor = sender();
        self.lastWaveId = msg.waveId;
        self.lastAmountRaw = msg.amountRaw;
        self.lastPositionId = msg.positionId;
    }

    get fun vaultState(): VaultState {
        return VaultState {
            owner: self.owner,
            tokenAddress: self.tokenAddress,
            paused: self.paused,
            totalDepositedRaw: self.totalDepositedRaw,
            depositCount: self.depositCount,
            lastDepositor: self.lastDepositor,
            lastWaveId: self.lastWaveId,
            lastAmountRaw: self.lastAmountRaw,
            lastPositionId: self.lastPositionId,
        };
    }
}

struct VaultState {
    owner: Address;
    tokenAddress: Address;
    paused: Bool;
    totalDepositedRaw: Int as uint128;
    depositCount: Int as uint64;
    lastDepositor: Address?;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as uint128;
    lastPositionId: Int as uint64;
}
