#!/usr/bin/env python3
"""
Momoyoga → Yoga in the Stars import.

Reads the two Momo exports (Members, Orders), creates a Supabase auth user +
profile for every person, loads every order into momo_orders, and recreates
current memberships and class passes. Everything is kept; nothing is deleted.

Usage (from the repo folder, .env.local present):
  python3 scripts/momo-import.py --members <Members.csv> --orders <Orders.csv> --out <reports folder> [--dry-run]

Safe to re-run: people are matched by email (and momo_id), orders by
(invoice number, email, date, option, price), memberships/passes are only created if none exist for that person yet.
"""
import argparse, csv, json, os, re, sys, time, datetime as dt, collections
import urllib.request, urllib.parse, urllib.error

TODAY = dt.date.today()

# Momo option name → our plan name (memberships)
MEMBERSHIP_MAP = {
    "Membership - Pay as you wish option ★ Low income": "Low income",
    "Membership - Pay as you wish option ★★ Standard": "Standard",
    "Membership - Pay as you wish ★ ★ ★ Community Supporter": "Supporter",
    "Yoga in the Stars ★ Membership ★": "Standard",
    "Couples Special Offer Membership": "Couples Special Offer Membership",
    "Couples Special Membership / £0 / partner": "Couples partner",
    "FOUNDER MEMBER (3 month membership only)": "Founder member",
    "★ Pay as you wish Membership ★": "Pay as you wish (legacy £50)",
    "Special Offer 44!": "Special offer 44",
    "Yoga Teacher Membership Package": "Yoga teacher",
    "Special Home Member": "Home member",
    "★ GOLD STAR ★": "Gold star",
    "Natures Rhythm YTT Unlimited Pass": "YTT unlimited pass",
    "Karma Yogi 3 - 4 months": "Karma yogi",
}
# Every option Momo lists as type "Membership" (anything else with an expiry is a class pass)
MEMBERSHIP_TYPE = set(MEMBERSHIP_MAP) | {
    "Integration Supplement Pass", "Basia Coaching Pass", "The Breath Retreat Gratis Pass",
    "Holotropic / Grof Breathwork Community Pass", "•••Psychedelic breathwork / Ecstatic Dance & Kundalini - INCLUDES 2 WEEK OF UNLIMITED YOGA!•••",
    "Thank you. One month gratis membership :)", "EQUINOX CELEBRATIONS - 7 Days Ticket", "Weekly Membership",
    "Test Membership £1", "Harmonia & Eris Weekend ticket (includes full week of unlimited Yoga in the Stars)",
    "2 week guest list friends and family", "1/2 Price £39.50", "3 Weeks Intensive & Unlimited with 1-1 consultation",
    "£33 / month / 3 months / UNLIMITED!", "Less than half price / Unlimited 1 month Membership",
    "Paradhis Pass 3 Months Free Pass - Yoga in the Stars", "Easter Weekend MULTI-DAY EVENT PASS (includes unlimited yoga sessions from now until 15th April)",
    "Star Staff Wellbeing - 3 months", "2 Week Trial Membership", "One Small Test - Try it now before you buy!",
    "Special Offer Membership",
}
GUEST_LIST_MEMBERSHIP = {"2 week guest list friends and family": "Guest list"}
MEMBERSHIP_MAP.update(GUEST_LIST_MEMBERSHIP)

PASS_MAP = {
    "3 Class Pass": "3 Class Pass",
    "THREE MOON PASS": "Three Moon Pass",
    "FULL MOON RITUALS + SPECIAL EVENTS": "Full Moon Rituals + Special Events",
    "10 Class Pass including Rituals and / or Special Events": "10 Class Pass",
}
SKIP_PASS = {"Drop-in"}  # single-class purchases; kept in momo_orders only

def log(*a):
    print(*a, flush=True)

def load_env(path=".env.local"):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def d(s):
    s = (s or "").strip()
    if not s: return None
    try: return dt.date.fromisoformat(s[:10])
    except ValueError: return None

def num(s):
    s = (s or "").strip().replace(",", "")
    if s == "": return None
    try: return float(s)
    except ValueError: return None

def norm_phone(p):
    p = re.sub(r"[^\d+]", "", p or "")
    if not p: return None
    if p.startswith("+"): return p
    if p.startswith("00"): return "+" + p[2:]
    if p.startswith("07") and len(p) == 11: return "+44" + p[1:]
    if p.startswith("447") and len(p) == 12: return "+" + p
    return p  # foreign or odd; keep as given

