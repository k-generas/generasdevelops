import { describe, expect, it } from "vitest";
import { generateAccessCode, hashAccessCode, isMissingDatabaseFunctionError } from "./access-codes";

describe("generateAccessCode", () => {
  it("uses the GARE code format", () => {
    expect(generateAccessCode()).toMatch(/^GARE-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("does not repeat codes", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateAccessCode()));
    expect(codes.size).toBe(500);
  });
});

describe("hashAccessCode", () => {
  it("returns a deterministic SHA-256 hex digest", async () => {
    const first = await hashAccessCode("GARE-1234-5678-9ABC-DEF0");
    const second = await hashAccessCode("GARE-1234-5678-9ABC-DEF0");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(second);
    expect(await hashAccessCode("GARE-0000-0000-0000-0000")).not.toBe(first);
  });
});

describe("isMissingDatabaseFunctionError", () => {
  it("detects the pgcrypto search_path failure", () => {
    expect(
      isMissingDatabaseFunctionError("function gen_random_bytes(integer) does not exist"),
    ).toBe(true);
    expect(isMissingDatabaseFunctionError("function digest(text, unknown) does not exist")).toBe(
      true,
    );
  });

  it("does not hide unrelated database errors", () => {
    expect(isMissingDatabaseFunctionError("permission denied for table access_codes")).toBe(false);
    expect(isMissingDatabaseFunctionError("duplicate key value violates unique constraint")).toBe(
      false,
    );
  });
});
