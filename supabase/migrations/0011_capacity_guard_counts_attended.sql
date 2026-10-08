-- 0011: the capacity guard (0009) counts checked-in people too (audit, 8 Oct 2026).
-- 0009 counted only status = 'booked', but a teacher checking people in turns
-- 'booked' into 'attended', so once check-ins start the guard saw spare places
-- that weren't there. The app's own check (session_booking_counts) already
-- counts both; this makes the database backstop agree.
create or replace function bookings_capacity_guard() returns trigger
language plpgsql as $$
declare
  cap integer;
  taken integer;
begin
  if new.status <> 'booked' then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('booked', 'attended') then return new; end if;

  select capacity into cap from class_sessions where id = new.session_id for update;
  select count(*) into taken from bookings
    where session_id = new.session_id and status in ('booked', 'attended') and id <> new.id;

  if cap is not null and taken >= cap then
    new.status := 'waitlisted';
    new.class_pass_id := null;
  end if;
  return new;
end;
$$;
