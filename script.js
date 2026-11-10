
(async()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
// Each page change is a browser history entry, so the Back button works.
// Pages opened from history (Back, Forward, a shared link) don't add a new entry.
let movedInSite=false;
function view(name,fromHistory){if(window.BRYCGuard)name=window.BRYCGuard(name)||name;$$('.view').forEach(n=>n.classList.toggle('active',n.id===name));$$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===name));$('.topbar nav')?.classList.remove('show');window.scrollTo({top:0,behavior:'instant'});const url=name==='home'?location.pathname:'#'+name;
 if(fromHistory)history.replaceState(null,'',url);else if(location.hash!==(name==='home'?'':'#'+name)){history.pushState(null,'',url);movedInSite=true;}
 document.dispatchEvent(new CustomEvent('bryc:view',{detail:{name}}));}
window.BRYCView=view;
document.addEventListener('click',e=>{const n=e.target.closest('[data-view]');if(!n||n.hasAttribute('data-scroll'))return;e.preventDefault();view(n.dataset.view);});// Once someone changes an answer, its error message goes away.
['input','change'].forEach(type=>document.addEventListener(type,e=>{const el=e.target;if(!el.matches?.('input,select,textarea'))return;const box=el.closest('.role-choice[aria-invalid]');const target=box||(el.getAttribute('aria-invalid')?el:el.closest('label[aria-invalid]'));if(!target)return;target.removeAttribute('aria-invalid');if(target.nextElementSibling?.classList.contains('field-error'))target.nextElementSibling.remove();}));
$('#mobile-menu')?.addEventListener('click',()=>$('.topbar nav')?.classList.toggle('show'));
// Open the page named in the link, so links like #refer or #apply can be shared.
// Old links to the home page's form (#connect) open the Get more info page.
const openFromHash=()=>{const name=({connect:'inquire'})[location.hash.slice(1)]||location.hash.slice(1)||'home';if(document.getElementById(name)?.classList.contains('view')&&!document.getElementById(name).classList.contains('active'))view(name,true);};
openFromHash();window.addEventListener('popstate',openFromHash);window.addEventListener('hashchange',openFromHash);
// Home video: a silent loop behind the headline. People who turn off motion or
// save data see the still frame instead and can press play. It pauses when it
// is scrolled away or another page is open, and loads only when it first plays.
// Phones and small tablets get the lighter 720p file.
(()=>{const v=$('.hero-video'),b=$('#hero-pause');if(!v||!b)return;
 let wanted=!(matchMedia('(prefers-reduced-motion: reduce)').matches||navigator.connection?.saveData),onScreen=true;
 const label=()=>{b.classList.toggle('paused',!wanted);b.setAttribute('aria-label',wanted?'Pause background video':'Play background video');};
 const sync=()=>{if(wanted&&onScreen&&$('#home')?.classList.contains('active')){if(!v.src){v.muted=true;v.src=matchMedia('(max-width: 900px)').matches&&v.dataset.srcSmall||v.dataset.src;}v.play().catch(e=>{if(e.name!=='AbortError'){wanted=false;label();}});}else v.pause();};
 if('IntersectionObserver' in window)new IntersectionObserver(es=>{onScreen=es[0].isIntersecting;sync();}).observe(v);
 b.addEventListener('click',()=>{wanted=!wanted;label();sync();});
 document.addEventListener('bryc:view',sync);
 b.hidden=false;label();sync();})();
// Section menu. On wide screens the home page gets a rail of dots on the right:
// hover it to see each section's name, click one to jump there. On every page, a
// Back to top button appears after scrolling (on wide screens the rail covers home).
// Add data-nav-label to a home page section to give it a stop on the rail.
(()=>{const home=$('#home');if(!home)return;
 const sections=[...home.querySelectorAll('[data-nav-label]')];
 const headerH=()=>$('.topbar')?.offsetHeight||0;
 const how=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
 const jump=i=>{const y=i===0?0:sections[i].getBoundingClientRect().top+scrollY-headerH();scrollTo({top:Math.max(0,y),behavior:how()});};
 const rail=document.createElement('nav');rail.className='section-rail';rail.setAttribute('aria-label','Sections on this page');
 const list=document.createElement('ol');
 const dots=sections.map((sec,i)=>{const li=document.createElement('li'),b=document.createElement('button'),t=document.createElement('span');
  b.type='button';t.className='rail-label';t.textContent=sec.dataset.navLabel;b.append(t);b.addEventListener('click',()=>jump(i));li.append(b);list.append(li);return b;});
 rail.append(list);
 const top=document.createElement('button');top.type='button';top.className='to-top';top.setAttribute('aria-label','Back to top');top.hidden=true;
 const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='↑';top.append(arrow);
 top.addEventListener('click',()=>scrollTo({top:0,behavior:how()}));
 document.body.append(rail,top);
 let queued=false;
 const update=()=>{queued=false;const onHome=home.classList.contains('active');rail.hidden=!onHome;top.hidden=scrollY<600;
  if(!onHome)return;
  // The current section is the last one whose top has passed a line a third of the way down the screen.
  const line=headerH()+innerHeight/3,atBottom=innerHeight+scrollY>=document.documentElement.scrollHeight-4;let current=0;
  sections.forEach((s,i)=>{if(s.getBoundingClientRect().top<=line)current=i;});if(atBottom)current=sections.length-1;
  dots.forEach((b,i)=>{if(i===current)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});};
 const soon=()=>{if(!queued){queued=true;requestAnimationFrame(update);}};
 addEventListener('scroll',soon,{passive:true});addEventListener('resize',soon);document.addEventListener('bryc:view',soon);update();})();
