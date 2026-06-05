#!/usr/bin/env python3
"""Generate diagram PNGs for the VANTORA documentation (matplotlib, no external deps)."""
import os, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = 'docs/diagrams'
os.makedirs(OUT, exist_ok=True)

NAVY='#1F3A5F'; CYAN='#0BC5DA'; LIGHT='#EAF6F9'; GREY='#6B7280'
FILL='#F3F6FA'; GREEN='#16A34A'; AMBER='#D97706'; RED='#DC2626'

def box(ax, cx, cy, w, h, text, fc=FILL, ec=NAVY, tc=NAVY, fs=9, bold=True):
    p = FancyBboxPatch((cx-w/2, cy-h/2), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                       linewidth=1.3, edgecolor=ec, facecolor=fc)
    ax.add_patch(p)
    ax.text(cx, cy, text, ha='center', va='center', fontsize=fs, color=tc,
            fontweight='bold' if bold else 'normal', wrap=True)

def arrow(ax, p1, p2, color=CYAN, lw=1.6, style='-|>'):
    a = FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=12,
                        linewidth=lw, color=color, shrinkA=2, shrinkB=2)
    ax.add_patch(a)

def label(ax, x, y, txt, fs=8, color=GREY, ha='center', style='italic'):
    ax.text(x, y, txt, ha=ha, va='center', fontsize=fs, color=color, fontstyle=style)

