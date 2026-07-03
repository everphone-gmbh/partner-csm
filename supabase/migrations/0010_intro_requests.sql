-- Partner CSM Tool — "Wer kann helfen?" board (intro requests)
-- ⚠ AUTHORED, NOT YET APPLIED. Apply after 0001-0009 on the Sovereign-Cloud
--   instance.

create table intro_requests (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_by uuid not null references profiles (id) default auth.uid(),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  helper_name text,
  resolved_at timestamptz
);

create index on intro_requests (status, created_at desc);

alter table intro_requests enable row level security;

-- Team-wide board: any authenticated user reads, creates own requests,
-- and may resolve ("Ich kann helfen"). Deleting: author or privileged.
create policy intro_requests_read on intro_requests for select
  using (auth.uid() is not null);

create policy intro_requests_insert on intro_requests for insert
  with check (created_by = auth.uid());

create policy intro_requests_update on intro_requests for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy intro_requests_delete on intro_requests for delete
  using (created_by = auth.uid() or is_privileged());