// Swipe rows: a list with data-swipe scrolls sideways on smaller screens (see
// styles.css). Underneath it gets dots for each stop and previous/next arrows.
// On wide screens the list is a normal grid and the controls stay hidden.
$$('[data-swipe]').forEach(row=>{
 const bar=document.createElement('div');bar.className='swipe-bar';bar.hidden=true;
 const mk=(text,label)=>{const b=document.createElement('button');b.type='button';b.className='swipe-arrow';b.textContent=text;b.setAttribute('aria-label',label);return b;};
 const prev=mk('←','Previous'),next=mk('→','Next'),dots=document.createElement('div');dots.className='swipe-dots';
 bar.append(prev,dots,next);row.after(bar);
 const hint=row.dataset.swipe==='Step'?Object.assign(document.createElement('p'),{className:'swipe-hint',textContent:'Swipe to follow the journey from 8th grade to a career.'}):null;
 if(hint){hint.hidden=true;bar.after(hint);}
 let stops=[];
 const how=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
 const pad=()=>parseFloat(getComputedStyle(row).scrollPaddingLeft)||0;
 const go=i=>row.scrollTo({left:Math.max(0,stops[i]-pad()),behavior:how()});
 const current=()=>{const x=row.scrollLeft+pad();let best=0;stops.forEach((s,i)=>{if(Math.abs(s-x)<Math.abs(stops[best]-x))best=i;});
  if(row.scrollLeft+row.clientWidth>=row.scrollWidth-2)best=stops.length-1;return best;};
 const mark=()=>{const i=current();[...dots.children].forEach((d,j)=>{if(j===i)d.setAttribute('aria-current','true');else d.removeAttribute('aria-current');});
  prev.disabled=i===0;next.disabled=i===stops.length-1;};
 const build=()=>{const scrolls=row.scrollWidth>row.clientWidth+2;bar.hidden=!scrolls;if(hint)hint.hidden=!scrolls;if(!scrolls)return;
  stops=[...new Set([...row.children].map(c=>c.offsetLeft))].sort((a,b)=>a-b);
  dots.replaceChildren(...stops.map((s,i)=>{const d=document.createElement('button');d.type='button';
   const name=row.dataset.swipe==='Step'?row.children[i]?.querySelector('h3')?.textContent:'';
   d.setAttribute('aria-label',name?`Step ${i+1}: ${name}`:`${row.dataset.swipe} ${i+1} of ${stops.length}`);d.addEventListener('click',()=>go(i));return d;}));
  mark();};
 prev.addEventListener('click',()=>go(Math.max(0,current()-1)));next.addEventListener('click',()=>go(Math.min(stops.length-1,current()+1)));
 let queued=false;row.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;mark();});}},{passive:true});
 let t;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(build,150);});document.addEventListener('bryc:view',()=>setTimeout(build,0));build();});
// Ticker under the video: repeat the word list until it covers the screen, then
// move one list-width per loop at a steady speed, so it never runs out of words.
(()=>{const t=$('.ticker'),track=t?.querySelector('.ticker-track'),group=track?.querySelector('.ticker-group');if(!group)return;
 const fill=()=>{track.querySelectorAll('.ticker-group+.ticker-group').forEach(n=>n.remove());
  const w=group.getBoundingClientRect().width;if(!w||!t.clientWidth)return;
  for(let i=1;i<Math.ceil(t.clientWidth/w)+1;i++)track.append(group.cloneNode(true));
  track.style.setProperty('--ticker-shift',w+'px');track.style.setProperty('--ticker-time',Math.round(w/40)+'s');t.classList.add('is-moving');};
 fill();document.fonts?.ready.then(fill);let r;addEventListener('resize',()=>{clearTimeout(r);r=setTimeout(fill,200);});
 document.addEventListener('bryc:view',()=>setTimeout(fill,0));})();
