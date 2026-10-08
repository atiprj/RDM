-- Direzione di sincronizzazione per ogni parametro mappato (Sinc Locali).
--   web_to_revit: il valore del sito viene scritto nel parametro Revit (comportamento storico).
--   revit_to_web: il valore del parametro Revit viene scritto sul sito (rooms.parameters).
-- Eseguire una volta nel SQL Editor di Supabase (idempotente).

alter table public.parameter_mappings
  add column if not exists direction text not null default 'web_to_revit';

alter table public.parameter_mappings
  drop constraint if exists parameter_mappings_direction_ck;

alter table public.parameter_mappings
  add constraint parameter_mappings_direction_ck
  check (direction in ('web_to_revit', 'revit_to_web'));
