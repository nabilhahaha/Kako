// Built-in alert sources. Importing this module registers them via
// registerAlertSource. Phase A3 adds the ready sources (pending approvals, overdue
// requests, low stock, failed integrations, credit/overdue, high discount variance);
// schema-dependent sources (near-expiry stock, route/GPS) follow once their columns
// are approved. Modules/industry packs register their own sources the same way.

// (registrations added in Phase A3)
export {};