// On-page Back: return to the previous page in the site, or home if the visitor arrived here directly.
$$('[data-back]').forEach(n=>n.addEventListener('click',()=>{if(movedInSite)history.back();else view('home');}));
// Interest form: one submission captures the student and, when they know it, a parent/guardian.
const inquiry=$('#inquiry-form');
const CONTACTS=['studentPhone','studentEmail','guardianPhone','guardianEmail'];
// The "add a phone or email" message sits under the student phone, but any of the four answers it.
inquiry?.addEventListener('input',e=>{if(!CONTACTS.includes(e.target.name))return;const sp=inquiry.elements.namedItem('studentPhone');
 if(sp.getAttribute('aria-invalid')&&sp.nextElementSibling?.classList.contains('field-error')){sp.removeAttribute('aria-invalid');sp.nextElementSibling.remove();}});
// A select with data-other shows a describe box when its "other" option is picked.
$$('select[data-other]').forEach(sel=>{const box=$(sel.dataset.other),input=box.querySelector('input'),trigger=sel.dataset.otherValue||'Other';
 const sync=()=>{const on=sel.value===trigger;box.hidden=!on;input.required=on;if(!on)input.value='';};sel.addEventListener('change',sync);sync();});
// A radio with data-reveal shows its target only when "yes" is chosen.
$$('input[type="radio"][data-reveal]').forEach(r=>r.addEventListener('change',()=>{$(r.dataset.reveal).hidden=r.form.elements.namedItem(r.name).value!=='yes';}));
// Shared checks for the interest and referral forms. Hidden questions are skipped.
function formErrors(form){
 form.querySelectorAll('.field-error').forEach(e=>e.remove());form.querySelectorAll('[aria-invalid="true"]').forEach(e=>e.removeAttribute('aria-invalid'));
 let first=null;const fail=(el,msg)=>{el.setAttribute('aria-invalid','true');const n=document.createElement('div');n.className='field-error';n.setAttribute('role','alert');n.textContent=msg;el.insertAdjacentElement('afterend',n);first??=el;};
 form.querySelectorAll('input,select,textarea').forEach(el=>{if(el.closest('[hidden]')||el.type==='radio'||el.classList.contains('school-search')||el.classList.contains('school-select'))return;
  if(el.type==='checkbox'){if(el.required&&!el.checked)fail(el.closest('label')||el,'Please check this box to continue.');return;}
  const v=el.value.trim();
  if(el.required&&!v)fail(el,'This question is required.');
  else if(v&&el.type==='email'&&el.validity.typeMismatch)fail(el,'Please enter a valid email address.');
  else if(v&&el.type==='tel'&&v.replace(/\D/g,'').length<10)fail(el,'Please enter a 10-digit phone number.');});
 form.querySelectorAll('[data-required-radio]').forEach(group=>{if(group.closest('[hidden]'))return;if(!form.elements.namedItem(group.dataset.requiredRadio).value)fail(group.querySelector('.role-choice')||group,'Please choose one.');});
 form.querySelectorAll('[data-school-control]').forEach(school=>{if(school.closest('[hidden]'))return;const sel=school.querySelector('.school-select');
  if(!sel.value)fail(school.querySelector('.school-search'),'Choose a school from the list, or select “My school isn’t listed.”');
  else if(sel.value===OTHER&&!school.querySelector('.other-school input').value.trim())fail(school.querySelector('.other-school input'),'Please enter the school name.');});
 return first;}
// Submissions go to the RAM HQ web app named in portal-config.js. Without it, forms stay in preview mode.
const SUBMIT_URL=(window.BRYC_PORTAL||{}).submitUrl||'';
if(SUBMIT_URL){$$('[data-preview]').forEach(n=>n.hidden=true);$$('[data-live]').forEach(n=>n.hidden=false);}
const MAX_FILE_BYTES=10*1024*1024;
// Answers keyed by RAM HQ column. Hidden or disabled questions are left out.
function collectAnswers(form){const out={};
 form.querySelectorAll('[data-col]').forEach(el=>{if(el.disabled||el.closest('[hidden]')||el.type==='file')return;const col=el.dataset.col;let v='';
  if(el.type==='checkbox'){if(!el.checked)return;out[col]=out[col]?out[col]+'; '+el.value:el.value;return;}
  if(el.type==='radio'){if(!el.checked)return;v=el.dataset.label||el.value;}
  else if(el.tagName==='SELECT'){
   if(el.classList.contains('school-select')){const other=el.closest('[data-school-control]').querySelector('.other-school input');
    if(el.value===OTHER){v=other.value.trim();out['School Not Listed']='Yes';}else if(el.value){v=el.value;out['School Not Listed']='No';}}
   else if(el.value){v='useValue' in el.dataset?el.value:el.selectedOptions[0].text;
    if(el.dataset.other&&el.value===(el.dataset.otherValue||'Other')){const t=$(el.dataset.other).querySelector('input').value.trim();if(t)v=el.value==='Other'?'Other: '+t:t;}}}
  else v=el.value.trim();
  if(v)out[col]=v;});
 return out;}
