'use client';
import {useState} from 'react';
import {FolderOpen,Grid2x2,List as ListIcon,RefreshCw,Trash2,Upload} from 'lucide-react';
import {Notice,send} from '../shared';
import type {Paged} from '@/lib/admin/types';
import type {MediaSummary} from '@/lib/admin/media';
import {AdminPage} from './AdminFrame';
import {AdvancedFilters,Badge,DataTable,ExportButtons,Pager,adminQuery,useAdminData,useUrlFilters,type Column,type FilterField,type FilterValues} from './kit';
import {formatBytes,formatDateTime} from './format';
import MediaGrid from './MediaGrid';
import MediaDetailPanel from './MediaDetailPanel';
import MediaUploadDialog from './MediaUploadDialog';
import MediaStats from './MediaStats';
import MediaFoldersTab from './MediaFoldersTab';
import './media.css';

// Admin › Media Manager: upload, browse, tag, and clean up every file used across project pages. The list itself is
// the same server-paged/filtered shape as every other admin list page (UsersPage, the log pages); grid vs. list is
// a rendering choice over the same rows, and folders/trash/unused are the same rows with a different implicit filter.

export type MediaTab='all'|'folders'|'unused'|'trash'|'storage';
const TAB_LABELS:Record<MediaTab,string>={all:'All media',folders:'Folders',unused:'Unused media',trash:'Trash',storage:'Storage'};
const TYPE_OPTIONS=[{value:'image',label:'Images'},{value:'video',label:'Videos'},{value:'document',label:'Documents'},{value:'archive',label:'Archives'}];
const DEFAULTS:FilterValues={q:'',type:'',folder:'',tag:'',used:'',uploadedBy:'',minSize:'',maxSize:'',sort:'created',dir:'desc',page:'1',view:'grid',tab:'all'};

function useMediaFilters() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const tab=(values.tab||'all') as MediaTab;
  const effective:FilterValues={...values};
  if(tab==='unused')effective.used='unused';
  delete (effective as Record<string,string>).view;delete (effective as Record<string,string>).tab;
  return {values,update,reset,ready,tab,effective};
}

export default function MediaPage() {
  return <AdminPage section="media" title="Media Manager" description="Upload, organize, tag, and clean up every image, video, document, and archive used across project pages.">
    <MediaLibrary/>
  </AdminPage>;
}

