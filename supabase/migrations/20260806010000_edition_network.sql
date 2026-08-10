-- Per-edition broadcaster.
--
-- productions.network_id models a production as having one network for life, which the
-- first real seed batch disproved three times over:
--   * the Grammys move from CBS to ABC beginning with the 2027 ceremony
--   * the Primetime Emmys rotate ABC / CBS / NBC / Fox annually (77th CBS, 78th NBC)
--   * the Actor Awards (formerly the SAG Awards) moved from broadcast to Netflix in 2026
--
-- Null means "inherit productions.network_id", so the column stays empty for the ordinary
-- case where a show sits on one network and only carries a value where an edition differs.
-- productions.network_id is retained as that default rather than dropped.
--
-- Corresponding update made to the schema block in LIVEGRID_PLAN.md.

alter table public.editions
  add column network_id uuid references public.networks(id) on delete set null;

create index editions_network_id_idx on public.editions (network_id);

comment on column public.editions.network_id is
  'Broadcaster for this specific edition. Null inherits productions.network_id.';
