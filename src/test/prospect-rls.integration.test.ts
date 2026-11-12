import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const env = {
  url: process.env["TEST_SUPABASE_URL"] ?? "",
  key: process.env["TEST_SUPABASE_PUBLISHABLE_KEY"] ?? "",
  ownerToken: process.env["TEST_OWNER_ACCESS_TOKEN"] ?? "",
  otherToken: process.env["TEST_OTHER_ACCESS_TOKEN"] ?? "",
};

const enabled = Object.values(env).every(Boolean);

function testClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function userId(client: SupabaseClient<Database>, token: string): Promise<string> {
  const { data, error } = await client.auth.getUser(token);
  expect(error).toBeNull();
  if (!data.user) throw new Error("Test token did not resolve to a user.");
  return data.user.id;
}

describe.skipIf(!enabled)("prospect_lists owner isolation (live Supabase)", () => {
  it("keeps location filters owner-readable and blocks another authenticated user", async () => {
    const owner = testClient(env.ownerToken);
    const other = testClient(env.otherToken);
    const [ownerId, otherId] = await Promise.all([
      userId(owner, env.ownerToken),
      userId(other, env.otherToken),
    ]);
    expect(ownerId).not.toBe(otherId);

    const name = `__rls_test__ ${Date.now()}`;
    const { data: inserted, error: insertError } = await owner
      .from("prospect_lists")
      .insert({
        name,
        entity_kind: "business",
        filters: { query: "dental", location: "Kigali" },
      })
      .select("id,owner_id,filters")
      .single();
    expect(insertError).toBeNull();
    if (!inserted) throw new Error("Owner could not create the test list.");

    try {
      expect(inserted.owner_id).toBe(ownerId);
      expect(inserted.filters).toMatchObject({ location: "Kigali" });

      const { data: leaked, error: leakError } = await other
        .from("prospect_lists")
        .select("id")
        .eq("id", inserted.id);
      expect(leakError).toBeNull();
      expect(leaked).toEqual([]);

      const { data: updated, error: updateError } = await other
        .from("prospect_lists")
        .update({ name: "__rls_test__ hacked" })
        .eq("id", inserted.id)
        .select("id");
      expect(updateError).toBeNull();
      expect(updated ?? []).toEqual([]);

      const { data: deleted, error: deleteError } = await other
        .from("prospect_lists")
        .delete()
        .eq("id", inserted.id)
        .select("id");
      expect(deleteError).toBeNull();
      expect(deleted ?? []).toEqual([]);

      const { data: spoofed, error: spoofError } = await other
        .from("prospect_lists")
        .insert({
          owner_id: ownerId,
          name: `__rls_test__ spoof ${Date.now()}`,
          entity_kind: "business",
          filters: { location: "Kigali" },
        })
        .select("id");
      if (spoofed?.length) {
        await owner
          .from("prospect_lists")
          .delete()
          .in(
            "id",
            spoofed.map((row) => row.id),
          );
      }
      expect(spoofError).not.toBeNull();

      const { data: stillThere, error: rereadError } = await owner
        .from("prospect_lists")
        .select("id,owner_id,filters")
        .eq("id", inserted.id)
        .maybeSingle();
      expect(rereadError).toBeNull();
      expect(stillThere).toMatchObject({
        id: inserted.id,
        owner_id: ownerId,
        filters: { location: "Kigali" },
      });
    } finally {
      await owner.from("prospect_lists").delete().eq("id", inserted.id);
    }
  });
});
