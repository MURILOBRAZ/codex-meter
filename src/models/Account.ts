// Wire types mirror `codex app-server generate-ts` (v2 protocol).

export type PlanType = string;

export type RawAccount =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string | null; planType: PlanType }
  | { type: 'amazonBedrock'; usesCodexManagedCredentials: boolean };

export interface GetAccountResponse {
  account: RawAccount | null;
  requiresOpenaiAuth: boolean;
}

export interface InitializeResponse {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

/** What the view needs to know about the signed-in account. */
export interface AccountInfo {
  kind: 'chatgpt' | 'apiKey' | 'amazonBedrock' | 'none';
  email: string | null;
  planType: PlanType | null;
  requiresAuth: boolean;
}
