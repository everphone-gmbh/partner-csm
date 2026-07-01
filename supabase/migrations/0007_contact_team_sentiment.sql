-- Partner CSM Tool — Team field + sentiment history (Req 3.2)
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0006 on the Sovereign-Cloud instance.

alter table contacts add column team text;
alter table contacts add column sentiment_history jsonb not null default '[]'::jsonb;