function MediaLibrary() {
  const {values,update,reset,ready,tab,effective}=useMediaFilters();
  const trashed=tab==='trash';
  const {data,error,loading,reload}=useAdminData<Paged<MediaSummary>>(ready&&tab!=='folders'&&tab!=='storage'?`admin/media?${adminQuery(effective,{deleted:trashed?'true':''})}`:null);
  const {data:folderData}=useAdminData<{folders:{id:string;name:string;fileCount:number}[]}>(ready?'admin/media/folders':null);
  const {data:tagData}=useAdminData<{tags:{id:string;name:string;fileCount:number}[]}>(ready?'admin/media/tags':null);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [openId,setOpenId]=useState<string|null>(null);
  const [uploading,setUploading]=useState(false);
  const [actionError,setActionError]=useState('');
  const [busy,setBusy]=useState(false);

  const fields:FilterField[]=[
    {type:'search',name:'q',label:'Search',placeholder:'Name, tag, folder, caption, description'},
    {type:'select',name:'type',label:'Type',options:TYPE_OPTIONS},
    {type:'select',name:'folder',label:'Folder',options:(folderData?.folders??[]).map(f=>({value:f.id,label:f.name}))},
    {type:'select',name:'tag',label:'Tag',options:(tagData?.tags??[]).map(t=>({value:t.id,label:t.name}))},
    ...(tab==='all'?[{type:'select',name:'used',label:'Usage',options:[{value:'used',label:'Used'},{value:'unused',label:'Unused'}]} as FilterField]:[]),
  ];

  const toggle=(id:string)=>setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const clearSelection=()=>setSelected(new Set());

  async function bulk(action:'trash'|'restore'|'purge',force=false) {
    setBusy(true);setActionError('');
    try{await send('admin/media/bulk',{ids:[...selected],action,force},'POST');clearSelection();await reload();}
    catch(e){setActionError((e as Error).message);}
    finally{setBusy(false);}
  }

  const columns:Column<MediaSummary>[]=[
    {key:'select',label:'',render:row=><input type="checkbox" aria-label={`Select ${row.displayName}`} checked={selected.has(row.id)} onChange={()=>toggle(row.id)}/>},
    {key:'name',label:'Name',sortKey:'name',render:row=><button type="button" className="text-button media-name-cell" onClick={()=>setOpenId(row.id)}>{row.displayName}</button>},
    {key:'type',label:'Type',render:row=>row.type},
    {key:'size',label:'Size',sortKey:'size',render:row=>formatBytes(row.size)},
    {key:'folder',label:'Folder',render:row=>row.folder?.name??<span className="muted">—</span>},
    {key:'uploadedBy',label:'Uploaded by',render:row=>row.uploadedBy?.name??<span className="muted">Unknown</span>},
    {key:'uploaded',label:'Uploaded',sortKey:'created',render:row=><time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>},
    {key:'usage',label:'Usage',render:row=>row.usageCount?<Badge tone="good">Used in {row.usageCount}</Badge>:<Badge tone="neutral">Unused</Badge>},
  ];

  return <>
    <div className="admin-tabs" role="tablist" aria-label="Media Manager views">
      {(Object.keys(TAB_LABELS) as MediaTab[]).map(key=><button key={key} type="button" role="tab" aria-selected={tab===key} className={`admin-chip ${tab===key?'active':''}`} onClick={()=>update({tab:key,page:'1'})}>{TAB_LABELS[key]}</button>)}
    </div>
    {tab!=='folders'&&tab!=='storage'&&<MediaStatsHeader/>}
    {tab==='folders'&&<MediaFoldersTab/>}
    {tab==='storage'&&<MediaStats/>}
    {(tab==='all'||tab==='unused'||tab==='trash')&&<>
      <AdvancedFilters fields={fields} values={values} onChange={update} onReset={reset}
        quickFilters={<button type="button" className="button blue" onClick={()=>setUploading(true)}><Upload size={15} aria-hidden="true"/> Upload Media</button>}>
        <div className="admin-toolbar media-toolbar">
          <span>{data?`${data.total}${data.totalCapped?'+':''} files`:loading?'Loading…':''}</span>
          <div className="media-toolbar-actions">
            <button type="button" className="text-button" onClick={()=>reload()}><RefreshCw size={14} aria-hidden="true"/> Refresh</button>
            <div className="media-view-toggle" role="group" aria-label="View mode">
              <button type="button" aria-pressed={values.view!=='list'} onClick={()=>update({view:'grid'})}><Grid2x2 size={15} aria-hidden="true"/></button>
              <button type="button" aria-pressed={values.view==='list'} onClick={()=>update({view:'list'})}><ListIcon size={15} aria-hidden="true"/></button>
            </div>
            <ExportButtons endpoint="admin/media" query={adminQuery(effective)}/>
          </div>
        </div>
      </AdvancedFilters>
      {(error||actionError)&&<Notice error>{error||actionError}</Notice>}
      {selected.size>0&&<div className="media-bulk-bar panel" role="toolbar" aria-label="Bulk actions">
        <strong>{selected.size} item{selected.size===1?'':'s'} selected</strong>
        <div className="media-bulk-actions">
          {!trashed&&<button type="button" className="button outline" disabled={busy} onClick={()=>bulk('trash')}><Trash2 size={14} aria-hidden="true"/> Move to trash</button>}
          {trashed&&<button type="button" className="button outline" disabled={busy} onClick={()=>bulk('restore')}><FolderOpen size={14} aria-hidden="true"/> Restore</button>}
          {trashed&&<button type="button" className="button outline bad" disabled={busy} onClick={()=>{if(confirm(`Permanently delete ${selected.size} file(s)? This cannot be undone.`))void bulk('purge');}}><Trash2 size={14} aria-hidden="true"/> Delete permanently</button>}
          <button type="button" className="text-button" onClick={clearSelection}>Clear</button>
        </div>
      </div>}
      {values.view==='list'
        ?<DataTable caption="Media" columns={columns} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading} empty={emptyMessage(tab)}/>
        :<MediaGrid items={data?.items??[]} selected={selected} onToggle={toggle} onOpen={setOpenId} loading={loading} empty={emptyMessage(tab)}/>}
      {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
    </>}
    {uploading&&<MediaUploadDialog onClose={()=>setUploading(false)} onUploaded={()=>{setUploading(false);reload();}}/>}
    {openId&&<MediaDetailPanel id={openId} onClose={()=>setOpenId(null)} onChanged={reload}/>}
  </>;
}

function emptyMessage(tab:MediaTab) {
  if(tab==='trash')return 'Trash is empty.';
  if(tab==='unused')return 'No unused media found.';
  return 'No media matches your filters.';
}

function MediaStatsHeader() {
  const {data}=useAdminData<{total:{count:number;bytes:number};byType:Record<string,{count:number;bytes:number}>;unused:{count:number;bytes:number}}>('admin/media/stats');
  if(!data)return null;
  return <div className="admin-stat-grid media-stat-grid">
    <div className="panel admin-stat"><span className="admin-stat-label">Total files</span><strong className="admin-stat-value">{data.total.count}</strong><span className="admin-stat-change">{formatBytes(data.total.bytes)} used</span></div>
    <div className="panel admin-stat"><span className="admin-stat-label">Images</span><strong className="admin-stat-value">{data.byType.image?.count??0}</strong></div>
    <div className="panel admin-stat"><span className="admin-stat-label">Videos</span><strong className="admin-stat-value">{data.byType.video?.count??0}</strong></div>
    <div className="panel admin-stat"><span className="admin-stat-label">Documents</span><strong className="admin-stat-value">{data.byType.document?.count??0}</strong></div>
    <div className="panel admin-stat"><span className="admin-stat-label">Archives</span><strong className="admin-stat-value">{data.byType.archive?.count??0}</strong></div>
    <div className="panel admin-stat"><span className="admin-stat-label">Unused media</span><strong className="admin-stat-value">{data.unused.count}</strong><span className="admin-stat-change">{formatBytes(data.unused.bytes)}</span></div>
  </div>;
}
