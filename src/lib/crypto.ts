import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from './config';

// AES-256-GCM for stored API credentials (IntegrationSetting.encryptedValue).
function key(): Buffer { return createHash('sha256').update(config.appSecret).digest(); }

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), enc.toString('base64'), cipher.getAuthTag().toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, enc, tag] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
