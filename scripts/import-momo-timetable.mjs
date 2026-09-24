// Copy the club's real timetable from Momo into the new site.
// Input: /tmp/tt.json (sessions + one description per class, parsed from the
// public Momo schedule). Safe to re-run: each session is tagged with its Momo
// lesson id in `notes`, and anything already imported is skipped.
// Also (once): replaces the demo class types, demo sessions and the placeholder
// venue from the build. DRY_RUN=1 prints what it would do and changes nothing.
// Usage: node scripts/import-momo-timetable.mjs
import { createClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  }),
);
const DRY = process.env.DRY_RUN === "1";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { sessions, descriptions } = JSON.parse(fs.readFileSync(process.env.TT || "/tmp/tt.json", "utf8"));

const DEMO_TYPES = ["Slow Flow", "Morning Flow", "Restorative", "Breathwork", "The Yoga-Social"];
const CAPACITY = 16; // Momo's public page doesn't show capacity; Tarin adjusts per class
const DROP_IN = 1300;

// Tidy Momo's titles a little (typos, spacing), keep the club's wording.
const tidy = (t) => ({
  "Vinyasa Slow FLow": "Vinyasa Slow Flow",
  "Grace of Vinyasa(60min)": "Grace of Vinyasa (60 min)",
  "HATHA SOMA / At Yoga in the Stars": "Hatha Soma (The Yoga-Social)",
}[t] ?? t);
const isPwyw = (t) => /donation based|hatha soma/i.test(t);

// Tarin has three Momo records; his classes go on the club Gmail one.
const TEACHER_EMAIL_OVERRIDE = { "Tarin Heaton-Heather": "yogainthestarsstudio@gmail.com" };

const log = (...a) => console.log(DRY ? "[dry run]" : "", ...a);

async function main() {
  // 1. Venue
  const { data: locs } = await db.from("locations").select("*");
  let location = locs.find((l) => /heathcote/i.test(l.name)) ?? locs.find((l) => l.name === "The Room Above the Pub");
  const venue = { name: "Heathcote & Star, Green Grove Room", address: "344 Grove Green Road, Leytonstone, London E11" };
  if (location && (location.name !== venue.name || location.address !== venue.address)) {
    log(`venue: "${location.name}, ${location.address}" -> "${venue.name}, ${venue.address}"`);
    if (!DRY) await db.from("locations").update(venue).eq("id", location.id);
  } else if (!location) {
    log("venue: creating", venue.name);
    if (!DRY) location = (await db.from("locations").insert(venue).select("*").single()).data;
  }

  // 2. Demo content out (only if nobody has booked it)
  const { data: demoTypes } = await db.from("class_types").select("id, name").in("name", DEMO_TYPES);
  for (const t of demoTypes ?? []) {
    const { data: ss } = await db.from("class_sessions").select("id").eq("class_type_id", t.id);
    const ids = (ss ?? []).map((s) => s.id);
    const { count } = ids.length ? await db.from("bookings").select("id", { count: "exact", head: true }).in("session_id", ids) : { count: 0 };
    if (count) { log(`keeping demo type "${t.name}": ${count} booking(s) on it`); continue; }
    log(`removing demo type "${t.name}" and its ${ids.length} session(s)`);
    if (!DRY) {
      if (ids.length) await db.from("class_sessions").delete().in("id", ids);
      await db.from("class_types").delete().eq("id", t.id);
    }
  }

  // 3. Teachers
  const teacherIds = {};
  for (const name of [...new Set(sessions.map((s) => s.teacher).filter(Boolean))]) {
    let q = db.from("profiles").select("id, full_name, email, role");
    q = TEACHER_EMAIL_OVERRIDE[name] ? q.eq("email", TEACHER_EMAIL_OVERRIDE[name]) : q.eq("full_name", name);
    const { data } = await q;
    if (data?.length !== 1) { log(`teacher "${name}": ${data?.length ?? 0} matches, leaving their classes without a named teacher`); continue; }
    teacherIds[name] = data[0].id;
    if (data[0].role === "yogi") {
      log(`teacher role: ${name} (${data[0].email})`);
      if (!DRY) await db.from("profiles").update({ role: "teacher" }).eq("id", data[0].id);
    }
  }

  // 4. Class types
  const typeIds = {};
  const { data: existingTypes } = await db.from("class_types").select("id, name");
  for (const raw of [...new Set(sessions.map((s) => s.title))]) {
    const name = tidy(raw);
    if (typeIds[name]) continue;
    const found = existingTypes.find((t) => t.name === name);
    if (found) { typeIds[name] = found.id; continue; }
    const first = sessions.find((s) => s.title === raw);
    const [a, b] = first.dates.split("/");
    const mins = (Date.parse(iso(b)) - Date.parse(iso(a))) / 60000;
    const row = {
      name, description: (descriptions[raw] ?? "").trim() || null, duration_minutes: mins, default_capacity: CAPACITY,
      default_pricing: isPwyw(raw) ? "pay_what_you_wish" : "members_included", default_drop_in_pence: DROP_IN, active: true,
    };
    log(`class type: ${name} (${mins} min, ${row.default_pricing})`);
    if (!DRY) typeIds[name] = (await db.from("class_types").insert(row).select("id").single()).data.id;
    else typeIds[name] = `dry-${name}`;
  }

  // 5. Sessions
  const { data: already } = await db.from("class_sessions").select("notes").like("notes", "momo:%");
  const done = new Set((already ?? []).map((r) => r.notes));
  let added = 0, skipped = 0;
  for (const s of sessions) {
    const tag = `momo:${s.id}`;
    if (done.has(tag)) { skipped++; continue; }
    const [a, b] = s.dates.split("/");
    const row = {
      class_type_id: typeIds[tidy(s.title)],
      teacher_id: teacherIds[s.teacher] ?? null,
      location_id: location?.id ?? null,
      starts_at: fromZonedTime(iso(a), "Europe/London").toISOString(),
      ends_at: fromZonedTime(iso(b), "Europe/London").toISOString(),
      capacity: CAPACITY,
      pricing: isPwyw(s.title) ? "pay_what_you_wish" : "members_included",
      drop_in_pence: DROP_IN,
      suggested_pwyw_pence: isPwyw(s.title) ? 500 : null,
      notes: tag,
    };
    if (!DRY) { const { error } = await db.from("class_sessions").insert(row); if (error) throw new Error(`${s.title} ${a}: ${error.message}`); }
    added++;
  }
  log(`sessions: ${added} added, ${skipped} already there`);
}

// "20260928T070000" -> "2026-09-28T07:00:00" (London wall-clock time)
function iso(d) { return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}`; }

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
