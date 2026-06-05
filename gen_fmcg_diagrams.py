#!/usr/bin/env python3
"""FMCG Distribution Pack diagrams."""
import os, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT='docs/diagrams/fmcg'; os.makedirs(OUT, exist_ok=True)
NAVY='#1F3A5F'; CYAN='#0BC5DA'; LIGHT='#EAF6F9'; GREY='#6B7280'; FILL='#F3F6FA'
AMBER='#D97706'; GREEN='#16A34A'; PUR='#6D28D9'; RED='#DC2626'

def box(ax,cx,cy,w,h,t,fc=FILL,ec=NAVY,fs=9,tc=NAVY):
    ax.add_patch(FancyBboxPatch((cx-w/2,cy-h/2),w,h,boxstyle="round,pad=0.02,rounding_size=0.08",
                lw=1.3,edgecolor=ec,facecolor=fc))
    ax.text(cx,cy,t,ha='center',va='center',fontsize=fs,color=tc,fontweight='bold')
def arr(ax,p1,p2,color=CYAN,lw=1.6,style='-|>'):
    ax.add_patch(FancyArrowPatch(p1,p2,arrowstyle=style,mutation_scale=12,lw=lw,color=color,shrinkA=2,shrinkB=2))
def save(fig,n): fig.savefig(f'{OUT}/{n}',dpi=150,bbox_inches='tight',facecolor='white'); plt.close(fig); print('  -',n)

# 1. ARCHITECTURE / MODULE MAP
def arch():
    fig,ax=plt.subplots(figsize=(10.6,7.4)); ax.axis('off'); ax.set_xlim(0,22); ax.set_ylim(0,15)
    ax.text(11,14.4,'FMCG Distribution Enterprise Pack — Architecture',fontsize=13,color=NAVY,fontweight='bold',ha='center')
    # pack capabilities row
    caps=['Customer\nManagement','Route &\nJourney','Van\nSales','Field &\nMerchandising','Trade\nMarketing','Near-Expiry\n& Returns','Distribution\nAnalytics']
    n=len(caps); x0,x1=1,21; w=2.5
    xs=[x0+w/2+i*((x1-x0-w)/(n-1)) for i in range(n)]
    for i,c in enumerate(caps): box(ax,xs[i],11.5,w,1.5,c,fc=LIGHT,ec=CYAN,fs=8.3)
    ax.add_patch(FancyBboxPatch((0.4,10.6),21.2,2.9,boxstyle="round,pad=0.05",lw=1.4,edgecolor=CYAN,facecolor='none'))
    ax.text(0.8,13.2,'PACK',fontsize=8,color=CYAN,fontweight='bold')
    # shared modules
    sh=['sales','inventory','accounting','pricing','crm','workflow','analytics']
    xs2=[x0+w/2+i*((x1-x0-w)/(len(sh)-1)) for i in range(len(sh))]
    for i,s in enumerate(sh): box(ax,xs2[i],6.7,2.3,1.1,s,fc=FILL,ec=NAVY,fs=8.6)
    ax.add_patch(FancyBboxPatch((0.4,6.0),21.2,1.5,boxstyle="round,pad=0.05",lw=1.2,edgecolor=NAVY,facecolor='none'))
    ax.text(0.8,7.2,'SHARED VANTORA MODULES',fontsize=8,color=NAVY,fontweight='bold')
    # foundation
    fo=['RLS / Tenant Isolation','Audit Logging','Plans & Entitlements','Roles & Permissions','Scalability (indexes, rollups)']
    xs3=[x0+2.0+i*((x1-x0-4.0)/(len(fo)-1)) for i in range(len(fo))]
    for i,f in enumerate(fo): box(ax,xs3[i],2.2,3.6,1.1,f,fc='#FDECEC' if i==0 else '#EEF2FF',ec=RED if i==0 else NAVY,fs=8.0)
    ax.add_patch(FancyBboxPatch((0.4,1.5),21.2,1.5,boxstyle="round,pad=0.05",lw=1.2,edgecolor=GREY,facecolor='none'))
    ax.text(0.8,2.75,'PLATFORM FOUNDATION',fontsize=8,color=GREY,fontweight='bold')
    arr(ax,(11,10.5),(11,7.6),color=CYAN); arr(ax,(11,5.9),(11,3.1),color=NAVY)
    save(fig,'fmcg_arch.png')

