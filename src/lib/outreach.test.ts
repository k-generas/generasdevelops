import { describe, expect, it } from "vitest";
import {
  OUTREACH_CHANNELS,
  nowLocalInput,
  outreachSummary,
  readOutreachDetails,
} from "@/lib/outreach";

describe("outreach", () => {
  it("includes common channels", () => {
    expect(OUTREACH_CHANNELS).toContain("Email");
    expect(OUTREACH_CHANNELS).toContain("WhatsApp");
  });

  it("formats a summary with and without a response", () => {
    expect(outreachSummary("Email")).toBe("Outreach via Email");
    expect(outreachSummary("WhatsApp", "  Call me tomorrow ")).toBe(
      "Outreach via WhatsApp — response: Call me tomorrow",
    );
  });

  it("formats a local datetime-local value with zero padding", () => {
    expect(nowLocalInput(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07");
  });

  it("reads outreach details safely", () => {
    expect(readOutreachDetails({ channel: "Phone", response: "Yes", at: "2026-01-01" })).toEqual({
      channel: "Phone",
      response: "Yes",
      at: "2026-01-01",
    });
    expect(readOutreachDetails(null)).toEqual({ channel: null, response: null, at: null });
    expect(readOutreachDetails("nonsense")).toEqual({
      channel: null,
      response: null,
      at: null,
    });
  });

  it("keeps the channel list stable for the UI", () => {
    expect(OUTREACH_CHANNELS.length).toBe(7);
  });
});
