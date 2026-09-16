'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { bucketLabel, formatNumber, formatPercent } from './format';

// Small SVG/HTML charts in the platform's colors (--series-1…8 in admin-panel.css, validated for both themes).
// Series take hues in the order given, so pass them in a fixed order; never more than eight. Every chart keeps its
// numbers reachable without hovering: a legend for two or more series and a "Show data table" view.

export type ChartSeries={key:string;label:string;values:number[]};
type Bucket='hour'|'day'|'week';
const seriesColor=(index:number)=>`var(--series-${Math.min(index,7)+1})`;

function useWidth<T extends HTMLElement>() {
  const ref=useRef<T>(null);const [width,setWidth]=useState(0);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const update=()=>setWidth(element.clientWidth);update();
    const observer=new ResizeObserver(update);observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  return [ref,width] as const;
}
function niceStep(raw:number) {const exponent=10**Math.floor(Math.log10(raw));const fraction=raw/exponent;return (fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*exponent;}
/** A y-axis from zero to a round maximum, with about `count` evenly spaced ticks. */
export function niceScale(max:number,count=4,integer=true) {
  if(!(max>0))return {max:count,ticks:Array.from({length:count+1},(_,index)=>index)};
  let step=niceStep(max/count);if(integer)step=Math.max(1,Math.ceil(step));
  const top=step*Math.ceil(max/step);const ticks:number[]=[];
  for(let value=0;value<=top+step/2;value+=step)ticks.push(Number(value.toPrecision(12)));
  return {max:top,ticks};
}
function useIndexKeys(count:number,active:number|null,setActive:(index:number|null)=>void) {
  return (event:KeyboardEvent)=>{
    if(!count)return;
    const next=event.key==='ArrowRight'?Math.min(count-1,(active??-1)+1):event.key==='ArrowLeft'?Math.max(0,(active??count)-1):event.key==='Home'?0:event.key==='End'?count-1:null;
    if(next!==null){event.preventDefault();setActive(next);}
  };
}
function DataTable({labels,series,bucket,format}:{labels:string[];series:ChartSeries[];bucket:Bucket;format:(value:number)=>string}) {
  return <details className="chart-table"><summary>Show data table</summary><div className="table-scroll"><table><thead><tr><th scope="col">Period</th>{series.map(item=><th scope="col" key={item.key}>{item.label}</th>)}</tr></thead><tbody>{labels.map((label,index)=><tr key={label}><th scope="row">{bucketLabel(label,bucket,true)}</th>{series.map(item=><td key={item.key}>{format(item.values[index]??0)}</td>)}</tr>)}</tbody></table></div></details>;
}
function Legend({series,shape='line'}:{series:{key:string;label:string}[];shape?:'line'|'box'}) {
  return <ul className="chart-legend">{series.map((item,index)=><li key={item.key}><span className={shape==='line'?'chart-key-line':'chart-key-box'} style={{background:seriesColor(index)}} aria-hidden="true"/>{item.label}</li>)}</ul>;
}
function Tooltip({left,width,title,rows,format}:{left:number;width:number;title:string;rows:{key:string;label:string;value:number;index:number}[];format:(value:number)=>string}) {
  return <div className="chart-tooltip" aria-live="polite" style={{left:Math.min(Math.max(left,86),Math.max(86,width-86))}}><span className="chart-tooltip-title">{title}</span>{rows.map(row=><div key={row.key}>{row.index>=0?<span className="chart-key-line" style={{background:seriesColor(row.index)}} aria-hidden="true"/>:<span className="chart-key-line" aria-hidden="true"/>}<strong>{format(row.value)}</strong><span>{row.label}</span></div>)}</div>;
}
const MARGIN={top:14,right:14,bottom:30,left:46};

/** Values over time: one or more lines sharing one y-axis, with a crosshair tooltip. */
export function TimeSeriesChart({title,labels,series,bucket='day',height=240,format=formatNumber,integer=true}:{title:string;labels:string[];series:ChartSeries[];bucket?:Bucket;height?:number;format?:(value:number)=>string;integer?:boolean}) {
  const [ref,width]=useWidth<HTMLDivElement>();const [active,setActive]=useState<number|null>(null);
  const count=labels.length,plotWidth=Math.max(0,width-MARGIN.left-MARGIN.right),plotHeight=height-MARGIN.top-MARGIN.bottom;
  const scale=useMemo(()=>niceScale(Math.max(0,...series.flatMap(item=>item.values)),4,integer),[series,integer]);
  const x=(index:number)=>MARGIN.left+(count<=1?plotWidth/2:index*plotWidth/(count-1));
  const y=(value:number)=>MARGIN.top+plotHeight-(value/scale.max)*plotHeight;
  const tickEvery=Math.max(1,Math.ceil(count/Math.max(2,Math.floor(plotWidth/88))));
  const onKeyDown=useIndexKeys(count,active,setActive);
  const summary=`${title}. ${series.map(item=>`${item.label}: ${format(item.values.reduce((sum,value)=>sum+value,0))} in total`).join('; ')}.`;
  return <figure className="admin-chart">
    {series.length>1&&<Legend series={series}/>}
    <div className="chart-canvas" ref={ref} style={{height}} onPointerLeave={()=>setActive(null)}>
      {width>0&&<svg width={width} height={height} role="img" aria-label={summary} tabIndex={0} onKeyDown={onKeyDown} onBlur={()=>setActive(null)}
        onPointerMove={event=>{if(!count)return;const offset=event.clientX-event.currentTarget.getBoundingClientRect().left-MARGIN.left;setActive(count<=1?0:Math.min(count-1,Math.max(0,Math.round(offset/(plotWidth/(count-1))))));}}>
        {scale.ticks.map(tick=><g key={tick}><line className={tick===0?'chart-baseline':'chart-grid'} x1={MARGIN.left} x2={width-MARGIN.right} y1={y(tick)} y2={y(tick)}/><text className="chart-tick" x={MARGIN.left-8} y={y(tick)} dy="0.32em" textAnchor="end">{format(tick)}</text></g>)}
        {labels.map((label,index)=>index%tickEvery===0&&<text key={label} className="chart-tick" x={x(index)} y={height-8} textAnchor={count>1&&index===0?'start':'middle'}>{bucketLabel(label,bucket)}</text>)}
        {count>0&&series.map((item,index)=>{
          const points=item.values.slice(0,count).map((value,position)=>`${x(position)},${y(value)}`);
          return <g key={item.key}>
            {series.length===1&&count>1&&<path className="chart-area" style={{fill:seriesColor(index)}} d={`M${x(0)},${y(0)} L${points.join(' L')} L${x(count-1)},${y(0)} Z`}/>}
            {count>1?<path className="chart-line" style={{stroke:seriesColor(index)}} d={`M${points.join(' L')}`}/>:<circle className="chart-dot" style={{fill:seriesColor(index)}} cx={x(0)} cy={y(item.values[0]??0)} r={4}/>}
          </g>;
        })}
        {active!==null&&<g><line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top+plotHeight}/>{series.map((item,index)=><circle key={item.key} className="chart-dot" style={{fill:seriesColor(index)}} cx={x(active)} cy={y(item.values[active]??0)} r={4}/>)}</g>}
      </svg>}
      {active!==null&&width>0&&<Tooltip left={x(active)} width={width} title={bucketLabel(labels[active],bucket,true)} format={format} rows={series.map((item,index)=>({key:item.key,label:item.label,value:item.values[active]??0,index}))}/>}
    </div>
    <DataTable labels={labels} series={series} bucket={bucket} format={format}/>
  </figure>;
}

