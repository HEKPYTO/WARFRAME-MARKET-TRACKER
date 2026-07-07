import { describe, expect, it } from "bun:test";

import { isIgnorableSchemaNotice } from "../src/index";

describe("isIgnorableSchemaNotice", () => {
  it("suppresses idempotent relation exists notices from schema setup", () => {
    expect(
      isIgnorableSchemaNotice({
        code: "42P07",
        message: 'relation "user_settings" already exists, skipping',
        severity: "NOTICE",
      }),
    ).toBe(true);
  });

  it("suppresses idempotent column exists notices from schema setup", () => {
    expect(
      isIgnorableSchemaNotice({
        code: "42701",
        message:
          'column "discord_bot_token_ciphertext" of relation "user_settings" already exists, skipping',
        severity: "NOTICE",
      }),
    ).toBe(true);
  });

  it("keeps non-idempotent notices visible", () => {
    expect(
      isIgnorableSchemaNotice({
        code: "42P07",
        message: 'relation "user_settings" already exists',
        severity: "NOTICE",
      }),
    ).toBe(false);
    expect(
      isIgnorableSchemaNotice({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        severity: "ERROR",
      }),
    ).toBe(false);
  });
});