function readFile(file){return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=()=>fail(r.error);r.readAsDataURL(file);});}
async function collectFiles(form){const files=[];
 for(const el of form.querySelectorAll('input[type="file"][data-col]')){if(el.closest('[hidden]')||!el.files.length)continue;const f=el.files[0];
  if(f.size>MAX_FILE_BYTES)throw new Error(`${f.name} is larger than 10 MB. Please upload a smaller file or a screenshot.`);
  files.push({column:el.dataset.col,name:f.name,mimeType:f.type||'application/octet-stream',data:await readFile(f)});}
 return files;}
// Interest and referral forms thank the family right away and finish sending in the
// background; if sending fails, the form comes back with the error. Applications
// carry files, so they wait for the save to finish before thanking.
// "Add another student": keep what the person told us about themselves and clear
// only the sections marked data-repeat-clear.
function startAnother(form,done,msg,button){
 form.querySelectorAll('[data-repeat-clear]').forEach(section=>{
  section.querySelectorAll('input,select,textarea').forEach(el=>{if(el.type==='checkbox'||el.type==='radio')el.checked=false;else if(el.tagName==='SELECT')el.selectedIndex=0;else el.value='';});
  section.querySelectorAll('select[data-other]').forEach(el=>el.dispatchEvent(new Event('change')));
  section.querySelectorAll('input[type="radio"][data-reveal]').forEach(r=>{$(r.dataset.reveal).hidden=true;});
  section.querySelectorAll('[data-school-control]').forEach(w=>{const sel=w.querySelector('.school-select');sel.replaceChildren(new Option('Select school',''));sel.value='';syncSchoolControl(w);});});
 form.querySelectorAll('.field-error').forEach(e=>e.remove());form.querySelectorAll('[aria-invalid="true"]').forEach(e=>e.removeAttribute('aria-invalid'));
 done.remove();msg.textContent='';button.disabled=false;form.hidden=false;
 const first=form.querySelector('[data-repeat-clear] input:not([type="radio"])');first?.focus({preventScroll:true});form.querySelector('[data-repeat-clear]').scrollIntoView({behavior:'smooth',block:'start'});}
async function sendForm(type,form,msg,button,thanks,optimistic,again){
 if(!SUBMIT_URL){msg.textContent='Preview only. Nothing was submitted or saved.';return false;}
 button.disabled=true;let done=null;
 const showDone=()=>{done=document.createElement('div');done.className='form-done';done.setAttribute('role','status');const p=document.createElement('p');p.textContent=thanks;done.append(p);
  if(again){const ask=document.createElement('p');ask.className='form-done-ask';ask.textContent=again.prompt;const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=again.label;b.addEventListener('click',()=>startAnother(form,done,msg,button));done.append(ask,b);
   if(again.apply){const p=document.createElement('p');p.className='form-done-ask';p.textContent='Ready to apply? A parent/guardian can create a household account and start the application.';const a=document.createElement('button');a.type='button';a.className='btn btn-primary';a.dataset.view='apply';a.textContent='Start an application';done.append(p,a);}}
  form.hidden=true;form.after(done);done.scrollIntoView({behavior:'smooth',block:'center'});};
 try{// Collect answers before hiding the form: hidden questions are skipped on purpose.
  const body={form:type,fields:collectAnswers(form),files:await collectFiles(form),website:form.elements.namedItem('website')?.value||''};
  if(optimistic)showDone();else msg.textContent='Submitting your application. This can take a few seconds.';
  const res=await fetch(SUBMIT_URL,{method:'POST',body:JSON.stringify(body),keepalive:optimistic});const out=await res.json();
  if(!out.ok)throw new Error(out.error||'Something went wrong.');
  if(!optimistic)showDone();return true;}
 catch(err){if(done){done.remove();form.hidden=false;}msg.textContent=(err&&err.message)||'Something went wrong. Please try again.';button.disabled=false;msg.scrollIntoView({behavior:'smooth',block:'center'});return false;}}
