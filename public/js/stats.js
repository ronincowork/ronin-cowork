import { request } from './request.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function buildStats(root){
let current='period',selection='Agent session';
let callRows=[], report=null, loading=false;
const actors=['Agent','User · desktop','User · mobile','Trello','System'];
const stats=root;
const head=el('div','td-head'),wins=el('div','td-wins'),range=el('span','td-range');
const refresh=el('button','td-win','Refresh');refresh.type='button';refresh.onclick=()=>load();wins.append(refresh);
head.append(wins,range);const body=el('div','td-body');stats.append(head,body);
const sum=r=>r[current].reduce((a,b)=>a+(b??0),0);
function table(rows){const wrap=el('div','rs-table-wrap'),t=el('table','rs-count-table');t.append(el('caption','','Tool-call counts by capability, caller and surface'));const header=el('thead',''),tr=el('tr','');['Tool call','Capability',...actors,'Total'].forEach(x=>{const th=el('th','',x);th.scope='col';tr.append(th)});header.append(tr);t.append(header);const tbody=el('tbody','');for(const r of rows){const line=el('tr',r.group===selection?'rs-selected-row':''),name=el('th','',r.tool);name.scope='row';line.append(name,el('td','',r.group));for(const n of [...r[current],sum(r)]){const cell=el('td','',n===null?'—':n);if(n===null)cell.title='Not applicable: Trello applies only to Work record';line.append(cell)}tbody.append(line)}t.append(tbody);const foot=el('tfoot',''),f=el('tr','');f.append(el('th','','Total'),el('td','',''));const totals=actors.map((_,i)=>rows.reduce((n,r)=>n+(r[current][i]??0),0));for(const n of [...totals,totals.reduce((a,b)=>a+b,0)])f.append(el('td','',n));foot.append(f);t.append(foot);wrap.append(t);return wrap}
function selectionChart(){
 const wrap=el('div','rs-selection'),cards=el('div','rs-capability-cards'),chart=el('div','td-mek'),legend=el('div','td-legend'),detail=el('div','td-mean','Width = tool-call total · colour = caller. Select a block to see its counts.');detail.setAttribute('aria-live','polite');
 const colors=['var(--accent-2)','var(--accent)','var(--ok)','var(--warn)','var(--dim)'];
 for(const group of [...new Set(callRows.map(r=>r.group))]){const rows=callRows.filter(r=>r.group===group),b=el('button','rs-capability-card');b.type='button';b.setAttribute('aria-pressed',String(group===selection));b.append(el('span','',group),el('strong','',rows.reduce((n,r)=>n+sum(r),0)+' calls'));b.onclick=()=>{selection=group;render();body.querySelectorAll('.rs-capability-card').forEach(c=>{if(c.getAttribute('aria-pressed')==='true')c.focus({preventScroll:true})})};cards.append(b)}
 const rows=callRows.filter(r=>r.group===selection);chart.setAttribute('aria-label',selection+' tool calls by caller');
 for(const r of rows){const total=sum(r);if(!total)continue;const col=el('div','td-mekcol');col.style.flex=`${total} 1 0`;r[current].forEach((n,i)=>{if(!n)return;const seg=el('button','td-seg');seg.type='button';seg.style.height=n/total*100+'%';seg.style.background=colors[i];seg.setAttribute('aria-label',r.tool+' · '+actors[i]+' · '+n);seg.title=seg.getAttribute('aria-label');const show=()=>{detail.textContent=seg.title};seg.onclick=show;seg.onfocus=show;if(total>=10&&n/total>.25)seg.append(el('span','',n));col.append(seg)});chart.append(col)}
 actors.forEach((actor,i)=>{if(!rows.some(r=>r[current][i]>0))return;const item=el('span',''),swatch=el('i','');swatch.style.background=colors[i];item.append(swatch,document.createTextNode(actor));legend.append(item)});
 wrap.append(cards,el('h3','rs-chart-heading',selection),chart,legend,detail);return wrap;
}
function render(){range.textContent=report ? 'Collection period · '+report.from.slice(0,10)+' → '+report.until.slice(0,10)+' · '+Math.max(1, Math.ceil((Date.parse(report.until)-Date.parse(report.from))/86400000))+' elapsed days · '+report.active_days+' active days' : '';wins.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b.dataset.period===current);b.setAttribute('aria-pressed',String(b.dataset.period===current))});body.replaceChildren(selectionChart(),table(callRows),el('div','td-foot','Approximate tool-call counts for this collection period. Refresh reads without resetting. Trello applies only to Work record; — means not applicable. Quiet local counters; no call contents.'));
}

async function load(){
 if(loading)return;loading=true;refresh.disabled=true;
 const r=await request('/api/tomodachi/tool-calls',{cache:'no-store'});
 if(r.ok){report=r.data;const sources=['agent','user_desktop','user_mobile','trello','system'];
 callRows=Object.entries(report.tools).map(([tool,group])=>({tool,group,period:sources.map(source=>source==='trello'&&group!=='Work record'?null:(report.counts.find(row=>row.tool===tool&&row.source===source)?.count??0))}));
 render();}
 // THE TAB DOES NOT ASK WHETHER STATS IS ALLOWED — it cannot be reached unless the
 // capability is switched on. A failure here is a real one, so it says what the machine
 // said rather than substituting a guess of its own. The sentence this replaces read as
 // "we have not built it", so the honest response was to wait when the truth was a switch.
 else body.textContent=r.message||'Stats could not be read.';
 loading=false;refresh.disabled=false;
}
return {enter:load,load};
}
