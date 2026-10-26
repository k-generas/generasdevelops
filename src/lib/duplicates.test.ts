import { describe, expect, it } from "vitest";
import {
  findDuplicateGroups,
  normalizeDomain,
  normalizeName,
  normalizePhone,
} from "@/lib/duplicates";

function biz(over: Partial<Parameters<typeof findDuplicateGroups>[0][number]>) {
  return { id: "a", name: "Acme Ltd", ...over };
}

describe("duplicate normalization", () => {
  it("matches Rwandan phone formats on the last nine digits", () => {
    expect(normalizePhone("+250 788 123 456")).toBe("788123456");
    expect(normalizePhone("0788 123 456")).toBe("788123456");
    expect(normalizePhone("12345")).toBe("");
  });

  it("normalizes domains and ignores social profiles", () => {
    expect(normalizeDomain("https://www.Acme.rw/about")).toBe("acme.rw");
    expect(normalizeDomain("acme.rw")).toBe("acme.rw");
    expect(normalizeDomain("https://facebook.com/acme")).toBe("");
  });

  it("drops legal suffixes from names", () => {
    expect(normalizeName("Acme Trading Ltd.")).toBe("acme trading");
    expect(normalizeName("The Acme Company")).toBe("acme");
  });
});

describe("findDuplicateGroups", () => {
  it("groups by shared phone before website", () => {
    const groups = findDuplicateGroups([
      biz({ id: "a", phone: "+250788123456", website: "acme.rw" }),
      biz({ id: "b", name: "Acme Trading", phone: "0788123456", website: "other.rw" }),
      biz({ id: "c", name: "Beta", website: "acme.rw" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("phone");
    expect(groups[0]!.businesses.map((b) => b.id).sort()).toEqual(["a", "b"]);
  });

  it("groups by website and picks the most complete record to keep", () => {
    const groups = findDuplicateGroups([
      biz({ id: "sparse", name: "Acme", website: "acme.rw" }),
      biz({
        id: "full",
        name: "Acme",
        website: "https://www.acme.rw",
        phone: "0788123456",
        address: "KG 1 Ave",
        district: "Gasabo",
        emails: ["hi@acme.rw"],
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("website");
    expect(groups[0]!.suggestedKeepId).toBe("full");
  });

  it("only groups identical names inside the same district", () => {
    const same = findDuplicateGroups([
      biz({ id: "a", name: "Acme Ltd", district: "Gasabo" }),
      biz({ id: "b", name: "Acme", district: "Gasabo" }),
    ]);
    expect(same).toHaveLength(1);
    expect(same[0]!.reason).toBe("name+district");

    const different = findDuplicateGroups([
      biz({ id: "a", name: "Acme Ltd", district: "Gasabo" }),
      biz({ id: "b", name: "Acme", district: "Kicukiro" }),
    ]);
    expect(different).toHaveLength(0);
  });

  it("never puts the same business in two groups", () => {
    const groups = findDuplicateGroups([
      biz({ id: "a", phone: "0788123456", website: "acme.rw", district: "Gasabo" }),
      biz({ id: "b", phone: "0788123456", website: "acme.rw", district: "Gasabo" }),
      biz({ id: "c", website: "acme.rw", district: "Gasabo" }),
    ]);
    const ids = groups.flatMap((g) => g.businesses.map((b) => b.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
