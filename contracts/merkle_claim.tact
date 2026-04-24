import "@stdlib/ownable";

message(0x524f4f54) SetMerkleRoot {
    batchId: Int as uint64;
    merkleRoot: Int as uint256;
}

message(0x434c414d) ClaimReward {
    queryId: Int as uint64;
    batchId: Int as uint64;
    ledgerIdHash: Int as uint256;
    amountRaw: Int as uint128;
    leafHash: Int as uint256;
}

message(0x50415553) SetPaused {
    paused: Bool;
}

contract MerkleClaim with Ownable {
    owner: Address;
    tokenAddress: Address;
    paused: Bool;
    activeBatchId: Int as uint64;
    merkleRoot: Int as uint256;
    totalClaimedRaw: Int as uint128;
    claimCount: Int as uint64;
    lastClaimer: Address?;
    lastLedgerIdHash: Int as uint256;
    lastAmountRaw: Int as uint128;
    lastLeafHash: Int as uint256;

    init(owner: Address, tokenAddress: Address) {
        self.owner = owner;
        self.tokenAddress = tokenAddress;
        self.paused = false;
        self.activeBatchId = 0;
        self.merkleRoot = 0;
        self.totalClaimedRaw = 0;
        self.claimCount = 0;
        self.lastClaimer = null;
        self.lastLedgerIdHash = 0;
        self.lastAmountRaw = 0;
        self.lastLeafHash = 0;
    }

    receive() {}

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: SetMerkleRoot) {
        self.requireOwner();
        throwUnless(1101, msg.batchId > 0);
        throwUnless(1102, msg.merkleRoot > 0);

        self.activeBatchId = msg.batchId;
        self.merkleRoot = msg.merkleRoot;
    }

    receive(msg: ClaimReward) {
        throwIf(1201, self.paused);
        throwUnless(1202, self.activeBatchId == msg.batchId);
        throwUnless(1203, self.merkleRoot != 0);
        throwUnless(1204, msg.amountRaw > 0);
        throwUnless(1205, msg.leafHash != 0);

        self.totalClaimedRaw += msg.amountRaw;
        self.claimCount += 1;
        self.lastClaimer = sender();
        self.lastLedgerIdHash = msg.ledgerIdHash;
        self.lastAmountRaw = msg.amountRaw;
        self.lastLeafHash = msg.leafHash;
    }

    get fun claimState(): ClaimState {
        return ClaimState {
            owner: self.owner,
            tokenAddress: self.tokenAddress,
            paused: self.paused,
            activeBatchId: self.activeBatchId,
            merkleRoot: self.merkleRoot,
            totalClaimedRaw: self.totalClaimedRaw,
            claimCount: self.claimCount,
            lastClaimer: self.lastClaimer,
            lastLedgerIdHash: self.lastLedgerIdHash,
            lastAmountRaw: self.lastAmountRaw,
            lastLeafHash: self.lastLeafHash,
        };
    }
}

struct ClaimState {
    owner: Address;
    tokenAddress: Address;
    paused: Bool;
    activeBatchId: Int as uint64;
    merkleRoot: Int as uint256;
    totalClaimedRaw: Int as uint128;
    claimCount: Int as uint64;
    lastClaimer: Address?;
    lastLedgerIdHash: Int as uint256;
    lastAmountRaw: Int as uint128;
    lastLeafHash: Int as uint256;
}
