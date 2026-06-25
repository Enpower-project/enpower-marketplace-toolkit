import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';


@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private adminClient: KeycloakAdminClient;
  private adminToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService
  ) {
    // Use master realm for admin authentication, then switch to target realm for operations
    this.adminClient = new KeycloakAdminClient({
      baseUrl: this.configService.get('KEYCLOAK_AUTH_SERVER_URL'),
      realmName: this.configService.get('KEYCLOAK_REALM'), // Admin users are in master realm
    });
  }

  /**
   * Updates the Keycloak user attribute so future tokens include the market claim.
   * Called by the tenant interceptor when the JWT lacks a market claim.
   */
  async enhanceUserTokenWithMarket(userId: string, marketId: string): Promise<void> {
    try {
      this.logger.debug(`Enhancing JWT for user ${userId} with market ${marketId}`);
      await this.ensureAdminAuthentication();
      await this.updateUserMarketAttribute(userId, marketId);

      this.logger.debug(`JWT enhanced successfully for user ${userId}`);

    } catch (error) {
      this.logger.error(`Failed to enhance JWT for user ${userId}: ${error.message}`);
      throw new HttpException(
        'Token enhancement failed', 
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /** Ensures a valid admin token is cached; obtains a new one if expired or missing. */
  async ensureAdminAuthentication(): Promise<void> {
    if (this.adminToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return;
    }

    try {
      const adminUsername = this.configService.get('KEYCLOAK_ADMIN_USERNAME');
      const adminPassword = this.configService.get('KEYCLOAK_ADMIN_PASSWORD');
      const adminClientSecret = this.configService.get('KEYCLOAK_ADMIN_CLIENT_SECRET');
      const adminClientId = this.configService.get('KEYCLOAK_ADMIN_CLIENT_ID') || 'admin-cli';

      // Log configuration details (without sensitive values)
      this.logger.debug('Keycloak Admin Authentication Configuration:', {
        baseUrl: this.configService.get('KEYCLOAK_AUTH_SERVER_URL'),
        realm: this.configService.get('KEYCLOAK_REALM'),
        adminClientId: adminClientId,
        hasAdminUsername: !!adminUsername,
        hasAdminPassword: !!adminPassword,
        hasAdminClientSecret: !!adminClientSecret,
        adminUsernameLength: adminUsername?.length || 0,
        adminClientSecretLength: adminClientSecret?.length || 0
      });

      // Validate that we have the minimum required configuration
      // Either username/password OR client secret is required
      if ((!adminUsername || !adminPassword) && !adminClientSecret) {
        throw new Error('Missing authentication credentials: Either provide KEYCLOAK_ADMIN_USERNAME/PASSWORD or KEYCLOAK_ADMIN_CLIENT_SECRET');
      }

      if (adminClientId === 'admin-cli' && !adminClientSecret) {
        this.logger.warn('admin-cli client configured but no client secret provided. This may fail if admin-cli is confidential.');
      }

      // Prefer client_credentials (Service Account) when available - works with 2FA and is more secure
      if (adminClientSecret) {
        this.logger.debug('Using client_credentials grant for admin authentication (Service Account)');
        this.logger.debug(`Auth config: baseUrl=${this.configService.get('KEYCLOAK_AUTH_SERVER_URL')}, realm=${this.configService.get('KEYCLOAK_REALM')}, clientId=${adminClientId}`);
        try {
          await this.adminClient.auth({
            grantType: 'client_credentials',
            clientSecret: adminClientSecret,
            clientId: adminClientId
          });
          this.logger.debug('Service Account authentication successful');
        } catch (clientCredsError) {
          this.logger.error(`Client credentials auth FAILED with detailed error:`);
          this.logger.error(`Error message: ${clientCredsError.message}`);
          this.logger.error(`Error stack: ${clientCredsError.stack}`);
          this.logger.error(`Error response:`, clientCredsError.response?.data || 'No response data');
          this.logger.error(`Error status: ${clientCredsError.response?.status}`);
          this.logger.warn(`Client credentials auth failed: ${clientCredsError.message}, falling back to password grant`);

          // Fallback to password grant if client_credentials fails
          if (adminUsername && adminPassword) {
            this.logger.debug('Falling back to password grant for admin authentication');

            const authConfig: any = {
              username: adminUsername,
              password: adminPassword,
              grantType: 'password',
              clientId: adminClientId,
            };

            if (adminClientSecret) {
              authConfig.clientSecret = adminClientSecret;
            }

            this.logger.debug(`Auth config: clientId=${authConfig.clientId}, grantType=${authConfig.grantType}, hasSecret=${!!authConfig.clientSecret}`);

            await this.adminClient.auth(authConfig);
          } else {
            throw clientCredsError;
          }
        }
      } else if (adminUsername && adminPassword) {
        // No client secret, use password grant (requires user without 2FA)
        this.logger.debug('Using password grant for admin authentication (no client secret available)');

        const authConfig: any = {
          username: adminUsername,
          password: adminPassword,
          grantType: 'password',
          clientId: adminClientId,
        };

        this.logger.debug(`Auth config: clientId=${authConfig.clientId}, grantType=${authConfig.grantType}`);

        await this.adminClient.auth(authConfig);
      } else {
        throw new Error('No valid authentication method available - missing admin credentials or client secret');
      }

      // Cache for 50 min — tokens typically expire in 1 hour
      this.adminToken = this.adminClient.accessToken || null;
      this.tokenExpiry = new Date(Date.now() + 50 * 60 * 1000);
      
      this.logger.debug('Admin authentication successful');

    } catch (error) {
      this.logger.error('Admin authentication failed:', error.message);
      this.logger.error('Error details:', {
        message: error.message,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          url: error.response.url
        } : 'No response object',
        responseData: error.responseData || 'No response data',
        stack: error.stack
      });

      // Log configuration being used (without sensitive data)
      this.logger.error('Configuration used for authentication:', {
        baseUrl: this.configService.get('KEYCLOAK_AUTH_SERVER_URL'),
        realm: this.configService.get('KEYCLOAK_REALM'),
        adminClientId: this.configService.get('KEYCLOAK_ADMIN_CLIENT_ID'),
        hasAdminUsername: !!this.configService.get('KEYCLOAK_ADMIN_USERNAME'),
        hasAdminPassword: !!this.configService.get('KEYCLOAK_ADMIN_PASSWORD'),
        hasAdminClientSecret: !!this.configService.get('KEYCLOAK_ADMIN_CLIENT_SECRET'),
        hasBackendClientSecret: !!this.configService.get('KEYCLOAK_CLIENT_SECRET')
      });

      throw new HttpException(
        'Keycloak admin authentication failed',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /** Updates the `current_market` attribute on the Keycloak user so it is included in future JWTs. */
  private async updateUserMarketAttribute(keycloakUserId: string, marketId: string): Promise<void> {
    try {
      this.logger.debug(`Starting updateUserMarketAttribute for user ${keycloakUserId} with market ${marketId}`);

      // Get admin client configured for user realm
      const adminClient = await this.getAdminClientForUserRealm();

      this.logger.debug(`Attempting to find user ${keycloakUserId} in realm ${this.configService.get('KEYCLOAK_REALM')}`);

      // Fetch the current user to preserve existing attributes
      const currentUser = await adminClient.users.findOne({
        id: keycloakUserId
      });

      if (!currentUser) {
        throw new Error(`User ${keycloakUserId} not found in Keycloak realm ${this.configService.get('KEYCLOAK_REALM')}`);
      }

      this.logger.debug(`User found: ${currentUser.username}`);
      this.logger.debug(`User email: ${currentUser.email}, firstName: ${currentUser.firstName}, lastName: ${currentUser.lastName}`);
      this.logger.debug(`Current attributes:`, currentUser.attributes);

      // SAFETY CHECK: Verify user has basic profile data before updating
      if (!currentUser.email || !currentUser.firstName || !currentUser.lastName) {
        this.logger.error(`SAFETY CHECK FAILED: User ${keycloakUserId} is missing basic profile data:`, {
          email: currentUser.email,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName
        });
        throw new Error(`Cannot update user attributes: User is missing basic profile data (email, firstName, or lastName). This would cause data loss.`);
      }

      // Preserve existing attributes and add/overwrite current_market
      const updatedAttributes = {
        ...currentUser.attributes,
        current_market: [marketId],
      };

      this.logger.debug(`Updating user attributes with:`, updatedAttributes);

      // ATTEMPT 1: Try using REST API directly instead of SDK
      // This gives us more control and visibility into what's happening
      try {
        const realm = this.configService.get('KEYCLOAK_REALM');
        const baseUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
        const token = adminClient.accessToken;

        this.logger.debug(`Attempting REST API update for user ${keycloakUserId}`);
        this.logger.debug(`Realm: ${realm}, BaseUrl: ${baseUrl}`);
        this.logger.debug(`Token present: ${!!token}`);

        // CRITICAL: Send full user object to prevent Keycloak from deleting other fields
        // Keycloak has a bug where sending ONLY attributes can delete email/firstName/lastName
        const updatePayload = {
          email: currentUser.email,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          emailVerified: currentUser.emailVerified,
          enabled: currentUser.enabled,
          attributes: updatedAttributes
        };

        this.logger.debug(`REST API payload (full user object):`, JSON.stringify(updatePayload, null, 2));

        const updateUrl = `${baseUrl}/admin/realms/${realm}/users/${keycloakUserId}`;

        const response = await firstValueFrom(
          this.httpService.put(updateUrl, updatePayload, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
        );

        this.logger.debug(`REST API update response status: ${response.status}`);
        this.logger.debug(`REST API update response data:`, response.data);

        if (response.status === 204) {
          this.logger.debug(`Update successful (204 No Content). Keycloak accepted the changes.`);
        }

      } catch (restError) {
        this.logger.error(`REST API update failed:`, {
          message: restError.message,
          status: restError.response?.status,
          statusText: restError.response?.statusText,
          data: restError.response?.data
        });
        throw new Error(`REST API update failed: ${restError.message}`);
      }

      // VERIFICATION: Read back the user via REST API (same method as update)
      this.logger.debug(`Verifying attributes were saved - reading user via REST API...`);

      try {
        const realm = this.configService.get('KEYCLOAK_REALM');
        const baseUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
        const token = adminClient.accessToken;
        const getUserUrl = `${baseUrl}/admin/realms/${realm}/users/${keycloakUserId}`;

        // Small delay to account for any eventual consistency
        await new Promise(resolve => setTimeout(resolve, 100));

        const verifyResponse = await firstValueFrom(
          this.httpService.get(getUserUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
        );

        this.logger.debug(`Verified user data via REST API:`, JSON.stringify(verifyResponse.data, null, 2));
        const verifiedAttributes = verifyResponse.data?.attributes;
        this.logger.debug(`Verified attributes:`, verifiedAttributes);

        if (!verifiedAttributes?.current_market) {
          this.logger.warn(`WARNING: Attributes were NOT saved in Keycloak. User attributes after update:`, verifiedAttributes);
          this.logger.warn(`This is likely due to Service Account permissions. The system will continue without JWT attribute.`);
          this.logger.warn(`User can still access the system, market context will be resolved from database.`);
          // Don't throw error - allow the system to continue
        } else {
          this.logger.debug(`SUCCESS: User attributes verified for ${keycloakUserId} with market ${marketId}`);
        }
      } catch (verifyError) {
        this.logger.warn(`Verification check failed (non-critical):`, verifyError.message);
        // Don't throw error - verification failure is not critical, the PUT was accepted (204)
      }

    } catch (error) {
      this.logger.error(`Failed to update user attributes: ${error.message}`);
      this.logger.error(`Error details:`, {
        status: error.status,
        statusText: error.statusText,
        response: error.response?.data,
        config: error.config ? {
          method: error.config.method,
          url: error.config.url,
          headers: error.config.headers
        } : 'No config'
      });
      throw error;
    }
  }

  /**
   * Checks whether a user has access to a specific market by inspecting
   * the `accessible_markets` attribute in Keycloak.
   * Returns `false` on any error (fail-safe behaviour).
   */
  async validateUserMarketAccess(keycloakUserId: string, marketId: string): Promise<boolean> {
    try {
      const adminClient = await this.getAdminClientForUserRealm();

      const user = await adminClient.users.findOne({ id: keycloakUserId });
      if (!user) return false;

      const userMarkets = user.attributes?.accessible_markets || [];
      const hasAccess = userMarkets.includes(marketId);

      this.logger.debug(`Market access validation for user ${keycloakUserId} to market ${marketId}: ${hasAccess}`);
      return hasAccess;

    } catch (error) {
      this.logger.error(`Market access validation failed: ${error.message}`);
      return false; // Fail-safe: nega accesso in caso di errore
    }
  }

  /**
   * Helper method to ensure admin client is configured for user realm operations
   */
  private async getAdminClientForUserRealm(): Promise<KeycloakAdminClient> {
    const targetRealm = this.configService.get('KEYCLOAK_REALM') || 'energy-realm';
    this.logger.debug(`Creating dedicated admin client for user realm: ${targetRealm}`);

    // Create a separate admin client instance for user operations
    const userRealmAdminClient = new KeycloakAdminClient({
      baseUrl: this.configService.get('KEYCLOAK_AUTH_SERVER_URL'),
      realmName: targetRealm, // Start directly in the target realm
    });

    // Authenticate this specific client
    const adminUsername = this.configService.get('KEYCLOAK_ADMIN_USERNAME');
    const adminPassword = this.configService.get('KEYCLOAK_ADMIN_PASSWORD');
    const adminClientSecret = this.configService.get('KEYCLOAK_ADMIN_CLIENT_SECRET');
    const adminClientId = this.configService.get('KEYCLOAK_ADMIN_CLIENT_ID') || 'admin-cli';

    this.logger.debug(`Authenticating dedicated client for realm: ${targetRealm}`);

    try {
      // Try different authentication approaches
      const authMethods: Array<{ name: string; config: any }> = [];

      // Method 1: Password grant with admin credentials
      if (adminUsername && adminPassword) {
        authMethods.push({
          name: 'password',
          config: {
            username: adminUsername,
            password: adminPassword,
            grantType: 'password',
            clientId: adminClientId,
            ...(adminClientSecret && { clientSecret: adminClientSecret })
          }
        });
      }

      // Method 2: Client credentials grant (if available)
      if (adminClientSecret) {
        authMethods.push({
          name: 'client_credentials',
          config: {
            grantType: 'client_credentials',
            clientId: adminClientId,
            clientSecret: adminClientSecret
          }
        });
      }

      for (const method of authMethods) {
        try {
          this.logger.debug(`Trying ${method.name} authentication for realm: ${targetRealm}`);
          await userRealmAdminClient.auth(method.config);

          this.logger.debug(`Successfully authenticated with ${method.name} for realm: ${targetRealm}`);
          this.logger.debug(`Dedicated client token present: ${!!userRealmAdminClient.accessToken}`);

          return userRealmAdminClient;

        } catch (authError) {
          this.logger.warn(`${method.name} authentication failed for realm ${targetRealm}:`, authError.message);
          continue;
        }
      }

      throw new Error('All authentication methods failed');

    } catch (error) {
      this.logger.error(`Failed to authenticate dedicated client for realm ${targetRealm}:`, error.message);

      // Fallback to the original approach
      this.logger.debug('Falling back to original admin client approach');
      await this.ensureAdminAuthentication();

      this.adminClient.setConfig({
        realmName: targetRealm,
      });

      return this.adminClient;
    }
  }

  /** Returns an admin client authenticated against the user realm, suitable for user-level operations. */
  async getAdminClientForUserOperations(): Promise<KeycloakAdminClient> {
    return this.getAdminClientForUserRealm();
  }

  /** Returns the shared admin client after ensuring a valid authentication token is cached. */
  async getAdminClient(): Promise<KeycloakAdminClient> {
    await this.ensureAdminAuthentication();
    return this.adminClient;
  }
  /** Returns the list of market IDs stored in the user's `accessible_markets` Keycloak attribute, or an empty array on failure. */
  async getUserAccessibleMarkets(keycloakUserId: string): Promise<string[]> {
    try {
      const adminClient = await this.getAdminClientForUserRealm();

      const user = await adminClient.users.findOne({ id: keycloakUserId });
      if (!user) return [];

      const accessibleMarkets = user.attributes?.accessible_markets || [];

      this.logger.debug(`Accessible markets for user ${keycloakUserId}: ${accessibleMarkets}`);
      return accessibleMarkets;

    } catch (error) {
      this.logger.error(`Failed to get user markets: ${error.message}`);
      return [];
    }
  }

  /** Fetches all Keycloak custom attributes for the specified user, or null if the user does not exist. */
  async getUserAttributes(keycloakUserId: string): Promise<any> {
    try {
      const adminClient = await this.getAdminClientForUserRealm();

      const user = await adminClient.users.findOne({ id: keycloakUserId });
      if (!user) {
        this.logger.warn(`User ${keycloakUserId} not found in Keycloak`);
        return null;
      }

      this.logger.debug(`Retrieved attributes for user ${keycloakUserId}:`, user.attributes);
      return user.attributes;

    } catch (error) {
      this.logger.error(`Failed to get user attributes for ${keycloakUserId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a Keycloak user account by Keycloak user ID
   */
  async deleteUserAccount(keycloakUserId: string): Promise<void> {
    try {
      const adminClient = await this.getAdminClientForUserRealm();
      await adminClient.users.del({ id: keycloakUserId });
      this.logger.debug(`Deleted Keycloak user ${keycloakUserId}`);
    } catch (error) {
      this.logger.error(`Failed to delete Keycloak user ${keycloakUserId}: ${error.message}`);
      throw error;
    }
  }
}
