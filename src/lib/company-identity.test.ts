import { describe, expect, it } from "vitest";
import {
  dedupeBusinesses,
  matchBusiness,
  nameSimilarity,
  normalizeCompanyName,
  normalizeDomain,
  normalizePhone,
  sameBusinessRecord,
} from "@/lib/company-identity";

describe("company identity", () => {
  it("strips legal suffixes and accents from names", () => {
    expect(normalizeCompanyName("Kigali Coffee Ltd.")).toBe("kigali coffee");
    expect(normalizeCompanyName("Amahoro Café & Co")).toBe("amahoro cafe and");
    expect(normalizeCompanyName("SOGECOM Sarl")).toBe("sogecom");
  });

  it("computes token similarity", () => {
    expect(nameSimilarity("Kigali Coffee Ltd", "Kigali Coffee Limited")).toBe(1);
    expect(nameSimilarity("Alpha Tech", "Beta Foods")).toBe(0);
  });

  it("normalises domains and phones", () => {
    expect(normalizeDomain("https://www.Example.rw/contact")).toBe("example.rw");
    expect(normalizeDomain("example.rw")).toBe("example.rw");
    expect(normalizeDomain("not a url")).toBeNull();
    expect(normalizePhone("+250 788 123 456")).toBe("788123456");
    expect(normalizePhone("0788 123 456")).toBe("788123456");
    expect(normalizePhone("123")).toBeNull();
  });

  it("matches on place_id, domain, phone, then name", () => {
    expect(
      matchBusiness(
        { place_id: "abc", name: "A" },
        { place_id: "abc", name: "Completely different" },
      ),
    ).toEqual({ kind: "place_id", value: "abc" });
    expect(
      matchBusiness(
        { name: "A", website: "https://a.rw" },
        { name: "B", website: "http://www.a.rw/home" },
      ),
    ).toEqual({ kind: "domain", value: "a.rw" });
    expect(
      matchBusiness({ name: "A", phone: "+250788111222" }, { name: "B", phone: "0788 111 222" }),
    ).toEqual({ kind: "phone", value: "788111222" });
    expect(
      matchBusiness(
        { name: "Kigali Coffee Ltd", address: "Kigali, Rwanda" },
        { name: "Kigali Coffee Limited", address: "Gasabo, Kigali, Rwanda" },
      ),
    ).toEqual({
      kind: "name",
      value: 1,
    });
    expect(matchBusiness({ name: "Alpha" }, { name: "Beta" })).toBeNull();
  });

  it("does not merge same-name companies in different countries", () => {
    expect(
      matchBusiness(
        { name: "Kigali Coffee Ltd", address: "Kigali, Rwanda" },
        { name: "Kigali Coffee Limited", address: "Nairobi, Kenya" },
      ),
    ).toBeNull();
    expect(
      sameBusinessRecord(
        { name: "Kigali Coffee Ltd", address: "Kigali, Rwanda" },
        { name: "Kigali Coffee Limited", address: "Nairobi, Kenya" },
      ),
    ).toBeNull();
  });

  it("does not name-match without a shared location hint", () => {
    expect(
      matchBusiness(
        { name: "Kigali Coffee Ltd" },
        { name: "Kigali Coffee Limited", address: "Kigali, Rwanda" },
      ),
    ).toBeNull();
    expect(
      matchBusiness(
        { name: "Kigali Coffee Ltd", address: "Kigali, Rwanda" },
        { name: "Kigali Coffee Limited", address: "Musanze, Rwanda" },
      ),
    ).toBeNull();
  });

  it("dedupes while keeping the first (priority) record", () => {
    const out = dedupeBusinesses([
      { name: "Kigali Coffee Ltd", website: "https://kigalicoffee.rw" },
      { name: "Kigali Coffee Limited", website: "https://kigalicoffee.rw" },
      { name: "Beta Foods", website: "https://betafoods.rw" },
    ]);
    expect(out.kept).toHaveLength(2);
    expect(out.duplicates).toHaveLength(1);
    expect(out.kept[0]!.name).toBe("Kigali Coffee Ltd");
    expect(out.duplicates[0]!.reason.kind).toBe("domain");
  });

  describe("sameBusinessRecord", () => {
    it("matches deterministically on place_id, domain and phone", () => {
      expect(
        sameBusinessRecord({ place_id: "p1", name: "Anything" }, { place_id: "p1", name: "Other" }),
      ).toEqual({ kind: "place_id", value: "p1" });
      expect(
        sameBusinessRecord(
          { name: "A", website: "https://a.rw" },
          { name: "B", website: "http://www.a.rw/x" },
        ),
      ).toEqual({ kind: "domain", value: "a.rw" });
      expect(
        sameBusinessRecord(
          { name: "A", phone: "+250788111222" },
          { name: "B", phone: "0788 111 222" },
        ),
      ).toEqual({ kind: "phone", value: "788111222" });
    });

    it("requires a high name similarity to avoid hiding generic names", () => {
      expect(
        sameBusinessRecord(
          { name: "Salon", address: "Kigali, Rwanda" },
          { name: "Shop", address: "Kigali, Rwanda" },
        ),
      ).toBeNull();
      expect(
        sameBusinessRecord(
          { name: "Kigali Coffee", address: "Kigali, Rwanda" },
          { name: "Kigali Coffee Ltd", address: "Kigali, Rwanda" },
        ),
      ).toEqual({
        kind: "name",
        value: 1,
      });
    });

    it("honours the name-similarity threshold", () => {
      const a = { name: "Alpha Trading", address: "Kigali, Rwanda" };
      const b = { name: "Alpha Trading House", address: "Kigali, Rwanda" };
      const sim = nameSimilarity(a.name, b.name);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(0.9);
      expect(sameBusinessRecord(a, b)).toBeNull();
      expect(sameBusinessRecord(a, b, sim)).toEqual({ kind: "name", value: sim });
    });
  });
});