[[inquiry,'inquiry','#inquiry-message','Thank you. Someone from our admissions team will reach out soon. If you shared an email address, look for information about BRYC in your inbox.',{prompt:'Is there another student in your family who might be interested?',label:'Add another student',apply:true}],
 [$('#referral-form'),'referral','#referral-message','Thank you for the referral. We will reach out to the student and their family.',{prompt:'Know another student who would be a good fit?',label:'Refer another student'}]]
 .forEach(([form,type,msgSel,thanks,again])=>form?.addEventListener('submit',e=>{e.preventDefault();let first=formErrors(form);const msg=$(msgSel);
 // The interest form needs one way to reach the family: any phone or email.
 if(!first&&type==='inquiry'&&!CONTACTS.some(n=>form.elements.namedItem(n).value.trim())){
  first=form.elements.namedItem('studentPhone');first.setAttribute('aria-invalid','true');const n=document.createElement('div');n.className='field-error';n.setAttribute('role','alert');n.textContent='Add at least one phone number or email for the student or a parent/guardian.';first.insertAdjacentElement('afterend',n);}
 if(first){msg.textContent='Please fix the highlighted questions.';first.focus({preventScroll:true});first.scrollIntoView({behavior:'smooth',block:'center'});return;}
 sendForm(type,form,msg,form.querySelector('button[type="submit"]'),thanks,true,again);}));
$$('[data-scroll]').forEach(n=>n.addEventListener('click',e=>{e.preventDefault();if(!$('#home').classList.contains('active'))view('home');document.getElementById(n.dataset.scroll)?.scrollIntoView({behavior:'smooth'});}));
// schools.json is the single school list for the public form and the staff workspace.
let schoolList=[];try{const r=await fetch('schools.json');if(r.ok)schoolList=await r.json();}catch(e){}