def save(fig, name):
    fig.savefig(f'{OUT}/{name}', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close(fig); print('  -', name)

# ───────────────────────── 1. ARCHITECTURE / GOVERNANCE FLOW ─────────────────────────
def arch():
    fig, ax = plt.subplots(figsize=(7.2, 9.4)); ax.axis('off')
    ax.set_xlim(0, 10); ax.set_ylim(0, 20)
    chain = [
        ('Platform Owner', 'Vendor apex — administers the entire platform', LIGHT, CYAN),
        ('Plans', 'erp_plans — subscription tiers + limits', FILL, NAVY),
        ('Modules', 'erp_plan_modules → erp_company_modules (effective = ∩)', FILL, NAVY),
        ('Roles', 'erp_roles / erp_company_roles', FILL, NAVY),
        ('Permissions', 'erp_role_permissions / erp_company_role_permissions', FILL, NAVY),
        ('Companies (Tenants)', 'erp_companies — one per customer', '#FFF7E6', AMBER),
        ('Users', 'erp_profiles via erp_user_branches (role per branch)', '#FFF7E6', AMBER),
        ('RLS (Row-Level Security)', 'company_id scoping — the hard isolation boundary', '#FDECEC', RED),
        ('Database (Postgres)', '129 erp_* tables · Supabase', '#EEF2FF', NAVY),
    ]
    n=len(chain); top=19.2; gap=2.12; w=6.2; h=1.25
    cx=4.4
    ys=[top-i*gap for i in range(n)]
    for i,(t,sub,fc,ec) in enumerate(chain):
        box(ax, cx, ys[i], w, h, t, fc=fc, ec=ec, tc=NAVY, fs=11)
        label(ax, cx, ys[i]-0.52, sub, fs=7.5)
        if i>0: arrow(ax, (cx, ys[i-1]-h/2-0.04), (cx, ys[i]+h/2+0.04))
    # side brackets
    ax.plot([8.0,8.4,8.4,8.0],[ys[0]+0.6, ys[0]+0.6, ys[4]-0.6, ys[4]-0.6], color=CYAN, lw=1.4)
    ax.text(8.55,(ys[0]+ys[4])/2,'GOVERNANCE\n(vendor defines)', rotation=90, va='center', ha='left',
            fontsize=8.5, color=CYAN, fontweight='bold')
    ax.plot([8.0,8.4,8.4,8.0],[ys[5]+0.6, ys[5]+0.6, ys[8]-0.6, ys[8]-0.6], color=AMBER, lw=1.4)
    ax.text(8.55,(ys[5]+ys[8])/2,'RUNTIME\n(enforced per request)', rotation=90, va='center', ha='left',
            fontsize=8.5, color=AMBER, fontweight='bold')
    ax.set_title('VANTORA — Governance & Control Flow', fontsize=13, color=NAVY, fontweight='bold', pad=10)
    save(fig,'arch.png')

# ───────────────────────── 2. ERD OVERVIEW ─────────────────────────
def erd():
    fig, ax = plt.subplots(figsize=(9.6, 7.2)); ax.axis('off')
    ax.set_xlim(0, 16); ax.set_ylim(0, 12)
    def e(cx,cy,t,fc=FILL,ec=NAVY,w=2.5,h=0.95,fs=9): box(ax,cx,cy,w,h,t,fc=fc,ec=ec,fs=fs)
    # hub
    e(8,6,'COMPANIES', fc=LIGHT, ec=CYAN, w=3.0, h=1.15, fs=11)
    # left: plans/modules
    e(2.4,9.2,'PLANS'); e(2.4,6.6,'MODULES');
    # top: branches/users/roles/perms
    e(6.2,10.4,'BRANCHES'); e(2.4,3.6,'BILLING')
    e(10.0,10.4,'USERS\n(profiles)')
    e(13.4,9.2,'ROLES'); e(13.4,6.6,'PERMISSIONS')
    # right/bottom commerce
    e(13.4,3.8,'CUSTOMERS'); e(13.4,1.4,'SUPPLIERS')
    e(8,2.0,'PRODUCTS'); e(10.6,4.0,'INVOICES'); e(5.4,3.6,'INVENTORY')
    e(6.0,0.7,'AUDIT LOGS', fc='#FDECEC', ec=RED)
    rel=[  # (p1, p2, card)
        ((3.5,9.0),(6.7,6.4),'1—*'),     # plan→company (plan_key)
        ((3.6,6.6),(6.5,6.0),'*—*'),     # modules↔company (company_modules)
        ((2.4,8.7),(2.4,7.1),'*—*'),     # plans↔modules (plan_modules)
        ((6.9,6.5),(6.2,9.9),'1—*'),     # company→branches
        ((6.9,10.4),(8.7,10.4),'1—*'),   # branches→users
        ((9.4,6.5),(12.1,9.0),'1—*'),    # company→roles
        ((13.4,8.7),(13.4,7.1),'*—*'),   # roles↔permissions
        ((9.5,6.0),(12.1,4.1),'1—*'),    # company→customers
        ((9.5,5.6),(12.2,1.6),'1—*'),    # company→suppliers
        ((8.0,5.4),(8.0,2.5),'1—*'),     # company→products
        ((12.6,3.6),(11.3,4.1),'1—*'),   # customer→invoices
        ((9.0,2.2),(9.9,3.7),'*—*'),     # products↔invoices (lines)
        ((7.3,2.0),(6.0,3.3),'1—*'),     # products→inventory
        ((6.8,5.5),(6.2,3.9),'1—*'),     # company→inventory
        ((7.2,5.5),(6.4,1.1),'1—*'),     # company→audit
        ((7.0,5.6),(3.2,3.9),'1—*'),     # company→billing
    ]
    for p1,p2,c in rel:
        arrow(ax,p1,p2,color=GREY,lw=1.1,style='-')
        mx,my=(p1[0]+p2[0])/2,(p1[1]+p2[1])/2
        ax.text(mx,my,c,fontsize=7,color=NAVY,ha='center',va='center',
                bbox=dict(boxstyle='round,pad=0.1',fc='white',ec='none'))
    ax.set_title('VANTORA — Entity Relationship Overview (ownership chains)', fontsize=13, color=NAVY, fontweight='bold', pad=8)
    save(fig,'erd.png')

# ───────────────────────── 3. WORKFLOW LANES ─────────────────────────
def workflows():
    flows=[
     ('New Company Onboarding',['Create company','Seed roles + modules\n(business type)','Tighten\n(e.g. clothing→fashion)','Create admin user','Ready']),
     ('User Creation',['Admin invites','auth.users + identity','Trigger → profile','Assign branch + role','Audit']),
     ('Role Assignment',['Pick user','Pick role','Set erp_user_branches.role','Permissions recomputed','Audit']),
     ('Plan Assignment',['Owner sets plan_key','plan_modules = entitlement','Effective modules\n= company ∩ plan','Nav updates']),
     ('Module Enablement',['Owner toggles\ncompany_module','Effective = company ∩ plan','Guards + nav reflect','Audit']),
     ('Permission Resolution',['Memberships → roles','company_role_perms\n(or global default)','+ fashion umbrella','Effective permissions','Guards / UI gate']),
     ('Audit Logging',['Guarded mutation','logAudit()','erp_log_audit RPC\n(stamps actor)','erp_audit_logs','Vendor + tenant viewers']),
    ]
    fig, ax = plt.subplots(figsize=(10.2, 12.2)); ax.axis('off')
    ax.set_xlim(0, 22); ax.set_ylim(0, len(flows)*3+1)
    for li,(title,steps) in enumerate(flows):
        y=(len(flows)-li)*3-0.5
        ax.text(0.2, y+0.95, f'{li+1}. {title}', fontsize=10.5, color=NAVY, fontweight='bold', ha='left')
        n=len(steps); x0=1.0; bw=3.4; gapx=(20.5-x0 - bw)/(max(n-1,1));
        xs=[x0+bw/2 + i*((20.5-x0-bw)/(n-1) if n>1 else 0) for i in range(n)]
        for i,s in enumerate(steps):
            fc = LIGHT if i==0 else ('#EEF2FF' if i==n-1 else FILL)
            box(ax, xs[i], y, bw, 1.15, s, fc=fc, ec=NAVY, fs=8.2)
            if i>0: arrow(ax,(xs[i-1]+bw/2,y),(xs[i]-bw/2,y))
    ax.set_title('VANTORA — Operational Workflow Maps', fontsize=13, color=NAVY, fontweight='bold', pad=8)
    save(fig,'workflows.png')

# ───────────────────────── 4. MODULE DEPENDENCY MAP ─────────────────────────
def deps():
    fig, ax = plt.subplots(figsize=(10.4, 7.6)); ax.axis('off')
    ax.set_xlim(0, 20); ax.set_ylim(0, 14)
    # base capability row
    base={'sales':(4,2),'inventory':(9,2),'accounting':(14,2),'field_ops':(18,2),
          'customers':(2,2),'products':(11.5,2)}
    for k,(x,y) in base.items(): box(ax,x,y,2.3,1.0,k,fc=LIGHT,ec=CYAN,fs=8.5)
    # dependent modules (above), arrow → dependency
    dep={
      'pos':(['sales','inventory'],(6.5,6)),
      'sales_orders':(['sales'],(3,6)),
      'returns':(['sales'],(1.2,8)),
      'warehousing':(['inventory'],(9,6)),
      'market':(['sales','inventory'],(11.5,6)),
      'wholesale':(['sales'],(4.8,8)),
      'restaurant':(['sales'],(7.0,8)),
      'distribution':(['sales','field_ops'],(16.5,6)),
      'fashion':(['sales','inventory'],(13.8,8)),
      'sales (core)':(['customers','products','inventory','accounting'],(3.0,11)),
    }
    for k,(deplist,(x,y)) in dep.items():
        fc = '#FFF7E6' if k.startswith('fashion') or k=='distribution' else FILL
        box(ax,x,y,2.5,1.0,k,fc=fc,ec=NAVY,fs=8.2)
        for d in deplist:
            tx,ty = base.get(d,(x,2))
            arrow(ax,(x,y-0.5),(tx,ty+0.5),color=GREY,lw=1.2)
    # legend
    ax.text(0.3,13.4,'Arrow = "depends on / works best with". Cyan = core capability.',fontsize=8.5,color=GREY,fontstyle='italic')
    ax.set_title('VANTORA — Module Dependency Map', fontsize=13, color=NAVY, fontweight='bold', pad=8)
    save(fig,'deps.png')

# ───────────────────────── 5. READINESS SCORES ─────────────────────────
def scores():
    data=[('Security',9.0),('Tenant Isolation',9.0),('Governance',9.0),
          ('Maintainability',8.0),('Production Readiness',8.5),('Scalability',7.5),
          ('Current Maturity (overall)',8.5)]
    labels=[d[0] for d in data][::-1]; vals=[d[1] for d in data][::-1]
    cols=[GREEN if v>=8.5 else (CYAN if v>=7.5 else AMBER) for v in vals]
    fig, ax = plt.subplots(figsize=(8.4, 4.4))
    bars=ax.barh(labels, vals, color=cols, edgecolor='white')
    ax.set_xlim(0,10)
    for b,v in zip(bars,vals):
        ax.text(v+0.12, b.get_y()+b.get_height()/2, f'{v:.1f}/10', va='center', fontsize=9, color=NAVY, fontweight='bold')
    ax.set_xlabel('Score (out of 10)', fontsize=9, color=GREY)
    ax.spines[['top','right']].set_visible(False)
    ax.tick_params(labelsize=9)
    ax.set_title('Architecture Readiness Assessment', fontsize=12.5, color=NAVY, fontweight='bold', pad=8)
    save(fig,'scores.png')

print('Generating diagrams...')
arch(); erd(); workflows(); deps(); scores()
print('Done.')
