import type { AdminPaginatedResult, AdminReward, AdminRiskFlag, AdminSquad, AdminWave, AppControlKey } from "@/src/lib/types";
import type { AdminListRequest } from "@/src/lib/api";

export type ListKey = "waves" | "risk" | "rewards" | "squads";

export type AdminLists = {
  waves: AdminWave[];
  risk: AdminRiskFlag[];
  rewards: AdminReward[];
  squads: AdminSquad[];
};

export type AdminListPages = {
  waves: AdminPaginatedResult<AdminWave> | null;
  risk: AdminPaginatedResult<AdminRiskFlag> | null;
  rewards: AdminPaginatedResult<AdminReward> | null;
  squads: AdminPaginatedResult<AdminSquad> | null;
};

export type AdminListQuery = AdminListRequest;

export type ControlDrafts = Record<AppControlKey, string>;

export const emptyLists: AdminLists = {
  waves: [],
  risk: [],
  rewards: [],
  squads: [],
};

export const emptyListPages: AdminListPages = {
  waves: null,
  risk: null,
  rewards: null,
  squads: null,
};

export const emptyControlDrafts: ControlDrafts = {
  pause_deposits: "",
  pause_reward_claims: "",
  pause_referral_rewards: "",
  pause_deposit_streak_rewards: "",
  maintenance_banner: "",
};
