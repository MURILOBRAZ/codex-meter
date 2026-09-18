import { AccountInfo, GetAccountResponse } from '../models/Account';
import { AppServerClient } from './AppServerClient';

export class AccountService {
  constructor(private readonly client: AppServerClient) {}

  async read(): Promise<AccountInfo> {
    const res = await this.client.request<GetAccountResponse>('account/read', {
      refreshToken: false,
    });
    const account = res.account;
    if (!account) {
      return { kind: 'none', email: null, planType: null, requiresAuth: res.requiresOpenaiAuth };
    }
    if (account.type === 'chatgpt') {
      return {
        kind: 'chatgpt',
        email: account.email,
        planType: account.planType,
        requiresAuth: res.requiresOpenaiAuth,
      };
    }
    return { kind: account.type, email: null, planType: null, requiresAuth: res.requiresOpenaiAuth };
  }
}
