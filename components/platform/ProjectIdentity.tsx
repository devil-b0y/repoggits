'use client';
import {useState,type ReactNode} from 'react';
import {Code2,Layers,Users,GraduationCap,Building2,GitBranch,Hash,Cloud,Database,Globe,Server,Wrench,CalendarDays,Eye,Download,ShieldCheck,Clock3,ArrowUpRight,type LucideIcon} from 'lucide-react';
import catalogue from '@/lib/programming-languages.json';
import type {Project,ProjectData} from '@/lib/schema';
import {imageUrl} from '@/lib/images';

const technologies:Record<string,string>={react:'react','react.js':'react',reactjs:'react','next.js':'nextjs',nextjs:'nextjs','node.js':'nodejs',nodejs:'nodejs',postgresql:'postgresql',postgres:'postgresql',mongodb:'mongodb',firebase:'firebase',docker:'docker',git:'git',github:'github',figma:'figma','vs code':'vscode',vscode:'vscode','visual studio code':'vscode',arduino:'arduino','arduino ide':'arduino',tensorflow:'tensorflow',pytorch:'pytorch',fastapi:'fastapi',flask:'flask',redis:'redis',supabase:'supabase',vercel:'vercel',playwright:'playwright'};
export function technologyLogo(name:string){const key=name.trim().toLowerCase();return catalogue.find(x=>x.name.toLowerCase()===key||x.aliases.some(a=>a.toLowerCase()===key))?.icon||(technologies[key]?`/images/technologies/${technologies[key]}.svg`:undefined);}
export function TechnologyMark({name,icon:Icon=Code2}:{name:string;icon?:LucideIcon}){
 const logo=technologyLogo(name),[failed,setFailed]=useState(false);
 return <span className="pd-logo-orbit" aria-hidden="true">{logo&&!failed?<img src={logo} width={28} height={28} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<Icon size={25} strokeWidth={1.5}/>}</span>;
}
export function TechnologyToken({name,icon}:{name:string;icon?:LucideIcon}){return <span className="pd-tech-token"><TechnologyMark name={name} icon={icon}/><span>{name}</span></span>;}
export function DetailHeading({title,kicker,icon:Icon,children}:{title:string;kicker:string;icon:LucideIcon;children?:ReactNode}){return <div className="pd-section-heading"><span className="pd-section-icon"><Icon size={23} strokeWidth={1.5}/></span><div><span className="pd-kicker">{kicker}</span><h2>{title}</h2>{children&&<p>{children}</p>}</div></div>;}
const stackIcons:Record<string,LucideIcon>={frontend:Globe,backend:Server,database:Database,languages:Code2,frameworks:Layers,tools:Wrench};
export function ProjectSummary({project}:{project:Project}){
 const {data,number,status}=project.version;
 const StatusIcon=status==='approved'?ShieldCheck:Clock3;
 const stats=[{label:'Project year',value:data.year,Icon:CalendarDays},{label:'Version',value:`v${number}`,Icon:GitBranch},{label:'Views',value:project.views.toLocaleString(),Icon:Eye},{label:'Downloads',value:project.downloads.toLocaleString(),Icon:Download}];
 return <section className="pd-summary" aria-label="Project summary">
  <a href="#project-team" className="pd-summary-team"><span className="pd-summary-emblem" aria-hidden="true"><Users size={25} strokeWidth={1.5}/></span><span className="pd-summary-team-copy"><span className="pd-summary-label">Created by</span><strong>{data.teamName}</strong><span className="pd-summary-members">{data.team.length} {data.team.length===1?'contributor':'contributors'}</span></span><ArrowUpRight className="pd-summary-arrow" size={17} aria-hidden="true"/></a>
  <dl className="pd-summary-stats">{stats.map(({label,value,Icon})=><div key={label}><dt><Icon size={15} aria-hidden="true"/>{label}</dt><dd>{value}</dd></div>)}</dl>
  <div className={`pd-summary-status is-${status}`}><span className="pd-summary-label">Review status</span><span className="pd-review-badge"><StatusIcon size={17} aria-hidden="true"/>{status.replaceAll('_',' ')}</span></div>
 </section>;
}
export function StackDetails({stack}:{stack:ProjectData['stack']}){return <dl className="pd-stack-details">{Object.entries(stack).filter(([,value])=>value).map(([key,value])=>{const Icon=stackIcons[key]||Code2;const names=value.split(',').map(v=>v.trim()).filter(Boolean);return <div key={key}><dt><Icon size={16}/><span className="capitalize">{key}</span></dt><dd>{names.length<=8&&names.every(n=>technologyLogo(n))?<div className="pd-stack-tokens">{names.map((name,i)=><TechnologyToken name={name} key={`${name}-${i}`}/>)}</div>:value}</dd></div>;})}</dl>;}
export function TeamProfile({member,index}:{member:ProjectData['team'][number];index:number}){
 const [failed,setFailed]=useState(false);
 const initials=member.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 return <article className="pd-team-card"><div className="pd-member-top"><span className="pd-kicker">THE PEOPLE BEHIND THE BUILD</span><span className="pd-member-number">{String(index+1).padStart(2,'0')}</span></div><div className="pd-member-identity"><div className="pd-avatar-ring">{member.photoId&&!failed?<img src={imageUrl(member.photoId,480)} alt={`${member.name}, team member`} loading="lazy" onError={()=>setFailed(true)}/>:<span className="pd-member-initials" aria-label={`${member.name} initials`}>{initials||<Users size={30}/>}</span>}<span className="pd-avatar-badge" aria-hidden="true"><Code2 size={15}/></span></div><div><h3>{member.name}</h3><p className="pd-member-role">{member.contribution||'Team member'}</p></div></div><dl className="pd-member-details"><div><dt><Building2 size={15}/>College</dt><dd>{member.college||'Not listed'}</dd></div><div><dt><GitBranch size={15}/>Branch</dt><dd>{member.branch||'Not listed'}</dd></div><div><dt><GraduationCap size={15}/>Semester</dt><dd>{member.semester?`Semester ${member.semester}`:'Not listed'}</dd></div></dl></article>;
}
