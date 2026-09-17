/* CampusFlow: a standalone, browser-local student planner. No account or API keys. */
(() => {
  'use strict';
  const key = 'campusflow-focus-v1';
  const initial = [
    { id:'t1', title:'Map the student submission journey', subject:'Research', owner:'Isha', priority:'High', due:'2026-09-14', status:'todo' },
    { id:'t2', title:'Prepare our project presentation', subject:'Presentation', owner:'Rohan', priority:'Medium', due:'2026-09-18', status:'todo' },
    { id:'t3', title:'Build the task board interactions', subject:'Project development', owner:'Rohan', priority:'High', due:'2026-09-15', status:'doing' },
    { id:'t4', title:'Polish the mobile workspace', subject:'Design', owner:'Isha', priority:'Medium', due:'2026-09-16', status:'doing' },
    { id:'t5', title:'Define the visual language', subject:'Design', owner:'Isha', priority:'Low', due:'2026-09-10', status:'done' },
    { id:'t6', title:'Sketch the first dashboard', subject:'Research', owner:'Rohan', priority:'Medium', due:'2026-09-11', status:'done' },
  ];
  const statuses = ['todo','doing','done'];
  let tasks = initial.map(task => ({...task}));
  try { const saved=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(saved)&&saved.length<=100&&saved.every(t=>t&&typeof t.id==='string'&&typeof t.title==='string'&&statuses.includes(t.status)&&['Rohan','Isha'].includes(t.owner)&&['High','Medium','Low'].includes(t.priority)&&typeof t.subject==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.due)))tasks=saved; } catch { /* Storage can be unavailable in private/file browsing. */ }
  const byId = id => document.getElementById(id);
  const element = (tag,className,text) => {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  function persist(message){try{localStorage.setItem(key,JSON.stringify(tasks));}catch{}render();byId('feedback').textContent=message;}
  function taskCard(task){
    const card=element('article','task');card.dataset.taskId=task.id;
    const top=element('div','task-top');top.append(element('span','subject',task.subject),element('span','priority '+task.priority.toLowerCase(),task.priority+' priority'));
    const footer=element('div','task-footer');footer.append(element('span','',new Date(task.due+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})),element('span','','· '+task.owner),element('span','avatar'+(task.owner==='Isha'?' peach':''),task.owner==='Isha'?'IS':'RM'));
    const actions=element('div','task-actions'),move=element('button','move-task',task.status==='todo'?'Start working ↗':task.status==='doing'?'Mark complete ✓':'Reopen task ↗'),remove=element('button','delete-task','Remove');
    move.setAttribute('aria-label',(task.status==='todo'?'Start ':task.status==='doing'?'Complete ':'Reopen ')+task.title);
    move.addEventListener('click',()=>{task.status=statuses[(statuses.indexOf(task.status)+1)%3];persist('Updated: '+task.title);});
    remove.setAttribute('aria-label','Remove '+task.title);remove.addEventListener('click',()=>{tasks=tasks.filter(t=>t.id!==task.id);persist('Task removed from this demo.');});
    actions.append(move,remove);card.append(top,element('h4','',task.title),footer,actions);return card;
  }
  function render(){
    const query=byId('search').value.trim().toLowerCase();
    for(const status of statuses){const list=byId(status);list.replaceChildren();const matches=tasks.filter(t=>(!byId('priority-filter').value||t.priority===byId('priority-filter').value)&&t.status===status&&(t.title+' '+t.subject+' '+t.owner).toLowerCase().includes(query));if(byId('sort-order').value==='due')matches.sort((a,b)=>a.due.localeCompare(b.due));for(const task of matches)list.append(taskCard(task));if(!matches.length)list.append(element('p','empty-column',query?'No matching tasks here.':'A little room for what comes next.'));}
    const done=tasks.filter(t=>t.status==='done').length,doing=tasks.filter(t=>t.status==='doing').length,percent=tasks.length?Math.round(done/tasks.length*100):0;
    for(const [id,value] of Object.entries({'total-count':tasks.length,'progress-count':doing,'done-count':done,'todo-count':tasks.length-done-doing,'doing-count':doing,'done-column-count':done,'completion':percent+'%'}))byId(id).textContent=value;
    byId('completion-bar').value=percent;
  }
  byId('search').addEventListener('input',render);
  byId('priority-filter').addEventListener('change',render);
  byId('sort-order').addEventListener('change',render);
  byId('export-csv').addEventListener('click',()=>{
    const cell=value=>'"'+String(value).replace(/^[=+@-]/,"'byId('search').addEventListener('input',render);").replaceAll('"','""')+'"';
    const rows=[['Title','Subject','Teammate','Priority','Due date','Status'],...tasks.map(t=>[t.title,t.subject,t.owner,t.priority,t.due,t.status])];
    const blob=new Blob([rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='campusflow-focus-tasks.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);byId('feedback').textContent='Task CSV exported.';
  });
  byId('new-task').addEventListener('click',()=>byId('task-dialog').showModal());
  byId('close-dialog').addEventListener('click',()=>byId('task-dialog').close());
  byId('task-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,values=new FormData(form),title=String(values.get('title')).trim();if(title.length<3||tasks.length>=100)return;tasks.push({id:crypto.randomUUID(),title,subject:String(values.get('subject')),owner:String(values.get('owner')),priority:String(values.get('priority')),due:String(values.get('due')),status:'todo'});byId('search').value='';persist('Added: '+title);form.reset();byId('task-dialog').close();});
  byId('reset-demo').addEventListener('click',()=>{tasks=initial.map(t=>({...t}));byId('search').value='';persist('Demo reset. Ready for a fresh start.');});
  render();
})();
