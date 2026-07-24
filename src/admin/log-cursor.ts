import { BadRequestException } from '@nestjs/common';

export interface RequestLogCursor {
  createdAt: Date;
  id: string;
}

export function encodeRequestLogCursor(cursor: RequestLogCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.createdAt.toISOString(), cursor.id]),
  ).toString('base64url');
}

export function decodeRequestLogCursor(value: string): RequestLogCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== 'string' ||
      typeof decoded[1] !== 'string' ||
      decoded[1].length === 0
    ) {
      throw new Error('Invalid cursor shape');
    }
    const createdAt = new Date(decoded[0]);
    if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid date');
    return { createdAt, id: decoded[1] };
  } catch {
    throw new BadRequestException('Invalid request log cursor');
  }
}