const OTHER='__other__';
function syncSchoolControl(wrapper){
 const sel=wrapper.querySelector('.school-select'),other=wrapper.querySelector('.other-school'),input=other.querySelector('input');
 other.hidden=sel.value!==OTHER;
 input.required=!other.hidden&&!sel.disabled;
 input.disabled=other.hidden||sel.disabled;
}
function initSchoolCombobox(wrapper){
 const search=wrapper.querySelector('.school-search'),sel=wrapper.querySelector('.school-select'),list=wrapper.querySelector('.school-suggestions');
 const uid='school-options-'+[...document.querySelectorAll('[data-school-control]')].indexOf(wrapper);
 search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-controls',uid);search.setAttribute('aria-expanded','false');
 list.id=uid;let active=-1,shown=[];
 function close(){list.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');active=-1;}
 function open(){if(search.disabled)return;let term=search.value.trim().toLocaleLowerCase();
   shown=schoolList.filter(x=>x.toLocaleLowerCase().includes(term)).slice(0,35).map(x=>({value:x,label:x}));
   shown.push({value:OTHER,label:'My school isn’t listed'});
   list.replaceChildren();shown.forEach((school,i)=>{let item=document.createElement('li');item.setAttribute('role','option');item.id=uid+'-'+i;item.textContent=school.label;
     if(school.value===OTHER)item.classList.add('school-other-option');item.addEventListener('mousedown',e=>e.preventDefault());item.addEventListener('click',()=>choose(i));list.append(item)});
   list.hidden=false;search.setAttribute('aria-expanded','true');active=-1;
 }
 function highlight(i){active=i;[...list.children].forEach((el,j)=>el.setAttribute('aria-selected',String(j===i)));if(i>=0){search.setAttribute('aria-activedescendant',uid+'-'+i);list.children[i].scrollIntoView({block:'nearest'});}else search.removeAttribute('aria-activedescendant');}
 function choose(i){const school=shown[i];if(!school)return;sel.replaceChildren(new Option(school.label,school.value));sel.value=school.value;search.value=school.value===OTHER?school.label:school.label;syncSchoolControl(wrapper);close();if(school.value===OTHER)wrapper.querySelector('.other-school input').focus();}
 search.addEventListener('focus',open);search.addEventListener('click',open);
 search.addEventListener('input',()=>{sel.replaceChildren(new Option('Select school',''));sel.value='';syncSchoolControl(wrapper);open()});
 search.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)open();highlight(Math.max(0,Math.min(shown.length-1,active+(e.key==='ArrowDown'?1:-1))));}else if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active<0&&shown.length===1)choose(0);else if(active>=0)choose(active);}else if(e.key==='Tab')close();});
 search.addEventListener('blur',()=>{setTimeout(()=>{if(!wrapper.contains(document.activeElement))close()},100)});
 document.addEventListener('pointerdown',e=>{if(!wrapper.contains(e.target))close()});
 // Native form validation and review continue to use this hidden backing select.
 sel.innerHTML='<option value="">Select school</option>';
 syncSchoolControl(wrapper);
}
$$('[data-school-control]').forEach(initSchoolCombobox);
window.BRYCForms={collectAnswers,collectFiles,formErrors,syncSchoolControl,OTHER};
const app=$('#application-demo');if(!app)return;
const year=app.elements.namedItem('academicYear'),currentGrade=app.elements.namedItem('currentGrade'),futureGrade=app.elements.namedItem('futureGrade');
const openYears=(window.BRYC_PORTAL||{}).openProgramYears;
if(Array.isArray(openYears))[...year.options].forEach(o=>{if(o.value&&!openYears.includes(o.value))o.remove();});
function updateYear(){
 const upcoming=year.value==='2027-2028',current=year.value==='2026-2027';
 [['upcoming-grade-field',upcoming],['current-school-field',current],['upcoming-school-field',upcoming]].forEach(([id,show])=>{
  const div=document.getElementById(id);if(!div)return;div.hidden=!show;
  div.querySelectorAll('input,select').forEach(input=>{
   if(input.classList.contains('school-search')){input.disabled=!show;return;}
   input.disabled=!show||(!!input.closest('.other-school')&&input.closest('.other-school').hidden);
   if(input.name==='futureGrade')input.required=show;
   if(input.classList.contains('school-select'))input.required=show;
  });
 });
 currentGrade.querySelector('option[value="7"]').disabled=current;
 if(current&&currentGrade.value==='7')currentGrade.value='';
 const school=app.querySelector('[data-school-control="'+(upcoming?'futureSchool':'currentSchool')+'"]');if(school)syncSchoolControl(school);
 updateAcademic();clearErrors();
}
function updateAcademic(){
 const g=Number((year.value==='2027-2028'?futureGrade:currentGrade).value);
 const branch=$('#academic-branch');branch.replaceChildren();
 const title=document.createElement('h3');title.textContent=g===12?'Rising Senior Academic Records':g===11?'Rising Junior Academic Records':'Grade Report';branch.append(title);
 const desc=document.createElement('p');desc.textContent=g===12?'Please provide your high school transcript through fall of junior year and your highest official ACT score report, if available.':g===11?'Please upload a transcript or report card showing coursework from ninth grade through fall of sophomore year.':'Grade Report: Please upload your most recent report card. A screenshot is acceptable.';branch.append(desc);
 function file(name,label){const lab=document.createElement('label');lab.className='academic-file';const span=document.createElement('span');span.className='question-title';span.textContent=label;const field=document.createElement('input');field.type='file';field.name=name;field.dataset.col=name==='actReport'?'ACT Report':'Academic Record';field.accept='.pdf,.png,.jpg,.jpeg';field.setAttribute('aria-label',label);lab.append(span,field);branch.append(lab);return field;}
 if(g===12){file('transcript','High School Transcript');const lab=document.createElement('label');const span=document.createElement('span');span.className='question-title';span.textContent='Have You Taken an Official ACT?';const select=document.createElement('select');select.name='actTaken';select.dataset.col='ACT Taken';select.required=true;[['','Choose one'],['Yes','Yes'],['Yes, but I do not know my scores yet','Yes, but I do not know my scores yet'],['No','No']].forEach(([v,l])=>select.add(new Option(l,v)));lab.append(span,select);branch.append(lab);
 const act=file('actReport','Highest ACT Score Report (if available)');act.closest('label').hidden=true;select.addEventListener('change',()=>{act.closest('label').hidden=select.value!=='Yes';clearErrors()});}
 else if(g===11){file('juniorRecord','Transcript or Report Card')}
 else{const f=file('gradeReport','Most Recent Report Card');const lab=document.createElement('label');const span=document.createElement('span');span.className='question-title';span.textContent='If You Cannot Access Your Report Card, Self-Report Your Grades Here';const area=document.createElement('textarea');area.name='selfReportedGrades';area.dataset.col='Self-Reported Grades';area.rows=3;area.placeholder='Class name and grade';lab.append(span,area);branch.append(lab);}
}
year.addEventListener('change',updateYear);currentGrade.addEventListener('change',updateAcademic);futureGrade.addEventListener('change',updateAcademic);updateYear();
const relative=app.elements.namedItem('brycRelative');const relativeNames=app.elements.namedItem('relativeNames');
function syncRelative(){relativeNames.required=relative.checked;relativeNames.closest('label').hidden=!relative.checked;if(!relative.checked)relativeNames.value=''}
relative.addEventListener('change',syncRelative);syncRelative();
let step=0,steps=$$('.wizard-step');const names=['Student Information','Academic Records','About You','Guardian & Address','Review'];
function labelFor(el){let label=el.closest('label');let text=label?.querySelector('.question-title')?.textContent||label?.textContent||el.getAttribute('aria-label')||el.name||'This field';return text.trim().replace(/\s+/g,' ').slice(0,90)}
function clearErrors(){app.querySelectorAll('.field-error').forEach(e=>e.remove());app.querySelectorAll('[aria-invalid="true"]').forEach(e=>e.removeAttribute('aria-invalid'));const n=$('#wizard-notice');if(n)n.textContent=''}
function error(el,message){el.setAttribute('aria-invalid','true');const note=document.createElement('div');note.className='field-error';note.setAttribute('role','alert');note.textContent=message;el.insertAdjacentElement('afterend',note);return el}
function validateStep(i){clearErrors();const panel=steps[i];if(!panel)return true;let first=null;
 function fail(el,message){if(!first)first=el;error(el,message)}
 panel.querySelectorAll('input,select,textarea').forEach(el=>{
  if(el.disabled||el.closest('[hidden]')||el.type==='hidden'||el.classList.contains('school-search'))return;
  if(el.type==='checkbox'||el.type==='radio'||el.type==='file')return;
  if(el.required&&!el.value.trim())fail(el,'Please complete '+labelFor(el).toLowerCase()+'.');
  else if(el.value&&el.validity.typeMismatch)fail(el,'Please enter a valid email address.');
 });
 panel.querySelectorAll('[data-required-radio]').forEach(g=>{if(g.closest('[hidden]'))return;if(!app.elements.namedItem(g.dataset.requiredRadio).value)fail(g.querySelector('.role-choice')||g,'Please choose one.');});
 if(i===0){
  if(!year.value){} else if(!['2026-2027','2027-2028'].includes(year.value))fail(year,'Please select an academic year.');
  const target=year.value==='2027-2028'?futureGrade:currentGrade;
  if(year.value==='2027-2028'&&target.value&&currentGrade.value&&Number(target.value)!==Number(currentGrade.value)+1)fail(target,'The 2027–2028 grade should be one grade above the current grade. Please verify your selections.');
  if(year.value==='2026-2027'&&currentGrade.value==='12')fail(currentGrade,'New senior applications are not accepted for the current year.');
  const school=app.querySelector('[data-school-control="'+(year.value==='2027-2028'?'futureSchool':'currentSchool')+'"]');if(school){const select=school.querySelector('.school-select');if(!select.value)fail(school.querySelector('.school-search'),'Please choose a school from the suggestions or select “My school isn’t listed.”');else if(select.value===OTHER&&!school.querySelector('.other-school input').value.trim())fail(school.querySelector('.other-school input'),'Please enter the school name.');}
 }
 if(i===1){const g=Number((year.value==='2027-2028'?futureGrade:currentGrade).value);const file=panel.querySelector('input[type="file"]');const self=panel.querySelector('[name="selfReportedGrades"]');
  if(file&&!file.files.length&&!(g<11&&self?.value.trim()))fail(file,g<11?'Upload a grade report or self-report your grades.':'Please select the requested academic record.');
  const taken=panel.querySelector('[name="actTaken"]');if(taken&&!taken.value)fail(taken,'Please select your ACT status.');
  const report=panel.querySelector('[name="actReport"]');if(taken?.value==='Yes'&&report&&!report.files.length)fail(report,'Please select your ACT score report, if available; otherwise update your ACT status.');
 }
 if(i===2){const radios=[...panel.querySelectorAll('[name="studentCertification"]')];const checked=radios.find(r=>r.checked);if(!checked)fail(radios[0],'Please select your certification response.');else if(checked.value.toLowerCase()!=='yes')fail(checked,'You must agree to the certification to continue.');}
 if(i===3){const a=panel.querySelector('[name="policyAck"]');if(a&&!a.checked)fail(a,'Please acknowledge BRYC policies.');['homeZip','g2Zip'].forEach(n=>{const zip=panel.querySelector('[name="'+n+'"]');if(zip?.value&&!zip.closest('[hidden]')&&!/^\d{5}(?:-\d{4})?$/.test(zip.value.trim()))fail(zip,'Please enter a valid ZIP code.');});}
 if(first){$('#wizard-notice').textContent='Please correct the highlighted questions before continuing.';first.focus({preventScroll:true});first.scrollIntoView({behavior:'smooth',block:'center'});return false}return true;
}
function review(){const target=$('#application-review');target.replaceChildren();const vals=new FormData(app);const added=new Set();for(const [k,v] of vals.entries()){
 if(v instanceof File){if(!v.name)continue;}
 else if(!String(v).trim())continue;
 if(k.endsWith('Other'))continue;
 const el=app.elements.namedItem(k);const input=el?.length?el[0]:el;if(!input||input.disabled||input.closest('[hidden]'))continue;
 const value=v instanceof File?v.name:(v===OTHER?vals.get(k+'Other')||'Not provided':v);
 const label=input?.closest('label')?.querySelector('.question-title')?.textContent||k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
 let row=target.querySelector('[data-review-key="'+CSS.escape(k)+'"]');if(!row){row=document.createElement('div');row.className='review-row';row.dataset.reviewKey=k;const title=document.createElement('strong');title.textContent=label;const data=document.createElement('span');row.append(title,data);target.append(row)}
 const node=row.querySelector('span');node.textContent+=(node.textContent?', ':'')+value;
 }}
