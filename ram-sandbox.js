// BRYC V19: Separate, fictional-only Firestore sandbox. NEVER collect real student data here.
// No writes until an authorized admin explicitly clicks Initialize.
import {firebaseConfig} from './firebase-config.js';
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,getDocs,writeBatch,updateDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const $=s=>document.querySelector(s);
const bar=$('#workspace-storage-status'),hint=$('#workspace-storage-help'),init=$('#workspace-seed-cloud');
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app),db=getFirestore(app);
let session=0,uid=null,isActive=false;
const groups=['prospects','applications','tasks'];
const path=(group)=>collection(db,'ramSandbox',uid,group);
const setStatus=(title,msg)=>{if(bar)bar.textContent=title;if(hint)hint.textContent=msg;};
function disable(){session++;uid=null;isActive=false;window.BRYCSandbox={active:false};init.hidden=true;init.disabled=true;window.BRYCWorkspace?.reset();setStatus('Session-only demo','Changes reset on refresh. No Firestore writes are active.');}
window.BRYCSandbox={active:false};
window.addEventListener('bryc:workspace-locked',disable);
async function authorize(e){
  const run=++session;uid=e.detail.uid;isActive=false;window.BRYCSandbox={active:false};init.hidden=true;
  if(e.detail.role!=='ram_admin'){setStatus('Session-only demo','Only approved RAM administrators can use this isolated test sandbox.');return;}
  setStatus('Checking secure sandbox…','Checking your personal fictional-data test collection.');
  try{
    const entries=await Promise.all(groups.map(g=>getDocs(path(g))));
    if(run!==session)return;
    const counts=entries.map(x=>x.size);
    if(counts.every(c=>c===0)){
      setStatus('Test sandbox ready','No demo records exist yet. Click Initialize to write fictional records only.');
      init.hidden=false;init.disabled=false;
    }else if(counts.every(c=>c>0)){
      const rows=Object.fromEntries(groups.map((g,i)=>[g,entries[i].docs.map(x=>x.data())]));
      window.BRYCWorkspace.load(rows);
      isActive=true;
      window.BRYCSandbox={active:true,update:async(group,id,changes)=>{
        if(!uid||!groups.includes(group))throw new Error('Sandbox not active');
        const allowed={prospects:['status'],applications:['status'],tasks:['done']};
        if(Object.keys(changes).some(k=>!allowed[group].includes(k)))throw new Error('Unsupported field');
        return updateDoc(doc(db,'ramSandbox',uid,group,id),changes);
      }};
      setStatus('Firestore test sandbox connected','Fictional records loaded from Firestore. Status updates are saved securely; refresh to verify persistence.');
    }else{
      setStatus('Incomplete test dataset','Sandbox contains only some record groups. No modifications will be made automatically.');
    }
  }catch(error){
    if(run!==session)return;
    setStatus('Firestore sandbox access denied','Existing production rules may still block the test collections. Session-only demonstration remains available.');
  }
}
window.addEventListener('bryc:workspace-authorized',authorize);
if(window.BRYCStaffAuth)authorize({detail:window.BRYCStaffAuth});
init.addEventListener('click',async()=>{
  if(!uid||!auth.currentUser||auth.currentUser.uid!==uid)return;
  const captured=uid,run=session;
  init.disabled=true;setStatus('Saving fictional test fixtures…','No real student information is being stored.');
  try{
    // Re-read before writing; never overwrite an existing sandbox.
    const lists=await Promise.all(groups.map(g=>getDocs(path(g))));
    if(lists.some(s=>!s.empty))throw new Error('Sandbox already contains data');
    const data=window.BRYCWorkspace.seeds();const batch=writeBatch(db);
    groups.forEach(g=>data[g].forEach(x=>batch.set(doc(db,'ramSandbox',captured,g,x.id),{...x,isDemo:true})));
    await batch.commit();
    if(run!==session)return;
    init.hidden=true;
    const entries=await Promise.all(groups.map(g=>getDocs(path(g))));
    if(run!==session)return;
    window.BRYCWorkspace.load(Object.fromEntries(groups.map((g,i)=>[g,entries[i].docs.map(x=>x.data())])));
    window.BRYCSandbox={active:true,update:async(g,id,changes)=>updateDoc(doc(db,'ramSandbox',uid,g,id),changes)};
    setStatus('Firestore test sandbox connected','Fictional records saved. Update a status and refresh the page to confirm persistence.');
  }catch(e){if(run!==session)return;init.disabled=false;setStatus('Sandbox initialization blocked','No sample records were created. Check staged security rules before retrying.');}
});
