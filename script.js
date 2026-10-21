
(async()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function view(name){$$('.view').forEach(n=>n.classList.toggle('active',n.id===name));$$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===name));$('.topbar nav')?.classList.remove('show');window.scrollTo({top:0,behavior:'instant'});}
$$('[data-view]').forEach(n=>n.addEventListener('click',e=>{e.preventDefault();view(n.dataset.view)}));$('#mobile-menu')?.addEventListener('click',()=>$('.topbar nav')?.classList.toggle('show'));
$$('[data-staff-tab]').forEach(n=>n.addEventListener('click',()=>{let name=n.dataset.staffTab;$$('.staff-link').forEach(x=>x.classList.toggle('chosen',x===n));$$('.staff-tab').forEach(x=>x.classList.toggle('active',x.id==='staff-'+name))}));
if(location.hash==='#staff')view('staff');
const inquiry=$('#inquiry-form');function changeRole(){let student=$('input[name="role"]:checked')?.value==='student';let field=$('#student-fields');field.hidden=!student;field.querySelectorAll('input,select').forEach(x=>{x.disabled=!student;if(x.classList.contains('school-search'))return; if(x.name==='school')x.required=student;else if(x.name==='inquiryOtherSchool')x.required=student&&x.closest('.other-school')?.hidden===false;else x.required=student});$('#email-label').textContent=student?'Personal email address':'Email address';$('#email-hint').hidden=!student}$$('input[name="role"]').forEach(n=>n.addEventListener('change',changeRole));
inquiry?.addEventListener('submit',e=>{e.preventDefault();$('#inquiry-message').textContent='Preview only — nothing was submitted or saved.'});
const schoolList=["Advantage Charter Academy", "Albany High School", "Arlington Preparatory Academy", "Ascension Christian High School", "Baker High School", "Baton Rouge Magnet High School", "Belaire Magnet High School", "Belfair Montessori Magnet School", "Bluff Middle School", "Broadmoor Senior High School", "Brusly High School", "Caneview K-8", "Capitol High School", "Capitol Middle Magnet School", "Catholic High School", "Central High School", "Central Middle School", "Collegiate Baton Rouge", "Crestworth Middle School", "CSAL", "Denham Springs High School", "Dutchtown High School", "East Ascension High School", "East Baton Rouge Arts & Technical School", "East Baton Rouge Virtual Academy", "East Feliciana High School", "EBR Virtual K–12", "Episcopal High School", "Eva Legarde Research Center", "Family Christian Academy", "French Settlement High School", "Friendship Capitol High School", "Frost Middle School", "GEO Next Generation High School", "GEO Prep - Sherwood", "GEO Prep Mid-City", "Glasgow Middle School", "Glen Oaks Magnet High School", "Great Hearts Harveston", "Helix Aviation Academy", "Helix Mentorship STEAM Academy", "Home School (Unaffiliated)", "Hosanna Christian Academy", "Iberville Math, Science, and Arts Academy West", "IDEA Bridge", "Indira Mura Institute", "Istrouma Magnet High School", "Istrouma Middle School", "Jefferson Terrace Academy", "Jehovah-Jireh Christian Academy", "JK Haynes Middle School", "Lafayette High School", "Liberty Magnet High School", "Live Oak High School", "Livonia High School", "Louisiana Academy of Production", "Louisiana Key Academy", "Louisiana Virtual Charter Academy", "LSU University Laboratory School", "Madison Preparatory Academy", "Mayfair Laboratory School", "McKanstry Prepatory School", "McKinley Middle Magnet School", "McKinley Senior High School", "MSA - East", "MSA West Middle/High School", "North Iberville High School", "Northeast High School", "Northwestern Middle School", "Park Forest Middle School", "Park Medical Academy", "Parkview Baptist School", "Plaquemine High School", "Port Allen High School", "Port Allen Middle School", "Prairieville High School", "Prairieville Middle School", "Redemptorist St. Gerard School", "Scotlandville Magnet High School", "Scotlandville Pre-Engineering Academy", "Sherwood Middle Academic Magnet School", "Slaughter Community Charter School", "Southeast Middle School", "Southern University Lab School", "St. Amant High School", "St. Joseph's Academy", "St. Michael High School", "Tara High School", "The Dunham School", "Thrive Academy", "University View Academy", "Walker High School", "West Feliciana High School", "West Feliciana Middle School", "Westdale Middle School", "Wilkinson County High School", "Woodlawn High School", "Woodlawn Middle School", "Zachary Christian Academy", "Zachary High School"];

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
changeRole();
const app=$('#application-demo');if(!app)return;
const year=app.elements.namedItem('academicYear'),currentGrade=app.elements.namedItem('currentGrade'),futureGrade=app.elements.namedItem('futureGrade');
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
 function file(name,label){const lab=document.createElement('label');lab.className='academic-file';const span=document.createElement('span');span.className='question-title';span.textContent=label;const field=document.createElement('input');field.type='file';field.name=name;field.accept='.pdf,.png,.jpg,.jpeg';field.setAttribute('aria-label',label);lab.append(span,field);branch.append(lab);return field;}
 if(g===12){file('transcript','High School Transcript');const lab=document.createElement('label');const span=document.createElement('span');span.className='question-title';span.textContent='Have You Taken an Official ACT?';const select=document.createElement('select');select.name='actTaken';select.required=true;[['','Choose one'],['Yes','Yes'],['Yes, but I do not know my scores yet','Yes, but I do not know my scores yet'],['No','No']].forEach(([v,l])=>select.add(new Option(l,v)));lab.append(span,select);branch.append(lab);
 const act=file('actReport','Highest ACT Score Report (if available)');act.closest('label').hidden=true;select.addEventListener('change',()=>{act.closest('label').hidden=select.value!=='Yes';clearErrors()});}
 else if(g===11){file('juniorRecord','Transcript or Report Card')}
 else{const f=file('gradeReport','Most Recent Report Card');const lab=document.createElement('label');const span=document.createElement('span');span.className='question-title';span.textContent='If You Cannot Access Your Report Card, Self-Report Your Grades Here';const area=document.createElement('textarea');area.name='selfReportedGrades';area.rows=3;area.placeholder='Class name and grade';lab.append(span,area);branch.append(lab);}
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
function showStep(){steps.forEach((s,i)=>s.classList.toggle('active',i===step));$('#wizard-count').textContent=`Step ${step+1} of ${steps.length} · ${names[step]}`;const prev=$('#wizard-back'),next=$('#wizard-next');prev.disabled=step===0;next.textContent=step===steps.length-1?'Preview Complete (No Submission)':'Continue →';const milestones=$$('.wizard-milestones li');milestones.forEach((x,i)=>{x.classList.toggle('active',i===step);x.classList.toggle('done',i<step);if(i===step)x.setAttribute('aria-current','step');else x.removeAttribute('aria-current')});$('#wizard-fill').style.width=((step+1)/steps.length*100)+'%';if(step===steps.length-1)review();clearErrors();const y=$('#apply').getBoundingClientRect().top+window.scrollY-80;window.scrollTo({top:Math.max(0,y),behavior:'instant'});}
$('#wizard-back')?.addEventListener('click',()=>{if(step>0)step--;showStep()});$('#wizard-next')?.addEventListener('click',()=>{if(step===steps.length-1){$('#wizard-notice').textContent='Preview complete. No information has been submitted or saved.';return;}if(!validateStep(step))return;step++;showStep()});showStep();
})();
