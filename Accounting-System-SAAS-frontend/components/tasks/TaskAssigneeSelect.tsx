"use client";

import * as React from "react";
import { Select } from "@/components/ui/Select";
import type { TenantUser } from "@/lib/tasks/types";

export function TaskAssigneeSelect({
  value,
  users,
  disabled,
  onChange,
}: {
  value: number | null | undefined;
  users: TenantUser[];
  disabled: boolean;
  onChange: (assigneeId: number | null) => void;
}) {
  const activeUsers = React.useMemo(() => (users || []).filter((u) => u.active), [users]);

  return (
    <Select
      value={value === null || value === undefined ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? Number(v) : null);
      }}
    >
      <option value="">Unassigned</option>
      {activeUsers.map((u) => (
        <option key={u.id} value={String(u.id)}>
          {u.name || u.email}
        </option>
      ))}
    </Select>
  );
}
