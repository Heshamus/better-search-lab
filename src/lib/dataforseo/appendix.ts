import { assertTasksOk, type DataForSeoClient } from "./client";

export const USER_DATA_ENDPOINT = "/v3/appendix/user_data";

export interface UserData {
  login: string | null;
  /** Prepaid balance in USD, as reported by DataForSEO. */
  balance: number | null;
  /** Lifetime spend in USD. */
  totalSpent: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Account balance + login — Test-connection and the Usage page's balance line. Free call. */
export async function userData(client: DataForSeoClient): Promise<UserData> {
  const resp = await client.get<any>(USER_DATA_ENDPOINT);
  assertTasksOk(resp);
  const r = resp?.tasks?.[0]?.result?.[0] ?? {};
  return {
    login: typeof r.login === "string" ? r.login : null,
    balance: num(r.money?.balance),
    totalSpent: num(r.money?.total),
  };
}
