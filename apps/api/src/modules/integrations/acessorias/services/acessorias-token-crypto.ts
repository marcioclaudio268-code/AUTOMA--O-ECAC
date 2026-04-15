import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';

const TOKEN_CRYPTO_VERSION = 'v1';
const TOKEN_CRYPTO_CONTEXT = 'ecac-acessorias-token';
const TOKEN_IV_LENGTH = 12;
const TOKEN_AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return createHash('sha256')
    .update(`${TOKEN_CRYPTO_CONTEXT}:${secret}`, 'utf8')
    .digest();
}

export function encryptAcessoriasToken(
  token: string,
  secret: string
): string {
  const iv = randomBytes(TOKEN_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv, {
    authTagLength: TOKEN_AUTH_TAG_LENGTH
  });

  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return [
    TOKEN_CRYPTO_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64')
  ].join(':');
}

export function decryptAcessoriasToken(
  payload: string,
  secret: string
): string {
  const [version, ivBase64, authTagBase64, ciphertextBase64] =
    payload.split(':');

  if (
    version !== TOKEN_CRYPTO_VERSION ||
    !ivBase64 ||
    !authTagBase64 ||
    !ciphertextBase64
  ) {
    throw new Error('Token Acessorias criptografado invalido.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(ivBase64, 'base64'),
    {
      authTagLength: TOKEN_AUTH_TAG_LENGTH
    }
  );

  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, 'base64')),
    decipher.final()
  ]);

  return plaintext.toString('utf8');
}
