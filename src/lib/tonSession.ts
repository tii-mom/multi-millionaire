export const TON_WALLET_SESSION_KEY = "ton_wallet_session";
export const BACKEND_AUTH_TOKEN_KEY = "auth_token";

export interface TonWalletSession {
  address: string;
  rawAddress: string;
  walletName: string;
  walletAppName: string;
  provider: string;
  connectedAt: string;
}

export function readTonWalletSession(): TonWalletSession | null {
  const raw = window.localStorage.getItem(TON_WALLET_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<TonWalletSession>;
    if (!parsed.address) return null;

    return {
      address: parsed.address,
      rawAddress: parsed.rawAddress || parsed.address,
      walletName: parsed.walletName || "TON Wallet",
      walletAppName: parsed.walletAppName || "ton-wallet",
      provider: parsed.provider || "tonconnect",
      connectedAt: parsed.connectedAt || new Date().toISOString(),
    };
  } catch {
    window.localStorage.removeItem(TON_WALLET_SESSION_KEY);
    return null;
  }
}

export function writeTonWalletSession(session: TonWalletSession) {
  window.localStorage.setItem(TON_WALLET_SESSION_KEY, JSON.stringify(session));
}

export function clearTonWalletSession() {
  window.localStorage.removeItem(TON_WALLET_SESSION_KEY);
}

export function readBackendAuthToken() {
  return window.localStorage.getItem(BACKEND_AUTH_TOKEN_KEY);
}

export function writeBackendAuthToken(token: string) {
  window.localStorage.setItem(BACKEND_AUTH_TOKEN_KEY, token);
}

export function clearBackendAuthToken() {
  window.localStorage.removeItem(BACKEND_AUTH_TOKEN_KEY);
}

export function shortWalletAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
