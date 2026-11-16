-- Hide removed notes from both lists and keep a reversible copy in the same board.
alter table dzs_review.notes
  add column author_role text check (author_role in ('owner', 'reviewer')),
  add column deleted_at timestamptz;

-- Existing notes stored the verified display name. Backfill only unambiguous authors.
update dzs_review.notes n
set author_role = l.role
from (
  select board_id, name, min(role) as role
  from dzs_review.links
  group by board_id, name
  having count(distinct role) = 1
) l
where n.board_id = l.board_id and n.author = l.name;

create function dzs_review.can_remove(p_note dzs_review.notes, p_link dzs_review.links)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_note).board_id = (p_link).board_id and (
    (p_link).role = 'owner' or coalesce(
      (p_link).role = (p_note).author_role and (p_link).name = (p_note).author, false
    )
  );
$$;

create function dzs_review.note_for(p_note dzs_review.notes, p_link dzs_review.links)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select (to_jsonb(p_note) - 'board_id' - 'author_role' - 'deleted_at')
    || jsonb_build_object('can_delete', dzs_review.can_remove(p_note, p_link));
$$;

revoke all on function dzs_review.can_remove(dzs_review.notes, dzs_review.links) from public, anon, authenticated;
revoke all on function dzs_review.note_for(dzs_review.notes, dzs_review.links) from public, anon, authenticated;

create or replace function public.dzs_review_list(p_token text)
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
  select coalesce(jsonb_agg(dzs_review.note_for(n, v_link) order by n.created_at desc, n.id), '[]'::jsonb)
    into v_notes
    from dzs_review.notes n where n.board_id = v_link.board_id and n.deleted_at is null;
  return jsonb_build_object('ok', true, 'role', v_link.role, 'name', v_link.name, 'notes', v_notes);
end;
$$;

create or replace function public.dzs_review_create(p_token text, p_id uuid, p_data jsonb)
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
    if v_note.author <> v_link.name or v_note.author_role is distinct from v_link.role then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if v_note.deleted_at is not null then
      return jsonb_build_object('ok', false, 'error', 'missing');
    end if;
    return jsonb_build_object('ok', true, 'note', dzs_review.note_for(v_note, v_link));
  end if;
  if (select count(*) from dzs_review.notes n where n.board_id = v_link.board_id) >= 600 then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;
  insert into dzs_review.notes (board_id, id, route, page_title, section, locator, body, author, author_role)
    values (v_link.board_id, p_id, v_route, v_title, v_section, v_locator, v_body, v_link.name, v_link.role)
    on conflict (board_id, id) do nothing
    returning * into v_note;
  if v_note.id is null then
    select * into v_note from dzs_review.notes n where n.board_id = v_link.board_id and n.id = p_id;
    if v_note.author <> v_link.name or v_note.author_role is distinct from v_link.role then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if v_note.deleted_at is not null then
      return jsonb_build_object('ok', false, 'error', 'missing');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'note', dzs_review.note_for(v_note, v_link));
end;
$$;

create or replace function public.dzs_review_set_status(p_token text, p_id uuid, p_status text)
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
    where board_id = v_link.board_id and id = p_id and deleted_at is null
    returning * into v_note;
  if v_note.id is null then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  return jsonb_build_object('ok', true, 'note', dzs_review.note_for(v_note, v_link));
end;
$$;

create function public.dzs_review_set_deleted(p_token text, p_id uuid, p_deleted boolean)
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
  if v_link.role is null then
    return jsonb_build_object('ok', false, 'error', 'access');
  end if;
  if p_id is null or p_deleted is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update dzs_review.notes n
    set deleted_at = case when p_deleted then coalesce(n.deleted_at, now()) else null end
    where n.board_id = v_link.board_id and n.id = p_id and dzs_review.can_remove(n, v_link)
    returning * into v_note;
  if v_note.id is null then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if p_deleted then
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', true, 'note', dzs_review.note_for(v_note, v_link));
end;
$$;

revoke all on function public.dzs_review_set_deleted(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.dzs_review_set_deleted(text, uuid, boolean) to anon, authenticated;
