#!/usr/bin/env python3
"""Submit the club's WhatsApp message templates to Meta for approval.

  META_TOKEN=... python3 n8n/submit-templates.py <WABA_ID> [--dry-run]

Reads n8n/whatsapp-templates.json and POSTs each template to
https://graph.facebook.com/v21.0/<WABA_ID>/message_templates. Templates that
already exist (same name + language) are skipped. Approval status can be read
back with --status. Safe to re-run.
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse

API = "https://graph.facebook.com/v21.0"


def call(method, path, token, body=None, params=None):
    url = f"{API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        sys.exit(__doc__)
    waba = args[0]
    token = os.environ.get("META_TOKEN", "").strip()
    if not token and "--dry-run" not in flags:
        sys.exit("META_TOKEN missing (System User token with whatsapp_business_management)")

    spec = json.load(open(os.path.join(os.path.dirname(__file__), "whatsapp-templates.json")))
    templates = spec["templates"]

    if "--status" in flags:
        st, res = call("GET", f"{waba}/message_templates", token, params={"fields": "name,status,category,rejected_reason,language", "limit": 100})
        for t in sorted(res.get("data", []), key=lambda t: t["name"]):
            print(f"{t['name']:<24} {t['language']:<6} {t['category']:<10} {t['status']}" + (f"  ({t.get('rejected_reason')})" if t.get("rejected_reason") else ""))
        return

    existing = set()
    if "--dry-run" not in flags:
        st, res = call("GET", f"{waba}/message_templates", token, params={"fields": "name,language", "limit": 100})
        existing = {(t["name"], t["language"]) for t in res.get("data", [])}

    for t in templates:
        key = (t["name"], t["language"])
        if key in existing:
            print(f"skip   {t['name']} (already submitted)")
            continue
        if "--dry-run" in flags:
            print(f"would  {t['name']} [{t['category']}] {t['components'][0]['text'][:60]}...")
            continue
        st, res = call("POST", f"{waba}/message_templates", token, body=t)
        if st in (200, 201):
            print(f"sent   {t['name']} -> {res.get('status', 'PENDING')} (id {res.get('id')})")
        else:
            print(f"FAILED {t['name']}: {res.get('error', {}).get('message', res)}")


if __name__ == "__main__":
    main()
