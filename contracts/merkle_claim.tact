import "@stdlib/ownable";

const REWARD_JETTON_TRANSFER_TON_FEE: Int = 50000000;

message(0x524f4f54) SetMerkleRoot {
    batchId: Int as uint64;
    merkleRoot: Int as uint256;
}

message(0x524a574c) SetRewardJettonWallet {
    queryId: Int as uint64;
    rewardJettonWallet: Address;
}

message(0x434c414d) ClaimReward {
    queryId: Int as uint64;
    batchId: Int as uint64;
    ledgerIdHash: Int as uint256;
    recipient: Address;
    amountRaw: Int as coins;
    proof: Cell;
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

contract MerkleClaim with Ownable {
    owner: Address;
    tokenAddress: Address;
    rewardJettonWallet: Address?;
    paused: Bool;
    activeBatchId: Int as uint64;
    merkleRoot: Int as uint256;
    totalClaimedRaw: Int as coins;
    claimCount: Int as uint64;
    claimedLedgers: map<Int as uint256, Bool>;
    lastClaimer: Address?;
    lastLedgerIdHash: Int as uint256;
    lastAmountRaw: Int as coins;
    lastLeafHash: Int as uint256;

    init(owner: Address, tokenAddress: Address) {
        self.owner = owner;
        self.tokenAddress = tokenAddress;
        self.rewardJettonWallet = null;
        self.paused = false;
        self.activeBatchId = 0;
        self.merkleRoot = 0;
        self.totalClaimedRaw = 0;
        self.claimCount = 0;
        self.claimedLedgers = emptyMap();
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

    receive(msg: SetRewardJettonWallet) {
        self.requireOwner();
        throwUnless(1103, self.claimCount == 0);
        self.rewardJettonWallet = msg.rewardJettonWallet;
    }

    receive(msg: ClaimReward) {
        throwIf(1201, self.paused);
        throwUnless(1202, self.activeBatchId == msg.batchId);
        throwUnless(1203, self.merkleRoot != 0);
        throwUnless(1204, msg.amountRaw > 0);
        throwUnless(1205, msg.ledgerIdHash != 0);
        throwUnless(1206, sender() == msg.recipient);
        throwUnless(1207, !self.claimedLedgers.exists(msg.ledgerIdHash));

        let leafHash: Int = self.leafHash(msg.batchId, msg.ledgerIdHash, msg.recipient, msg.amountRaw);
        let calculatedRoot: Int = self.calculateRoot(leafHash, msg.proof);
        throwUnless(1208, calculatedRoot == self.merkleRoot);

        self.claimedLedgers.set(msg.ledgerIdHash, true);
        self.totalClaimedRaw += msg.amountRaw;
        self.claimCount += 1;
        self.lastClaimer = msg.recipient;
        self.lastLedgerIdHash = msg.ledgerIdHash;
        self.lastAmountRaw = msg.amountRaw;
        self.lastLeafHash = leafHash;

        let jettonWallet: Address? = self.rewardJettonWallet;
        throwUnless(1209, jettonWallet != null);

        send(SendParameters {
            to: jettonWallet!!,
            value: REWARD_JETTON_TRANSFER_TON_FEE,
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: msg.amountRaw,
                destination: msg.recipient,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 1,
                forwardPayload: emptySlice(),
            }.toCell(),
        });
    }

    fun leafHash(batchId: Int, ledgerIdHash: Int, recipient: Address, amountRaw: Int): Int {
        return beginCell()
            .storeUint(batchId, 64)
            .storeUint(ledgerIdHash, 256)
            .storeAddress(recipient)
            .storeCoins(amountRaw)
            .endCell()
            .hash();
    }

    fun pairHash(left: Int, right: Int): Int {
        return beginCell()
            .storeUint(left, 256)
            .storeUint(right, 256)
            .endCell()
            .hash();
    }

    fun calculateRoot(leafHash: Int, proof: Cell): Int {
        let proofSlice: Slice = proof.beginParse();
        if (proofSlice.empty()) {
            return leafHash;
        }

        throwUnless(1210, proofSlice.bits() >= 8);
        let depth: Int = proofSlice.loadUint(8);
        let currentHash: Int = leafHash;

        repeat (depth) {
            throwUnless(1211, proofSlice.bits() >= 257);
            let siblingOnRight: Bool = proofSlice.loadBool();
            let siblingHash: Int = proofSlice.loadUint(256);
            if (siblingOnRight) {
                currentHash = self.pairHash(currentHash, siblingHash);
            } else {
                currentHash = self.pairHash(siblingHash, currentHash);
            }
        }

        throwUnless(1212, proofSlice.empty());
        return currentHash;
    }

    get fun claimState(): ClaimState {
        return ClaimState {
            owner: self.owner,
            tokenAddress: self.tokenAddress,
            rewardJettonWallet: self.rewardJettonWallet,
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

    get fun isClaimed(ledgerIdHash: Int): Bool {
        return self.claimedLedgers.exists(ledgerIdHash);
    }

    get fun proofLeafHash(batchId: Int, ledgerIdHash: Int, recipient: Address, amountRaw: Int): Int {
        return self.leafHash(batchId, ledgerIdHash, recipient, amountRaw);
    }
}

struct ClaimState {
    owner: Address;
    tokenAddress: Address;
    rewardJettonWallet: Address?;
    paused: Bool;
    activeBatchId: Int as uint64;
    merkleRoot: Int as uint256;
    totalClaimedRaw: Int as coins;
    claimCount: Int as uint64;
    lastClaimer: Address?;
    lastLedgerIdHash: Int as uint256;
    lastAmountRaw: Int as coins;
    lastLeafHash: Int as uint256;
}