const roundedTop=(left:number,top:number,barWidth:number,barHeight:number)=>{const r=Math.min(4,barWidth/2,barHeight);return `M${left},${top+barHeight} L${left},${top+r} Q${left},${top} ${left+r},${top} L${left+barWidth-r},${top} Q${left+barWidth},${top} ${left+barWidth},${top+r} L${left+barWidth},${top+barHeight} Z`;};

/** Counts per period as columns; several series stack in the order given, separated by a 2px gap. */
export function ColumnChart({title,labels,series,bucket='day',height=240,format=formatNumber}:{title:string;labels:string[];series:ChartSeries[];bucket?:Bucket;height?:number;format?:(value:number)=>string}) {
  const [ref,width]=useWidth<HTMLDivElement>();const [active,setActive]=useState<number|null>(null);
  const count=labels.length,plotWidth=Math.max(0,width-MARGIN.left-MARGIN.right),plotHeight=height-MARGIN.top-MARGIN.bottom;
  const totals=useMemo(()=>labels.map((_,index)=>series.reduce((sum,item)=>sum+(item.values[index]??0),0)),[labels,series]);
  const scale=useMemo(()=>niceScale(Math.max(0,...totals)),[totals]);
  const band=count?plotWidth/count:0,barWidth=Math.max(2,Math.min(24,band*0.64));
  const y=(value:number)=>MARGIN.top+plotHeight-(value/scale.max)*plotHeight;
  const tickEvery=Math.max(1,Math.ceil(count/Math.max(2,Math.floor(plotWidth/88))));
  const onKeyDown=useIndexKeys(count,active,setActive);
  const summary=`${title}. ${series.map(item=>`${item.label}: ${format(item.values.reduce((sum,value)=>sum+value,0))} in total`).join('; ')}.`;
  return <figure className="admin-chart">
    {series.length>1&&<Legend series={series} shape="box"/>}
    <div className="chart-canvas" ref={ref} style={{height}} onPointerLeave={()=>setActive(null)}>
      {width>0&&<svg width={width} height={height} role="img" aria-label={summary} tabIndex={0} onKeyDown={onKeyDown} onBlur={()=>setActive(null)}>
        {scale.ticks.map(tick=><g key={tick}><line className={tick===0?'chart-baseline':'chart-grid'} x1={MARGIN.left} x2={width-MARGIN.right} y1={y(tick)} y2={y(tick)}/><text className="chart-tick" x={MARGIN.left-8} y={y(tick)} dy="0.32em" textAnchor="end">{format(tick)}</text></g>)}
        {labels.map((label,index)=>{
          const left=MARGIN.left+index*band+(band-barWidth)/2;let base=0;
          const visible=series.map((item,position)=>({position,value:item.values[index]??0})).filter(part=>part.value>0);
          return <g key={label} className={active===index?'chart-column active':'chart-column'}>
            {visible.map((part,order)=>{
              const top=y(base+part.value),bottom=y(base)-(order>0?2:0);base+=part.value;
              const barHeight=Math.max(0,bottom-top);
              return order===visible.length-1?<path key={part.position} style={{fill:seriesColor(part.position)}} d={roundedTop(left,top,barWidth,barHeight)}/>:<rect key={part.position} style={{fill:seriesColor(part.position)}} x={left} y={top} width={barWidth} height={barHeight}/>;
            })}
            {index%tickEvery===0&&<text className="chart-tick" x={MARGIN.left+index*band+band/2} y={height-8} textAnchor="middle">{bucketLabel(label,bucket)}</text>}
            <rect className="chart-hit" x={MARGIN.left+index*band} y={MARGIN.top} width={band} height={plotHeight} onPointerEnter={()=>setActive(index)}/>
          </g>;
        })}
      </svg>}
      {active!==null&&width>0&&<Tooltip left={MARGIN.left+active*band+band/2} width={width} title={bucketLabel(labels[active],bucket,true)} format={format} rows={[...series.map((item,index)=>({key:item.key,label:item.label,value:item.values[active]??0,index})),...(series.length>1?[{key:'__total',label:'Total',value:totals[active]??0,index:-1}]:[])]}/>}
    </div>
    <DataTable labels={labels} series={series} bucket={bucket} format={format}/>
  </figure>;
}

