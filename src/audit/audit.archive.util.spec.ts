import {
  canonicalJson,
  sha256,
  signCanonical,
  verifyCanonicalSignature,
} from './audit.archive.util';

describe('audit archive integrity utilities', () => {
  it('serializes objects deterministically regardless of insertion order', () => {
    expect(
      canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: new Date(0) }),
    ).toBe(
      canonicalJson({ a: new Date(0), nested: { a: 1, b: 2 }, z: 1 }),
    );
  });

  it('detects modified manifests and the wrong signing key', () => {
    const manifest = {
      archiveId: 'a1',
      rowCount: 10,
      checksum: sha256(Buffer.from('data')),
    };
    const signature = signCanonical(manifest, 'signing-secret');
    expect(
      verifyCanonicalSignature(manifest, signature, 'signing-secret'),
    ).toBe(true);
    expect(
      verifyCanonicalSignature(
        { ...manifest, rowCount: 11 },
        signature,
        'signing-secret',
      ),
    ).toBe(false);
    expect(verifyCanonicalSignature(manifest, signature, 'wrong-key')).toBe(
      false,
    );
  });
});