function showStep(){steps.forEach((s,i)=>s.classList.toggle('active',i===step));$('#wizard-count').textContent=`Step ${step+1} of ${steps.length} · ${names[step]}`;const prev=$('#wizard-back'),next=$('#wizard-next');prev.disabled=step===0;next.textContent=step===steps.length-1?(SUBMIT_URL?'Submit application':'Preview complete (no submission)'):'Continue →';const milestones=$$('.wizard-milestones li');milestones.forEach((x,i)=>{x.classList.toggle('active',i===step);x.classList.toggle('done',i<step);if(i===step)x.setAttribute('aria-current','step');else x.removeAttribute('aria-current')});$('#wizard-fill').style.width=((step+1)/steps.length*100)+'%';if(step===steps.length-1)review();clearErrors();const y=$('#apply').getBoundingClientRect().top+window.scrollY-80;window.scrollTo({top:Math.max(0,y),behavior:'instant'});}
$('#wizard-back')?.addEventListener('click',()=>{if(step>0)step--;showStep()});$('#wizard-next')?.addEventListener('click',()=>{if(step===steps.length-1){if(window.BRYCPortal?.active){window.BRYCPortal.submitApplication($('#wizard-notice'),$('#wizard-next'));return;}sendForm('application',app,$('#wizard-notice'),$('#wizard-next'),'Your application was submitted. We will be in touch with next steps.');return;}if(!validateStep(step))return;step++;showStep()});showStep();
// Application state for portal drafts. Answers are keyed by field name, so a
// saved draft restores exactly; files can't be saved and are re-attached.
function setSchool(wrapper,value,otherText){const sel=wrapper.querySelector('.school-select'),search=wrapper.querySelector('.school-search');
 if(value){sel.replaceChildren(new Option(value===OTHER?'My school isn’t listed':value,value));sel.value=value;search.value=value===OTHER?'My school isn’t listed':value;}
 else{sel.replaceChildren(new Option('Select school',''));sel.value='';search.value='';}
 syncSchoolControl(wrapper);const other=wrapper.querySelector('.other-school input');if(other&&otherText)other.value=otherText;}
