import {
  csvField,
  dedupeByKey,
  formatIngestError,
  normalizeCsvHeader,
  parseOptionalFloat,
  parseOptionalInt,
  stripUtf8Bom,
} from './gtfs-ingest.util';

describe('gtfs-ingest.util', () => {
  describe('dedupeByKey', () => {
    it('keeps the last row for duplicate keys and drops empty keys', () => {
      const rows = [
        { id: 'a', v: 1 },
        { id: '', v: 0 },
        { id: 'a', v: 2 },
        { id: 'b', v: 3 },
      ];
      expect(dedupeByKey(rows, (r) => r.id)).toEqual([
        { id: 'a', v: 2 },
        { id: 'b', v: 3 },
      ]);
    });
  });

  describe('formatIngestError', () => {
    it('surfaces the deepest Postgres cause message', () => {
      const root = new Error('ON CONFLICT DO UPDATE command cannot affect row a second time');
      const mid = new Error('Failed query: insert into gtfs_stops');
      (mid as Error & { cause: Error }).cause = root;
      const outer = new Error('Failed query: insert into "gtfs_stops"');
      (outer as Error & { cause: Error }).cause = mid;

      expect(formatIngestError(outer)).toContain('cannot affect row a second time');
    });
  });

  describe('parsers', () => {
    it('rejects non-finite numbers', () => {
      expect(parseOptionalFloat('')).toBeNull();
      expect(parseOptionalFloat('abc')).toBeNull();
      expect(parseOptionalFloat('-33.8')).toBeCloseTo(-33.8);
      expect(parseOptionalInt('x')).toBeNull();
      expect(parseOptionalInt('12')).toBe(12);
    });
  });

  describe('BOM / CSV headers', () => {
    it('strips UTF-8 BOM from buffers and headers', () => {
      const withBom = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('stop_id')]);
      expect(stripUtf8Bom(withBom).toString()).toBe('stop_id');
      expect(normalizeCsvHeader('\ufeffstop_id')).toBe('stop_id');
    });

    it('reads fields even when the header still has a BOM prefix', () => {
      const record = { '\ufeffstop_id': '200030', stop_name: 'Martin Place' };
      expect(csvField(record, 'stop_id')).toBe('200030');
      expect(csvField(record, 'stop_name')).toBe('Martin Place');
    });
  });
});
