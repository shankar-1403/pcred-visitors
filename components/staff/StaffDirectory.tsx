"use client";

import React, { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconCheck, IconLink, IconSearch, IconX } from "@tabler/icons-react";
import { createStaffAccount, patchStaffMember, saveStaffMember } from "@/src/lib/data";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useStaff, type Staff } from "@/src/hooks/useStaff";
import { usePagination } from "@/src/hooks/usePagination";
import TablePagination from "@/components/TablePagination";

const initialFormData = {
  name: "",
  designation: "",
  department: "",
  email: "",
  phone: "",
  password: "",
  accessRole: "staff" as "admin" | "staff",
  // Only meaningful while editing: unchecked, resetting a password never
  // touches whatever access level that account already has.
  changeAccess: false,
  active: true,
};

export default function StaffDirectory() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { staff, loading: staffLoading } = useStaff();

  const [formData, setFormData] = useState(initialFormData);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");


  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;

    return staff.filter((member) =>
      [member.name, member.designation, member.department, member.email]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(query))
    );
  }, [staff, search]);

  const {
    page: tablePage,
    setPage: setTablePage,
    pageSize: tablePageSize,
    setPageSize: setTablePageSize,
    total: tableTotal,
    totalPages: tableTotalPages,
    pageItems: tablePageItems,
  } = usePagination(filtered);

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingStaffId(null);
    setError("");
  };

  const handleOpen = () => {
    resetForm();
    setSuccess("");
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleEdit = (member: Staff) => {
    setEditingStaffId(member.id);
    setFormData({
      name: member.name ?? "",
      designation: member.designation ?? "",
      department: member.department ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      password: "",
      // Inert until "Also change their access level" is ticked — see
      // changeAccess above for why this can't just reflect their real role
      // (the directory doesn't know it; roles are keyed by uid, staff by id).
      accessRole: "staff",
      changeAccess: false,
      active: member.active ?? true,
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const handleToggleActive = async (member: Staff) => {
    if (!user) return;

    try {
      // A merge, not a rewrite: `id` is the storage key rather than a stored
      // field, so re-setting the whole record would duplicate it inside.
      await patchStaffMember(member.id, {
        active: !(member.active ?? true),
        updatedAt: Date.now(),
        updatedBy: user.uid,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not update this staff member."
      );
    }
  };

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!user) {
      setError("You must be signed in.");
      return;
    }

    if (!formData.name.trim()) {
      setError("Name is required.");
      return;
    }

    if (formData.password.trim() && !formData.email.trim()) {
      setError("A login needs an email address.");
      return;
    }

    if (formData.password.trim() && formData.password.trim().length < 8) {
      setError("The password must be at least 8 characters.");
      return;
    }

    setSaving(true);

    try {
      const now = Date.now();
      const isEditing = editingStaffId !== null;

      // The login comes first, whether adding someone new or fixing up an
      // existing record whose account never got created. If the address
      // already has a login, this resets its password instead of failing.
      let loginResult: { created: boolean } | null = null;

      if (formData.password.trim()) {
        loginResult = await createStaffAccount({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          displayName: formData.name.trim(),
          // A brand-new login always gets an explicit level. Resetting an
          // existing one only changes it if the admin ticked the box —
          // otherwise whatever access that account already has is left alone.
          ...(!isEditing || formData.changeAccess
            ? { role: formData.accessRole }
            : {}),
        });
      }

      const existing = isEditing
        ? staff.find((member) => member.id === editingStaffId)
        : null;

      await saveStaffMember(editingStaffId, {
        name: formData.name.trim(),
        designation: formData.designation.trim(),
        department: formData.department.trim(),
        // Lowercased so it matches the signed-in address regardless of typing.
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        active: formData.active,
        createdAt: isEditing ? existing?.createdAt ?? now : now,
        createdBy: isEditing ? existing?.createdBy ?? user.uid : user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });

      setSuccess(
        loginResult?.created
          ? `${formData.name.trim()}'s login is ready. Send them the password.`
          : loginResult
            ? `Password reset for ${formData.name.trim()}. Send them the new one.`
            : isEditing
              ? "Staff member updated."
              : `${formData.name.trim()} added. They have no login, so an admin answers their visitors.`
      );
      setModalOpen(false);
      resetForm();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save staff member."
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "border border-navy-500 dark:border-white/25 rounded-4xl w-full py-2 px-3 text-navy-500 dark:text-white dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-gold-300/40";
  const labelClass = "mb-2 block text-sm font-medium text-navy-500 dark:text-white";

  return (
    <div className="max-w-7xl mx-auto px-4 pt-20 pb-16 space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-500 dark:text-white">
            Staff directory
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-white/50">
            Everyone listed here appears on the check-in screen. Give
            someone a login email and their own visitors alert them directly.
          </p>
        </div>

        <button
          onClick={handleOpen}
          className="min-h-11 shrink-0 rounded-xl bg-navy-500 px-4 text-sm font-medium text-white cursor-pointer transition-opacity hover:opacity-90"
        >
          Add staff
        </button>
      </section>

      {success ? (
        <p className="rounded-4xl bg-green-50 dark:bg-green-400/15 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          {success}
        </p>
      ) : null}

      {!modalOpen && error ? (
        <p className="rounded-4xl bg-red-50 dark:bg-red-400/15 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="relative max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500 dark:text-white/50" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, role or department"
          aria-label="Search staff"
          className="w-full rounded-xl border border-navy-500/20 dark:border-white/15 bg-white dark:bg-surface-dark-card py-2 pl-9 pr-3 text-sm text-navy-500 dark:text-white outline-none focus:border-navy-500"
        />
      </div>

      <AnimatePresence>
        {modalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="Close modal"
              onClick={handleCloseModal}
              className="absolute inset-0 cursor-pointer bg-navy-500/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25 }}
              className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-4xl bg-white dark:bg-surface-dark-card shadow-2xl"
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-navy-500/10 dark:border-white/10 bg-white dark:bg-surface-dark-card px-6 py-5">
                <h2 className="text-xl font-bold text-navy-500 dark:text-white">
                  {editingStaffId ? "Edit staff member" : "Add staff member"}
                </h2>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  aria-label="Close"
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-navy-500/15 dark:border-white/10 text-navy-500 dark:text-white transition-colors hover:bg-navy-500/10 dark:bg-white/10"
                >
                  <IconX className="size-5" />
                </button>
              </div>

              <div className="p-6">
                <form className="space-y-4" onSubmit={handleSave}>
                  {error ? (
                    <p className="rounded-4xl bg-red-50 dark:bg-red-400/15 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                      {error}
                    </p>
                  ) : null}

                  <div>
                    <label htmlFor="name" className={labelClass}>
                      Full name *
                    </label>
                    <input
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      type="text"
                      placeholder="e.g. Vijay Sharma"
                      className={inputClass}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="designation" className={labelClass}>
                        Designation
                      </label>
                      <input
                        id="designation"
                        name="designation"
                        value={formData.designation}
                        onChange={handleChange}
                        type="text"
                        placeholder="e.g. Director"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="department" className={labelClass}>
                        Department
                      </label>
                      <input
                        id="department"
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        type="text"
                        placeholder="e.g. Advisory"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className={labelClass}>
                        Login email
                      </label>
                      <input
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        type="email"
                        placeholder="name@pcred.org"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className={labelClass}>
                        Phone (extension)
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        type="tel"
                        placeholder="e.g. +91 98765 43210"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <fieldset className="rounded-2xl border border-navy-500/15 dark:border-white/10 p-4">
                    <legend className="px-2 text-sm font-medium text-navy-500 dark:text-white">
                      Their login
                    </legend>
                    <p className="text-xs leading-relaxed text-stone-500 dark:text-white/50">
                      {editingStaffId === null ? (
                        <>
                          Set a password here and their login is created the
                          moment you add them. They can sign in straight away
                          with the email above. Leave it blank for someone who
                          doesn&rsquo;t need an account (e.g. a driver or
                          office assistant); their visitors still appear under
                          &ldquo;All requests&rdquo; for reception to answer.
                        </>
                      ) : (
                        <>
                          Leave the password blank to leave their login
                          exactly as it is. Type one to set their password.
                          This also works if their login was never actually
                          created (they&rsquo;ll simply get one now), so it
                          doubles as the fix if someone can&rsquo;t sign in.
                        </>
                      )}
                    </p>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="password" className={labelClass}>
                          {editingStaffId === null
                            ? "Starting password"
                            : "New password"}
                        </label>
                        <input
                          id="password"
                          name="password"
                          type="text"
                          autoComplete="off"
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="At least 8 characters"
                          className={inputClass}
                        />
                        <p className="mt-2 text-xs text-stone-500 dark:text-white/50">
                          Shown in plain text on purpose. You have to read it
                          out to them. Ask them to change it once they sign in.
                        </p>
                      </div>
                      <div>
                        <label htmlFor="accessRole" className={labelClass}>
                          Access
                        </label>
                        <select
                          id="accessRole"
                          name="accessRole"
                          value={formData.accessRole}
                          onChange={handleChange}
                          disabled={editingStaffId !== null && !formData.changeAccess}
                          style={{ colorScheme: theme }}
                          className={`${inputClass} cursor-pointer bg-white dark:bg-surface-dark-card disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <option value="staff">
                            Staff (their own visitors only)
                          </option>
                          <option value="admin">
                            Admin (manages the directory and logins)
                          </option>
                        </select>

                        {editingStaffId !== null ? (
                          <label className="mt-2 flex items-center gap-2 text-xs text-stone-600 dark:text-white/60">
                            <input
                              type="checkbox"
                              name="changeAccess"
                              checked={formData.changeAccess}
                              onChange={handleChange}
                              className="size-3.5 accent-navy-500"
                            />
                            Also change their access level (only applied if
                            you set a password above)
                          </label>
                        ) : null}
                      </div>
                    </div>
                  </fieldset>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="active"
                      name="active"
                      checked={formData.active}
                      onChange={handleChange}
                      className="size-4 accent-navy-500"
                    />
                    <label htmlFor="active" className="text-sm font-medium text-navy-500 dark:text-white">
                      Active (shown on the check-in screen)
                    </label>
                  </div>

                  <div className="flex justify-center pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="cursor-pointer rounded-4xl bg-navy-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-navy-500/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving…" : editingStaffId ? "Update" : "Add staff"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="max-w-full overflow-hidden rounded-xl border border-navy-500/15 dark:border-white/10 bg-white dark:bg-surface-dark-card">
        {/* Phones get cards. A six-column table at 375px is a sideways scroll
            with three words per line — technically present, practically
            unusable. */}
        <ul className="divide-y divide-navy-500 dark:divide-white/10/10 dark:divide-white/10 sm:hidden">
          {staffLoading ? (
            <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-white/50">
              Loading staff…
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-white/50">
              {staff.length === 0
                ? "No staff added yet. Add someone so the check-in screen has a list."
                : "No staff match that search."}
            </li>
          ) : (
            tablePageItems.map((member) => (
              <li key={member.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy-500 dark:text-white">
                      {member.name || "Unnamed"}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-stone-500 dark:text-white/50">
                      {[member.designation, member.department]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  {member.active ?? true ? (
                    <span className="shrink-0 rounded-full bg-green-50 dark:bg-green-400/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-300">
                      Active
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-gray-100 dark:bg-white/10 px-2 py-0.5 text-xs font-semibold text-gray-400 dark:text-white/40">
                      Inactive
                    </span>
                  )}
                </div>

                <p className="mt-2 truncate text-xs text-stone-500 dark:text-white/50">
                  {member.email || "No login"}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(member)}
                    className="min-h-11 flex-1 cursor-pointer rounded-xl bg-navy-500 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(member)}
                    className="min-h-11 flex-1 cursor-pointer rounded-xl border border-navy-500/25 dark:border-white/15 text-sm font-medium text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8"
                  >
                    {member.active ?? true ? "Deactivate" : "Activate"}
                  </button>
                  <CopyVisitorLinkButton staffId={member.id} compact />
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-190 table-auto text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-800 dark:border-white/10 bg-navy-500 text-sm uppercase text-white">
              <tr>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Name</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Designation</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Department</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Login</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500 dark:divide-white/10">
              {staffLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-stone-500 dark:text-white/50">
                    Loading staff…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-stone-500 dark:text-white/50">
                    {staff.length === 0
                      ? "No staff added yet. Add someone so the check-in screen has a list."
                      : "No staff match that search."}
                  </td>
                </tr>
              ) : (
                tablePageItems.map((member) => (
                  <tr key={member.id} className="text-sm text-navy-500 dark:text-white">
                    <td className="max-w-xs truncate px-4 py-2">
                      {member.name || "Unnamed"}
                    </td>
                    <td className="px-4 py-2 text-stone-500 dark:text-white/50">
                      {member.designation || "—"}
                    </td>
                    <td className="px-4 py-2 text-stone-500 dark:text-white/50">
                      {member.department || "—"}
                    </td>
                    <td className="px-4 py-2">
                      {member.email ? (
                        <span className="text-xs text-stone-500 dark:text-white/50">
                          {member.email}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 dark:bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          No login
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {member.active ?? true ? (
                        <span className="rounded-full bg-green-50 dark:bg-green-400/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-300">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 dark:bg-white/10 px-2 py-0.5 text-xs font-semibold text-gray-400 dark:text-white/40">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(member)}
                          className="cursor-pointer rounded-xl bg-navy-500 px-3 py-1 text-xs text-white transition-opacity hover:opacity-90"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(member)}
                          className="cursor-pointer rounded-xl border border-navy-500/25 dark:border-white/15 px-3 py-1 text-xs text-navy-500 dark:text-white transition-colors hover:bg-navy-500/10 dark:bg-white/10"
                        >
                          {member.active ?? true ? "Deactivate" : "Activate"}
                        </button>
                        <CopyVisitorLinkButton staffId={member.id} compact />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!staffLoading && (
          <TablePagination
            page={tablePage}
            totalPages={tableTotalPages}
            pageSize={tablePageSize}
            totalItems={tableTotal}
            onPageChange={setTablePage}
            onPageSizeChange={setTablePageSize}
          />
        )}
      </section>
    </div>
  );
}

/** Copies a staff member's own check-in link — visitors who open it skip
    straight to "who are you here to meet", since the link already says who. */
function CopyVisitorLinkButton({
  staffId,
  compact,
}: {
  staffId: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}/visit/${staffId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked by the browser; nothing to recover
      // from beyond letting the person try again.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        compact
          ? "flex cursor-pointer items-center gap-1.5 rounded-xl border border-navy-500/25 dark:border-white/15 px-3 py-1 text-xs text-navy-500 dark:text-white transition-colors hover:bg-navy-500/10 dark:hover:bg-white/10"
          : "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-navy-500/25 dark:border-white/15 text-sm font-medium text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8"
      }
    >
      {copied ? (
        <>
          <IconCheck className="size-3.5" />
          Copied
        </>
      ) : (
        <>
          <IconLink className="size-3.5" />
          Link
        </>
      )}
    </button>
  );
}
