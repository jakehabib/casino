"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Users as UsersIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { searchUsers } from "@/server/services/admin/users";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  Credits,
  PageHeader,
  Pager,
  Panel,
  RolePill,
  Select,
  StatusPill,
  Table,
  TableSkeleton,
  Td,
  Th,
  Time,
} from "./ui";

type Result = Awaited<ReturnType<typeof searchUsers>>;

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** Width of an element, tracked with ResizeObserver (null before first layout). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function AdminUsersList() {
  // Only one layout is mounted (not CSS-hidden): avatar SVG gradients break inside display:none trees.
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const compact = width !== null && width < 720;
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [role, setRole] = useState(params.get("role") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const dq = useDebounced(q.trim());

  const filterKey = `${dq}|${role}|${status}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    // Filters changed: restart from the first page (render-phase state sync, no effect flash).
    setLastFilterKey(filterKey);
    setPage(1);
  }

  // Keep filters in the URL so a filtered view can be shared / restored.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (dq) sp.set("q", dq);
    if (role) sp.set("role", role);
    if (status) sp.set("status", status);
    if (page > 1) sp.set("page", String(page));
    const s = sp.toString();
    router.replace(s ? `/admin/users?${s}` : "/admin/users", { scroll: false });
  }, [dq, role, status, page, router]);

  const query = useQuery({
    queryKey: ["admin", "users", dq, role, status, page],
    queryFn: () => {
      const sp = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (dq) sp.set("q", dq);
      if (role) sp.set("role", role);
      if (status) sp.set("status", status);
      return api.get<Result>(`/api/admin/users?${sp}`);
    },
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Search by username or email prefix. Select a player to view their account, ledger and history."
      />
      <div ref={boxRef}>
        <Panel flush>
          <div className="flex flex-col gap-2 border-b border-line-soft p-3 sm:flex-row sm:items-center">
            <Input
              leading={<Search size={15} />}
              placeholder="Search username or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 flex-1"
              aria-label="Search users"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Select
                label="Role"
                value={role}
                onChange={setRole}
                className="sm:w-[150px]"
                options={[
                  { value: "", label: "All roles" },
                  { value: "USER", label: "Players" },
                  { value: "MODERATOR", label: "Moderators" },
                  { value: "ADMIN", label: "Admins" },
                  { value: "SUPER_ADMIN", label: "Super admins" },
                ]}
              />
              <Select
                label="Status"
                value={status}
                onChange={setStatus}
                className="sm:w-[150px]"
                options={[
                  { value: "", label: "Any status" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "SUSPENDED", label: "Suspended" },
                  { value: "BANNED", label: "Banned" },
                ]}
              />
            </div>
          </div>
          {query.isError ? (
            <ErrorState onRetry={() => query.refetch()} />
          ) : !data ? (
            <TableSkeleton rows={8} cols={6} />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={<UsersIcon size={18} />}
              title="No users match"
              body="Try a shorter prefix or clear the filters."
            />
          ) : (
            <>
              {compact ? (
                <ul className="divide-y divide-line-soft">
                  {data.items.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/users/${u.id}`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2"
                      >
                        <Avatar
                          avatarUrl={u.avatarUrl}
                          name={u.username}
                          size={34}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13.5px] font-medium text-fg">
                              {u.displayName}
                            </span>
                            {u.role !== "USER" ? (
                              <RolePill role={u.role} />
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-fg-subtle">
                            @{u.username} · {u.email}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Credits value={u.balance} className="text-[13px]" />
                          {u.status !== "ACTIVE" ? (
                            <StatusPill
                              status={u.status}
                              until={u.suspendedUntil}
                            />
                          ) : null}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className={
                    query.isFetching
                      ? "opacity-70 transition-opacity"
                      : undefined
                  }
                >
                  <Table minWidth={720}>
                    <thead>
                      <tr>
                        <Th>User</Th>
                        <Th>Role</Th>
                        <Th>Status</Th>
                        <Th align="right">Balance</Th>
                        <Th align="right">Rounds</Th>
                        <Th>Last seen</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((u) => (
                        <tr
                          key={u.id}
                          tabIndex={0}
                          onClick={() => router.push(`/admin/users/${u.id}`)}
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            router.push(`/admin/users/${u.id}`)
                          }
                          className="cursor-pointer outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2"
                        >
                          <Td className="max-w-[240px]">
                            <div className="flex items-center gap-2.5">
                              <Avatar
                                avatarUrl={u.avatarUrl}
                                name={u.username}
                                size={28}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium text-fg">
                                  {u.displayName}
                                </div>
                                <div className="truncate text-xs text-fg-subtle">
                                  @{u.username} · {u.email}
                                </div>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <RolePill role={u.role} />
                          </Td>
                          <Td>
                            <StatusPill
                              status={u.status}
                              until={u.suspendedUntil}
                            />
                          </Td>
                          <Td align="right">
                            <Credits value={u.balance} />
                          </Td>
                          <Td align="right" className="tabular">
                            {u.gamesPlayed.toLocaleString("en-US")}
                          </Td>
                          <Td>
                            <Time at={u.lastSeenAt} relative />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
              <Pager
                page={data.page}
                pages={data.pages}
                total={data.total}
                onPage={setPage}
                label={data.total === 1 ? "user" : "users"}
              />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
