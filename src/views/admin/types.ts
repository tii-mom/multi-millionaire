import type { AdminReward, AdminRiskFlag, AdminSquad, AdminWave, AppControlKey } from "@/src/lib/types";

export type ListKey = "waves" | "risk" | "rewards" | "squads";

export type AdminLists = {
  waves: AdminWave[];
  risk: AdminRiskFlag[];
  rewards: AdminReward[];
  squads: AdminSquad[];
};

export type ControlDrafts = Record<AppControlKey, string>;

export const emptyLists: AdminLists = {
  waves: [],
  risk: [],
  rewards: [],
  squads: [],
};

export const emptyControlDrafts: ControlDrafts = {
  pause_deposits: "",
  pause_reward_claims: "",
  pause_referral_rewards: "",
  maintenance_banner: "",
};
