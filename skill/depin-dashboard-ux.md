# DePIN Dashboard UX — Node Operator Interfaces

> Load this skill for building dashboards for DePIN node operators.
> Node operators are a distinct user class: they are technical, they care about uptime
> and earnings, and they make configuration decisions with financial consequences.
>
> Cross-skill: pairs with `solana-depin-builder-skill` for the on-chain data layer.

---

## The Node Operator User Model

```
WHO THEY ARE:
  ├── Technical hobbyist running 1-5 nodes at home
  ├── Professional operator running 50-5000 nodes at datacenter scale
  └── Institutional operator with automated fleet management

WHAT THEY CARE ABOUT (priority order):
  1. Am I earning? (rewards per epoch, projected APY, missed rewards)
  2. Are my nodes healthy? (uptime %, connectivity, last heartbeat)
  3. Did I get slashed? (slash events, jailed nodes, appeal status)
  4. What do I need to do? (pending claims, configuration changes, software updates)
  5. How do I compare? (ranking vs other operators, network share)

THEIR FAILURE MODES (design around these):
  ├── Missed a slash because dashboard didn't alert them
  ├── Node went offline, didn't notice for 6 hours, lost epoch rewards
  ├── Claimed rewards but forgot to re-stake → earning less than expected
  └── Didn't upgrade node software before deadline → compatibility failure
```

---

## Dashboard Layout Architecture

```
OPERATOR DASHBOARD — 3-PANEL LAYOUT

TOP ROW: Summary Stats (always visible, 5-second refresh)
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  Total Nodes    │  Uptime (30d)   │  Pending Earn.  │  Health Score   │
│  47 / 50 active │  99.2%          │  1,240 TOKENS   │  92 / 100       │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘

MIDDLE ROW: Node Fleet Table (paginated, sortable)
┌──────────────────────────────────────────────────────────────────────┐
│  NODE ID  │  STATUS  │  UPTIME  │  LAST SEEN  │  EPOCH REWARD  │  ⚙  │
│  node-001 │  🟢 OK   │  100%    │  12s ago    │  24.5 TKN      │  ...│
│  node-007 │  🔴 DOWN │  87%     │  6h ago     │  0.0 TKN       │  ...│
│  node-023 │  🟡 WARN │  95%     │  3m ago     │  18.2 TKN      │  ...│
└──────────────────────────────────────────────────────────────────────┘

BOTTOM ROW: Charts (earnings history, uptime trend, network rank)
```

---

## Core Dashboard Components

### Summary Stats Row

