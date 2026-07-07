import { describe, expect, it } from "bun:test";

import {
  decryptDiscordBotToken,
  encryptDiscordBotToken,
  parseAppSecretsMasterKey,
} from "../src/discord-token-crypto";

const validMasterKey = Buffer.alloc(32, 7).toString("base64");

describe("parseAppSecretsMasterKey", () => {
  it("rejects keys that do not decode to 32 bytes", () => {
    expect(() => parseAppSecretsMasterKey("not-base64")).toThrow(
      "APP_SECRETS_MASTER_KEY must be a base64-encoded 32-byte key",
    );
  });
});

describe("encryptDiscordBotToken", () => {
  it("round-trips a token through AES-GCM encryption", async () => {
    const encrypted = await encryptDiscordBotToken({
      masterKey: parseAppSecretsMasterKey(validMasterKey),
      token: "discord-bot-token",
    });

    await expect(
      decryptDiscordBotToken({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        keyVersion: encrypted.keyVersion,
        masterKey: parseAppSecretsMasterKey(validMasterKey),
      }),
    ).resolves.toBe("discord-bot-token");
  });

  it("fails to decrypt when a different master key is used", async () => {
    const encrypted = await encryptDiscordBotToken({
      masterKey: parseAppSecretsMasterKey(validMasterKey),
      token: "discord-bot-token",
    });

    await expect(
      decryptDiscordBotToken({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        keyVersion: encrypted.keyVersion,
        masterKey: parseAppSecretsMasterKey(
          Buffer.alloc(32, 8).toString("base64"),
        ),
      }),
    ).rejects.toThrow("Failed to decrypt Discord bot token");
  });
});
