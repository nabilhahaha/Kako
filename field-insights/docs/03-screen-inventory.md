# 03 — Screen Inventory

Mobile-first. Every screen is designed for one-handed use, large touch targets, and offline operation. Desktop is a responsive enhancement (mainly dashboards/reports for managers).

## A. Authentication & Onboarding
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| A1 | Splash / App load | Boot, restore session, sync check | Logo, offline indicator |
| A2 | Sign in | Email+password / magic link | Inputs, "stay signed in", offline notice |
| A3 | Forgot / reset password | Recovery | Email input |
| A4 | First-run permissions | Request camera, GPS, mic, notifications | Permission cards, "why we need this" |

## B. Home / Navigation
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| B1 | Home / Today | Snapshot + quick actions | "Start Visit" FAB, today's visits, actions due, sync status |
| B2 | Bottom nav shell | Primary navigation | Home · Visits · Map · Dashboards · More |
| B3 | More menu | Secondary nav | Opportunities, Issues, Reports, Customers, Settings, Profile |
| B4 | Global search | Find customer/visit/opportunity | Search field, recent, filters |
| B5 | Sync center | Review/retry pending items | Queue list, per-item status, "Sync now" |

## C. Visit Management (module 1)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| C1 | Visits list | Browse/filter visits | Filter (type/status/date/customer), status badges, sync badge |
| C2 | Start visit — customer select | Pick customer | Search, recent, "new customer" shortcut |
| C3 | Start visit — location select | Pick location + GPS capture | Map pin, "use my location", geofence check |
| C4 | Visit detail (tabbed hub) | Central record during/after visit | Tabs: Overview · Photos · Competitors · Opportunities · Issues · Actions · Voice |
| C5 | Visit overview/edit | Type, objective, summary, outcome | Type chips, text areas, start/end visit buttons |
| C6 | Visit timeline/summary | Read-only recap | All captured items, "Generate report" |

## D. Photo Intelligence (module 2)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| D1 | Camera capture | Take photo with auto GPS/time | Shutter, category pre-select, multi-shot |
| D2 | Photo annotate | Add category + description | Category chips, caption, retake |
| D3 | Photo gallery (per visit) | Review captured photos | Grid, category filter, GPS tag, delete |
| D4 | Photo viewer | Full-screen single photo | Swipe, metadata overlay (cat/time/GPS) |

## E. Competitor Tracking (module 3)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| E1 | Competitor observations list | Per-visit competitor entries | Cards (name/product/price), add button |
| E2 | Competitor entry form | Capture one observation | Competitor, product, price, promotion, display quality, notes, attach photos |

## F. Opportunity Management (module 4)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| F1 | Opportunities list/pipeline | Browse + kanban by status | Columns: Open/In Progress/Won/Lost, value totals |
| F2 | Opportunity form | Create/edit | Title, description, value, priority, due date, status, owner |
| F3 | Opportunity detail | View + advance status | Status stepper, linked visit/customer, activity |

## G. Issue Tracking (module 5)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| G1 | Issues list | Browse/filter | Type, severity, status filters, overdue highlight |
| G2 | Issue form | Report issue | Type, severity, owner, due date, description |
| G3 | Issue detail | Resolve | Status, resolution notes, resolve button |

## H. Action Plans (module 6)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| H1 | Actions list ("My actions") | Track assigned/owned actions | Due grouping, status toggle |
| H2 | Action form | Create from visit | Action, responsible person, target date |
| H3 | Action detail | Complete | Status, completion notes |

## I. Voice Notes (module 7)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| I1 | Voice notes list (per visit) | Review recordings | Play, duration, transcript snippet |
| I2 | Recorder | Record/stop/save | Record button, waveform, timer |
| I3 | Transcript view | Read/edit transcript | Text, re-transcribe |

## J. Map & GPS (module 8)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| J1 | Visits map | Visits as clustered pins | Filters, cluster, tap → visit |
| J2 | Location picker | Confirm/adjust coordinates | Draggable pin, accuracy ring, geofence |

## K. Dashboards
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| K1 | Executive dashboard | KPIs overview | Total visits, by city, by user, pipeline, competitor activity, issues by category, actions due, market trends |
| K2 | Visits analytics | Drill-down | By type/city/user/time |
| K3 | Pipeline dashboard | Opportunity funnel | Value by stage/priority |
| K4 | Competitor dashboard | Activity & pricing | By competitor/product/price trend |
| K5 | Issues dashboard | Category & SLA | By type/severity/aging |

## L. Reporting (module 9)
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| L1 | Reports hub | Pick a report | PDF Visit, Opportunity, Competitor, Customer Visit History, Market Intelligence |
| L2 | Report config | Date range/scope/filters | Range, region/area, customer, format |
| L3 | Report preview/export | View & download/share | Preview, Download PDF, Share |

## M. Master Data & Admin
| # | Screen | Purpose | Key elements |
|---|---|---|---|
| M1 | Customers list/detail | Manage customers & locations | Search, add, edit, visit history |
| M2 | Competitor catalog | Maintain competitor list | Add/merge |
| M3 | Users & roles (admin) | Manage users, roles, scope | Invite, role, region/area assignment |
| M4 | Regions & areas (admin) | Geography setup | CRUD |
| M5 | Settings | App/org settings | Geofence radius, language, currency, sync |
| M6 | Profile | Personal settings | Name, avatar, password, sign out |

**Count:** ~50 screens across 13 groups. MVP subset is defined in `06-development-roadmap.md`.
