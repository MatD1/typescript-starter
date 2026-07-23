import {
  AUDIT_ACTIONS,
  HIGH_RISK_REASON_ACTIONS,
} from './audit.types';

describe('audit action catalog', () => {
  it('contains unique, namespaced action names', () => {
    const actions = Object.values(AUDIT_ACTIONS);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions.every((action) => /^[a-z][a-z0-9_.]+$/.test(action))).toBe(
      true,
    );
  });

  it('requires reasons for every destructive manual operation', () => {
    expect(HIGH_RISK_REASON_ACTIONS).toEqual(
      expect.objectContaining({
        has: expect.any(Function),
      }),
    );
    expect(
      HIGH_RISK_REASON_ACTIONS.has(AUDIT_ACTIONS.ADMIN_USER_DELETED),
    ).toBe(true);
    expect(
      HIGH_RISK_REASON_ACTIONS.has(AUDIT_ACTIONS.ADMIN_IMPERSONATION_STARTED),
    ).toBe(true);
    expect(
      HIGH_RISK_REASON_ACTIONS.has(AUDIT_ACTIONS.CACHE_FLUSH_ATTEMPTED),
    ).toBe(true);
    expect(
      HIGH_RISK_REASON_ACTIONS.has(AUDIT_ACTIONS.HISTORY_PURGE_ATTEMPTED),
    ).toBe(true);
  });
});
