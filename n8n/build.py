#!/usr/bin/env python3
"""Generates the two n8n workflow files in this folder. Run: python3 n8n/build.py"""
import json, os

HERE = os.path.dirname(__file__)

# ---------------------------------------------------------------------------
# 1. Outbox tick: every minute, ask the site to flush its outbox to this n8n.
# ---------------------------------------------------------------------------
tick = {
    "name": "YITS · Outbox tick (every minute)",
    "nodes": [
        {
            "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 1}]}},
            "id": "schedule", "name": "Every minute", "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [0, 0],
        },
        {
            "parameters": {
                "url": "https://yoga-in-the-stars.vercel.app/api/cron/outbox",
                "sendHeaders": True,
                "headerParameters": {"parameters": [{"name": "Authorization", "value": "Bearer REPLACE_WITH_CRON_SECRET"}]},
                "options": {"timeout": 55000},
            },
            "id": "http", "name": "Flush outbox", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [260, 0],
        },
    ],
    "connections": {"Every minute": {"main": [[{"node": "Flush outbox", "type": "main", "index": 0}]]}},
    "settings": {"executionOrder": "v1"},
}

# ---------------------------------------------------------------------------
# 2. Events → WhatsApp. One webhook, one code node with all the wording,
#    one HTTP node that sends template messages through Meta's Graph API.
# ---------------------------------------------------------------------------
BUILD_MESSAGES = r"""
// Every outbox event from the site arrives here. Return one item per WhatsApp
// message to send: { to, template, params }. Templates must exist (approved) in
// WhatsApp Manager with the same names and parameter counts. See n8n/README.md.
//
// Wording lives in the templates themselves; here we only choose WHO gets WHAT
// and fill the placeholders.

const ev = $input.first().json.body ?? $input.first().json;
const { type, user, payload = {}, club = {} } = ev;
const out = [];

const first = (name) => (name || 'there').split(' ')[0];
const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const timeOnly = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const canMessage = (p) => p && p.phone && p.whatsapp_opt_in;
const teamAlert = (text) => { for (const to of club.team_numbers || []) out.push({ to, template: 'yits_team_alert', params: [text] }); };

switch (type) {
  case 'user.registered':
    teamAlert(`New registration: ${user?.full_name || user?.email}`);
    break;

  case 'membership.purchased':
  case 'membership.granted':
    teamAlert(`${user?.full_name || user?.email} just joined: ${payload.plan}. First purchase, say hello!`);
    if (canMessage(user)) out.push({ to: user.phone, template: 'yits_welcome', params: [first(user.full_name), payload.plan || 'membership', club.community_url || club.site_url] });
    break;

  case 'membership.payment_failed':
    teamAlert(`Payment failed for ${user?.full_name || user?.email} (${payload.plan}). They've been emailed a link to update their card.`);
    break;

  case 'membership.cancelled':
    teamAlert(`${user?.full_name || user?.email} cancelled their ${payload.plan}. Worth a message?`);
    break;

  case 'booking.reminder':
    if (canMessage(user)) out.push({ to: user.phone, template: 'yits_reminder', params: [first(user.full_name), payload.class_name, timeOnly(payload.starts_at)] });
    break;

  case 'booking.promoted':
    if (canMessage(user)) out.push({ to: user.phone, template: 'yits_promoted', params: [first(user.full_name), payload.class_name, when(payload.starts_at)] });
    break;

  case 'session.cancelled': {
    const affected = payload.affected || [];
    const messaged = affected.filter(canMessage);
    for (const p of messaged) out.push({ to: p.phone, template: 'yits_cancelled', params: [first(p.full_name), payload.class_name, when(payload.starts_at), payload.reason || ''] });
    teamAlert(`${payload.class_name} on ${when(payload.starts_at)} cancelled. ${affected.length} booked; ${messaged.length} sent a WhatsApp, the rest emailed.${(payload.paid_bookings || []).length ? ` ${payload.paid_bookings.length} paid drop-in(s) to refund.` : ''}`);
    break;
  }
    break;

  case 'engagement.flag_changed':
    if (payload.to === 'orange' && canMessage(user)) out.push({ to: user.phone, template: 'yits_checkin', params: [first(user.full_name)] });
    if (payload.to === 'red') teamAlert(`${payload.name || user?.full_name} has gone red (last class ${payload.last_attended_at ? when(payload.last_attended_at) : 'never'}). Time for a real conversation.`);
    break;

  case 'broadcast.whatsapp':
    if (payload.phone) out.push({ to: payload.phone, template: 'yits_broadcast', params: [payload.message] });
    break;

  case 'class_pass.expiring':
    if (canMessage(user)) out.push({ to: user.phone, template: 'yits_pass_expiring', params: [first(user.full_name), String(payload.credits_remaining), when(payload.expires_at)] });
    break;

  default:
    // booking.created, class_pass.purchased, event_ticket.purchased etc. are emailed by the site. Nothing to do here.
    break;
}

// Normalise numbers to digits only (Meta wants no +, spaces or dashes).
return out.map((m) => ({ json: { ...m, to: String(m.to).replace(/[^0-9]/g, '') } }));
"""

