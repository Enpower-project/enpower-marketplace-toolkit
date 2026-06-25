import { UserRole } from "../../../core/enums/user-role.enum";

export interface MarketUser {
    id: string,
    lastName: string,
    username: string,
    firstName: string,
    status: UserStatus,
    role: UserRole,
    email: string
}

enum UserStatus {
    PENDING_WALLET_CREATION = 'PENDING_WALLET_CREATION',
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    BLOCKED = 'BLOCKED'
}