export type RankedItem={key:string;label:ReactNode;value:number;href?:string;detail?:ReactNode};
/** A ranked list with a bar per row, for "most viewed", "most active" and similar top-N lists. */
export function BarList({label,items,format=formatNumber,empty='Nothing to show for this range yet.'}:{label:string;items:RankedItem[];format?:(value:number)=>string;empty?:ReactNode}) {
  if(!items.length)return <p className="muted">{empty}</p>;
  const max=Math.max(0,...items.map(item=>item.value));
  return <ol className="bar-list" aria-label={label}>{items.map(item=><li key={item.key}>
    <div className="bar-list-text"><span className="bar-list-label">{item.href?<Link className="inline-link" href={item.href}>{item.label}</Link>:item.label}{item.detail&&<small>{item.detail}</small>}</span><strong>{format(item.value)}</strong></div>
    <span className="bar-list-track" aria-hidden="true"><span style={{width:`${max?Math.max(1.5,item.value/max*100):0}%`}}/></span>
  </li>)}</ol>;
}

export type ShareItem={key:string;label:string;value:number};
/** Parts of a whole (device types, browsers, operating systems) as one proportional bar with a legend of values and shares. */
export function ShareBar({label,items,format=formatNumber}:{label:string;items:ShareItem[];format?:(value:number)=>string}) {
  const total=items.reduce((sum,item)=>sum+item.value,0);
  if(!total)return <p className="muted">No data for this range yet.</p>;
  const share=(value:number)=>value/total*100;
  return <div className="share-bar">
    <div className="share-bar-track" role="img" aria-label={`${label}: ${items.map(item=>`${item.label} ${formatPercent(share(item.value))}`).join(', ')}`}>{items.map((item,index)=>item.value>0&&<span key={item.key} title={`${item.label}: ${format(item.value)} (${formatPercent(share(item.value))})`} style={{flexGrow:item.value,background:seriesColor(index)}}/>)}</div>
    <ul className="chart-legend share-legend">{items.map((item,index)=><li key={item.key}><span className="chart-key-box" style={{background:seriesColor(index)}} aria-hidden="true"/><span>{item.label}</span><strong>{format(item.value)}</strong><small>{formatPercent(share(item.value))}</small></li>)}</ul>
  </div>;
}

