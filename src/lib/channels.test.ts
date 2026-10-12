import { describe, expect, it } from "vitest";
import {
  CHANNEL_GUIDANCE,
  DEFAULT_CHANNEL,
  PROPOSAL_CHANNELS,
  channelGuidance,
  isKnownChannel,
} from "@/lib/channels";

describe("channels", () => {
  it("covers the requested copy-paste channels", () => {
    for (const c of ["Email", "WhatsApp", "SMS", "LinkedIn"]) {
      expect(PROPOSAL_CHANNELS).toContain(c);
    }
  });

  it("has guidance for every listed channel", () => {
    for (const c of PROPOSAL_CHANNELS) {
      expect(CHANNEL_GUIDANCE[c].length).toBeGreaterThan(10);
    }
  });

  it("defaults to Email", () => {
    expect(DEFAULT_CHANNEL).toBe("Email");
    expect(isKnownChannel("Email")).toBe(true);
  });

  it("returns a fallback for unknown or empty channels", () => {
    expect(isKnownChannel("Carrier pigeon")).toBe(false);
    expect(isKnownChannel(null)).toBe(false);
    expect(channelGuidance("Carrier pigeon").length).toBeGreaterThan(10);
    expect(channelGuidance(undefined)).toBe(channelGuidance("anything-unknown"));
  });
});
