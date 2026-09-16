'use client';
import Link from 'next/link';
import { Notice } from '../shared';
import type { ActivityAnalytics, AnalyticsResponse, DevicesAnalytics, NamedValue, UsersAnalytics, VisitorsAnalytics } from '@/lib/admin/analytics';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, FactGrid, QuickFilter, Section, adminQuery, useAdminData, useUrlFilters, type FilterField, type FilterValues } from './kit';
import { BarList, ColumnChart, RetentionGrid, ShareBar, TimeSeriesChart } from './charts';
import { bucketLabel, formatNumber, formatPercent } from './format';
import './admin-insights.css';

// Admin › Analytics: four views over one date range, each answering one question — who signs up and comes back, what
// people do, how many visitors there are, and what they browse on. Project analytics and AI usage read the same
// endpoint from their own pages (?view=projects and ?view=ai).

const VIEWS=[{key:'users',label:'Users and growth'},{key:'activity',label:'Activity'},{key:'visitors',label:'Visitors'},{key:'devices',label:'Devices'}] as const;
const DEFAULTS:FilterValues={view:'users',date:'30d',from:'',to:''};
const FIELDS:FilterField[]=[{type:'dateRange'}];

export default function AnalyticsPage() {
  return <AdminPage section="analytics" title="Analytics" description="Growth, engagement, visitors and devices over the range you choose. Aggregated from tracked activity: no prompt text, IP address or user agent is read."><Analytics/></AdminPage>;
}

function Analytics() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const {data,error,loading}=useAdminData<AnalyticsResponse>(ready?`admin/analytics?${adminQuery(values)}`:null);
  const view=values.view||'users';
  return <>
    <div className="admin-quick-filters admin-view-tabs" role="group" aria-label="Analytics view">
      {VIEWS.map(option=><QuickFilter key={option.key} pressed={view===option.key} onClick={()=>update({view:option.key})}>{option.label}</QuickFilter>)}
    </div>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span aria-live="polite">{data?data.range.label:loading?'Loading analytics…':''}</span>
      <span className="admin-section-links"><Link className="inline-link" href="/admin/projects">Project analytics</Link><Link className="inline-link" href="/admin/ai">AI usage</Link></span>
    </div>
    {data?.view==='users'&&<UsersView data={data}/>}
    {data?.view==='activity'&&<ActivityView data={data}/>}
    {data?.view==='visitors'&&<VisitorsView data={data}/>}
    {data?.view==='devices'&&<DevicesView data={data}/>}
    {!data&&!error&&<p className="admin-note" role="status">Loading analytics…</p>}
  </>;
}

function UsersView({data}:{data:UsersAnalytics}) {
  const bucket=data.range.bucket;
  return <>
    <FactGrid label="Sign-ups and activity" facts={[
      {key:'new',label:'New sign-ups',value:formatNumber(data.newUsers),hint:'Accounts created in this range'},
      {key:'total',label:'Accounts in total',value:formatNumber(data.cumulative.at(-1)),hint:'At the end of this range'},
      {key:'dau',label:'Active on the last day',value:formatNumber(data.dau.at(-1)),hint:'Distinct signed-in users'},
      {key:'mau',label:'Active in 30 days',value:formatNumber(data.mau.at(-1)),hint:'Distinct signed-in users, rolling'},
    ]}/>
    <div className="admin-grid-2">
      <Section title="New sign-ups" description="Accounts created in each period.">
        <ColumnChart title="New sign-ups" labels={data.labels} bucket={bucket} series={[{key:'registrations',label:'Sign-ups',values:data.registrations}]}/>
      </Section>
      <Section title="Total accounts" description="Every account that existed at the end of each period.">
        <TimeSeriesChart title="Total accounts" labels={data.labels} bucket={bucket} series={[{key:'cumulative',label:'Accounts',values:data.cumulative}]}/>
      </Section>
    </div>
    <Section title="Active users" description="Distinct signed-in users over the 1, 7 and 30 days ending with each period, so the three lines overlap by design.">
      <TimeSeriesChart title="Daily, weekly and monthly active users" labels={data.labels} bucket={bucket} series={[
        {key:'dau',label:'Daily active',values:data.dau},{key:'wau',label:'Weekly active',values:data.wau},{key:'mau',label:'Monthly active',values:data.mau},
      ]}/>
    </Section>
    <Section title="New against returning" description="Whether the people active in a period had just signed up or were coming back.">
      <ColumnChart title="New against returning active users" labels={data.labels} bucket={bucket} series={[
        {key:'new',label:'New that period',values:data.newActive},{key:'returning',label:'Returning',values:data.returningActive},
      ]}/>
    </Section>
    <Section title="Retention by sign-up week" description="Of everyone who signed up in a week, the share still active in the weeks that followed. Week 0 is the sign-up week itself; a blank cell is a week that has not happened yet.">
      <RetentionGrid periods={8} periodLabel="Week" cohorts={data.cohorts.map(cohort=>({label:bucketLabel(cohort.week,'week',true),size:cohort.size,values:cohort.values}))}/>
    </Section>
  </>;
}

