import { describe, expect, it } from "vitest";
import {
  ACCESS_EMAIL_SUBJECT,
  ADMIN_EMAIL,
  ADMIN_WHATSAPP,
  accessEmailText,
  accessRequestBody,
  redeemErrorMessage,
  whatsappAccessLink,
  type AccessInfo,
} from "./access";

function info(over: Partial<AccessInfo> = {}): AccessInfo {
  return {
    status: "pending",
    email: "newuser@example.com",
    name: "Uwase",
    isAdmin: false,
    ...over,
  };
}

describe("contact links", () => {
  it("uses the verified WhatsApp number and encodes the message", () => {
    const link = whatsappAccessLink(info());
    expect(ADMIN_WHATSAPP).toBe("250794144738");
    expect(link.startsWith("https://wa.me/250794144738?text=")).toBe(true);
    expect(link).toContain("newuser%40example.com");
  });

  it("points email requests at the owner with the access subject", () => {
    const text = accessEmailText(info());
    expect(ADMIN_EMAIL).toBe("generaskagiraneza@gmail.com");
    expect(text).toContain(`Subject: ${ACCESS_EMAIL_SUBJECT}`);
    expect(text).toContain("newuser@example.com");
  });

  it("omits the name line when no name is on file", () => {
    const body = accessRequestBody(info({ name: null }));
    expect(body).not.toContain("Name:");
    expect(body).toContain("newuser@example.com");
  });

  it("uses a placeholder when no email is on file", () => {
    const body = accessRequestBody(info({ email: "", name: null }));
    expect(body).toContain("(no email on file)");
  });
});

describe("redeemErrorMessage", () => {
  it("maps every redemption failure to a human message", () => {
    const codes = [
      "not_authenticated",
      "empty_code",
      "invalid_code",
      "code_used",
      "code_expired",
      "code_revoked",
      "code_exhausted",
      "code_not_assigned",
      "rate_limited",
    ];
    const messages = codes.map(redeemErrorMessage);
    expect(new Set(messages).size).toBe(codes.length);
    for (const m of messages) expect(m.length).toBeGreaterThan(10);
  });

  it("falls back for unknown or missing keys", () => {
    expect(redeemErrorMessage()).toMatch(/Try again/i);
    expect(redeemErrorMessage("something_else")).toMatch(/Try again/i);
  });
});
