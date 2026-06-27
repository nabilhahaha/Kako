import type { AppRole } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string; // English fallback (translated in the sidebar via `key`)
  key: string; // i18n key suffix → nav.<key>
  icon: string; // lucide icon name (mapped in Sidebar)
  roles: AppRole[];
};

const ALL_ACTIVE: AppRole[] = ["admin", "company_manager", "area_manager"];
const GLOBAL: AppRole[] = ["admin", "company_manager"];

export const NAV: NavItem[] = [
  { href: "/", label: "Home", key: "home", icon: "Home", roles: ALL_ACTIVE },
  { href: "/workspace", label: "Workspace", key: "workspace", icon: "CheckSquare", roles: ALL_ACTIVE },
  { href: "/calendar", label: "Calendar", key: "calendar", icon: "CalendarDays", roles: ALL_ACTIVE },
  { href: "/requests", label: "Requests", key: "requests", icon: "ClipboardList", roles: ALL_ACTIVE },
  { href: "/organization", label: "Organization", key: "organization", icon: "Building2", roles: ALL_ACTIVE },
  { href: "/organization?tab=distributors", label: "Distributors", key: "distributors", icon: "Truck", roles: ALL_ACTIVE },
  { href: "/raw-data-upload", label: "Raw Data Upload", key: "raw_data_upload", icon: "Upload", roles: GLOBAL },
  { href: "/mapping-profiles", label: "Mapping Profiles", key: "mapping_profiles", icon: "SlidersHorizontal", roles: GLOBAL },
  { href: "/import-batches", label: "Import Batches", key: "import_batches", icon: "Database", roles: ALL_ACTIVE },
  { href: "/sla-targets", label: "SLA & Coverage Setup", key: "sla_setup", icon: "Target", roles: ALL_ACTIVE },
  { href: "/sla-report", label: "SLA Report", key: "sla_report", icon: "BarChart3", roles: ALL_ACTIVE },
  { href: "/users-scopes", label: "Users & Scopes", key: "users_scopes", icon: "Users", roles: GLOBAL },
  { href: "/settings", label: "Settings", key: "settings", icon: "Settings", roles: ALL_ACTIVE },
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
