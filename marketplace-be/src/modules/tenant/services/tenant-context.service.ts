import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { UserService } from 'src/modules/user/user.service';

export interface TenantContext {
  marketId: string;
  userId?: string;
}

@Injectable()
export class TenantContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<TenantContext>();
  constructor(private readonly userService: UserService) {}

  /**
   * Esegue una funzione nel context del tenant
   */
  run<T>(context: TenantContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * Ottiene il context corrente del tenant
   */
  getContext(): TenantContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Ottiene il market ID corrente
   */
  async getCurrentMarket(): Promise<string> {
    const userId = this.getCurrentUserId() ?? "";
    const marketId = (await this.userService.getUserByKeycloakId(userId)).assignedMarket;
    if (!marketId) {
      throw new Error('No tenant context found. Market ID is required.');
    }
    return marketId.toString();
  }

  /**
   * Ottiene l'user ID corrente (se disponibile)
   * This return the keycloak user id
   */
  getCurrentUserId(): string | undefined {
    const context = this.getContext();
    return context?.userId;
  }

  /**
   * Verifica se siamo in un context di tenant
   */
  hasContext(): boolean {
    return !!this.getContext();
  }
}