const DISCORD_TOKEN_ENCRYPTION_ALGORITHM = "AES-GCM";
const DISCORD_TOKEN_IV_LENGTH = 12;
const DISCORD_TOKEN_KEY_LENGTH = 32;
const DISCORD_TOKEN_KEY_VERSION = 1;
const DISCORD_TOKEN_AAD = new TextEncoder().encode(
  "warframe-market-tracker:discord-bot-token:v1",
);

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function parseAppSecretsMasterKey(value: string): Uint8Array {
  try {
    const decoded = fromBase64(value);

    if (decoded.byteLength !== DISCORD_TOKEN_KEY_LENGTH) {
      throw new Error("invalid-length");
    }

    return decoded;
  } catch {
    throw new Error(
      "APP_SECRETS_MASTER_KEY must be a base64-encoded 32-byte key",
    );
  }
}

async function importDiscordTokenKey(masterKey: Uint8Array) {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(masterKey),
    {
      length: DISCORD_TOKEN_KEY_LENGTH * 8,
      name: DISCORD_TOKEN_ENCRYPTION_ALGORITHM,
    },
    false,
    ["decrypt", "encrypt"],
  );
}

export async function encryptDiscordBotToken(input: {
  masterKey: Uint8Array;
  token: string;
}): Promise<{
  ciphertext: string;
  iv: string;
  keyVersion: number;
}> {
  const iv = crypto.getRandomValues(new Uint8Array(DISCORD_TOKEN_IV_LENGTH));
  const key = await importDiscordTokenKey(input.masterKey);
  const plaintext = new TextEncoder().encode(input.token);
  const encrypted = await crypto.subtle.encrypt(
    {
      additionalData: DISCORD_TOKEN_AAD,
      iv: toArrayBuffer(iv),
      name: DISCORD_TOKEN_ENCRYPTION_ALGORITHM,
    },
    key,
    toArrayBuffer(plaintext),
  );

  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    keyVersion: DISCORD_TOKEN_KEY_VERSION,
  };
}

export async function decryptDiscordBotToken(input: {
  ciphertext: string;
  iv: string;
  keyVersion: number;
  masterKey: Uint8Array;
}): Promise<string> {
  if (input.keyVersion !== DISCORD_TOKEN_KEY_VERSION) {
    throw new Error(
      `Unsupported Discord token key version: ${String(input.keyVersion)}`,
    );
  }

  try {
    const key = await importDiscordTokenKey(input.masterKey);
    const decrypted = await crypto.subtle.decrypt(
      {
        additionalData: DISCORD_TOKEN_AAD,
        iv: toArrayBuffer(fromBase64(input.iv)),
        name: DISCORD_TOKEN_ENCRYPTION_ALGORITHM,
      },
      key,
      toArrayBuffer(fromBase64(input.ciphertext)),
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Failed to decrypt Discord bot token");
  }
}
