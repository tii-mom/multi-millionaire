import 'dotenv/config';

async function main() {
  const endpoint = process.env.CHAIN_RPC_URL || 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
  if (!endpoint.includes('testnet')) {
    throw new Error('Refusing to send deposit: CHAIN_RPC_URL is not a testnet endpoint');
  }

  throw new Error([
    'Refusing to send a direct LockVault deposit on public testnet.',
    'LockVault only accepts JettonTransferNotification messages from its configured vault Jetton wallet.',
    'Send the canary deposit by calling transfer on the user Jetton wallet with LockVault as the destination and a forward payload containing waveId:uint32 and positionId:uint64.',
    'Direct simulated JettonTransferNotification messages are only appropriate in sandbox/local tests where the sender can be the configured vault Jetton wallet.',
  ].join(' '));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
