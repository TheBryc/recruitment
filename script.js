
(async()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
// Each page change is a browser history entry, so the Back button works.
// Pages opened from history (Back, Forward, a shared link) don't add a new entry.
let movedInSite=false;
function view(name,fromHistory){if(window.BRYCGuard)name=window.BRYCGuard(name)||name;$$('.view').forEach(n=>n.classList.toggle('active',n.id===name));$$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===name));$('.topbar nav')?.classList.remove('show');window.scrollTo({top:0,behavior:'instant'});const url=name==='home'?location.pathname:'#'+name;
 if(fromHistory)history.replaceState(null,'',url);else if(location.hash!==(name==='home'?'':'#'+name)){history.pushState(null,'',url);movedInSite=true;}
 document.dispatchEvent(new CustomEvent('bryc:view',{detail:{name}}));}
window.BRYCView=view;
document.addEventListener('click',e=>{const n=e.target.closest('[data-view]');if(!n||n.hasAttribute('data-scroll'))return;e.preventDefault();view(n.dataset.view);});$('#mobile-menu')?.addEventListener('click',()=>$('.topbar nav')?.classList.toggle('show'));
// Open the page named in the link, so links like #refer or #apply can be shared.
const openFromHash=()=>{const name=location.hash.slice(1)||'home';if(document.getElementById(name)?.classList.contains('view')&&!document.getElementById(name).classList.contains('active'))view(name,true);};
openFromHash();window.addEventListener('popstate',openFromHash);window.addEventListener('hashchange',openFromHash);
// On-page Back: return to the previous page in the site, or home if the visitor arrived here directly.
$$('[data-back]').forEach(n=>n.addEventListener('click',()=>{if(movedInSite)history.back();else view('home');}));
// Interest form: one submission captures the student and a parent or guardian so staff can match them.
const inquiry=$('#inquiry-form');
function changeRole(){const guardian=$('input[name="submitterRole"]:checked')?.value==='guardian';
 inquiry.querySelector('.household').classList.toggle('guardian-first',guardian);
 inquiry.querySelector('[data-student-title]').textContent=guardian?'Your student':'Your information';
 inquiry.querySelector('[data-guardian-title]').textContent=guardian?'Your information':'Your parent or guardian';
 inquiry.querySelector('[data-relationship-label]').textContent=guardian?'Your relationship to the student':'Relationship to you';}
$$('input[name="submitterRole"]').forEach(n=>n.addEventListener('change',changeRole));
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
  if(again){const ask=document.createElement('p');ask.className='form-done-ask';ask.textContent=again.prompt;const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=again.label;b.addEventListener('click',()=>startAnother(form,done,msg,button));done.append(ask,b);}
  form.hidden=true;form.after(done);done.scrollIntoView({behavior:'smooth',block:'center'});};
 try{// Collect answers before hiding the form: hidden questions are skipped on purpose.
  const body={form:type,fields:collectAnswers(form),files:await collectFiles(form),website:form.elements.namedItem('website')?.value||''};
  if(optimistic)showDone();else msg.textContent='Submitting your application. This can take a few seconds.';
  const res=await fetch(SUBMIT_URL,{method:'POST',body:JSON.stringify(body),keepalive:optimistic});const out=await res.json();
  if(!out.ok)throw new Error(out.error||'Something went wrong.');
  if(!optimistic)showDone();return true;}
 catch(err){if(done){done.remove();form.hidden=false;}msg.textContent=(err&&err.message)||'Something went wrong. Please try again.';button.disabled=false;msg.scrollIntoView({behavior:'smooth',block:'center'});return false;}}
[[inquiry,'inquiry','#inquiry-message','Thank you. Someone from our admissions team will reach out soon.',{prompt:'Is there another student in your family who might be interested?',label:'Add another student'}],
 [$('#referral-form'),'referral','#referral-message','Thank you for the referral. We will reach out to the student and their family.',{prompt:'Know another student who would be a good fit?',label:'Refer another student'}]]
 .forEach(([form,type,msgSel,thanks,again])=>form?.addEventListener('submit',e=>{e.preventDefault();const first=formErrors(form);const msg=$(msgSel);
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
if(inquiry)changeRole();
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
 if(i===3){const a=panel.querySelector('[name="policyAck"]');if(a&&!a.checked)fail(a,'Please acknowledge BRYC policies.');const zip=panel.querySelector('[name="homeZip"]');if(zip?.value&&!/^\d{5}(?:-\d{4})?$/.test(zip.value.trim()))fail(zip,'Please enter a valid ZIP code.');}
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
function resetApp(){app.reset();app.querySelectorAll('[data-school-control]').forEach(w=>setSchool(w,''));updateYear();syncRelative();
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
 syncRelative();app.querySelectorAll('select[data-other],select[name="actTaken"]').forEach(el=>el.dispatchEvent(new Event('change')));
 step=0;showStep();clearErrors();}
window.BRYCApp={form:app,serialize,restore,reset:resetApp};
document.dispatchEvent(new CustomEvent('bryc:app-ready'));
})();
