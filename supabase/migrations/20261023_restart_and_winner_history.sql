-- Restart the current round without deleting the room's winner history.
-- Assumptions based on the app's existing RPC contract:
-- public.rooms(id, host_player_id, called_numbers)
-- public.players(id, room_id, user_id, player_name)
-- If your players table calls user_id something else, update the host/member checks below.

create table if not exists public.room_winner_history (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  winner_name text not null check (char_length(trim(winner_name)) between 1 and 24),
  confirmed_by_player_id uuid not null references public.players(id),
  created_at timestamptz not null default now()
);

create index if not exists room_winner_history_room_created_idx
  on public.room_winner_history (room_id, created_at desc);

alter table public.room_winner_history enable row level security;
revoke all on public.room_winner_history from anon, authenticated;

create or replace function public.get_bingo_winner_history(p_room_id uuid)
returns table (id uuid, room_id uuid, winner_name text, confirmed_by_player_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_member boolean;
begin
  select exists (
    select 1 from public.players p
    where p.room_id = p_room_id and p.user_id = auth.uid()
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You must be a member of this room to view winner history.';
  end if;

  return query
    select h.id, h.room_id, h.winner_name, h.confirmed_by_player_id, h.created_at
    from public.room_winner_history h
    where h.room_id = p_room_id
    order by h.created_at desc;
end;
$$;

create or replace function public.confirm_bingo_winner(p_room_id uuid, p_winner_name text)
returns public.room_winner_history
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_player_id uuid;
  v_confirming_player_id uuid;
  v_row public.room_winner_history;
begin
  select r.host_player_id into v_host_player_id
  from public.rooms r where r.id = p_room_id;

  if v_host_player_id is null then
    raise exception 'Room not found or host is not configured.';
  end if;

  select p.id into v_confirming_player_id
  from public.players p
  where p.id = v_host_player_id
    and p.room_id = p_room_id
    and p.user_id = auth.uid();

  if v_confirming_player_id is null then
    raise exception 'Only the room host can confirm a winner.';
  end if;

  if p_winner_name is null or char_length(trim(p_winner_name)) not between 1 and 24 then
    raise exception 'Enter a winner name between 1 and 24 characters.';
  end if;

  insert into public.room_winner_history (room_id, winner_name, confirmed_by_player_id)
  values (p_room_id, trim(p_winner_name), v_confirming_player_id)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.restart_bingo_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_player_id uuid;
  v_is_host boolean;
  v_called_numbers integer[];
begin
  select r.host_player_id into v_host_player_id
  from public.rooms r where r.id = p_room_id;

  if v_host_player_id is null then
    raise exception 'Room not found or host is not configured.';
  end if;

  select exists (
    select 1 from public.players p
    where p.id = v_host_player_id
      and p.room_id = p_room_id
      and p.user_id = auth.uid()
  ) into v_is_host;

  if not v_is_host then
    raise exception 'Only the room host can restart the game.';
  end if;

  update public.rooms
  set called_numbers = '{}'::integer[]
  where id = p_room_id
  returning called_numbers into v_called_numbers;

  return jsonb_build_object('called_numbers', coalesce(v_called_numbers, '{}'::integer[]));
end;
$$;

grant execute on function public.get_bingo_winner_history(uuid) to authenticated;
grant execute on function public.confirm_bingo_winner(uuid, text) to authenticated;
grant execute on function public.restart_bingo_game(uuid) to authenticated;