```tsx
// components/operator/NodeSummaryStats.tsx
import { useQuery } from "@tanstack/react-query";
import { Connection, PublicKey } from "@solana/web3.js";

interface OperatorStats {
  totalNodes: number;
  activeNodes: number;
  uptimePct30d: number;
  pendingRewards: number;       // in token base units
  rewardTokenSymbol: string;
  healthScore: number;          // 0-100
  epochsWithFullUptime: number;
  slashCount30d: number;
}

export function NodeSummaryStats({ operatorAddress }: { operatorAddress: string }) {
  const { data: stats, isLoading } = useQuery<OperatorStats>({
    queryKey: ["operator-stats", operatorAddress],
    queryFn: () => fetchOperatorStats(operatorAddress),
    refetchInterval: 5_000, // 5-second refresh
    staleTime: 3_000,
  });

  if (isLoading) return <StatsSkeleton />;

  const healthColor =
    (stats?.healthScore ?? 0) >= 90 ? "text-emerald-600 dark:text-emerald-400" :
    (stats?.healthScore ?? 0) >= 70 ? "text-yellow-600 dark:text-yellow-400" :
    "text-destructive";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Active Nodes"
        value={`${stats?.activeNodes ?? 0} / ${stats?.totalNodes ?? 0}`}
        subtext={stats && stats.activeNodes < stats.totalNodes
          ? `${stats.totalNodes - stats.activeNodes} offline`
          : "All online"}
        alertLevel={stats && stats.activeNodes < stats.totalNodes ? "warn" : "ok"}
      />
      <StatCard
        label="30d Uptime"
        value={`${stats?.uptimePct30d.toFixed(2) ?? "—"}%`}
        subtext={`${stats?.epochsWithFullUptime ?? 0} full epochs`}
        alertLevel={(stats?.uptimePct30d ?? 100) < 95 ? "warn" : "ok"}
      />
      <StatCard
        label="Pending Rewards"
        value={formatTokenAmount(stats?.pendingRewards ?? 0, stats?.rewardTokenSymbol)}
        subtext="Click to claim"
        action="claim"
      />
      <StatCard
        label="Health Score"
        value={`${stats?.healthScore ?? 0} / 100`}
        valueClassName={healthColor}
        subtext={stats?.slashCount30d ? `${stats.slashCount30d} slash events` : "No slashes"}
        alertLevel={(stats?.slashCount30d ?? 0) > 0 ? "critical" : "ok"}
      />
    </div>
  );
}

function StatCard({
  label, value, subtext, alertLevel, action, valueClassName
}: {
  label: string;
  value: string;
  subtext?: string;
  alertLevel?: "ok" | "warn" | "critical";
  action?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`rounded-lg border p-4 bg-card ${
      alertLevel === "critical" ? "border-destructive" :
      alertLevel === "warn" ? "border-yellow-500" : ""
    }`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${valueClassName ?? "text-foreground"}`}>
        {value}
      </p>
      {subtext && (
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}
```

---

### Node Fleet Table

```tsx
// components/operator/NodeFleetTable.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type NodeStatus = "active" | "offline" | "warning" | "jailed" | "upgrading";

interface NodeRow {
  nodeId: string;
  address: string;
  status: NodeStatus;
  uptimePct7d: number;
  lastHeartbeat: number; // unix timestamp
  epochReward: number;
  totalEarned: number;
  version: string;
  latestVersion: string; // for update badge
  slashRisk: "low" | "medium" | "high";
}

const STATUS_CONFIG: Record<NodeStatus, { icon: string; label: string; className: string }> = {
  active:    { icon: "🟢", label: "Active",    className: "text-emerald-600 dark:text-emerald-400" },
  warning:   { icon: "🟡", label: "Warning",   className: "text-yellow-600 dark:text-yellow-400" },
  offline:   { icon: "🔴", label: "Offline",   className: "text-destructive" },
  jailed:    { icon: "⛔", label: "Jailed",    className: "text-destructive font-bold" },
  upgrading: { icon: "🔵", label: "Upgrading", className: "text-primary" },
};

export function NodeFleetTable({ operatorAddress }: { operatorAddress: string }) {
  const [sortField, setSortField] = useState<keyof NodeRow>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<NodeStatus | "all">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data: nodes = [] } = useQuery<NodeRow[]>({
    queryKey: ["node-fleet", operatorAddress, page],
    queryFn: () => fetchNodeFleet(operatorAddress, page, PAGE_SIZE),
    refetchInterval: 10_000,
  });

  const filtered = filter === "all" ? nodes : nodes.filter((n) => n.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortField], vb = b[sortField];
    return sortDir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  function toggleSort(field: keyof NodeRow) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const offlineCount = nodes.filter((n) => n.status === "offline").length;
  const jailedCount = nodes.filter((n) => n.status === "jailed").length;

  return (
    <div className="space-y-3">
      {/* Alert banner for critical states */}
      {jailedCount > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          ⛔ {jailedCount} node{jailedCount > 1 ? "s" : ""} jailed — review slash conditions and file an appeal
        </div>
      )}
      {offlineCount > 0 && jailedCount === 0 && (
        <div className="rounded-md border border-yellow-500 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          🔴 {offlineCount} node{offlineCount > 1 ? "s" : ""} offline — check connectivity
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "active", "warning", "offline", "jailed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {f === "all" ? `All (${nodes.length})` : `${STATUS_CONFIG[f]?.icon} ${f} (${nodes.filter(n => n.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {[
                { key: "nodeId", label: "Node" },
                { key: "status", label: "Status" },
                { key: "uptimePct7d", label: "7d Uptime" },
                { key: "lastHeartbeat", label: "Last Seen" },
                { key: "epochReward", label: "Epoch Reward" },
                { key: "version", label: "Version" },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort(key as keyof NodeRow)}
                >
                  {label} {sortField === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((node) => {
              const cfg = STATUS_CONFIG[node.status];
              const lastSeenSec = Math.floor(Date.now() / 1000) - node.lastHeartbeat;
              const isOutdated = node.version !== node.latestVersion;

              return (
                <tr key={node.nodeId} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{node.nodeId}</td>
                  <td className={`px-3 py-2 ${cfg.className}`}>{cfg.icon} {cfg.label}</td>
                  <td className="px-3 py-2">
                    <span className={node.uptimePct7d < 95 ? "text-destructive" : ""}>
                      {node.uptimePct7d.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatRelativeTime(lastSeenSec)}
                  </td>
                  <td className="px-3 py-2">
                    {formatTokenAmount(node.epochReward, "TKN")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={isOutdated ? "text-yellow-600 dark:text-yellow-400" : ""}>
                      v{node.version} {isOutdated ? `→ v${node.latestVersion}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <NodeActionsMenu node={node} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>Showing {Math.min(PAGE_SIZE, sorted.length)} of {nodes.length} nodes</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
    </div>
  );
}
```

---

### Earnings Chart

```tsx
// components/operator/EarningsChart.tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface EpochEarning {
  epoch: number;
  reward: number;
  uptimePct: number;
  slashed: boolean;
}

export function EarningsChart({ operatorAddress, epochs = 30 }: {
  operatorAddress: string;
  epochs?: number;
}) {
  const { data: history = [] } = useQuery<EpochEarning[]>({
    queryKey: ["earnings-history", operatorAddress, epochs],
    queryFn: () => fetchEarningsHistory(operatorAddress, epochs),
    staleTime: 60_000,
  });

  const maxReward = Math.max(...history.map((h) => h.reward), 1);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">Earnings — Last {epochs} Epochs</p>
        <p className="text-xs text-muted-foreground">
          Total: {formatTokenAmount(history.reduce((s, h) => s + h.reward, 0), "TKN")}
        </p>
      </div>

      {/* Bar chart — pure CSS, no library dependency */}
      <div className="flex items-end gap-0.5 h-24">
        {history.map((ep) => (
          <div
            key={ep.epoch}
            className="flex-1 flex flex-col justify-end group relative"
            title={`Epoch ${ep.epoch}: ${formatTokenAmount(ep.reward, "TKN")} (${ep.uptimePct.toFixed(1)}% uptime)`}
          >
            <div
              className={`w-full rounded-t-sm transition-all ${
                ep.slashed ? "bg-destructive" :
                ep.uptimePct >= 99 ? "bg-primary" :
                ep.uptimePct >= 95 ? "bg-yellow-500" : "bg-muted-foreground"
              }`}
              style={{ height: `${(ep.reward / maxReward) * 100}%`, minHeight: ep.reward > 0 ? "2px" : "0" }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded px-2 py-1 whitespace-nowrap z-10 border">
              Epoch {ep.epoch}: {formatTokenAmount(ep.reward, "TKN")}
              {ep.slashed && " ⚠️ SLASHED"}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block w-2 h-2 bg-primary rounded mr-1" />Full uptime</span>
        <span><span className="inline-block w-2 h-2 bg-yellow-500 rounded mr-1" />Partial uptime</span>
        <span><span className="inline-block w-2 h-2 bg-destructive rounded mr-1" />Slashed</span>
      </div>
    </div>
  );
}
```

---

### Real-Time Heartbeat Monitor

```tsx
// components/operator/HeartbeatMonitor.tsx
// Subscribes to Helius webhooks for live node status updates
import { useEffect, useState } from "react";

interface HeartbeatEvent {
  nodeId: string;
  timestamp: number;
  status: "ok" | "late" | "missed";
  proofHash: string;
}

export function useHeartbeatMonitor(
  nodeIds: string[],
  webhookEndpoint: string
) {
  const [events, setEvents] = useState<HeartbeatEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  useEffect(() => {
    // SSE connection for real-time heartbeat events
    const source = new EventSource(`${webhookEndpoint}/stream?nodes=${nodeIds.join(",")}`);

    source.onmessage = (e) => {
      const event: HeartbeatEvent = JSON.parse(e.data);
      setEvents((prev) => [event, ...prev.slice(0, 99)]); // keep last 100
      setLastUpdate(Date.now());
    };

    source.onerror = () => {
      // Reconnect after 5s on error
      setTimeout(() => source.close(), 5000);
    };

    return () => source.close();
  }, [nodeIds.join(","), webhookEndpoint]);

  // Alert: node hasn't reported in >5 minutes
  const overdueNodes = nodeIds.filter((id) => {
    const lastEvent = events.find((e) => e.nodeId === id);
    if (!lastEvent) return true;
    return (Date.now() / 1000 - lastEvent.timestamp) > 300;
  });

  return { events, overdueNodes, lastUpdate };
}
```

---

### Slash Alert System

```tsx
// components/operator/SlashAlert.tsx
// Most critical UX: slash events must be immediately visible
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface SlashEvent {
  nodeId: string;
  epoch: number;
  reason: string; // "downtime" | "double_signing" | "invalid_proof"
  amount: number;
  appealDeadlineEpoch: number;
  appealable: boolean;
}

export function SlashAlertBanner({ operatorAddress }: { operatorAddress: string }) {
  const { data: slashEvents = [] } = useQuery<SlashEvent[]>({
    queryKey: ["slash-events", operatorAddress],
    queryFn: () => fetchRecentSlashEvents(operatorAddress),
    refetchInterval: 30_000,
  });

  const appealable = slashEvents.filter((e) => e.appealable);

  // Trigger browser notification for new slashes
  useEffect(() => {
    if (slashEvents.length > 0 && Notification.permission === "granted") {
      new Notification("⛔ Node Slash Event", {
        body: `${slashEvents[0].nodeId} slashed: ${slashEvents[0].reason}`,
        icon: "/icon.png",
      });
    }
  }, [slashEvents.length]);

  if (slashEvents.length === 0) return null;

  return (
    <div className="rounded-md border-2 border-destructive bg-destructive/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-destructive text-lg">⛔</span>
        <p className="font-semibold text-destructive">
          {slashEvents.length} slash event{slashEvents.length > 1 ? "s" : ""} detected
        </p>
      </div>
      {slashEvents.map((slash) => (
        <div key={`${slash.nodeId}-${slash.epoch}`} className="text-sm space-y-1">
          <p>
            <span className="font-mono text-xs">{slash.nodeId}</span>
            {" — "}
            <span className="capitalize">{slash.reason.replace(/_/g, " ")}</span>
            {" — "}
            <span className="text-destructive">{formatTokenAmount(slash.amount, "TKN")} slashed</span>
          </p>
          {slash.appealable && (
            <p className="text-yellow-600 dark:text-yellow-400 text-xs">
              Appeal deadline: epoch {slash.appealDeadlineEpoch}
              {" "}
              <a href={`/appeal/${slash.nodeId}`} className="underline">File appeal →</a>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Operator Notification System

```typescript
// lib/operator-notifications.ts
// Node operators need PUSH notifications — they are not watching the dashboard 24/7

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export type NodeAlertType =
  | "node_offline"
  | "slash_event"
  | "low_uptime"
  | "rewards_claimable"
  | "software_update"
  | "epoch_end";

const ALERT_PRIORITY: Record<NodeAlertType, "critical" | "high" | "normal"> = {
  slash_event:       "critical",
  node_offline:      "critical",
  low_uptime:        "high",
  rewards_claimable: "normal",
  software_update:   "high",
  epoch_end:         "normal",
};

export function sendNodeAlert(
  type: NodeAlertType,
  nodeId: string,
  detail: string
): void {
  const priority = ALERT_PRIORITY[type];

  // Critical alerts: notification + Discord webhook + email
  if (priority === "critical") {
    if (Notification.permission === "granted") {
      new Notification(`${type === "slash_event" ? "⛔" : "🔴"} ${nodeId}`, {
        body: detail,
        requireInteraction: true, // stays on screen until dismissed
        tag: `${type}-${nodeId}`, // deduplicate
      });
    }
    sendDiscordAlert(type, nodeId, detail);
    return;
  }

  // High: notification only
  if (priority === "high" && Notification.permission === "granted") {
    new Notification(`⚠️ ${nodeId}`, { body: detail, tag: `${type}-${nodeId}` });
  }
}

async function sendDiscordAlert(type: NodeAlertType, nodeId: string, detail: string): Promise<void> {
  const webhookUrl = localStorage.getItem("discord_webhook_url");
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `**${type.replace(/_/g, " ").toUpperCase()}** — \`${nodeId}\`\n${detail}`,
      username: "Node Monitor",
    }),
  }).catch(() => {}); // non-critical
}
```

---

## Responsive Layout for Multi-Device Operators

```typescript
// Mobile: operators check nodes on phone during the day
// Desktop: full fleet table for configuration and analysis

export const OPERATOR_BREAKPOINTS = {
  mobile: {
    // Show: summary stats + alert count + quick claims
    // Hide: full fleet table, earnings chart
    primaryAction: "claim_rewards",
    showTable: false,
    showChart: false,
  },
  tablet: {
    // Show: summary + truncated fleet table (5 nodes) + earnings
    showTable: true,
    tableRows: 5,
    showChart: true,
  },
  desktop: {
    // Show everything
    showTable: true,
    tableRows: 20,
    showChart: true,
    showNetworkMap: true,
  },
};
```

---

## Cross-Skill Integration

### Receives from DePIN Builder
- Node registration events → trigger dashboard refresh
- Epoch boundary notifications → update reward display
- Proof submission results → update node status table

### Sends to Observability
- `DEPIN_NODE_OFFLINE_TO_OBS` → triggers `solana_depin_node_active` metric update
- Slash events → trigger `solana_authority_change_total` alert if slash authority is invoked

### Sends to Incident Response
- Fleet-wide offline event (>20% nodes offline) → declare P1 incident
- Smart contract upgrade affecting node registration → load `skill/program-upgrade-safety.md`
