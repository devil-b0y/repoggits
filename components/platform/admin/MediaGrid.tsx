'use client';
import {Archive,FileText,Film,Image as ImageIcon} from 'lucide-react';
import type {MediaSummary} from '@/lib/admin/media';
import {Badge} from './kit';
import {formatBytes,formatDateTime} from './format';

// The thumbnail grid used by Admin › Media Manager. No generic Card primitive exists in the shared kit for this
// shape (thumbnail + selection + usage badge), so this is the one new presentational component for the module.

const TYPE_ICON={image:ImageIcon,video:Film,document:FileText,archive:Archive} as const;

export default function MediaGrid({items,selected,onToggle,onOpen,loading,empty}:{items:MediaSummary[];selected:Set<string>;onToggle:(id:string)=>void;onOpen:(id:string)=>void;loading:boolean;empty:string}) {
  if(!items.length)return <div className="media-grid-empty panel" aria-busy={loading}>{loading?'Loading…':empty}</div>;
  return <div className="media-grid" aria-busy={loading}>
    {items.map(item=><MediaTile key={item.id} item={item} checked={selected.has(item.id)} onToggle={()=>onToggle(item.id)} onOpen={()=>onOpen(item.id)}/>)}
  </div>;
}

function MediaTile({item,checked,onToggle,onOpen}:{item:MediaSummary;checked:boolean;onToggle:()=>void;onOpen:()=>void}) {
  const Icon=TYPE_ICON[item.type];
  return <div className={`media-tile panel ${checked?'is-selected':''}`}>
    <label className="media-tile-check"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${item.displayName}`}/></label>
    <button type="button" className="media-tile-preview" onClick={onOpen} aria-label={`Open ${item.displayName}`}>
      {item.type==='image'?<img src={`/api/admin/media/${item.id}/content?w=480`} alt="" loading="lazy"/>:<Icon size={32} aria-hidden="true"/>}
    </button>
    <div className="media-tile-body">
      <button type="button" className="text-button media-tile-name" onClick={onOpen} title={item.displayName}>{item.displayName}</button>
      <span className="media-tile-meta">{item.type} · {formatBytes(item.size)}</span>
      <span className="media-tile-meta">{formatDateTime(item.createdAt)}</span>
      {item.usageCount?<Badge tone="good">Used in {item.usageCount}</Badge>:<Badge tone="neutral">Unused</Badge>}
    </div>
  </div>;
}
