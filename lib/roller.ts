export const SELECTABLE_ROLE_OPTIONS = [
  { value: "user", label: "Medlem" },
  { value: "admin", label: "Admin" },
  { value: "styreleder", label: "Styreleder" },
  { value: "nestleder", label: "Nestleder" },
  { value: "kasserer", label: "Kasserer" },
  { value: "sekretaer", label: "Sekretær" },
  { value: "medlemsansvarlig", label: "Medlemsansvarlig" },
  { value: "kursleder", label: "Kursleder" },
  { value: "teamleder", label: "Teamleder" },
  { value: "birokter", label: "Birøkter" },
  { value: "selger", label: "Selger" },
  { value: "moderator", label: "Moderator" },
] as const

export type SelectableRole = (typeof SELECTABLE_ROLE_OPTIONS)[number]["value"]
export type RoleKey = SelectableRole | "superadmin"

export const PERMISSION_KEYS = [
  "admin_home",
  "view_members",
  "edit_members",
  "assign_roles",
  "change_member_status",
  "mark_membership_payment",
  "send_member_email",
  "manage_campaigns",
  "view_finance",
  "manage_finance",
  "manage_finance_settings",
  "manage_finance_balance",
  "manage_projects",
  "manage_lottery",
  "manage_media",
  "manage_bie_eske",
] as const

export type Permission = (typeof PERMISSION_KEYS)[number]
export type RolePermissions = Record<Permission, boolean>

const BASE_PERMISSIONS: RolePermissions = {
  admin_home: false,
  view_members: false,
  edit_members: false,
  assign_roles: false,
  change_member_status: false,
  mark_membership_payment: false,
  send_member_email: false,
  manage_campaigns: false,
  view_finance: false,
  manage_finance: false,
  manage_finance_settings: false,
  manage_finance_balance: false,
  manage_projects: false,
  manage_lottery: false,
  manage_media: false,
  manage_bie_eske: false,
}

const ROLE_LABELS: Record<RoleKey, string> = {
  user: "Medlem",
  admin: "Admin",
  styreleder: "Styreleder",
  nestleder: "Nestleder",
  kasserer: "Kasserer",
  sekretaer: "Sekretær",
  medlemsansvarlig: "Medlemsansvarlig",
  kursleder: "Kursleder",
  teamleder: "Teamleder",
  birokter: "Birøkter",
  selger: "Selger",
  moderator: "Moderator",
  superadmin: "Superbruker",
}

const ROLE_RANK: Record<RoleKey, number> = {
  superadmin: 0,
  admin: 1,
  styreleder: 2,
  nestleder: 3,
  kasserer: 4,
  medlemsansvarlig: 5,
  sekretaer: 6,
  moderator: 7,
  kursleder: 8,
  teamleder: 9,
  birokter: 10,
  selger: 11,
  user: 12,
}

const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  superadmin: [...PERMISSION_KEYS],
  admin: [
    "admin_home",
    "view_members",
    "edit_members",
    "change_member_status",
    "mark_membership_payment",
    "send_member_email",
    "manage_campaigns",
    "view_finance",
    "manage_finance",
    "manage_finance_settings",
    "manage_projects",
    "manage_lottery",
    "manage_media",
    "manage_bie_eske",
  ],
  styreleder: [
    "admin_home",
    "view_members",
    "edit_members",
    "change_member_status",
    "mark_membership_payment",
    "send_member_email",
    "manage_campaigns",
    "view_finance",
    "manage_finance",
    "manage_projects",
    "manage_lottery",
  ],
  nestleder: [
    "admin_home",
    "view_members",
    "edit_members",
    "change_member_status",
    "mark_membership_payment",
    "send_member_email",
    "manage_campaigns",
    "view_finance",
    "manage_projects",
  ],
  kasserer: [
    "admin_home",
    "view_members",
    "mark_membership_payment",
    "view_finance",
    "manage_finance",
    "manage_finance_settings",
  ],
  sekretaer: ["admin_home", "view_members", "send_member_email", "manage_projects"],
  medlemsansvarlig: [
    "admin_home",
    "view_members",
    "edit_members",
    "change_member_status",
    "mark_membership_payment",
    "send_member_email",
    "manage_campaigns",
  ],
  kursleder: ["admin_home", "view_members", "send_member_email"],
  teamleder: ["admin_home", "manage_bie_eske"],
  birokter: ["admin_home", "manage_bie_eske"],
  selger: ["admin_home", "manage_lottery"],
  moderator: ["admin_home", "manage_media"],
  user: [],
}

export function normalizeRole(role: string | null | undefined): RoleKey {
  const value = String(role ?? "")
    .trim()
    .toLowerCase()
  if (value === "superadmin") return "superadmin"
  if (value === "admin") return "admin"
  if (value === "styreleder") return "styreleder"
  if (value === "nestleder") return "nestleder"
  if (value === "kasserer") return "kasserer"
  if (value === "sekretaer" || value === "sekretar") return "sekretaer"
  if (value === "medlemsansvarlig") return "medlemsansvarlig"
  if (value === "kursleder") return "kursleder"
  if (value === "teamleder") return "teamleder"
  if (value === "birokter" || value === "frivillig") return "birokter"
  if (value === "selger") return "selger"
  if (value === "moderator") return "moderator"
  return "user"
}

export function isSelectableRole(role: string | null | undefined): role is SelectableRole {
  return SELECTABLE_ROLE_OPTIONS.some((option) => option.value === role)
}

export function labelForRole(role: string | null | undefined) {
  return ROLE_LABELS[normalizeRole(role)]
}

export function roleRank(role: string | null | undefined) {
  return ROLE_RANK[normalizeRole(role)]
}

export function permissionsForRole(role: string | null | undefined): RolePermissions {
  const normalized = normalizeRole(role)
  const permissions = { ...BASE_PERMISSIONS }
  for (const key of ROLE_PERMISSIONS[normalized]) permissions[key] = true
  return permissions
}

export function hasPermission(role: string | null | undefined, permission: Permission) {
  return permissionsForRole(role)[permission]
}

export function hasAnyAdminAccess(role: string | null | undefined) {
  return permissionsForRole(role).admin_home
}

export function canAccessAdminPath(pathname: string, role: string | null | undefined) {
  const permissions = permissionsForRole(role)
  if (!permissions.admin_home) return false
  if (pathname === "/admin" || pathname.startsWith("/admin?")) return true
  if (pathname.startsWith("/admin/medlemmer")) return permissions.view_members
  if (pathname.startsWith("/admin/regnskap")) return permissions.view_finance
  if (pathname.startsWith("/admin/prosjekter")) return permissions.manage_projects
  if (pathname.startsWith("/admin/lodd") || pathname.startsWith("/admin/skrapelodd")) {
    return permissions.manage_lottery
  }
  if (pathname.startsWith("/admin/media-bibliotek")) return permissions.manage_media
  if (pathname.startsWith("/admin/bie-eske-system") || pathname.startsWith("/admin/redd-1-bie-eske")) {
    return permissions.manage_bie_eske
  }
  return true
}
