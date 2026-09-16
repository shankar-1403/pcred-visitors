/**
 * The office's fixed department list — one set of names shared by the kiosk's
 * "who are you here to meet" filter and the staff directory's own Department
 * field, so a name typed one way in the directory can't fail to match the
 * filter it's supposed to show up under.
 *
 * Deliberately not free text: a visitor picking from six wouldn't help if
 * whoever added a staff member had typed "Sales " or "sales" instead.
 */
export const DEPARTMENTS = [
  "Management",
  "Accounts",
  "Sales",
  "Process",
  "Digital Marketing",
  "HR",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

/**
 * The staff directory's own picker offers one more option than the kiosk
 * filter: "Admin", for reception and admin staff who answer visitors rather
 * than receive them — nobody checks in to see "Admin", so it has no reason
 * to appear as a kiosk filter.
 */
export const STAFF_DEPARTMENTS = [...DEPARTMENTS, "Admin"] as const;
