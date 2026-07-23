import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'stream';

@Injectable()
export class AuditObjectStorage {
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('audit.archive.bucket') ?? '';
    const endpoint = config.get<string>('audit.archive.endpoint');
    const region = config.get<string>('audit.archive.region') ?? 'auto';
    const accessKeyId =
      config.get<string>('audit.archive.accessKeyId') ?? '';
    const secretAccessKey =
      config.get<string>('audit.archive.secretAccessKey') ?? '';

    this.client =
      this.bucket && endpoint && accessKeyId && secretAccessKey
        ? new S3Client({
            endpoint,
            region,
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true,
          })
        : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async readiness(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  async putImmutable(
    key: string,
    body: Buffer,
    contentType: string,
    retainUntil: Date,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentEncoding: key.endsWith('.gz') ? 'gzip' : undefined,
        ServerSideEncryption: 'AES256',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil,
        Metadata: metadata,
      }),
    );
  }

  async putTemporary(
    key: string,
    body: Buffer,
    contentType: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: metadata,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const client = this.requireClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async isLocked(key: string): Promise<boolean> {
    const client = this.requireClient();
    const response = await client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return (
      response.ObjectLockMode === 'COMPLIANCE' &&
      Boolean(
        response.ObjectLockRetainUntilDate &&
          response.ObjectLockRetainUntilDate > new Date(),
      )
    );
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Immutable audit object storage is not configured',
      );
    }
    return this.client;
  }
}
