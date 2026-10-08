<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS

- Every data table is owner-scoped via `owner_id = auth.uid()` RLS — the app is single-owner private, no roles needed yet.
- Google Places calls go only through authenticated server functions in `src/lib/discovery.functions.ts` — Maps usage is paid and must stay bounded (max 20 results/run, dedupe by place_id).
- AI investigation uses raw streamed `/v1/responses` with strict json_schema in `src/lib/investigate.server.ts` — AI may only interpret collected evidence, never invent facts.
- Authenticated pages live under `src/routes/_authenticated/` (client-side session gate, ssr: false).
