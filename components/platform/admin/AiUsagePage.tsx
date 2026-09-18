'use client';
import Link from 'next/link';
import { Notice } from '../shared';
import type { AiAnalytics } from '@/lib/admin/analytics';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Section, StatGrid, adminQuery, useAdminData, useUrlFilters, type FilterField, type FilterValues } from './kit';
import { BarList, ColumnChart, ShareBar, TimeSeriesChart } from './charts';
import { formatDuration, formatNumber } from './format';
import './admin-insights.css';

// Admin › AI usage: how much the assistant is used, how it ends and how long it takes, by feature, person and project.
// GET /api/admin/analytics?view=ai, which needs the prompts permission. Prompt text is never part of this view; reading
// one prompt happens on Prompt logs, with prompt_content, and is audited.

const DEFAULTS:FilterValues={date:'30d',from:'',to:''};
const FIELDS:FilterField[]=[{type:'dateRange'}];

export default function AiUsagePage() {
  return <AdminPage section="ai" title="AI usage" description="Prompt volume, outcomes and response times for the Gemini assistant, and who and what it is used for." actions={<Link className="button outline" href="/admin/logs/prompts">Prompt logs</Link>}><AiInsights/></AdminPage>;
}

function AiInsights() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const {data,error,loading}=useAdminData<AiAnalytics>(ready?`admin/analytics?${adminQuery(values,{view:'ai'})}`:null);
  const dates=new URLSearchParams(values.date==='custom'?{date:'custom',from:values.from,to:values.to}:{date:values.date});
  const promptLog=(extra:Record<string,string>)=>`/admin/logs/prompts?${new URLSearchParams({...extra,...Object.fromEntries(dates)})}`;
  return <>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span aria-live="polite">{data?data.range.label:loading?'Loading AI usage…':''}</span>
      <span className="admin-section-links"><Link className="inline-link" href="/admin/ai-activity">AI access requests</Link><Link className="inline-link" href="/admin/logs?event=prompt">Prompt activity</Link></span>
    </div>
    {data&&<>
      <StatGrid cards={data.cards} label="AI usage statistics"/>
      <Section title="Prompts over time" description="Every prompt in this range, stacked by how it ended. In-progress prompts join the chart once they finish.">
        <ColumnChart title="Prompts by outcome over time" labels={data.labels} bucket={data.range.bucket} series={data.overTime}/>
      </Section>
      <div className="admin-grid-2">
        <Section title="Outcomes" description="How prompts ended across the whole range.">
          <ShareBar label="Prompt outcomes" items={data.outcomes.filter(item=>item.value>0)}/>
        </Section>
        <Section title="Response time" description="Average time a successful prompt took in each period. A period with no successful prompt reads as zero.">
          <TimeSeriesChart title="Average response time" labels={data.labels} bucket={data.range.bucket} integer={false} format={formatDuration} series={[{key:'averageMs',label:'Average response time',values:data.averageMs}]}/>
        </Section>
      </div>
      <div className="admin-grid-3">
        <Section title="By feature" description="Which part of Repoggits asked.">
          <BarList label="Prompts by feature" items={data.byFeature.map(item=>({key:item.key,label:item.label,value:item.value,href:promptLog({feature:item.key})}))} empty="No prompts in this range."/>
        </Section>
        <Section title="Busiest people" description="The ten accounts with the most prompts.">
          <BarList label="Prompts by person" items={data.byUser.map(row=>({key:row.user.id,label:row.user.name,value:row.count,href:`/admin/users/${row.user.id}`}))} empty="No prompts in this range."/>
        </Section>
        <Section title="Busiest projects" description="The ten projects prompts were attached to.">
          <BarList label="Prompts by project" items={data.byProject.map(row=>({key:row.project.id,label:row.project.title,value:row.count,href:`/projects/${row.project.id}`}))} empty="No prompts were attached to a project in this range."/>
        </Section>
      </div>
      <p className="admin-note">{formatNumber(data.outcomes.reduce((sum,item)=>sum+item.value,0))} prompts in {data.range.label.toLowerCase()}. Prompt text is stored encrypted and never appears on this page; reading one is done from Prompt logs with the prompt_content permission, and every reading is recorded in the admin audit log.</p>
    </>}
    {!data&&!error&&<p className="admin-note" role="status">Loading AI usage…</p>}
  </>;
}
