import { describe, expect, it } from "vitest";
import {
  OUTREACH_PACK_CHANNELS,
  OUTREACH_PACK_MODE,
  packChannelCounts,
  selectPackMessages,
  type PackMessage,
} from "./outreach-pack";

function msg(channel: string, body = "hello", title = "t"): PackMessage {
  return { channel, title, body };
}

describe("outreach-pack", () => {
  it("exposes a stable mode marker and the three channels", () => {
    expect(OUTREACH_PACK_MODE).toBe("Outreach message");
    expect([...OUTREACH_PACK_CHANNELS]).toEqual(["Email", "WhatsApp", "SMS"]);
  });

  it("keeps at most three usable messages per channel", () => {
    const input = [
      msg("Email", "e1"),
      msg("Email", "e2"),
      msg("Email", "e3"),
      msg("Email", "e4"),
      msg("WhatsApp", "w1"),
      msg("SMS", "s1"),
    ];
    const kept = selectPackMessages(input);
    expect(kept).toHaveLength(5);
    expect(kept.filter((m) => m.channel === "Email")).toHaveLength(3);
    expect(kept.filter((m) => m.channel === "WhatsApp")).toHaveLength(1);
    expect(kept.filter((m) => m.channel === "SMS")).toHaveLength(1);
  });

  it("orders results by channel order, not input order", () => {
    const kept = selectPackMessages([msg("SMS", "s"), msg("Email", "e"), msg("WhatsApp", "w")]);
    expect(kept.map((m) => m.channel)).toEqual(["Email", "WhatsApp", "SMS"]);
  });

  it("drops empty bodies and unknown channels", () => {
    const kept = selectPackMessages([msg("Email", "   "), msg("Telegram", "x"), msg("SMS", "ok")]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.channel).toBe("SMS");
  });

  it("honours a custom per-channel cap", () => {
    const kept = selectPackMessages([msg("SMS", "a"), msg("SMS", "b"), msg("SMS", "c")], 2);
    expect(kept).toHaveLength(2);
  });

  it("counts messages per channel and ignores unknown ones", () => {
    const counts = packChannelCounts([
      msg("Email"),
      msg("Email"),
      msg("WhatsApp"),
      msg("SMS"),
      msg("Telegram"),
    ]);
    expect(counts).toEqual({ Email: 2, WhatsApp: 1, SMS: 1 });
  });
});