def norm_email(e):
    return (e or "").strip().lower()

class SB:
    def __init__(self, url, key, dry):
        self.url = url.rstrip("/"); self.key = key; self.dry = dry
    def _req(self, method, path, body=None, headers=None):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if headers: h.update(headers)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    txt = r.read().decode()
                    return r.status, (json.loads(txt) if txt else None)
            except urllib.error.HTTPError as e:
                txt = e.read().decode()
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    time.sleep(2 * (attempt + 1)); continue
                return e.code, (json.loads(txt) if txt.startswith("{") or txt.startswith("[") else txt)
            except (urllib.error.URLError, TimeoutError):
                if attempt < 3: time.sleep(2 * (attempt + 1)); continue
                raise
    def get(self, path): return self._req("GET", path)
    def post(self, path, body, headers=None): return self._req("POST", path, body, headers)
    def patch(self, path, body): return self._req("PATCH", path, body, {"Prefer": "return=representation"})

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", required=True); ap.add_argument("--orders", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="only process the first N members (testing)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    env = load_env()
    sb = SB(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], a.dry_run)

    members = list(csv.DictReader(open(a.members, encoding="utf-8-sig")))
    orders = list(csv.DictReader(open(a.orders, encoding="utf-8-sig")))
    log(f"members {len(members)} orders {len(orders)} dry_run={a.dry_run}")

    # ---- reference data
    st, plans = sb.get("/rest/v1/membership_plans?select=id,name")
    st2, products = sb.get("/rest/v1/class_pass_products?select=id,name")
    plan_id = {p["name"]: p["id"] for p in plans}; product_id = {p["name"]: p["id"] for p in products}
    missing = [v for v in set(MEMBERSHIP_MAP.values()) | {"Momo legacy membership"} if v not in plan_id]
    missing += [v for v in set(PASS_MAP.values()) | {"Momo legacy pass"} if v not in product_id]
    if missing: sys.exit(f"Run migration 0003 first; missing plans/products: {missing}")

    # ---- people: dedupe by email
    by_email = collections.OrderedDict(); dup_rows = []; skipped = []
    for m in members:
        e = norm_email(m["Email address"])
        if "@" not in e: skipped.append({**m, "reason": "no valid email"}); continue
        if e in by_email:
            dup_rows.append({**m, "kept_momo_id": by_email[e]["ID"]})
            # keep the richer record's phone/last class if the first lacks it
            k = by_email[e]
            for f in ("Phone number", "Date of birth", "Last class", "Address", "Postal code", "City"):
                if not k.get(f) and m.get(f): k[f] = m[f]
            if m.get("Status") == "Active": k["Status"] = "Active"
            continue
        by_email[e] = dict(m)
    log(f"unique people {len(by_email)}, duplicates {len(dup_rows)}, skipped {len(skipped)}")
    if a.limit: by_email = collections.OrderedDict(list(by_email.items())[: a.limit])

    # ---- existing profiles (for re-runs and for Sam's own account)
    existing = {}
    off = 0
    while True:
        st, rows = sb.get(f"/rest/v1/profiles?select=id,email,momo_id&offset={off}&limit=1000")
        if not rows: break
        for r in rows: existing[norm_email(r["email"])] = r
        if len(rows) < 1000: break
        off += 1000
    log(f"existing profiles {len(existing)}")

    # ---- 1. auth users + profiles
    user_id = {}; created = 0; updated = 0; errors = []
    for i, (e, m) in enumerate(by_email.items(), 1):
        full_name = f"{m['First name'].strip()} {m['Last name'].strip()}".strip()
        phone = norm_phone(m["Phone number"])
        if e in existing:
            uid = existing[e]["id"]
        else:
            if a.dry_run:
                uid = f"dry-{m['ID']}"
            else:
                st, r = sb.post("/auth/v1/admin/users", {
                    "email": e, "email_confirm": True,
                    "user_metadata": {"full_name": full_name, "phone": phone, "momo_id": int(m["ID"])},
                })
                if st not in (200, 201):
                    errors.append({"email": e, "step": "create user", "status": st, "body": str(r)[:300]}); continue
                uid = r["id"]; created += 1
                time.sleep(0.05)
        user_id[e] = uid
        patch = {
            "full_name": full_name or None,
            "phone": phone,
            "source": "momo" if e not in existing or existing[e].get("momo_id") else "site",
            "date_of_birth": (d(m["Date of birth"]) or None) and d(m["Date of birth"]).isoformat(),
            "gender": (m.get("Gender") or "").strip() or None,
            "address_line": (m.get("Address") or "").strip() or None,
            "postal_code": (m.get("Postal code") or "").strip() or None,
            "city": (m.get("City") or "").strip() or None,
            "momo_id": int(m["ID"]),
            "momo_registered_at": d(m["Registered"]) and d(m["Registered"]).isoformat(),
            "momo_status": (m.get("Status") or "").strip() or None,
            "momo_last_class_at": d(m["Last class"]) and d(m["Last class"]).isoformat(),
            "momo_orders_summary": (m.get("Orders") or "").strip() or None,
        }
        if e in existing and not existing[e].get("momo_id"):
            # a person who already registered on the new site: keep their site details, add Momo history
            for k in ("full_name", "phone", "source"): patch.pop(k, None)
        if not a.dry_run:
            st, r = sb.patch(f"/rest/v1/profiles?id=eq.{uid}", patch)
            if st not in (200, 204): errors.append({"email": e, "step": "profile", "status": st, "body": str(r)[:300]})
            else: updated += 1
        if i % 100 == 0: log(f"  people {i}/{len(by_email)} created={created} updated={updated} errors={len(errors)}")
    log(f"people done: created {created}, updated {updated}, errors {len(errors)}")

    # ---- 2. momo_orders (batched, skip ones already there by invoice number)
    have_keys = set(); off = 0
    while True:
        st, have = sb.get(f"/rest/v1/momo_orders?select=invoice_number,email,invoice_date,pricing_option,price&offset={off}&limit=1000")
        if not have: break
        for r in have: have_keys.add((r.get("invoice_number") or "", (r.get("email") or "").lower(), r.get("invoice_date") or "", r.get("pricing_option") or "", (f"{float(r['price']):.2f}" if r.get("price") is not None else "")))
        if len(have) < 1000: break
        off += 1000
    def okey(o):
        pr = num(o["Price"]); inv_d = d(o["Invoice date"])
        return ((o.get("Invoice number") or "").strip(), norm_email(o["Email address"]), inv_d.isoformat() if inv_d else "", o["Order"], (f"{pr:.2f}" if pr is not None else ""))
    rows = []; unmatched_people = collections.Counter()
    for o in orders:
        inv = (o.get("Invoice number") or "").strip()
        if okey(o) in have_keys: continue
        e = norm_email(o["Email address"]); uid = user_id.get(e)
        if uid is None and "@" in e: unmatched_people[e] += 1
        rows.append({
            "user_id": None if (uid is None or str(uid).startswith("dry-")) else uid,
            "invoice_date": d(o["Invoice date"]) and d(o["Invoice date"]).isoformat(),
            "first_name": o["First name"], "last_name": o["Last name"], "email": o["Email address"],
            "pricing_option": o["Order"], "currency": o["Currency"],
            "price": num(o["Price"]), "tax_percent": num(o["TAX %"]), "tax": num(o["TAX"]), "price_ex_tax": num(o["Price ex TAX"]),
            "promo_code": o["Promo code"] or None, "discount_value": num(o["Discount value"]), "price_for_yogi": num(o["Price for yogi"]),
            "fee": num(o["Fee"]), "ex_fee": num(o["Ex fee"]), "paid": (o["Paid"] == "Yes"),
            "payment_date": d(o["Payment date"]) and d(o["Payment date"]).isoformat(),
            "payment_method": o["Payment method"] or None, "payment_id": o["Payment ID"] or None,
            "credits": int(num(o["Credits"])) if num(o["Credits"]) is not None else None,
            "start_date": d(o["Start date"]) and d(o["Start date"]).isoformat(),
            "expiry_date": d(o["Expiry date"]) and d(o["Expiry date"]).isoformat(),
            "invoice_number": inv or None, "reminded": int(num(o["Reminded"]) or 0),
            "payout_date": d(o["Payout date"]) and d(o["Payout date"]).isoformat(),
            "raw": o,
        })
    log(f"orders to insert {len(rows)} (already present {len(have_keys)}); orders whose person is not a profile: {sum(unmatched_people.values())} across {len(unmatched_people)} emails")
    inserted = 0
    if not a.dry_run:
        for i in range(0, len(rows), 500):
            st, r = sb.post("/rest/v1/momo_orders", rows[i:i+500], {"Prefer": "return=minimal"})
            if st not in (200, 201): errors.append({"email": "", "step": f"orders batch {i}", "status": st, "body": str(r)[:300]})
            else: inserted += len(rows[i:i+500])
        log(f"orders inserted {inserted}")

    # ---- 3. current memberships and passes
    st, have_m = sb.get("/rest/v1/memberships?select=user_id&limit=100000")
    st, have_p = sb.get("/rest/v1/class_passes?select=user_id&limit=100000")
    has_membership = {r["user_id"] for r in (have_m or [])}; has_pass = {r["user_id"] for r in (have_p or [])}
    first_start = collections.defaultdict(lambda: None)
    for o in orders:
        if o["Paid"] != "Yes": continue
        k = (norm_email(o["Email address"]), o["Order"]); sd = d(o["Start date"])
        if sd and (first_start[k] is None or sd < first_start[k]): first_start[k] = sd
    mem_rows = []; pass_rows = []; unmapped = collections.Counter()
    for o in orders:
        if o["Paid"] != "Yes": continue
        exp = d(o["Expiry date"])
        if not exp or exp < TODAY: continue
        e = norm_email(o["Email address"]); uid = user_id.get(e)
        if uid is None: continue
        name = o["Order"]; sd = d(o["Start date"]) or d(o["Invoice date"]) or TODAY
        if name in MEMBERSHIP_TYPE:
            if uid in has_membership: continue
            pname = MEMBERSHIP_MAP.get(name, "Momo legacy membership")
            if pname == "Momo legacy membership": unmapped[name] += 1
            mem_rows.append({"user_id": uid, "plan_id": plan_id[pname], "status": "active",
                             "current_period_start": sd.isoformat(), "current_period_end": exp.isoformat(),
                             "started_at": (first_start[(e, name)] or sd).isoformat()})
        elif name in SKIP_PASS:
            continue
        else:
            if uid in has_pass: continue
            credits = int(num(o["Credits"]) or 0)
            if credits <= 0: continue
            pname = PASS_MAP.get(name, "Momo legacy pass")
            if pname == "Momo legacy pass": unmapped[name] += 1
            # Momo's Credits column is the credits REMAINING; the total comes from the product
            total = {"3 Class Pass": 3, "Three Moon Pass": 3, "10 Class Pass": 10}.get(pname, max(credits, 1))
            pass_rows.append({"user_id": uid, "product_id": product_id[pname], "credits_total": max(total, credits),
                              "credits_remaining": credits, "expires_at": exp.isoformat(), "created_at": sd.isoformat()})
    log(f"memberships to create {len(mem_rows)}, passes to create {len(pass_rows)}; unmapped option names → legacy: {dict(unmapped)}")
    if not a.dry_run:
        for label, path, rws in (("memberships", "/rest/v1/memberships", mem_rows), ("passes", "/rest/v1/class_passes", pass_rows)):
            rws = [r for r in rws if not str(r["user_id"]).startswith("dry-")]
            for i in range(0, len(rws), 500):
                st, r = sb.post(path, rws[i:i+500], {"Prefer": "return=minimal"})
                if st not in (200, 201): errors.append({"email": "", "step": f"{label} batch {i}", "status": st, "body": str(r)[:300]})
            log(f"{label} inserted {len(rws)}")

    # ---- reports
    def w(name, rws):
        if not rws: return
        with open(os.path.join(a.out, name), "w", newline="", encoding="utf-8") as f:
            wr = csv.DictWriter(f, fieldnames=list(rws[0].keys())); wr.writeheader(); wr.writerows(rws)
    w("duplicates.csv", dup_rows); w("skipped.csv", skipped); w("errors.csv", errors)
    w("orders-without-profile.csv", [{"email": k, "orders": v} for k, v in unmatched_people.most_common()])
    with open(os.path.join(a.out, "import-summary.txt"), "w") as f:
        f.write(f"run {dt.datetime.now().isoformat()} dry_run={a.dry_run}\n"
                f"members {len(members)} unique {len(by_email)} duplicates {len(dup_rows)} skipped {len(skipped)}\n"
                f"users created {created} profiles updated {updated}\n"
                f"orders inserted {inserted if not a.dry_run else len(rows)} (planned {len(rows)})\n"
                f"memberships {len(mem_rows)} passes {len(pass_rows)} unmapped {dict(unmapped)}\n"
                f"errors {len(errors)}\n")
    log("done; reports in", a.out)

if __name__ == "__main__":
    main()
