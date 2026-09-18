'use client';
import Link from 'next/link';
import { Notice } from '../shared';
import type { ActiveUser, ProjectsAnalytics, RankedProject } from '@/lib/admin/analytics';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, DataTable, FactGrid, PersonLink, Section, adminQuery, useAdminData, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { BarList, ColumnChart, type RankedItem } from './charts';
import { formatNumber } from './format';
import './admin-insights.css';

// Admin › Project analytics: what was created in this range, which projects drew views, shares and downloads, who was
// busiest, and what the library is made of. GET /api/admin/analytics?view=projects.

const DEFAULTS:FilterValues={date:'30d',from:'',to:''};
const FIELDS:FilterField[]=[{type:'dateRange'}];

export default function ProjectAnalyticsPage() {
  return <AdminPage section="projects" title="Project analytics" description="Which projects people view, share and download, who is building them, and what the library is made of." actions={<Link className="button outline" href="/admin/library">Project library</Link>}><ProjectInsights/></AdminPage>;
}

/** A ranked project row: its count in this range, and its all-time total where the API reports one. */
const projectItems=(rows:RankedProject[],unit:string):RankedItem[]=>rows.map(row=>({
  key:row.project.id,label:row.project.title,value:row.count,href:`/projects/${row.project.id}`,
  detail:row.allTime===null?undefined:`${formatNumber(row.allTime)} ${unit} all time`,
}));

function ProjectInsights() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const {data,error,loading}=useAdminData<ProjectsAnalytics>(ready?`admin/analytics?${adminQuery(values,{view:'projects'})}`:null);
  const columns:Column<ActiveUser>[]=[
    {key:'user',label:'User',render:row=><PersonLink person={row.user}/>},
    {key:'total',label:'Total actions',render:row=>formatNumber(row.total)},
    {key:'events',label:'Tracked events',render:row=>formatNumber(row.events)},
    {key:'projects',label:'Projects created',render:row=>formatNumber(row.projects)},
    {key:'prompts',label:'Prompts',render:row=>formatNumber(row.prompts)},
  ];
  const topProject=data?.mostViewed[0],topUser=data?.activeUsers[0];
  return <>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span aria-live="polite">{data?data.range.label:loading?'Loading project analytics…':''}</span>
      <span className="admin-section-links"><Link className="inline-link" href="/admin/analytics">All analytics</Link><Link className="inline-link" href="/admin/logs?event=project_view">Project view log</Link></span>
    </div>
    {data&&<>
      <FactGrid label="Projects" facts={[
        {key:'created',label:'Created in this range',value:formatNumber(data.createdInRange),hint:data.range.label},
        {key:'total',label:'Projects in total',value:formatNumber(data.totalProjects),hint:'Every project, archived or not',href:'/admin/library'},
        {key:'top',label:'Most viewed project',value:topProject?topProject.project.title:'—',hint:topProject?`${formatNumber(topProject.count)} views in this range`:'No project views in this range',href:topProject?`/projects/${topProject.project.id}`:undefined},
        {key:'builder',label:'Most active person',value:topUser?topUser.user.name:'—',hint:topUser?`${formatNumber(topUser.total)} tracked actions`:'No activity in this range',href:topUser?`/admin/users/${topUser.user.id}`:undefined},
      ]}/>
      <Section title="Projects created" description="New projects in each period of this range.">
        <ColumnChart title="Projects created" labels={data.labels} bucket={data.range.bucket} series={[{key:'created',label:'Projects created',values:data.created}]}/>
      </Section>
      <div className="admin-grid-3">
        <Section title="Most viewed" description="Project views counted in this range.">
          <BarList label="Most viewed projects" items={projectItems(data.mostViewed,'views')} empty="No project views in this range."/>
        </Section>
        <Section title="Most shared" description="Shares counted in this range.">
          <BarList label="Most shared projects" items={projectItems(data.mostShared,'shares')} empty="No shares in this range."/>
        </Section>
        <Section title="Most downloaded" description="Downloads counted in this range.">
          <BarList label="Most downloaded projects" items={projectItems(data.mostDownloaded,'downloads')} empty="No downloads in this range."/>
        </Section>
      </div>
      <Section title="Most active people" description="Tracked events, projects created and prompts in this range, highest total first.">
        <DataTable caption="Most active people" columns={columns} rows={data.activeUsers} rowKey={row=>row.user.id} empty="Nobody was active in this range."/>
      </Section>
      <div className="admin-grid-3">
        <Section title="Departments"><BarList label="Projects by department" items={data.departments.map(item=>({key:item.key,label:item.label,value:item.value}))} empty="No departments recorded."/></Section>
        <Section title="Subjects"><BarList label="Projects by subject" items={data.subjects.map(item=>({key:item.key,label:item.label,value:item.value}))} empty="No subjects recorded."/></Section>
        <Section title="Tags"><BarList label="Projects by tag" items={data.tags.map(item=>({key:item.key,label:item.label,value:item.value}))} empty="No tags recorded."/></Section>
      </div>
      <p className="admin-note">Departments, subjects and tags describe each project as its latest version left it and leave out archived projects, so they cover the whole library rather than this date range.</p>
    </>}
    {!data&&!error&&<p className="admin-note" role="status">Loading project analytics…</p>}
  </>;
}
