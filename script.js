(()=>{
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 function view(name){$$('.view').forEach(el=>el.classList.toggle('active',el.id===name));$$('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));$('.topbar nav')?.classList.remove('show');window.scrollTo({top:0,behavior:'instant'});}
 $$('[data-view]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();view(el.dataset.view)}));$('#mobile-menu')?.addEventListener('click',()=>$('.topbar nav')?.classList.toggle('show'));
 const inquiry=$('#inquiry-form');const fields=$('#student-fields');function changeRole(){let student=$('input[name="role"]:checked')?.value==='student';if(fields){fields.hidden=!student;fields.querySelectorAll('input,select').forEach(el=>el.required=student)}if($('#email-label'))$('#email-label').textContent=student?'Personal email address':'Email address';if($('#email-hint'))$('#email-hint').hidden=!student}
 $$('input[name="role"]').forEach(x=>x.addEventListener('change',changeRole));changeRole();
 inquiry?.addEventListener('submit',e=>{e.preventDefault();const m=$('#inquiry-message');if(m)m.textContent='This is a design preview. Submissions are disabled; nothing has been saved.'});
 let step=0;const steps=$$('.wizard-step');function showStep(){steps.forEach((el,i)=>el.classList.toggle('active',i===step));const progress=$('#step-count');if(progress)progress.textContent=`Step ${step+1} of ${steps.length}`;}showStep();
 $$('[data-next-step]').forEach(el=>el.addEventListener('click',()=>{step=Math.min(steps.length-1,step+1);showStep()}));$$('[data-prev-step]').forEach(el=>el.addEventListener('click',()=>{step=Math.max(0,step-1);showStep()}));
 $$('[data-staff-tab]').forEach(el=>el.addEventListener('click',()=>{let t=el.dataset.staffTab;$$('.staff-link').forEach(b=>b.classList.toggle('chosen',b===el));$$('.staff-tab').forEach(p=>p.classList.toggle('active',p.id==='staff-'+t));}));
 if(location.hash==='#staff')view('staff');
})();
