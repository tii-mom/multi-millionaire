export const PUBLIC_72H_V2_MAINNET = {
  chain_id: 'ton-mainnet',
  token_address: 'EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg',
  season_vault_address: 'EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-',
  season_claim_address: 'EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS',
  fund_vesting_address: 'EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4',
  development_fund_address: 'EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU',
  presale_vault_address: 'EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9',
  ecosystem_treasury_address: 'EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O',
  team_vesting_address: 'EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK',
} as const;

export function readPublicV2Tokenomics(env: NodeJS.ProcessEnv = process.env) {
  return {
    chain_id: env.CHAIN_ID?.trim() || PUBLIC_72H_V2_MAINNET.chain_id,
    token_address: env.TOKEN_ADDRESS_MAINNET?.trim() || PUBLIC_72H_V2_MAINNET.token_address,
    season_vault_address: env.SEASON_VAULT_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.season_vault_address,
    season_claim_address: env.SEASON_CLAIM_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.season_claim_address,
    fund_vesting_address: env.FUND_VESTING_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.fund_vesting_address,
    development_fund_address: env.DEVELOPMENT_FUND_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.development_fund_address,
    presale_vault_address: env.PRESALE_VAULT_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.presale_vault_address,
    ecosystem_treasury_address: env.ECOSYSTEM_TREASURY_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.ecosystem_treasury_address,
    team_vesting_address: env.TEAM_VESTING_ADDRESS?.trim() || PUBLIC_72H_V2_MAINNET.team_vesting_address,
  };
}