# 2. ERD
def erd():
    fig,ax=plt.subplots(figsize=(11,7.6)); ax.axis('off'); ax.set_xlim(0,20); ax.set_ylim(0,13)
    ax.text(10,12.4,'FMCG Pack — Entity Relationship Overview',fontsize=13,color=NAVY,fontweight='bold',ha='center')
    def e(x,y,t,fc=FILL,ec=NAVY,w=2.6,h=0.95,fs=8.5): box(ax,x,y,w,h,t,fc=fc,ec=ec,fs=fs)
    e(10,6.4,'CUSTOMER',fc=LIGHT,ec=CYAN,w=3.0,h=1.1,fs=10)
    e(5.0,9.4,'CUSTOMER PROFILE\n(channel/grade/GPS)',w=3.2,fs=7.6)
    e(2.2,6.4,'CHANNEL'); e(2.2,3.4,'ROUTE')
    e(6.0,2.0,'JOURNEY PLAN'); e(10,2.0,'BEAT');
    e(14,2.0,'LOAD SHEET'); e(17.4,3.6,'VAN INVENTORY',w=2.8)
    e(14.5,6.4,'VISIT'); e(17.6,8.6,'STORE AUDIT\n(MSL/OSA)',w=2.8,fs=7.6)
    e(14.7,9.6,'COMPETITOR OBS',w=3.0,fs=7.8)
    e(10,9.8,'TARGETS'); e(6.4,6.4,'PROMOTION'); e(3.0,9.6,'TRADE BUDGET/SPEND',w=3.4,fs=7.6)
    e(6.4,3.9,'CLAIM'); e(10,4.0,'EXPIRY BATCH'); e(13.2,4.0,'RETURN/EXPIRY CLAIM',w=3.2,fs=7.4)
    e(17.7,6.4,'DAILY ROLLUP',w=2.8)
    rel=[((8.5,6.7),(6.4,9.0),'1—1'),((8.7,6.2),(3.3,6.4),'*—1'),((8.6,6.0),(3.0,3.7),'*—1'),
         ((3.4,3.2),(5.2,2.4),'1—*'),((7.4,2.0),(9.0,2.0),'1—*'),((11.0,2.0),(13.0,2.0),'1—*'),
         ((15.2,2.2),(16.6,3.2),'1—*'),((10.6,2.5),(13.9,6.0),'1—*'),((15.8,6.6),(16.6,8.2),'1—1'),
         ((15.6,6.8),(14.2,9.2),'1—*'),((11.0,6.7),(13.5,6.4),'1—*'),((6.4,5.9),(6.4,4.4),'1—*'),
         ((5.6,3.9),(4.3,9.2),'*—1'),((7.0,6.6),(4.4,9.2),'1—*'),((10,5.5),(10,4.5),'1—*'),
         ((11.0,4.0),(11.6,4.0),'1—*'),((11.2,6.6),(10.4,9.3),'1—*'),((11.4,6.2),(16.4,6.4),'·rollup')]
    for p1,p2,c in rel:
        arr(ax,p1,p2,color=GREY,lw=1.0,style='-')
        ax.text((p1[0]+p2[0])/2,(p1[1]+p2[1])/2,c,fontsize=6.6,color=NAVY,ha='center',va='center',
                bbox=dict(boxstyle='round,pad=0.08',fc='white',ec='none'))
    save(fig,'fmcg_erd.png')

