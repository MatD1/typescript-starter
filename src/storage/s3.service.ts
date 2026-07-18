import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export interface GtfsZipObjectMeta {
  key: string;
  lastModified?: string;
  contentLength?: number;
  exists: boolean;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('s3.bucket') ?? '';
    const endpoint = this.configService.get<string>('s3.endpoint');
    const region = this.configService.get<string>('s3.region') ?? 'auto';
    const accessKeyId = this.configService.get<string>('s3.accessKeyId') ?? '';
    const secretAccessKey =
      this.configService.get<string>('s3.secretAccessKey') ?? '';

    this.enabled = Boolean(
      this.bucket && endpoint && accessKeyId && secretAccessKey,
    );

    if (!this.enabled) {
      this.logger.warn(
        'S3 not fully configured; GTFS ZIP persistence will use in-memory fallback only',
      );
      this.client = null;
      return;
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    this.logger.log(`S3 client configured for bucket ${this.bucket}`);
  }

  isEnabled(): boolean {
    return this.enabled && this.client != null;
  }

  latestKey(feedKey: string): string {
    return `gtfs/schedule/${feedKey}/latest.zip`;
  }

  datedKey(feedKey: string, day: string): string {
    return `gtfs/schedule/${feedKey}/${day}.zip`;
  }

  async headLatest(feedKey: string): Promise<GtfsZipObjectMeta> {
    const key = this.latestKey(feedKey);
    if (!this.client) {
      return { key, exists: false };
    }
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        exists: true,
        lastModified: res.Metadata?.['tfnsw-last-modified'],
        contentLength: res.ContentLength,
      };
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        return { key, exists: false };
      }
      // NotFound name used by some S3-compatible APIs
      if ((err as { name?: string }).name === 'NotFound') {
        return { key, exists: false };
      }
      throw err;
    }
  }

  async putGtfsZip(
    feedKey: string,
    body: Buffer,
    meta: { lastModified?: string; day: string },
  ): Promise<{ latestKey: string; datedKey: string }> {
    const latest = this.latestKey(feedKey);
    const dated = this.datedKey(feedKey, meta.day);
    if (!this.client) {
      this.logger.warn(`S3 disabled; skipped put for ${feedKey}`);
      return { latestKey: latest, datedKey: dated };
    }

    const metadata: Record<string, string> = {};
    if (meta.lastModified) {
      metadata['tfnsw-last-modified'] = meta.lastModified;
    }

    const put = async (Key: string) =>
      this.client!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key,
          Body: body,
          ContentType: 'application/zip',
          Metadata: metadata,
        }),
      );

    await put(dated);
    await put(latest);
    this.logger.debug(
      `Stored GTFS ZIP ${feedKey} (${body.length} bytes) → ${latest}`,
    );
    return { latestKey: latest, datedKey: dated };
  }

  async getBuffer(key: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('S3 is not configured');
    }
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return this.streamToBuffer(res.Body as Readable);
  }

  async getLatestBuffer(feedKey: string): Promise<Buffer> {
    return this.getBuffer(this.latestKey(feedKey));
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