events = {
    "name": "YITS · Events → WhatsApp",
    "nodes": [
        {
            "parameters": {"httpMethod": "POST", "path": "stars", "responseMode": "onReceived", "options": {}},
            "id": "webhook", "name": "Outbox event", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
            "webhookId": "yits-outbox",
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                    "conditions": [{"id": "secret", "leftValue": "={{ $json.headers['x-stars-secret'] }}", "rightValue": "REPLACE_WITH_OUTBOX_SECRET", "operator": {"type": "string", "operation": "equals"}}],
                    "combinator": "and",
                },
                "options": {},
            },
            "id": "if", "name": "Secret matches?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [240, 0],
        },
        {
            "parameters": {"jsCode": BUILD_MESSAGES.strip()},
            "id": "code", "name": "Build messages", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [480, -80],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "=https://graph.facebook.com/v21.0/REPLACE_WITH_PHONE_NUMBER_ID/messages",
                "sendHeaders": True,
                "headerParameters": {"parameters": [
                    {"name": "Authorization", "value": "Bearer REPLACE_WITH_WHATSAPP_ACCESS_TOKEN"},
                    {"name": "Content-Type", "value": "application/json"},
                ]},
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.to, type: 'template', template: { name: $json.template, language: { code: 'en_GB' }, components: [{ type: 'body', parameters: ($json.params || []).map(p => ({ type: 'text', text: String(p ?? '') })) }] } }) }}",
                "options": {},
            },
            "id": "send", "name": "Send WhatsApp template", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [740, -80],
        },
    ],
    "connections": {
        "Outbox event": {"main": [[{"node": "Secret matches?", "type": "main", "index": 0}]]},
        "Secret matches?": {"main": [[{"node": "Build messages", "type": "main", "index": 0}], []]},
        "Build messages": {"main": [[{"node": "Send WhatsApp template", "type": "main", "index": 0}]]},
    },
    "settings": {"executionOrder": "v1"},
}

with open(os.path.join(HERE, "outbox-tick.json"), "w") as f:
    json.dump(tick, f, indent=2)
with open(os.path.join(HERE, "events-to-whatsapp.json"), "w") as f:
    json.dump(events, f, indent=2)
print("wrote n8n/outbox-tick.json and n8n/events-to-whatsapp.json")

# ---------------------------------------------------------------------------
# 3. Uptime monitor: every 5 minutes GET /api/health; email Sam when it turns
#    bad, and once more when it recovers (state kept in workflow static data).
# ---------------------------------------------------------------------------
MONITOR_CODE = r"""
const res = $input.first().json;
const status = res.status || 'unknown';
const bad = status === 'problem' || status === 'down';
const st = $getWorkflowStaticData('global');
const wasBad = !!st.bad;
st.bad = bad;
st.lastChecked = new Date().toISOString();
if (bad) st.badSince = st.badSince || st.lastChecked; else st.badSince = null;
const failing = (res.checks || []).filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`);
const notes = (res.checks || []).filter(c => c.ok && c.warn).map(c => `${c.name}: ${c.detail}`);
let subject = null, text = null;
if (bad && !wasBad) {
  subject = 'Yoga in the Stars site: PROBLEM';
  text = `The health check just failed at ${st.lastChecked}.\n\nFailing:\n- ${failing.join('\n- ') || res.error || 'no detail'}\n\n${notes.length ? 'Notes:\n- ' + notes.join('\n- ') + '\n\n' : ''}Check https://yoga-in-the-stars.vercel.app/admin/health`;
} else if (!bad && wasBad) {
  subject = 'Yoga in the Stars site: recovered';
  text = `All checks pass again as of ${st.lastChecked}.`;
}
return subject ? [{ json: { subject, text } }] : [];
"""

monitor = {
    "name": "YITS · Uptime monitor (every 5 min)",
    "nodes": [
        {"parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}}, "id": "sched", "name": "Every 5 minutes", "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [0, 0]},
        {
            "parameters": {"url": "https://yoga-in-the-stars.vercel.app/api/health", "options": {"timeout": 20000, "response": {"response": {"neverError": True, "responseFormat": "json"}}}},
            "id": "http", "name": "GET /api/health", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [240, 0],
            "onError": "continueRegularOutput",
        },
        {"parameters": {"jsCode": MONITOR_CODE.strip()}, "id": "code", "name": "Changed state?", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [480, 0]},
        {
            "parameters": {"sendTo": "sam.allen101@gmail.com", "subject": "={{ $json.subject }}", "emailType": "text", "message": "={{ $json.text }}", "options": {}},
            "id": "gmail", "name": "Email Sam", "type": "n8n-nodes-base.gmail", "typeVersion": 2.1, "position": [720, 0],
            "credentials": {"gmailOAuth2": {"id": "JUcRN0VawbhMTeUq", "name": "Gmail account"}},
        },
    ],
    "connections": {
        "Every 5 minutes": {"main": [[{"node": "GET /api/health", "type": "main", "index": 0}]]},
        "GET /api/health": {"main": [[{"node": "Changed state?", "type": "main", "index": 0}]]},
        "Changed state?": {"main": [[{"node": "Email Sam", "type": "main", "index": 0}]]},
    },
    "settings": {"executionOrder": "v1"},
}
with open(os.path.join(HERE, "uptime-monitor.json"), "w") as f:
    json.dump(monitor, f, indent=2)
print("wrote n8n/uptime-monitor.json")