const LOG_LINKS:Record<string,string>={page_views:'/admin/logs?event=page_view',project_views:'/admin/logs?event=project_view',shares:'/admin/logs?event=project_share',downloads:'/admin/logs?event=project_download',logins:'/admin/logs?event=login',searches:'/admin/logs?event=search',prompts:'/admin/logs/prompts'};
function ActivityView({data}:{data:ActivityAnalytics}) {
  const totals=data.series.map(series=>({key:series.key,label:series.label,value:series.values.reduce((sum,value)=>sum+value,0)}));
  return <>
    <Section title="What people did" description={`Counted actions per ${data.range.bucket}. Each line is one kind of event; the data table under the chart has the exact numbers.`}>
      <TimeSeriesChart title="Activity over time" labels={data.labels} bucket={data.range.bucket} series={data.series}/>
    </Section>
    <div className="admin-grid-2">
      <Section title="Actions in this range" description="The totals behind the chart above, each linking to its log." actions={<Link className="inline-link" href="/admin/logs">Global activity</Link>}>
        <BarList label="Actions by kind" items={totals.map(item=>({key:item.key,label:item.label,value:item.value,href:LOG_LINKS[item.key]}))} empty="No tracked activity in this range."/>
      </Section>
      <Section title="Most viewed pages" description="The ten paths with the most page views. Query strings are never recorded.">
        <BarList label="Most viewed pages" items={data.topPages.map(row=>({key:row.page,label:row.page,value:row.views,href:`/admin/logs?event=page_view&q=${encodeURIComponent(row.page)}`}))} empty="No page views in this range."/>
      </Section>
    </div>
  </>;
}

function VisitorsView({data}:{data:VisitorsAnalytics}) {
  const {totals}=data;
  const newVisitors=Math.max(0,totals.unique-totals.returning);
  return <>
    <FactGrid label="Visitors" facts={[
      {key:'unique',label:'Unique visitors',value:formatNumber(totals.unique),hint:'Browsers merged into the account that later signed in on them'},
      {key:'returning',label:'Returning',value:formatNumber(totals.returning),hint:`First seen before this range · ${formatPercent(totals.unique?totals.returning/totals.unique*100:0)} of visitors`},
      {key:'new',label:'New',value:formatNumber(newVisitors),hint:'First seen inside this range'},
      {key:'authenticated',label:'Signed in',value:formatNumber(totals.authenticated),hint:'Accounts with tracked activity'},
      {key:'anonymous',label:'Anonymous',value:formatNumber(totals.anonymous),hint:'Browsers that never signed in'},
    ]}/>
    <Section title="Signed in against anonymous" description="Distinct visitors in each period, split by whether they were signed in.">
      <ColumnChart title="Signed in against anonymous visitors" labels={data.labels} bucket={data.range.bucket} series={[
        {key:'authenticated',label:'Signed in',values:data.authenticated},{key:'anonymous',label:'Anonymous',values:data.anonymous},
      ]}/>
    </Section>
    <p className="admin-note">A visitor is recognised only by the first-party cookie, stored as a hash: there is no fingerprinting and no third-party script. One person on two browsers counts twice until they sign in on both.</p>
  </>;
}

function DevicesView({data}:{data:DevicesAnalytics}) {
  const named=(items:NamedValue[])=>items.filter(item=>item.value>0);
  const {device,os,browser}=data.mostCommon;
  return <>
    <FactGrid label="Devices" facts={[
      {key:'people',label:'People in this range',value:formatNumber(data.people),hint:'Distinct visitors with a tracked session'},
      {key:'device',label:'Most common device',value:device?device.label:'—',hint:device?`${formatNumber(device.value)} people`:'No sessions in this range'},
      {key:'os',label:'Most common OS',value:os?os.label:'—',hint:os?`${formatNumber(os.value)} people`:'No sessions in this range'},
      {key:'browser',label:'Most common browser',value:browser?browser.label:'—',hint:browser?`${formatNumber(browser.value)} people`:'No sessions in this range'},
    ]}/>
    <div className="admin-grid-3">
      <Section title="Device type"><ShareBar label="Device type" items={named(data.devices)}/></Section>
      <Section title="Operating system"><ShareBar label="Operating system" items={named(data.os)}/></Section>
      <Section title="Browser"><ShareBar label="Browser" items={named(data.browsers)}/></Section>
    </div>
    <Section title="Devices over time" description="Distinct people on each kind of device in each period. Bots and unrecognised devices are left out of this chart.">
      <TimeSeriesChart title="Devices over time" labels={data.labels} bucket={data.range.bucket} series={data.overTime}/>
    </Section>
    <p className="admin-note">Device, operating system and browser come from the User-Agent header and User-Agent Client Hints; screen size, language and time zone come from standard browser APIs. Names outside the known families are grouped as Other.</p>
  </>;
}
