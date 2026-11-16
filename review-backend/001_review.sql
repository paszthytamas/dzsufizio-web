-- Store comments and hashes of the separate reviewer and owner access links.
create schema dzs_review;
revoke all on schema dzs_review from public, anon, authenticated;

create table dzs_review.links (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  board_id uuid not null,
  role text not null check (role in ('reviewer', 'owner')),
  name text not null check (char_length(name) between 1 and 80),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create table dzs_review.notes (
  board_id uuid not null,
  id uuid not null,
  route text not null check (char_length(route) <= 160 and route ~ '^([a-z0-9-]+/)*$'),
  page_title text not null check (char_length(page_title) between 1 and 220),
  section text not null check (char_length(section) <= 220),
  locator jsonb not null check (jsonb_typeof(locator) = 'object' and pg_column_size(locator) <= 3500),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  author text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  primary key (board_id, id)
);
create index review_notes_by_board on dzs_review.notes (board_id, created_at desc, id);

alter table dzs_review.links enable row level security;
alter table dzs_review.notes enable row level security;
revoke all on all tables in schema dzs_review from public, anon, authenticated;

create function dzs_review.get_link(p_token text)
returns dzs_review.links
language sql
stable
set search_path = ''
as $$
  select l.*
  from dzs_review.links l
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and l.token_hash = pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
    and not l.revoked
    and l.expires_at > pg_catalog.now();
$$;
revoke all on function dzs_review.get_link(text) from public, anon, authenticated;

create function public.dzs_review_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link dzs_review.links;
  v_notes jsonb;
begin
  v_link := dzs_review.get_link(p_token);
  if v_link.role is null then
    return jsonb_build_object('ok', false, 'error', 'access');
  end if;
  select coalesce(jsonb_agg(to_jsonb(n) - 'board_id' order by n.created_at desc, n.id), '[]'::jsonb)
    into v_notes
    from dzs_review.notes n where n.board_id = v_link.board_id;
  return jsonb_build_object('ok', true, 'role', v_link.role, 'name', v_link.name, 'notes', v_notes);
end;
$$;

create function public.dzs_review_create(p_token text, p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link dzs_review.links;
  v_note dzs_review.notes;
  v_route text;
  v_title text;
  v_section text;
  v_body text;
  v_locator jsonb;
begin
  v_link := dzs_review.get_link(p_token);
  if v_link.role is null then
    return jsonb_build_object('ok', false, 'error', 'access');
  end if;
  if p_id is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data) > 17000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_route := p_data->>'route';
  v_title := btrim(p_data->>'page_title');
  v_section := left(coalesce(p_data->>'section', ''), 220);
  v_body := btrim(p_data->>'body');
  v_locator := p_data->'locator';
  if v_route is null or char_length(v_route) > 160 or v_route !~ '^([a-z0-9-]+/)*$'
    or coalesce(char_length(v_title), 0) not between 1 and 220
    or coalesce(char_length(v_body), 0) not between 1 and 3000
    or jsonb_typeof(v_locator) is distinct from 'object'
    or pg_column_size(v_locator) > 3500
    or coalesce(v_locator->>'kind', '') not in ('page', 'text', 'element')
  then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- A repeated submission can return the same note if the first response was lost.
  select * into v_note from dzs_review.notes n where n.board_id = v_link.board_id and n.id = p_id;
  if v_note.id is not null then
    if v_note.author <> v_link.name then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    return jsonb_build_object('ok', true, 'note', to_jsonb(v_note) - 'board_id');
  end if;
  if (select count(*) from dzs_review.notes n where n.board_id = v_link.board_id) >= 600 then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;
  insert into dzs_review.notes (board_id, id, route, page_title, section, locator, body, author)
    values (v_link.board_id, p_id, v_route, v_title, v_section, v_locator, v_body, v_link.name)
    on conflict (board_id, id) do nothing
    returning * into v_note;
  if v_note.id is null then
    select * into v_note from dzs_review.notes n where n.board_id = v_link.board_id and n.id = p_id;
    if v_note.author <> v_link.name then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'note', to_jsonb(v_note) - 'board_id');
end;
$$;

create function public.dzs_review_set_status(p_token text, p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link dzs_review.links;
  v_note dzs_review.notes;
begin
  v_link := dzs_review.get_link(p_token);
  if v_link.role is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'error', 'access');
  end if;
  if p_status is null or p_status not in ('open', 'done') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update dzs_review.notes
    set status = p_status
    where board_id = v_link.board_id and id = p_id
    returning * into v_note;
  if v_note.id is null then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  return jsonb_build_object('ok', true, 'note', to_jsonb(v_note) - 'board_id');
end;
$$;

revoke all on function public.dzs_review_list(text) from public, anon, authenticated;
revoke all on function public.dzs_review_create(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.dzs_review_set_status(text, uuid, text) from public, anon, authenticated;
grant execute on function public.dzs_review_list(text) to anon, authenticated;
grant execute on function public.dzs_review_create(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.dzs_review_set_status(text, uuid, text) to anon, authenticated;