# 3. WORKFLOWS
def workflows():
    flows=[
     ('Van-Sales Day Cycle',['Load sheet','Van loaded','Beat: visit →\nsell/return/collect','Day-close:\nvan + cash reconcile','Variance?\nSupervisor approve','Settled']),
     ('Visit & Merchandising',['Check-in\n(GPS validate)','Store audit\nMSL / OSA','Competitor +\nphotos','Sell / order or\nno-sale (+reason)','Check-out →\ncoverage']),
     ('Trade Promotion & Claims',['Plan promo\n(budget)','Activate','Execute in outlet\n(display/price)','Retailer claim','Validate (evidence)\n→ tiered approve','Credit note → ROI']),
     ('Near-Expiry & Old/Expired',['Batch/expiry\ntracking','Near-expiry flag','Near: promo /\npull-back','Old: segregate +\nexpiry claim','Approve','Warehouse process\n(destroy/return) → CN']),
     ('Customer Data Governance (KSA)',['Field captures change\n(GPS/CR/VAT/address)','Change request','Review (compliance)','Tiered approve','Apply + audit']),
    ]
    fig,ax=plt.subplots(figsize=(11.5,10.2)); ax.axis('off'); ax.set_xlim(0,24); ax.set_ylim(0,len(flows)*3+0.5)
    for li,(title,steps) in enumerate(flows):
        y=(len(flows)-li)*3-1.0
        ax.text(0.2,y+1.05,f'{li+1}. {title}',fontsize=10.5,color=NAVY,fontweight='bold')
        n=len(steps); x0=0.8; bw=3.4
        xs=[x0+bw/2+i*((22.5-x0-bw)/(n-1)) for i in range(n)]
        for i,s in enumerate(steps):
            fc=LIGHT if i==0 else ('#EEF2FF' if i==n-1 else FILL)
            box(ax,xs[i],y,bw,1.2,s,fc=fc,ec=NAVY,fs=7.9)
            if i>0: arr(ax,(xs[i-1]+bw/2,y),(xs[i]-bw/2,y))
    ax.set_title('FMCG Pack — Key Operational Workflows',fontsize=13,color=NAVY,fontweight='bold',pad=8)
    save(fig,'fmcg_workflows.png')

# 4. HIERARCHY + SCOPE + APPROVAL (7 roles, branched)
def hierarchy():
    fig,ax=plt.subplots(figsize=(11.0,8.6)); ax.axis('off'); ax.set_xlim(0,18); ax.set_ylim(0,17)
    ax.text(9,16.4,'FMCG Sales Hierarchy (7 roles) — Scope & Approval Authority',fontsize=12.5,color=NAVY,fontweight='bold',ha='center')
    levels=[('National Sales Manager','National','targets, promotions, listing fees, all claims/write-offs',CYAN,'#EAF6F9'),
            ('Regional Sales Manager','Region','targets, promos, claims ≤ L3, CR/VAT/address, credit limits',NAVY,FILL),
            ('Area Manager','Area','promos, listing, claims ≤ L2, write-offs ≤ L2, targets, CR/VAT/address',NAVY,FILL),
            ('Supervisor','Route / Team','route riding & accompaniment; out-of-route, GPS override, day-close exception, GPS-CR, claims ≤ L1',AMBER,'#FFF7E6')]
    y=14.8; h=1.4; cx=5.6; w=6.6; ys=[]
    for i,(t,scope,appr,ec,fc) in enumerate(levels):
        yy=y-i*2.5; ys.append(yy)
        box(ax,cx,yy,w,h,t,fc=fc,ec=ec,fs=10.4)
        ax.text(cx+w/2+0.3,yy+0.26,'Scope: '+scope,fontsize=8.0,color=NAVY,fontweight='bold',va='center',ha='left')
        ax.text(cx+w/2+0.3,yy-0.34,'Approves: '+appr,fontsize=6.9,color=GREY,va='center',ha='left',fontstyle='italic')
        if i>0: arr(ax,(cx,ys[i-1]-h/2),(cx,yy+h/2),color=NAVY)
    # branch: 3 field roles under Supervisor
    field=[('Salesman','Own outlets · pre-sell\norders + collections','#ECFDF3',GREEN),
           ('Van Salesman','Own route · van stock\nsell/return/collect','#ECFDF3',GREEN),
           ('Merchandiser','Audit-only\nMSL/OSA/SOS/planogram/photos','#F5F3FF',PUR)]
    fy=ys[-1]-2.6; fxs=[3.0,8.6,14.2]; fw=4.6
    arr(ax,(cx,ys[-1]-h/2),(cx,fy+1.5),color=NAVY)
    for (t,sub,fc,ec),fx in zip(field,fxs):
        box(ax,fx,fy,fw,1.45,t,fc=fc,ec=ec,fs=10.0)
        ax.text(fx,fy-1.05,sub,fontsize=7.4,color=GREY,ha='center',va='center',fontstyle='italic')
        arr(ax,(cx,fy+1.5),(fx,fy+0.75),color=GREY,lw=1.2,style='-|>')
    ax.text(cx,ys[0]+1.25,'Targets cascade DOWN  ·  Achievement & approvals roll UP',fontsize=8.5,color=CYAN,fontweight='bold',ha='center')
    save(fig,'fmcg_hierarchy.png')

print('Generating FMCG diagrams...')
arch(); erd(); workflows(); hierarchy()
print('Done.')
