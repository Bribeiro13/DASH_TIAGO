-- ============================================================
-- CDQ Dashboard — Schema Supabase
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard → SQL Editor → New query
-- ============================================================

-- 1. Tabela de arquivos importados
create table if not exists public.imported_files (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null,
  imported_at  timestamptz default now(),
  row_count    int  default 0,
  file_size    text
);

-- 2. Tabela de registros de manutenção
create table if not exists public.records (
  id           uuid primary key default gen_random_uuid(),
  file_id      uuid references public.imported_files(id) on delete cascade,
  maquina      text,
  data         date,
  duracao      numeric default 0,
  atividades   text    default 'Sim',
  oms          text,
  bloqueio     numeric default 0,
  manutencao   numeric default 0,
  desbloqueio  numeric default 0,
  testes       numeric default 0,
  espera_testes numeric default 0,
  motivo       text,
  observacoes  text,
  created_at   timestamptz default now()
);

-- 3. Row Level Security (permite tudo para anon — dashboard privado)
alter table public.imported_files enable row level security;
alter table public.records         enable row level security;

create policy "anon_all_imported_files" on public.imported_files
  for all using (true) with check (true);

create policy "anon_all_records" on public.records
  for all using (true) with check (true);
