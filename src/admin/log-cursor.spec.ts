import { BadRequestException } from '@nestjs/common';
import {
  decodeRequestLogCursor,
  encodeRequestLogCursor,
} from './log-cursor';

describe('request log cursor', () => {
  it('round-trips a timestamp and stable tie-breaker', () => {
    const cursor = {
      createdAt: new Date('2026-07-24T01:02:03.456Z'),
      id: 'entry-123',
    };
    expect(decodeRequestLogCursor(encodeRequestLogCursor(cursor))).toEqual(
      cursor,
    );
  });

  it('rejects malformed and legacy raw-ID cursors', () => {
    expect(() => decodeRequestLogCursor('old-random-id')).toThrow(
      BadRequestException,
    );
  });
});
