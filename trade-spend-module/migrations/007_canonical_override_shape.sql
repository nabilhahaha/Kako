-- Trade Spend Native Module — 007: override-dialect convergence
-- (APPLIED during the Final-Approval RBAC audit, 18 Jul 2026)
--
-- INCIDENT (second occurrence of the 006 class): the Final Approval controls
-- disappeared for dmytro.danylenko@roshen.trade (role regional_admin).
-- Audit finding: his ts.approve.final grant EXISTS — but in the FLAT override
-- shape (overrides.grant), written by the Dashboard's User-Management screen,
-- which is also the shape the server's canonical permission engine
-- dash_effective_perms() reads. The module, however, only read the NAMESPACED
-- shape (overrides.ts.grant) seeded by migration 002. Two dialects, one blind
-- reader: the server said YES (dash_boot effective permissions included
-- ts.approve.final; the enforce_final_approval trigger allows him by email),
-- while the client module computed can('ts.approve.final') = false and never
-- rendered the controls.
--
-- FIX (code, deployed with this migration): the module now bases its ts.*
-- capabilities on the server-computed dash_boot permission list and honors
-- BOTH override dialects (revokes win). No role change: Final Approval stays
-- person-specific — regional_admin as a ROLE deliberately has only
-- ts.view/ts.export.
--
-- THIS MIGRATION (data): mirror the ts.* grants still living ONLY in the
-- namespaced shape into the flat/canonical shape, so the server engine and
-- the User-Management screen see them too. Additive and idempotent; the
-- namespaced blob is kept for backward compatibility.
update public.dash_users u
set overrides = jsonb_set(
      coalesce(u.overrides, '{}'::jsonb),
      '{grant}',
      coalesce(u.overrides->'grant', '[]'::jsonb) || (
        select coalesce(jsonb_agg(g), '[]'::jsonb)
        from jsonb_array_elements_text(u.overrides->'ts'->'grant') g
        where g like 'ts.%'
          and not coalesce(u.overrides->'grant', '[]'::jsonb) ? g
      ),
      true
    )
where u.overrides->'ts'->'grant' is not null;
