import "@stdlib/ownable";

const DEFAULT_LOCK_SECONDS: Int = 31536000;
const DEFAULT_TARGET_USD_E6: Int = 1000000000000;
const DEFAULT_TOKEN_SCALE: Int = 1000000000;
const JETTON_TRANSFER_TON_FEE: Int = 50000000;

message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Slice as remaining;
}

message(0x0f8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x50415553) SetPaused {
    paused: Bool;
}

message(0x50524943) SetPrice {
    queryId: Int as uint64;
    priceUsdE6: Int as uint64;
}

message(0x4a57544c) SetVaultJettonWallet {
    queryId: Int as uint64;
    vaultJettonWallet: Address;
}

message(0x55545247) SetUserTarget {
    queryId: Int as uint64;
    targetUsdE6: Int as uint64;
}

message(0x57495448) WithdrawPosition {
    queryId: Int as uint64;
    positionId: Int as uint64;
}

struct DepositPayload {
    waveId: Int as uint32;
    positionId: Int as uint64;
}

struct Position {
    owner: Address;
    amountRaw: Int as coins;
    waveId: Int as uint32;
    createdAt: Int as uint64;
    withdrawn: Bool;
}

contract LockVault with Ownable {
    owner: Address;
    tokenAddress: Address;
    vaultJettonWallet: Address?;
    paused: Bool;
    priceUsdE6: Int as uint64;
    lockSeconds: Int as uint64;
    tokenScale: Int as uint64;
    defaultTargetUsdE6: Int as uint64;
    totalDepositedRaw: Int as coins;
    totalWithdrawnRaw: Int as coins;
    totalActiveRaw: Int as coins;
    depositCount: Int as uint64;
    withdrawCount: Int as uint64;
    positions: map<Int as uint64, Position>;
    activeRawByUser: map<Address, Int>;
    targetUsdE6ByUser: map<Address, Int>;
    goalReachedByUser: map<Address, Bool>;
    lastDepositor: Address?;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastPositionId: Int as uint64;

    init(owner: Address, tokenAddress: Address) {
        self.owner = owner;
        self.tokenAddress = tokenAddress;
        self.vaultJettonWallet = null;
        self.paused = false;
        self.priceUsdE6 = 0;
        self.lockSeconds = DEFAULT_LOCK_SECONDS;
        self.tokenScale = DEFAULT_TOKEN_SCALE;
        self.defaultTargetUsdE6 = DEFAULT_TARGET_USD_E6;
        self.totalDepositedRaw = 0;
        self.totalWithdrawnRaw = 0;
        self.totalActiveRaw = 0;
        self.depositCount = 0;
        self.withdrawCount = 0;
        self.positions = emptyMap();
        self.activeRawByUser = emptyMap();
        self.targetUsdE6ByUser = emptyMap();
        self.goalReachedByUser = emptyMap();
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

    receive(msg: SetPrice) {
        self.requireOwner();
        self.priceUsdE6 = msg.priceUsdE6;
    }

    receive(msg: SetVaultJettonWallet) {
        self.requireOwner();
        throwUnless(1007, self.depositCount == 0);
        self.vaultJettonWallet = msg.vaultJettonWallet;
    }

    receive(msg: SetUserTarget) {
        throwUnless(1010, msg.targetUsdE6 > 0);

        let currentTarget: Int = self.userTarget(sender());
        let activeRaw: Int = self.activeRaw(sender());
        if (activeRaw > 0) {
            throwUnless(1011, msg.targetUsdE6 >= currentTarget);
        }

        self.targetUsdE6ByUser.set(sender(), msg.targetUsdE6);
    }

    receive(msg: JettonTransferNotification) {
        throwIf(1001, self.paused);
        throwUnless(1002, msg.amount > 0);
        throwUnless(1003, self.vaultJettonWallet != null && sender() == self.vaultJettonWallet!!);
        throwUnless(1004, !msg.forwardPayload.empty());
        throwUnless(1008, !self.isGoalLatched(msg.sender));

        let payload: DepositPayload = self.parseDepositPayload(msg.forwardPayload);
        throwUnless(1005, payload.positionId > 0);
        throwUnless(1006, !self.positions.exists(payload.positionId));

        let createdAt: Int = now();
        self.positions.set(payload.positionId, Position {
            owner: msg.sender,
            amountRaw: msg.amount,
            waveId: payload.waveId,
            createdAt: createdAt,
            withdrawn: false,
        });

        self.totalDepositedRaw += msg.amount;
        self.totalActiveRaw += msg.amount;
        self.depositCount += 1;

        let previousActive: Int = self.activeRaw(msg.sender);
        let nextActive: Int = previousActive + msg.amount;
        self.activeRawByUser.set(msg.sender, nextActive);
        self.refreshGoalReached(msg.sender, nextActive);

        self.lastDepositor = msg.sender;
        self.lastWaveId = payload.waveId;
        self.lastAmountRaw = msg.amount;
        self.lastPositionId = payload.positionId;
    }

    receive(msg: WithdrawPosition) {
        let existing: Position? = self.positions.get(msg.positionId);
        throwUnless(1020, existing != null);

        let position: Position = existing!!;
        throwUnless(1021, position.owner == sender());
        throwUnless(1022, !position.withdrawn);

        let activeRaw: Int = self.activeRaw(position.owner);
        let goalReached: Bool = self.hasReachedGoal(position.owner, activeRaw);
        if (goalReached) {
            self.goalReachedByUser.set(position.owner, true);
        }
        throwUnless(1023, goalReached || now() >= position.createdAt + self.lockSeconds);

        self.positions.set(msg.positionId, Position {
            owner: position.owner,
            amountRaw: position.amountRaw,
            waveId: position.waveId,
            createdAt: position.createdAt,
            withdrawn: true,
        });

        self.totalWithdrawnRaw += position.amountRaw;
        self.totalActiveRaw -= position.amountRaw;
        self.withdrawCount += 1;
        let nextActiveRaw: Int = activeRaw - position.amountRaw;
        self.activeRawByUser.set(position.owner, nextActiveRaw);
        if (nextActiveRaw == 0) {
            self.goalReachedByUser.set(position.owner, false);
        }

        let jettonWallet: Address? = self.vaultJettonWallet;
        throwUnless(1024, jettonWallet != null);

        send(SendParameters {
            to: jettonWallet!!,
            value: JETTON_TRANSFER_TON_FEE,
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: position.amountRaw,
                destination: position.owner,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 1,
                forwardPayload: emptySlice(),
            }.toCell(),
        });
    }

    fun parseDepositPayload(forwardPayload: Slice): DepositPayload {
        let payload: Slice = forwardPayload;
        throwUnless(1030, payload.bits() >= 1);

        let payloadInRef: Bool = payload.loadBool();
        if (payloadInRef) {
            throwUnless(1031, !payload.refsEmpty());
            payload = payload.loadRef().beginParse();
        }

        throwUnless(1032, payload.bits() >= 96);
        return DepositPayload {
            waveId: payload.loadUint(32),
            positionId: payload.loadUint(64),
        };
    }

    fun userTarget(user: Address): Int {
        let configured: Int? = self.targetUsdE6ByUser.get(user);
        if (configured == null) {
            return self.defaultTargetUsdE6;
        }
        return configured!!;
    }

    fun activeRaw(user: Address): Int {
        let active: Int? = self.activeRawByUser.get(user);
        if (active == null) {
            return 0;
        }
        return active!!;
    }

    fun hasReachedGoal(user: Address, activeRaw: Int): Bool {
        if (self.isGoalLatched(user)) {
            return true;
        }
        if (self.priceUsdE6 == 0) {
            return false;
        }
        return activeRaw * self.priceUsdE6 >= self.userTarget(user) * self.tokenScale;
    }

    fun isGoalLatched(user: Address): Bool {
        let latched: Bool? = self.goalReachedByUser.get(user);
        return latched != null && latched!!;
    }

    fun refreshGoalReached(user: Address, activeRaw: Int) {
        if (self.hasReachedGoal(user, activeRaw)) {
            self.goalReachedByUser.set(user, true);
        }
    }

    get fun vaultState(): VaultState {
        return VaultState {
            owner: self.owner,
            tokenAddress: self.tokenAddress,
            vaultJettonWallet: self.vaultJettonWallet,
            paused: self.paused,
            priceUsdE6: self.priceUsdE6,
            lockSeconds: self.lockSeconds,
            tokenScale: self.tokenScale,
            defaultTargetUsdE6: self.defaultTargetUsdE6,
            totalDepositedRaw: self.totalDepositedRaw,
            totalWithdrawnRaw: self.totalWithdrawnRaw,
            totalActiveRaw: self.totalActiveRaw,
            depositCount: self.depositCount,
            withdrawCount: self.withdrawCount,
            lastDepositor: self.lastDepositor,
            lastWaveId: self.lastWaveId,
            lastAmountRaw: self.lastAmountRaw,
            lastPositionId: self.lastPositionId,
        };
    }

    get fun position(positionId: Int): Position {
        let existing: Position? = self.positions.get(positionId);
        throwUnless(1040, existing != null);
        return existing!!;
    }

    get fun userState(user: Address): UserState {
        let active: Int = self.activeRaw(user);
        return UserState {
            activeRaw: active,
            targetUsdE6: self.userTarget(user),
            goalReached: self.hasReachedGoal(user, active),
        };
    }
}

struct VaultState {
    owner: Address;
    tokenAddress: Address;
    vaultJettonWallet: Address?;
    paused: Bool;
    priceUsdE6: Int as uint64;
    lockSeconds: Int as uint64;
    tokenScale: Int as uint64;
    defaultTargetUsdE6: Int as uint64;
    totalDepositedRaw: Int as coins;
    totalWithdrawnRaw: Int as coins;
    totalActiveRaw: Int as coins;
    depositCount: Int as uint64;
    withdrawCount: Int as uint64;
    lastDepositor: Address?;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastPositionId: Int as uint64;
}

struct UserState {
    activeRaw: Int as coins;
    targetUsdE6: Int as uint64;
    goalReached: Bool;
}
