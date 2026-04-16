import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Session / Token Responses ────────────────────────────────────────────────

export class SessionTokenResponseSwagger {
    @ApiProperty({ description: 'Session token – use as Bearer token in Authorization header for authenticated API calls' })
    sessionToken!: string;

    @ApiProperty({ description: 'Refresh token – use with POST /auth/refresh to obtain new tokens before expiry' })
    refreshToken!: string;

    @ApiProperty({ description: 'ISO 8601 session expiry timestamp' })
    expiresAt!: string;

    @ApiProperty({ description: 'User ID' })
    userId!: string;

    @ApiProperty({ description: 'User email' })
    email!: string;

    @ApiProperty({ description: 'User role: admin | user' })
    role!: string;
}

// ─── API Key Responses ────────────────────────────────────────────────────────

export class ApiKeyResponseSwagger {
    @ApiProperty({ description: 'Unique key ID' })
    id!: string;

    @ApiPropertyOptional({ description: 'Human-readable key name' })
    name?: string;

    @ApiProperty({ description: 'First 8 characters of the key for display' })
    start!: string;

    @ApiProperty({
        description:
            'The full API key — only returned once on creation. Store it securely; it is not retrievable again.',
    })
    key!: string;

    @ApiPropertyOptional({ description: 'Expiration timestamp (null = never expires)' })
    expiresAt?: Date;

    @ApiProperty({ description: 'Whether the key is currently enabled' })
    enabled!: boolean;

    @ApiProperty({ description: 'Permission level: user | admin | app-authorised' })
    permissions!: string;

    @ApiProperty({ description: 'Creation timestamp' })
    createdAt!: Date;
}

export class ApiKeyListItemSwagger {
    @ApiProperty({ description: 'Unique key ID' })
    id!: string;

    @ApiPropertyOptional({ description: 'Human-readable key name' })
    name?: string;

    @ApiProperty({ description: 'First 8 characters for display' })
    start!: string;

    @ApiProperty({ description: 'Whether the key is currently enabled' })
    enabled!: boolean;

    @ApiPropertyOptional({ description: 'Expiration timestamp (null = never expires)' })
    expiresAt?: Date;

    @ApiProperty({ description: 'Permission level: user | admin | app-authorised' })
    permissions!: string;

    @ApiProperty({ description: 'Total request count using this key' })
    requestCount!: number;

    @ApiProperty({ description: 'Creation timestamp' })
    createdAt!: Date;
}

export class RevokeSuccessSwagger {
    @ApiProperty({ example: true })
    success!: boolean;
}
