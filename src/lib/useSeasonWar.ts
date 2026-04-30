import { useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import { readTonWalletSession } from "@/src/lib/tonSession";
import type {
  SeasonWarClaimPreview,
  SeasonWarCurrent,
  SeasonWarExportManifest,
  SeasonWarMe,
  SeasonWarRadar,
  SeasonWarSquads,
} from "@/src/lib/types";

export type SeasonWarReadModel = {
  current: SeasonWarCurrent | null;
  radar: SeasonWarRadar | null;
  squads: SeasonWarSquads | null;
  me: SeasonWarMe | null;
  claimPreview: SeasonWarClaimPreview | null;
  exportManifest: SeasonWarExportManifest | null;
  wallet: string | null;
  partialErrors: Partial<Record<"radar" | "squads" | "me" | "claimPreview" | "exportManifest", string>>;
};

export type SeasonWarStatus = "loading" | "ready" | "error";

export function useSeasonWarReadModel() {
  const [data, setData] = useState<SeasonWarReadModel>({
    current: null,
    radar: null,
    squads: null,
    me: null,
    claimPreview: null,
    exportManifest: null,
    wallet: null,
    partialErrors: {},
  });
  const [status, setStatus] = useState<SeasonWarStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const current = await api.seasonWarCurrent();
      const wallet = readTonWalletSession()?.address || null;
      const entries = await Promise.allSettled([
        api.seasonWarRadar(current.seasonId),
        api.seasonWarSquads(current.seasonId),
        wallet ? api.seasonWarMe(wallet) : Promise.resolve(null),
        wallet ? api.seasonWarClaimPreview(current.seasonId, wallet) : Promise.resolve(null),
        api.seasonWarExportManifest(current.seasonId),
      ] as const);
      const keys = ["radar", "squads", "me", "claimPreview", "exportManifest"] as const;
      const partialErrors: SeasonWarReadModel["partialErrors"] = {};
      const value = <T,>(index: number): T | null => {
        const entry = entries[index];
        if (entry.status === "fulfilled") return entry.value as T;
        partialErrors[keys[index]] = entry.reason instanceof Error ? entry.reason.message : "API unavailable";
        return null;
      };
      setData({
        current,
        radar: value<SeasonWarRadar>(0),
        squads: value<SeasonWarSquads>(1),
        me: value<SeasonWarMe>(2),
        claimPreview: value<SeasonWarClaimPreview>(3),
        exportManifest: value<SeasonWarExportManifest>(4),
        wallet,
        partialErrors,
      });
      setStatus("ready");
    } catch (err) {
      setData({ current: null, radar: null, squads: null, me: null, claimPreview: null, exportManifest: null, wallet: null, partialErrors: {} });
      setError(err instanceof Error ? err.message : "Unable to load Season War data");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, error, refresh, status };
}
