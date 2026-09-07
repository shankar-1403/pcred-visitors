import { useEffect, useState } from "react";
import { subscribeRole } from "@/src/lib/data";
import { useAuth } from "@/src/context/AuthContext";

export type Role = "admin" | "staff";

export interface RoleRecord {
  role: Role;
  email?: string;
  createdAt?: number;
  createdBy?: string | null;
}

interface Snapshot {
  /** The uid this snapshot belongs to — lets a stale result be ignored. */
  uid: string;
  record: RoleRecord | null;
}

/**
 * The signed-in person's role.
 *
 * Everything this gates is also enforced in the database rules — this only
 * decides what to show. A hidden button is a courtesy, not a permission.
 */
export function useRole() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeRole(user.uid, (record) =>
      setSnapshot({ uid: user.uid, record })
    );

    return () => unsubscribe();
  }, [user]);

  const fresh = user && snapshot?.uid === user.uid ? snapshot : null;

  // Anyone signed in without a role record is treated as ordinary staff —
  // never as an admin. Failing closed matters more than failing usefully.
  const role: Role = fresh?.record?.role === "admin" ? "admin" : "staff";

  return {
    role,
    isAdmin: role === "admin",
    loading: Boolean(user) && fresh === null,
  };
}
