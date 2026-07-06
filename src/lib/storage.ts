import { promises as fs } from 'fs';
import path from 'path';
import { config } from './config';

export interface StorageDriver {
  put(relPath: string, content: string | Buffer): Promise<{ path: string; sizeBytes: number }>;
  read(relPath: string): Promise<Buffer>;
}

class LocalStorage implements StorageDriver {
  private root = path.resolve(config.storageDir);
  private resolveSafe(relPath: string): string {
    const abs = path.resolve(this.root, relPath);
    if (!abs.startsWith(this.root + path.sep) && abs !== this.root) throw new Error('Path escapes storage root');
    return abs;
  }
  async put(relPath: string, content: string | Buffer) {
    const abs = this.resolveSafe(relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
    const stat = await fs.stat(abs);
    return { path: relPath, sizeBytes: stat.size };
  }
  async read(relPath: string) { return fs.readFile(this.resolveSafe(relPath)); }
}

// S3-compatible driver stub. Implement with @aws-sdk/client-s3 when moving beyond local MVP.
class S3StorageStub implements StorageDriver {
  async put(): Promise<never> { throw new Error('S3 driver not configured. Set STORAGE_DRIVER=local or implement S3StorageStub.'); }
  async read(): Promise<never> { throw new Error('S3 driver not configured.'); }
}

export const storage: StorageDriver = config.storageDriver === 's3' ? new S3StorageStub() : new LocalStorage();
