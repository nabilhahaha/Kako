-- Field Insights — Phase 1: seed the FMCG default configuration.
-- These are global (company_id null), default, v1 frameworks. Companies can
-- later add overrides / new versions without touching these.

do $$
declare dvap uuid; health uuid; vq uuid; oppf uuid; stages uuid;
        gulf uuid;
begin
  -- DVAP assessment scorecard --------------------------------------------
  insert into frameworks(key,name,kind,industry,is_default,description)
    values('dvap','DVAP Scorecard','assessment','fmcg',true,
           'Distribution, Visibility, Availability, Pricing, Promotion')
    returning id into dvap;
  insert into framework_dimensions(framework_id,key,label,weight,sort) values
    (dvap,'distribution','Distribution',0.25,1),
    (dvap,'visibility','Visibility',0.20,2),
    (dvap,'availability','Availability',0.25,3),
    (dvap,'pricing','Pricing',0.15,4),
    (dvap,'promotion','Promotion',0.15,5);
  insert into framework_bands(framework_id,key,label,min_score,max_score,color,sort) values
    (dvap,'poor','Poor',0,49,'#DC2626',1),
    (dvap,'fair','Fair',50,69,'#F59E0B',2),
    (dvap,'good','Good',70,84,'#10B981',3),
    (dvap,'excellent','Excellent',85,100,'#0F2A43',4);
  insert into framework_rules(framework_id,dimension_id,name,comparator,threshold,action,action_params,sort)
    select dvap, d.id, r.nm, r.cmp::rule_comparator, r.thr, r.act::rule_action, r.params::jsonb, r.srt
    from (values
      ('availability','OOS risk','lt',60,'spawn_issue','{"issue_type":"out_of_stock","severity":"high"}',1),
      ('pricing','Pricing gap','lt',60,'spawn_issue','{"issue_type":"pricing_issue","severity":"medium"}',2),
      ('visibility','Improve visibility','lt',60,'spawn_action','{"description":"Improve shelf visibility"}',3),
      ('distribution','Distribution gap','lt',60,'spawn_opportunity','{"title":"Close distribution gap"}',4)
    ) as r(dimkey,nm,cmp,thr,act,params,srt)
    join framework_dimensions d on d.framework_id=dvap and d.key=r.dimkey;

  -- Customer Health composite --------------------------------------------
  insert into frameworks(key,name,kind,industry,is_default,description)
    values('customer_health','Customer Health Model','health','fmcg',true,
           'Composite health from DVAP, visit recency, issues, opportunities, pricing')
    returning id into health;
  insert into framework_dimensions(framework_id,key,label,weight,sort) values
    (health,'dvap','Execution (DVAP)',0.30,1),
    (health,'recency','Visit recency',0.20,2),
    (health,'issues','Open issues',0.20,3),
    (health,'opportunity','Opportunity momentum',0.15,4),
    (health,'pricing','Pricing competitiveness',0.15,5);
  insert into framework_bands(framework_id,key,label,min_score,max_score,color,sort) values
    (health,'critical','Critical',0,39,'#DC2626',1),
    (health,'at_risk','At risk',40,59,'#F59E0B',2),
    (health,'watch','Watch',60,79,'#3B82F6',3),
    (health,'healthy','Healthy',80,100,'#10B981',4);

  -- Visit Quality Score --------------------------------------------------
  insert into frameworks(key,name,kind,industry,is_default,description)
    values('visit_quality','Visit Quality Score','visit_quality','fmcg',true,
           'Visit completeness and value rubric')
    returning id into vq;
  insert into framework_dimensions(framework_id,key,label,weight,sort) values
    (vq,'objective','Objective set',10,1),
    (vq,'summary_outcome','Summary & outcome',15,2),
    (vq,'gps','GPS in range',15,3),
    (vq,'photos','Photos captured',15,4),
    (vq,'dvap','DVAP completed',20,5),
    (vq,'competitor','Competitor capture',10,6),
    (vq,'execution','Generated execution',15,7);
  insert into framework_bands(framework_id,key,label,min_score,max_score,color,sort) values
    (vq,'low','Low',0,49,'#DC2626',1),
    (vq,'fair','Fair',50,74,'#F59E0B',2),
    (vq,'good','Good',75,89,'#10B981',3),
    (vq,'excellent','Excellent',90,100,'#0F2A43',4);

  -- Opportunity Scoring --------------------------------------------------
  insert into frameworks(key,name,kind,industry,is_default,description)
    values('opportunity_scoring','Opportunity Scoring','opportunity_scoring','fmcg',true,
           'Weighted opportunity score feeding probability')
    returning id into oppf;
  insert into framework_dimensions(framework_id,key,label,weight,sort) values
    (oppf,'value','Value',0.40,1),
    (oppf,'urgency','Urgency',0.20,2),
    (oppf,'strategic_fit','Strategic fit',0.20,3),
    (oppf,'likelihood','Likelihood',0.20,4);
  insert into framework_bands(framework_id,key,label,min_score,max_score,color,sort) values
    (oppf,'cold','Cold',0,39,'#3B82F6',1),
    (oppf,'warm','Warm',40,69,'#F59E0B',2),
    (oppf,'hot','Hot',70,100,'#DC2626',3);

  -- Customer Development stage model -------------------------------------
  insert into frameworks(key,name,kind,industry,is_default,description)
    values('customer_dev_stages','Customer Development Stages','stage_model','fmcg',true,
           'Lifecycle from prospect to strategic / at-risk / dormant')
    returning id into stages;
  insert into framework_stages(framework_id,key,label,sort,is_entry,is_terminal) values
    (stages,'prospect','Prospect',1,true,false),
    (stages,'onboarding','Onboarding',2,false,false),
    (stages,'developing','Developing',3,false,false),
    (stages,'established','Established',4,false,false),
    (stages,'strategic','Strategic',5,false,false),
    (stages,'at_risk','At Risk',6,false,false),
    (stages,'dormant','Dormant',7,false,true);

  -- Starter geography ----------------------------------------------------
  insert into regions(name) values ('Gulf') returning id into gulf;
  insert into areas(region_id,name,city) values
    (gulf,'Dubai','Dubai'),
    (gulf,'Abu Dhabi','Abu Dhabi'),
    (gulf,'Sharjah','Sharjah');

  -- Competitor catalog ---------------------------------------------------
  insert into competitors(name) values ('Competitor A'),('Competitor B'),('Competitor C');
end $$;
