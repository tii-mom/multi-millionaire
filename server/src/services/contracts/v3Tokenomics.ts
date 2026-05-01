export const PUBLIC_72H_V3_MAINNET = {
  chain_id: 'ton-mainnet',
  token_address: 'EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3',
  token_decimals: 9,
  total_supply_raw: '100000000000000000000',
  total_supply: '100,000,000,000 72H',
  mintable: false,
  jetton_admin: null,
  metadata_uri: 'ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC',
  logo_uri: 'ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4',
  season_vault_address: 'EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l',
  season_claim_v2_address: 'EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b',
  season_claim_address: 'EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b',
  fund_vesting_address: 'EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb',
  development_fund_address: 'EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh',
  presale_vault_address: 'EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy',
  ecosystem_treasury_address: 'EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7',
  team_vesting_address: 'EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy',
  season_vault_wallet_address: 'EQClq_b3CeBTPUtjsQWgaIg4dfrjIP2GyTPcYkIMf352BSbt',
  season_vault_wallet_balance_raw: '90000000000000000000',
  season_claim_v2_wallet_address: 'EQC3AK8tmvIezR6gd_cdmg4qmrFJOloUhpoWE8HpsSKhjPxY',
  season_claim_v2_wallet_balance_raw: '0',
  fund_vesting_wallet_address: 'EQBHI_ujpZQVNDj8CVaKMQ6QR2tMVugXaSL46rxgQT7XxnpW',
  fund_vesting_wallet_balance_raw: '0',
  development_fund_wallet_address: 'EQAmfNJcT0-DZlc1pLWURIJrQKR2xRJQaBjadpSB9wVcYx8T',
  development_fund_wallet_balance_raw: '500000000000000000',
  presale_vault_wallet_address: 'EQBeIBmsLzSkfVwcGl4Donf3Hca2nfta__S3x2n1TMO1g9Vx',
  presale_vault_wallet_balance_raw: '4500000000000000000',
  ecosystem_treasury_wallet_address: 'EQC6l1XfmSrj50sOWHf5S7xiO_O4_0Xd4v2je2Pr7BLcWnBF',
  ecosystem_treasury_wallet_balance_raw: '4500000000000000000',
  team_vesting_wallet_address: 'EQABKzYV7XtCAi9RcKGWRL8OAHWEr0lYvNXW_h-W9kJ7sO9X',
  team_vesting_wallet_balance_raw: '300000000000000000',
  early_users_operations_wallet_address: 'EQD-9WsEEJFTo9yMw2cLOkbN_tnFQuizMRMZzeWOv2E2Zq01',
  early_users_operations_wallet_balance_raw: '200000000000000000',
} as const;

export function readPublicV3Tokenomics(env: NodeJS.ProcessEnv = process.env) {
  const seasonClaimV2Address = env.SEASON_CLAIM_V2_ADDRESS?.trim()
    || env.SEASON_CLAIM_ADDRESS?.trim()
    || PUBLIC_72H_V3_MAINNET.season_claim_v2_address;

  return {
    ...PUBLIC_72H_V3_MAINNET,
    chain_id: env.CHAIN_ID?.trim() || PUBLIC_72H_V3_MAINNET.chain_id,
    token_address: env.TOKEN_ADDRESS_MAINNET?.trim() || PUBLIC_72H_V3_MAINNET.token_address,
    season_vault_address: env.SEASON_VAULT_ADDRESS?.trim() || PUBLIC_72H_V3_MAINNET.season_vault_address,
    season_claim_v2_address: seasonClaimV2Address,
    season_claim_address: seasonClaimV2Address,
    fund_vesting_address: env.FUND_VESTING_ADDRESS?.trim() || PUBLIC_72H_V3_MAINNET.fund_vesting_address,
    development_fund_address: env.DEVELOPMENT_FUND_ADDRESS?.trim() || PUBLIC_72H_V3_MAINNET.development_fund_address,
    presale_vault_address: env.PRESALE_VAULT_ADDRESS?.trim() || PUBLIC_72H_V3_MAINNET.presale_vault_address,
    ecosystem_treasury_address: env.ECOSYSTEM_TREASURY_ADDRESS?.trim() || PUBLIC_72H_V3_MAINNET.ecosystem_treasury_address,
    team_vesting_address: env.TEAM_VESTING_ADDRESS?.trim() || PUBLIC_72H_V3_MAINNET.team_vesting_address,
  };
}
