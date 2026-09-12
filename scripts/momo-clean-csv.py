#!/usr/bin/env python3
"""Builds one clean people CSV from the Momo exports: every person, tidied, with
their current entitlements, spend, last class and a segment. Nothing dropped.
Usage: python3 scripts/momo-clean-csv.py --members <Members.csv> --orders <Orders.csv> --out <people.csv>
"""
import argparse, csv, re, collections, datetime as dt
TODAY = dt.date.today()
def d(s):
    s = (s or "").strip()
    try: return dt.date.fromisoformat(s[:10]) if s else None
    except ValueError: return None
def norm_phone(p):
    p = re.sub(r"[^\d+]", "", p or "")
    if not p: return ""
    if p.startswith("+"): return p
    if p.startswith("00"): return "+" + p[2:]
    if p.startswith("07") and len(p) == 11: return "+44" + p[1:]
    return p
ap = argparse.ArgumentParser(); ap.add_argument("--members", required=True); ap.add_argument("--orders", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
members = list(csv.DictReader(open(a.members, encoding="utf-8-sig")))
orders = list(csv.DictReader(open(a.orders, encoding="utf-8-sig")))
by_email = collections.defaultdict(list)
for o in orders: by_email[o["Email address"].strip().lower()].append(o)
out = []
for m in members:
    e = m["Email address"].strip().lower(); os_ = by_email.get(e, [])
    paid = [o for o in os_ if o["Paid"] == "Yes"]
    current = [o for o in paid if d(o["Expiry date"]) and d(o["Expiry date"]) >= TODAY]
    spend = sum(float(o["Price"] or 0) for o in paid)
    last = d(m["Last class"]); days = (TODAY - last).days if last else None
    if current and any(float(o["Price"] or 0) > 0 for o in current): seg = "paying now"
    elif current: seg = "free entitlement now"
    elif days is not None and days <= 90: seg = "recent, lapsed"
    elif days is not None and days <= 365: seg = "lapsed this year"
    elif last: seg = "lapsed over a year"
    else: seg = "never attended"
    out.append({
        "momo_id": m["ID"], "first_name": m["First name"].strip(), "last_name": m["Last name"].strip(),
        "email": e, "phone_raw": m["Phone number"], "phone_e164": norm_phone(m["Phone number"]),
        "date_of_birth": m["Date of birth"], "gender": m["Gender"], "address": m["Address"], "postal_code": m["Postal code"], "city": m["City"],
        "registered": m["Registered"], "momo_status": m["Status"], "momo_current_options": m["Orders"],
        "last_class": m["Last class"], "days_since_last_class": days if days is not None else "",
        "orders_total": len(os_), "orders_paid": len(paid), "lifetime_spend_gbp": f"{spend:.2f}",
        "first_order": min((o["Invoice date"] for o in os_), default=""), "last_order": max((o["Invoice date"] for o in os_), default=""),
        "current_entitlements": " | ".join(f"{o['Order']} (to {o['Expiry date']})" for o in current),
        "failed_payments_90d": sum(1 for o in os_ if o["Paid"] == "No" and d(o["Invoice date"]) and (TODAY - d(o["Invoice date"])).days <= 90),
        "promo_codes_used": " | ".join(sorted({o["Promo code"] for o in os_ if o["Promo code"]})),
        "segment": seg,
    })
with open(a.out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
print("wrote", a.out, len(out), "people;", dict(collections.Counter(r["segment"] for r in out)))
