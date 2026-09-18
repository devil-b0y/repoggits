'use client';
import {Notice} from '../shared';
import {useAdminData} from './kit';
import {formatBytes,formatDateTime} from './format';

// Admin › Media Manager → Storage: totals by type, largest files, recently uploaded, and trash storage. Read-only —
// cleanup recommendations are shown, nothing is deleted automatically (per the Media Manager spec's storage section).

type StatsResponse={
  total:{count:number;bytes:number};byType:Record<string,{count:number;bytes:number}>;
  largest:{id:string;filename:string;mime:string;size:number}[];
  recentlyUploaded:{id:string;filename:string;mime:string;size:number;createdAt:string}[];
  unused:{count:number;bytes:number};trash:{count:number;bytes:number};
};

export default function MediaStats() {
  const {data,error,loading}=useAdminData<StatsResponse>('admin/media/stats');
  if(loading&&!data)return <p role="status">Loading storage overview…</p>;
  if(error)return <Notice error>{error}</Notice>;
  if(!data)return null;
  return <div className="media-stats">
    <div className="admin-grid-2">
      <section className="panel">
        <h2>Storage by type</h2>
        {Object.entries(data.byType).map(([type,stats])=><div className="chart-row" key={type}><span>{type}</span><meter min={0} max={Math.max(data.total.bytes,1)} value={stats.bytes} aria-label={`${type}: ${formatBytes(stats.bytes)}`}/><strong>{formatBytes(stats.bytes)}</strong></div>)}
      </section>
      <section className="panel">
        <h2>Cleanup recommendations</h2>
        {data.unused.count>0
          ?<p>{data.unused.count} unused file{data.unused.count===1?'':'s'} {data.unused.count===1?'is':'are'} using {formatBytes(data.unused.bytes)}. Review them in the Unused Media tab before deleting.</p>
          :<p className="muted">No unused media detected.</p>}
        <p className="muted">Trash currently holds {data.trash.count} file{data.trash.count===1?'':'s'} ({formatBytes(data.trash.bytes)}).</p>
      </section>
    </div>
    <div className="admin-grid-2">
      <section className="panel">
        <h2>Largest files</h2>
        <ul className="media-usage-list">{data.largest.map(file=><li key={file.id}>{file.filename} <span className="muted">— {formatBytes(file.size)}</span></li>)}</ul>
      </section>
      <section className="panel">
        <h2>Recently uploaded</h2>
        <ul className="media-usage-list">{data.recentlyUploaded.map(file=><li key={file.id}>{file.filename} <span className="muted">— {formatDateTime(file.createdAt)}</span></li>)}</ul>
      </section>
    </div>
  </div>;
}
