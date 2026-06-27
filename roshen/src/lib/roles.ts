import type { AppRole } from "@/lib/auth";

export type NavChild = { href: string; key: string };
export type NavNode = { href: string; key: string; icon: string; roles: AppRole[]; children?: NavChild[] };
export type NavGroup = { key: string; items: NavNode[] };

// Core operational roles (full module access subject to RLS scope).
const CORE: AppRole[] = ["admin", "company_manager", "area_manager"];
const GLOBAL: AppRole[] = ["admin", "company_manager"];
// Future roles — for now conservative access: Dashboard + Workspace only.
const LIMITED: AppRole[] = ["supply_chain_manager", "general_manager", "accountant"];
// Everyone who can sign in sees Home + Workspace.
const EVERYONE: AppRole[] = [...CORE, ...LIMITED];

// Grouped, tree-shaped navigation (rendered by the Sidebar).
export const NAV_TREE: NavGroup[] = [
  {
    key: "main",
    items: [
      { href: "/", key: "home", icon: "Home", roles: EVERYONE },
      {
        href: "/workspace", key: "workspace", icon: "CheckSquare", roles: EVERYONE,
        children: [
          { href: "/workspace?tab=my", key: "my_tasks" },
          { href: "/workspace?tab=team", key: "team_tasks" },
          { href: "/workspace?tab=assigned", key: "assigned" },
          { href: "/calendar", key: "calendar" },
          { href: "/workspace/files", key: "files" },
          { href: "/notifications", key: "notifications" },
        ],
      },
    ],
  },
  {
    key: "requests",
    items: [
      {
        href: "/requests", key: "requests", icon: "ClipboardList", roles: CORE,
        children: [
          { href: "/requests/business-trip", key: "business_trip" },
          { href: "/requests/expenses", key: "expenses" },
          { href: "/requests/leave", key: "leave" },
          { href: "/requests/approvals", key: "approvals" },
        ],
      },
    ],
  },
  {
    key: "organization",
    items: [
      { href: "/organization", key: "organization", icon: "Building2", roles: CORE },
      { href: "/organization?tab=distributors", key: "distributors", icon: "Truck", roles: CORE },
      { href: "/users-scopes", key: "users_scopes", icon: "Users", roles: GLOBAL },
    ],
  },
  {
    key: "import_data",
    items: [
      { href: "/raw-data-upload", key: "raw_data_upload", icon: "Upload", roles: GLOBAL },
      { href: "/mapping-profiles", key: "mapping_profiles", icon: "SlidersHorizontal", roles: GLOBAL },
      { href: "/import-batches", key: "import_batches", icon: "Database", roles: CORE },
    ],
  },
  {
    key: "sla",
    items: [
      { href: "/sla-targets", key: "sla_setup", icon: "Target", roles: CORE },
      { href: "/sla-report", key: "sla_report", icon: "BarChart3", roles: CORE },
    ],
  },
  {
    key: "system",
    items: [{ href: "/settings", key: "settings", icon: "Settings", roles: CORE }],
  },
];

export const ROLE_LABEL: Record<string, string> = {
  company_manager: "Company Manager",
  area_manager: "Area Manager",
  admin: "Admin",
  branch_manager: "Branch Manager",
  sales_supervisor: "Sales Supervisor",
  salesman: "Salesman",
  finance: "Finance",
  supply_chain_manager: "Supply Chain Manager",
  general_manager: "General Manager",
  accountant: "Accountant",
};

/** Roles an Admin can assign in the Users & Scopes screen. */
export const ASSIGNABLE_ROLES: AppRole[] = [
  "admin",
  "company_manager",
  "area_manager",
  "supply_chain_manager",
  "general_manager",
  "accountant",
];

/** Groups visible to a role, with role-filtered items and empty groups dropped. */
export function visibleGroups(role: AppRole | null | undefined): NavGroup[] {
  if (!role) return [];
  return NAV_TREE
    .map((g) => ({ key: g.key, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}
