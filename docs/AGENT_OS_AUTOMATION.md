# Agent OS Automation Runbook

## Purpose

`POST /api/agent-runs` is the common execution endpoint for Sniper's five-agent operating system.
It can be called by Make.com with `AUTOMATION_WEBHOOK_SECRET` or by an authenticated admin from
`/admin/agent-command`.

The endpoint does not directly change prices, product status, order status, or customer notices.
It scans Supabase state and creates approval-backed records:

- `agent_runs`: one run record for each of the five agents
- `agent_tasks`: approval queue items for risky actions
- `agent_findings`: margin, order, automation, and compliance findings
- `automation_logs`: one scan execution log

## Make.com HTTP Module

```text
Method: POST
URL: https://{your-domain}/api/agent-runs
Headers:
  Content-Type: application/json
  x-automation-secret: {{AUTOMATION_WEBHOOK_SECRET}}
Body:
  { "triggerType": "scheduled" }
```

Allowed `triggerType` values:

- `scheduled`
- `make_webhook`
- `manual_admin`

## Agent Decisions

- `product_discovery`: creates review tasks for candidate products with high Sniper scores.
- `margin_pricing`: creates findings and approval tasks for products below the margin threshold.
- `order_ops`: creates follow-up tasks for pending or ordered orders older than 24 hours.
- `compliance_risk`: creates risk findings and inspection tasks for high-risk or low-automation products.
- `command_center`: creates review tasks for failed Make.com scenarios.

## Required Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SESSION_SECRET`
- `AUTOMATION_WEBHOOK_SECRET`

## Safety Rules

- Make.com must never call browser-facing Supabase keys for service-role writes.
- Risky actions remain approval-gated in `agent_tasks`.
- Repeated scans skip existing active tasks and unresolved findings for the same agent/action/target.
