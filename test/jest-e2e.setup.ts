// The isolated e2e modules mock ApiKeyService and never initialise Better Auth.
// Mock its service before module loading so Jest does not try to execute
// better-auth's ESM distribution through the CommonJS test runtime.
jest.mock('../src/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('../src/auth/supabase-auth.service', () => ({
  SupabaseAuthService: class SupabaseAuthService {},
}));