/** A small trend line for stat tiles. Decorative: the tile states the value and its change in text. */
export function Sparkline({values}:{values:number[]}) {
  if(values.length<2)return null;
  const width=120,height=30,max=Math.max(...values),min=Math.min(...values,0),span=max-min||1;
  const points=values.map((value,index)=>`${2+index*(width-4)/(values.length-1)},${height-3-(value-min)/span*(height-6)}`).join(' ');
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false"><polyline points={points} vectorEffect="non-scaling-stroke"/></svg>;
}

const RAMP=['#eef3fc','#cde2fb','#9ec5f4','#6da7ec','#3987e5','#256abf','#184f95','#0d366b'];
export type Cohort={label:string;size:number;values:(number|null)[]};
/** Retention by sign-up cohort: each cell is the percentage of that cohort active N periods later (null = not reached yet). */
export function RetentionGrid({cohorts,periods,periodLabel='Week'}:{cohorts:Cohort[];periods:number;periodLabel?:string}) {
  if(!cohorts.length)return <p className="muted">No sign-up cohorts in this range yet.</p>;
  return <div className="table-scroll"><table className="retention-grid"><caption className="sr-only">Percentage of each sign-up cohort active in later periods</caption>
    <thead><tr><th scope="col">Cohort</th><th scope="col">Users</th>{Array.from({length:periods},(_,index)=><th scope="col" key={index}>{periodLabel} {index}</th>)}</tr></thead>
    <tbody>{cohorts.map(cohort=><tr key={cohort.label}><th scope="row">{cohort.label}</th><td>{formatNumber(cohort.size)}</td>{Array.from({length:periods},(_,index)=>{
      const value=cohort.values[index];
      if(value==null)return <td key={index} className="retention-empty">—</td>;
      const step=Math.max(0,Math.min(RAMP.length-1,Math.round(value/100*(RAMP.length-1))));
      return <td key={index} style={{background:RAMP[step],color:step>=4?'#ffffff':'#243e77'}}>{formatPercent(value)}</td>;
    })}</tr>)}</tbody>
  </table></div>;
}
