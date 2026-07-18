import { lineFor, resolveLine, FAMILY_TO_LINE } from './line-identity.util';

describe('lineFor', () => {
  it('maps Sydney Trains route families to badges', () => {
    expect(lineFor('NSN_1a')).toBe('T1');
    expect(lineFor('CCN_2')).toBe('CCN');
    expect(lineFor('SMNW_M')).toBe('M1');
    expect(lineFor('APS_1')).toBe('T8');
  });

  it('falls back to tripId segments when routeId is missing', () => {
    expect(lineFor(undefined, 'CCN.1234.1')).toBe('CCN');
  });

  it('returns OTHER for unrecognised ids', () => {
    expect(lineFor('ZZZZZZZZ')).toBe('OTHER');
    expect(lineFor()).toBe('OTHER');
  });

  it('returns short raw family when not in map but plausible', () => {
    expect(lineFor('BUS42')).toBe('BUS42');
  });
});

describe('resolveLine', () => {
  it('prefers GTFS lineCode when route metadata is present', () => {
    const meta = new Map([
      ['24549_87001', { lineCode: '370', routeName: 'Coogee to Railway Square' }],
    ]);
    expect(resolveLine('24549_87001', null, meta)).toBe('370');
  });

  it('falls back to lineFor when metadata missing or empty code', () => {
    expect(resolveLine('CCN_1', null, new Map())).toBe('CCN');
    const empty = new Map([['X', { lineCode: '  ' }]]);
    expect(resolveLine('X', 'NSN_1', empty)).toBe('T1');
  });
});

describe('FAMILY_TO_LINE', () => {
  it('exports the shared family map', () => {
    expect(FAMILY_TO_LINE.NSN).toBe('T1');
    expect(FAMILY_TO_LINE.MTRO).toBe('M1');
  });
});
