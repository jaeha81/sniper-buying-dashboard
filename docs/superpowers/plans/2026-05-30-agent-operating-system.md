# Agent Operating System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hybrid five-agent operating layer for Sniper Buying Dashboard without committing or pushing.

**Architecture:** Supabase persists agent runs, tasks, findings, and automation logs. Next.js API routes enforce admin authentication and Make.com webhook secrets. The admin UI exposes `/admin/agent-command` as the command center for all five agents.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL, existing admin cookie auth, Make.com webhooks.

---

## File Map

- `supabase/migrations/003_agent_operating_system.sql`: create `automation_logs`, `agent_runs`, `agent_tasks`, `agent_findings`.
- `lib/agents.ts`: shared agent enums, labels, action policy, priority helper.
- `lib/types.ts`: export agent types for app-wide use.
- `app/api/agent-command/route.ts`: command center summary endpoint.
- `app/api/agent-tasks/route.ts`: list/create agent tasks.
- `app/api/agent-tasks/[id]/route.ts`: approve/reject/update agent tasks.
- `app/api/automation-logs/route.ts`: keep admin GET and add secret-protected POST.
- `app/admin/agent-command/page.tsx`: admin command center UI.
- `app/admin/page.tsx`: add command center entry point.
- `app/admin/product-candidates/page.tsx`: replace alert-only approve/reject with task-backed flow.

## Task 1: Agent Contracts

**Files:**
- Create: `lib/agents.ts`
- Create: `lib/agents.typecheck.ts`
- Modify: `lib/types.ts`

- [x] **Step 1: Write the compile-time contract check**

`lib/agents.typecheck.ts` must import `AGENT_TYPES`, `AGENT_TYPE_LABELS`, `RISKY_AGENT_ACTIONS`, `requiresApproval`, and `getAgentTaskPriority`.

- [x] **Step 2: Verify RED**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected before implementation: FAIL because `./agents` does not exist.

- [x] **Step 3: Implement shared agent contracts**

`lib/agents.ts` defines:
- `AgentType`
- `AgentTaskStatus`
- `AgentTaskPriority`
- `AgentFindingSeverity`
- `AgentActionType`
- labels for all five agents
- risky action list
- `requiresApproval`
- `getAgentTaskPriority`

- [x] **Step 4: Verify GREEN**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: PASS.

## Task 2: Supabase Migration

**Files:**
- Create: `supabase/migrations/003_agent_operating_system.sql`

- [ ] **Step 1: Add `automation_logs`**

Create the table currently expected by `app/api/automation-logs/route.ts`:

```sql
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT NOT NULL,
  scenario_id TEXT,
  trigger_type TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','failed','partial')),
  ops_consumed INTEGER NOT NULL DEFAULT 0,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  error_detail JSONB,
  payload JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Add agent tables**

Create `agent_runs`, `agent_tasks`, and `agent_findings` with `agent_type`, status, priority, action type, target references, JSON payload, timestamps, and indexes.

- [ ] **Step 3: Add RLS**

Enable RLS and add `service_role` policies for all four tables. Browser clients should not have direct write policies.

## Task 3: API Routes

**Files:**
- Create: `app/api/agent-command/route.ts`
- Create: `app/api/agent-tasks/route.ts`
- Create: `app/api/agent-tasks/[id]/route.ts`
- Modify: `app/api/automation-logs/route.ts`

- [ ] **Step 1: Add row mappers**

Map snake_case Supabase rows to camelCase API DTOs. Keep PII out of command summaries unless the route is admin-only and the UI needs it.

- [ ] **Step 2: Implement `GET /api/agent-command`**

Use existing `cookies()` plus `isAdminAuthenticated(cookieStore)`. Return 401 when unauthenticated. Query:
- pending agent tasks
- critical findings
- failed automation logs
- active products with `margin_rate < 15`
- pending/ordered orders older than 24 hours

- [ ] **Step 3: Implement task list/create**

`GET /api/agent-tasks` lists tasks. `POST /api/agent-tasks` creates a task and forces `requires_approval = true` for risky actions from `requiresApproval`.

- [ ] **Step 4: Implement task state changes**

`PUT /api/agent-tasks/[id]` accepts `{ action: 'approve' | 'reject' | 'complete' | 'fail' | 'cancel' }` and updates status plus reviewer note fields.

- [ ] **Step 5: Add automation log POST**

Require `AUTOMATION_WEBHOOK_SECRET`. Accept either:
- `Authorization: Bearer <secret>`
- `x-automation-secret: <secret>`

Return 401 when missing or wrong.

## Task 4: Admin Command UI

**Files:**
- Create: `app/admin/agent-command/page.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Build agent status cards**

Render all five agent cards from `AGENT_TYPES` and `AGENT_TYPE_LABELS`.

- [ ] **Step 2: Build task queues**

Show pending task title, priority, action label, recommendation, and approve/reject buttons.

- [ ] **Step 3: Build risk and automation sections**

Show critical findings and failed automation logs. Use compact cards, not nested cards.

- [ ] **Step 4: Link from admin home**

Add an entry button or card to `/admin/agent-command`.

## Task 5: Product Candidate Integration

**Files:**
- Modify: `app/admin/product-candidates/page.tsx`

- [ ] **Step 1: Replace alert-only handlers**

On approve/reject, call `/api/agent-tasks` with:
- `agentType = 'product_discovery'`
- `actionType = 'approve_product'` for approval
- `actionType = 'review_candidate'` with rejection recommendation for rejection

- [ ] **Step 2: Keep UI responsive**

Disable the clicked button while the request is running and show success/failure state.

## Task 6: Verification

**Commands:**

```powershell
npm.cmd run build
npx.cmd tsc --noEmit
```

- [ ] Build passes.
- [ ] Typecheck passes.
- [ ] Unauthenticated admin API calls return 401.
- [ ] Automation log POST without secret returns 401.
- [ ] All five agent literals appear in `lib/agents.ts` and `/admin/agent-command`.

## Completion Notes

Do not commit or push. After implementation, report:
- changed files
- verification commands and results
- remaining known gaps
- whether all five agents are present in DB, API, and UI
