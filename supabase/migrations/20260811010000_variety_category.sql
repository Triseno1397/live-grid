-- Live Grid — add the `variety` production category
--
-- The original twelve categories have no home for live-to-tape talk and sketch: late
-- night, daytime talk, and sketch series are none of awards / game_shows / reality /
-- streaming. They were being forced into whichever was least wrong, which is how a
-- category column stops meaning anything.
--
-- `variety` is the industry's own word for this group — the Television Academy awards
-- Outstanding Variety Talk Series and Outstanding Variety Sketch Series — so it covers
-- The Tonight Show and Saturday Night Live without either being a stretch. The finer
-- distinction lives in `subcategory` ("late night", "sketch", "daytime talk"), which is
-- free text precisely so the enum does not have to grow a row per format.
--
-- AGENTS.md rule 2: this migration and the CATEGORIES constant in
-- src/lib/import/schema.ts are the two places that must agree, and LIVEGRID_PLAN.md
-- records the change.

alter table public.productions
  drop constraint productions_category_check;

alter table public.productions
  add constraint productions_category_check check (category in (
    'awards','sports','concerts','game_shows','reality','streaming',
    'holiday','tech','gaming','corporate','political','international',
    'variety'
  ));
