import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

type Hit = { kind: string; id: string; label: string; sub: string; go: () => void };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, " ");
    if (term.length < 2) { setHits([]); return; }
    let stale = false;
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [b, r, p, n, tk] = await Promise.all([
        supabase.from("businesses").select("id,name,website,address,phone").or(`name.ilike.${like},website.ilike.${like},phone.ilike.${like},address.ilike.${like}`).limit(6),
        supabase.from("discovery_runs").select("id,title,query,location,created_at").or(`title.ilike.${like},query.ilike.${like},location.ilike.${like}`).limit(4),
        supabase.from("proposals").select("id,title,mode,body,businesses(name)").or(`title.ilike.${like},body.ilike.${like}`).limit(4),
        supabase.from("business_notes").select("id,body,business_id").ilike("body", like).limit(3),
        supabase.from("tasks").select("id,title,business_id").ilike("title", like).limit(3),
      ]);
      const emailHits = await supabase.from("businesses").select("id,name,emails").contains("emails", [term.toLowerCase()]).limit(3);
      if (stale) return;
      const out: Hit[] = [];
      const seen = new Set<string>();
      for (const x of [...(b.data ?? []), ...(emailHits.data ?? [])] as any[]) {
        if (seen.has(x.id)) continue; seen.add(x.id);
        out.push({ kind: "Business", id: x.id, label: x.name, sub: x.website ?? x.address ?? (x.emails?.[0] ?? ""), go: () => navigate({ to: "/businesses/$id", params: { id: x.id } }) });
      }
      for (const x of r.data ?? []) out.push({ kind: "Search", id: x.id, label: x.title ?? x.query, sub: new Date(x.created_at).toLocaleDateString(), go: () => navigate({ to: "/history/$id", params: { id: x.id } }) });
      for (const x of (p.data ?? []) as any[]) out.push({ kind: "Proposal", id: x.id, label: x.title ?? x.mode, sub: x.businesses?.name ?? "", go: () => navigate({ to: "/proposals/$id", params: { id: x.id } }) });
      for (const x of n.data ?? []) out.push({ kind: "Note", id: x.id, label: x.body.slice(0, 60), sub: "note", go: () => navigate({ to: "/businesses/$id", params: { id: x.business_id } }) });
      for (const x of tk.data ?? []) out.push({ kind: "Task", id: x.id, label: x.title, sub: "task", go: () => (x.business_id ? navigate({ to: "/businesses/$id", params: { id: x.business_id } }) : navigate({ to: "/tasks" })) });
      setHits(out); setActive(0);
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q, navigate]);

  function pick(h: Hit) { setOpen(false); setQ(""); h.go(); }

  return (
    <div className="relative w-full max-w-xs">
      <Input
        ref={ref}
        value={q}
        placeholder="Search everything…  ⌘K"
        className="h-8 text-sm"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && hits[active]) pick(hits[active]!);
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-9 z-50 max-h-96 overflow-auto rounded-md border bg-popover shadow-lg">
          {hits.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nothing saved matches “{q}”. Try a business name, domain, email or search title.</p>
          ) : hits.map((h, i) => (
            <button key={h.kind + h.id} onMouseDown={() => pick(h)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-muted" : ""}`}>
              <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-primary">{h.kind}</span>
              <span className="min-w-0 flex-1 truncate">{h.label}</span>
              <span className="max-w-[40%] truncate text-xs text-muted-foreground">{h.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