function serialize(){const out={};
 [...app.elements].forEach(el=>{if(!el.name||el.type==='file'||el.name==='website'||el.disabled&&el.type!=='checkbox')return;
  if(el.type==='checkbox'){(out[el.name]=out[el.name]||[]);if(el.checked)out[el.name].push(el.value);return;}
  if(el.type==='radio'){if(el.checked)out[el.name]=el.value;return;}
  if(el.value)out[el.name]=el.value;});
 return out;}
// Yes/no questions with data-reveal show or hide their follow-up questions.
function syncReveals(){app.querySelectorAll('input[type="radio"][data-reveal]').forEach(r=>{const t=$(r.dataset.reveal);if(t)t.hidden=app.elements.namedItem(r.name).value!=='yes';});}
function resetApp(){app.reset();syncReveals();app.querySelectorAll('[data-school-control]').forEach(w=>setSchool(w,''));updateYear();syncRelative();
 app.querySelectorAll('select[data-other]').forEach(el=>el.dispatchEvent(new Event('change')));
 if(year.options.length===2){year.selectedIndex=1;updateYear();}
 step=0;showStep();clearErrors();}
function restore(a){resetApp();a=a||{};
 if(a.academicYear){year.value=a.academicYear;updateYear();}
 ['currentGrade','futureGrade'].forEach(n=>{if(a[n]){app.elements.namedItem(n).value=a[n];}});updateAcademic();
 [...app.elements].forEach(el=>{const v=a[el.name];if(!el.name||v===undefined||['academicYear','currentGrade','futureGrade'].includes(el.name)||el.type==='file')return;
  if(el.classList.contains('school-select')){setSchool(el.closest('[data-school-control]'),v,a[el.name+'Other']);return;}
  if(el.type==='checkbox')el.checked=Array.isArray(v)&&v.includes(el.value);
  else if(el.type==='radio')el.checked=el.value===v;
  else el.value=v;});
 syncRelative();syncReveals();app.querySelectorAll('select[data-other],select[name="actTaken"]').forEach(el=>el.dispatchEvent(new Event('change')));
 step=0;showStep();clearErrors();}
window.BRYCApp={form:app,serialize,restore,reset:resetApp};
document.dispatchEvent(new CustomEvent('bryc:app-ready'));
})();
