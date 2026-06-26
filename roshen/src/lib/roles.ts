import type { AppRole } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide icon name (mapped in Sidebar)
  roles: AppRole[];
};

const ALL_ACTIVE: AppRole[] = ["admin", "company_manager", "area_manager"];
const GLOBAL: AppRole[] = ["admin", "company_manager"];

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "Home", roles: ALL_ACTIVE },
  { href: "/workspace", label: "Workspace", icon: "CheckSquare", roles: ALL_ACTIVE },
  { href: "/calendar", label: "Calendar", icon: "CalendarDays", roles: ALL_ACTIVE },
  { href: "/requests", label: "Requests", icon: "ClipboardList", roles: ALL_ACTIVE },
  { href: "/organization", label: "Organization", icon: "Building2", roles: ALL_ACTIVE },
  { href: "/organization?tab=distributors", label: "Distributors", icon: "Truck", roles: ALL_ACTIVE },
  { href: "/raw-data-upload", label: "Raw Data Upload", icon: "Upload", roles: GLOBAL },
  { href: "/mapping-profiles", label: "Mapping Profiles", icon: "SlidersHorizontal", roles: GLOBAL },
  { href: "/import-batches", label: "Import Batches", icon: "Database", roles: ALL_ACTIVE },
  { href: "/sla-targets", label: "SLA Targets", icon: "Target", roles: GLOBAL },
  { href: "/sla-report", label: "SLA Report", icon: "BarChart3", roles: ALL_ACTIVE },
  { href: "/users-scopes", label: "Users & Scopes", icon: "Users", roles: GLOBAL },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ALL_ACTIVE },
];

export const ROLE_LABEL: Record<string, string> = {
  company_manager: "Company Manager",
  area_manager: "Area Manager",
  admin: "Admin",
  branch_manager: "Branch Manager",
  sales_supervisor: "Sales Supervisor",
  salesman: "Salesman",
  finance: "Finance",
};

export function visibleNav(role: AppRole | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV.filter((i) => i.roles.includes(role));
}
