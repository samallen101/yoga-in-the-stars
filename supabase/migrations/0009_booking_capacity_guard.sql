-- Never more "booked" places than a class has (24 Sep 2026).
-- The app checks capacity before booking, but two people pressing Book on the
-- last space at the same moment could both get in (found by the automated
-- test run). This guard runs inside the database: it locks the class row, so
-- bookings for one class are checked one at a time, and anyone who would go
-- over capacity is put on the waitlist instead. The app reads the status back
-- and only takes a class pass credit for a real place.
create or replace function bookings_capacity_guard() returns trigger
language plpgsql as $$
declare
  cap integer;
  taken integer;
begin
  if new.status <> 'booked' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'booked' then return new; end if;

  select capacity into cap from class_sessions where id = new.session_id for update;
  select count(*) into taken from bookings
    where session_id = new.session_id and status = 'booked' and id <> new.id;

  if cap is not null and taken >= cap then
    new.status := 'waitlisted';
    new.class_pass_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_capacity_guard on bookings;
create trigger bookings_capacity_guard
  before insert or update of status on bookings
  for each row execute function bookings_capacity_guard();
