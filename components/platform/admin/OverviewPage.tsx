'use client';
import Link from 'next/link';
import { Notice } from '../shared';
import type { OverviewResponse } from '@/lib/admin/overview';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Section, StatGrid, adminQuery, useAdminData, useNow, useUrlFilters, type FilterField, type FilterValues } from './kit';
import { TimeSeriesChart } from './charts';
import { formatNumber, timeAgo } from './format';

// Admin › Overview: the headline numbers for the chosen period, each against the equally long period before it, and the
// platform activity chart. Everything comes from GET /api/admin/overview, refreshed every minute.

const POLL_MS=60000;
const DEFAULTS:FilterValues={date:'7d',from:'',to:''};
const FIELDS:FilterField[]=[{type:'dateRange'}];

export default function OverviewPage() {
  return <AdminPage section="overview" title="Overview" description="How Repoggits is being used: people, projects, AI and the platform itself, each compared with the period before."><Dashboard/></AdminPage>;
}

function Dashboard() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const {data,error,loading}=useAdminData<OverviewResponse>(ready?`admin/overview?${adminQuery(values)}`:null,{pollMs:POLL_MS});
  const now=useNow(15000);
  return <>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span aria-live="polite">{data?`${data.range.label} · updated ${timeAgo(data.generatedAt,now)}`:loading?'Loading the dashboard…':''}</span>
      <span className="admin-section-links"><Link className="inline-link" href="/admin/analytics">Detailed analytics</Link><Link className="inline-link" href="/admin/live">Live monitoring</Link></span>
    </div>
    {data&&<>
      <StatGrid cards={data.cards} label="Platform statistics"/>
      <Section title="Platform activity" description={`Page views, project views and logins per ${data.range.bucket} across ${data.range.label.toLowerCase()}. Every tile above links to the log or page behind it.`}>
        <TimeSeriesChart title="Platform activity" labels={data.labels} bucket={data.range.bucket} series={[
          {key:'pageViews',label:'Page views',values:data.activity.pageViews},
          {key:'projectViews',label:'Project views',values:data.activity.projectViews},
          {key:'logins',label:'Logins',values:data.activity.logins},
        ]}/>
      </Section>
      <p className="admin-note">Percentage changes compare this period with the equally long one before it; a tile reads &quot;No earlier period to compare&quot; when the logs do not reach that far back. {formatNumber(data.onlineWindowSeconds)} seconds without a heartbeat marks a session offline.</p>
    </>}
    {!data&&!error&&<p className="admin-note" role="status">Loading the dashboard…</p>}
  </>;
}
