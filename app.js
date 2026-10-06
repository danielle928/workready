import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm'

const sb = createClient('https://wxyuqqxhlbfzbtpomcco.supabase.co','sb_publishable_ebkEAsh5a2zjPTjnCkL9nQ_f9MtaU8J')
const $ = id => document.getElementById(id)
const state = { user:null, profile:null, partnerMemberships:[], contractorMemberships:[], partners:[], activePartner:null, activeContractor:null, activeJob:null, pendingW9Token:new URL(location.href).searchParams.get('w9_request'), clientPreviewPartner:null, supportActionPartner:null, supportActionSessionId:null, supportThread:null }

function toast(text){$('toast').innerHTML=`<div class="toast">${text}</div>`;setTimeout(()=>{$('toast').innerHTML=''},2800)}
function authMessage(text,type=''){ $('authMessage').innerHTML=`<div class="message ${type}">${text}</div>` }
function showMarketing(){ $('marketing').classList.remove('hidden');$('publicNav').classList.remove('hidden');$('authView').classList.add('hidden');$('appView').classList.add('hidden') }
function showAuth(){ $('marketing').classList.add('hidden');$('publicNav').classList.add('hidden');$('authView').classList.remove('hidden');$('appView').classList.add('hidden');window.scrollTo(0,0) }
function showApp(){
  $('marketing').classList.add('hidden');
  $('publicNav').classList.add('hidden');
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  window.scrollTo(0,0);
}
function showDashboardLoading(text='Loading your WorkReady dashboard…'){
  showApp();
  $('sidebar').innerHTML='';
  $('workspace').innerHTML=`<section class="workspace-card"><h2>${text}</h2><p>Please wait while we load your account and permissions.</p></section>`;
}
function showDashboardError(message){
  showApp();
  $('sidebar').innerHTML='';
  $('workspace').innerHTML=`<section class="workspace-card"><h2>We signed you in, but couldn't finish loading the dashboard.</h2><p>${message}</p><div class="actions"><button class="btn primary" id="retryDashboard">Retry Dashboard</button><button class="btn ghost" id="dashboardSignOut">Sign Out</button></div></section>`;
  $('retryDashboard').onclick=()=>enterApp(true);
  $('dashboardSignOut').onclick=async()=>{if(isSupportActionMode())await exitSupportActionMode(false);await sb.auth.signOut();location.reload()};
}

document.querySelectorAll('[data-action="open-login"]').forEach(b=>b.onclick=showAuth)
document.querySelectorAll('[data-action="home"]').forEach(b=>b.onclick=showMarketing)

async function acceptInvites(){
  const q=new URL(location.href).searchParams
  const contractor=q.get('contractor_invite'), partner=q.get('partner_invite')
  if(contractor){const {error}=await sb.rpc('wr_accept_contractor_invitation',{p_token:contractor});if(error)toast(error.message);else toast('Contractor invitation accepted.')}
  if(partner){const {error}=await sb.rpc('wr_accept_partner_admin_invitation',{p_token:partner});if(error)toast(error.message);else toast('Partner administrator invitation accepted.')}
  if(contractor||partner){
    const keep=new URLSearchParams()
    if(state.pendingW9Token)keep.set('w9_request',state.pendingW9Token)
    history.replaceState({},'',location.pathname+(keep.toString()?'?'+keep.toString():''))
  }
}

async function loadIdentity(){
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError) throw userError;
  state.user=user;
  if(!user)return false;

  await acceptInvites();

  const [profileRes,pmRes,cmRes] = await Promise.all([
    sb.from('wr_profiles').select('*').eq('user_id',user.id).maybeSingle(),
    sb.from('wr_partner_users').select('partner_id,role,wr_partners(id,name,slug,account_type,parent_partner_id,logo_url)').eq('user_id',user.id),
    sb.from('wr_contractor_users').select('contractor_business_id,role,wr_contractor_businesses(id,legal_name)').eq('user_id',user.id)
  ]);

  if(profileRes.error) throw new Error(`Profile access failed: ${profileRes.error.message}`);
  if(pmRes.error) throw new Error(`Partner access failed: ${pmRes.error.message}`);
  if(cmRes.error) throw new Error(`Contractor access failed: ${cmRes.error.message}`);

  state.profile=profileRes.data;
  state.partnerMemberships=pmRes.data||[];
  state.contractorMemberships=cmRes.data||[];

  // A profile should normally exist from the auth trigger. Don't strand a valid session if it doesn't.
  if(!state.profile){
    state.profile={user_id:user.id,full_name:user.user_metadata?.full_name||'',platform_role:'user'};
  }
  return true;
}

async function enterApp(force=false){
  showDashboardLoading();
  try{
    const ok=await loadIdentity();
    if(!ok){showAuth();return}
    await restoreSupportActionMode()
    renderSidebar();
    if(isSupportActionMode()){
      await renderHome()
      return
    }
    if(state.pendingW9Token && role()==='contractor'){
      const opened=await openW9RequestToken(state.pendingW9Token)
      if(opened)return
    }
    history.replaceState({},'',location.pathname+'#dashboard');
    await renderHome();
  }catch(err){
    console.error('WorkReady dashboard load error:',err);
    showDashboardError(err?.message||'Unknown dashboard loading error.');
  }
}

async function signIn(){
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  if(!email||!password)return authMessage('Enter your email and password.','error');

  $('signInBtn').disabled=true;
  $('signInBtn').textContent='Signing In…';
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  $('signInBtn').disabled=false;
  $('signInBtn').textContent='Sign In';

  if(error){
    return authMessage(
      error.message.toLowerCase().includes('invalid login')
        ? 'Email or password not accepted. Use “Forgot password?” if needed.'
        : error.message,
      'error'
    );
  }

  if(!data?.session){
    return authMessage('Authentication succeeded but no session was returned. Please try again.','error');
  }

  // Move to app immediately; role/data loads there.
  showDashboardLoading('Signed in successfully');
  await enterApp();
}

async function signUp(){
  document.querySelectorAll('.signup-only').forEach(x=>x.classList.remove('hidden'))
  const email=$('authEmail').value.trim(),password=$('authPassword').value,name=$('authName').value.trim()
  if(!email||!password||!name)return authMessage('Enter your name, email, and a password with at least 8 characters.','error')
  if(password.length<8)return authMessage('Password must be at least 8 characters.','error')
  const inviteParams=new URL(location.href).searchParams
  const redirectUrl=new URL('https://workready.frantech-solutions.com/')
  for(const key of ['contractor_invite','partner_invite','w9_request']){
    const value=inviteParams.get(key)
    if(value)redirectUrl.searchParams.set(key,value)
  }
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:redirectUrl.toString()}})
  if(error)return authMessage(error.message,'error')
  if(data.session)return enterApp()
  authMessage('Account created. Check your inbox and spam folder if email confirmation is required.','success')
}

async function forgotPassword(){
  const email=$('authEmail').value.trim();if(!email)return authMessage('Enter your email first.','error')
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://workready.frantech-solutions.com/'})
  if(error)return authMessage(error.message,'error')
  authMessage('Password reset email requested. Check your inbox and spam folder.','success')
}
async function savePassword(){
  const a=$('newPassword').value,b=$('confirmPassword').value
  if(a.length<8)return authMessage('New password must be at least 8 characters.','error')
  if(a!==b)return authMessage('Passwords do not match.','error')
  const {error}=await sb.auth.updateUser({password:a});if(error)return authMessage(error.message,'error')
  toast('Password updated');$('recoveryAuth').classList.add('hidden');$('normalAuth').classList.remove('hidden');await enterApp()
}
$('signInBtn').onclick=signIn;$('signUpBtn').onclick=signUp;$('forgotBtn').onclick=forgotPassword;$('savePasswordBtn').onclick=savePassword
$('signOutBtn').onclick=async()=>{if(isSupportActionMode())await exitSupportActionMode(false);await sb.auth.signOut();location.reload()}

function isClientPreview(){return Boolean(state.clientPreviewPartner&&state.profile?.platform_role==='platform_admin')}
function isSupportActionMode(){return Boolean(state.supportActionPartner&&state.supportActionSessionId&&state.profile?.platform_role==='platform_admin')}
function role(){
  if(isClientPreview()||isSupportActionMode())return 'partner'
  if(state.profile?.platform_role==='platform_admin')return 'platform_admin'
  if(state.partnerMemberships.length)return 'partner'
  return 'contractor'
}
function renderAdminModeBanner(){
  const existing=document.getElementById('clientPreviewBanner')
  if(existing)existing.remove()
  document.body.classList.toggle('client-preview-mode',isClientPreview())
  document.body.classList.toggle('support-action-mode',isSupportActionMode())
  if(!isClientPreview()&&!isSupportActionMode())return

  const support=isSupportActionMode()
  const p=support?state.supportActionPartner:state.clientPreviewPartner
  const el=document.createElement('div')
  el.id='clientPreviewBanner'
  el.className=`client-preview-banner ${support?'support-action-banner':''}`
  el.innerHTML=support
    ? `<div><b>SUPPORT ACTION MODE</b><span>You are operating ${escapeHtml(p.name)} on the client's behalf. Changes are enabled and every supported mutation is recorded under your WorkReady admin identity.</span></div><button id="exitAdminMode" class="btn preview-exit">Exit Support Mode</button>`
    : `<div><b>VIEWING AS CLIENT</b><span>You are seeing WorkReady as ${escapeHtml(p.name)} sees it. Preview mode is read-only.</span></div><button id="exitAdminMode" class="btn preview-exit">Exit Client View</button>`
  document.body.appendChild(el)
  document.getElementById('exitAdminMode').onclick=support?exitSupportActionMode:exitClientPreview
}
async function startClientPreview(partnerId){
  if(isSupportActionMode())await exitSupportActionMode(false)
  const {data,error}=await sb.from('wr_partners').select('*').eq('id',partnerId).single()
  if(error)return toast(error.message)
  state.clientPreviewPartner=data
  state.activePartner=data
  renderAdminModeBanner()
  renderSidebar()
  await renderHome()
  applyClientPreviewGuards()
}
async function exitClientPreview(returnToAdmin=true){
  const p=state.clientPreviewPartner
  state.clientPreviewPartner=null
  state.activePartner=p||null
  renderAdminModeBanner()
  renderSidebar()
  if(!returnToAdmin)return
  if(p?.id)await renderAdminAccount(p.id);else await renderAdminCenter()
}
async function startSupportActionMode(partnerId){
  if(state.profile?.platform_role!=='platform_admin')return toast('Platform admin required')
  if(isClientPreview())await exitClientPreview(false)
  const reason=prompt('Why are you entering Support Action Mode for this client? This reason will be attached to the support session audit trail.')
  if(reason===null)return
  if(reason.trim().length<3)return toast('Enter a support reason')
  const {data:partner,error:pe}=await sb.from('wr_partners').select('*').eq('id',partnerId).single()
  if(pe)return toast(pe.message)
  const {data:sessionId,error}=await sb.rpc('wr_platform_start_support_session',{p_partner_id:partnerId,p_reason:reason.trim()})
  if(error)return toast(error.message)
  state.supportActionPartner=partner
  state.supportActionSessionId=sessionId
  state.activePartner=partner
  sessionStorage.setItem('wr_support_session_id',sessionId)
  sessionStorage.setItem('wr_support_partner_id',partnerId)
  sessionStorage.setItem('wr_support_partner_name',partner.name||'Client')
  renderAdminModeBanner()
  renderSidebar()
  await renderHome()
  toast(`Support Action Mode started for ${partner.name}`)
}
async function exitSupportActionMode(returnToAdmin=true){
  const p=state.supportActionPartner
  const id=state.supportActionSessionId
  if(id){
    const {error}=await sb.rpc('wr_platform_end_support_session',{p_session_id:id,p_reason:'Exited Support Action Mode'})
    if(error)toast(error.message)
  }
  state.supportActionPartner=null
  state.supportActionSessionId=null
  sessionStorage.removeItem('wr_support_session_id')
  sessionStorage.removeItem('wr_support_partner_id')
  sessionStorage.removeItem('wr_support_partner_name')
  state.activePartner=p||null
  renderAdminModeBanner()
  renderSidebar()
  if(!returnToAdmin)return
  if(p?.id)await renderAdminAccount(p.id);else await renderAdminCenter()
}
async function restoreSupportActionMode(){
  if(state.profile?.platform_role!=='platform_admin')return
  const id=sessionStorage.getItem('wr_support_session_id')
  const partnerId=sessionStorage.getItem('wr_support_partner_id')
  if(!id||!partnerId)return
  const {data:session}=await sb.from('wr_admin_support_sessions').select('id,partner_id,ended_at').eq('id',id).maybeSingle()
  if(!session||session.ended_at){
    sessionStorage.removeItem('wr_support_session_id');sessionStorage.removeItem('wr_support_partner_id');sessionStorage.removeItem('wr_support_partner_name');return
  }
  const {data:partner}=await sb.from('wr_partners').select('*').eq('id',partnerId).maybeSingle()
  if(!partner)return
  state.supportActionSessionId=id
  state.supportActionPartner=partner
  state.activePartner=partner
}
function applyClientPreviewGuards(){
  if(!isClientPreview())return
  const workspace=document.getElementById('workspace')
  if(!workspace)return
  workspace.querySelectorAll('input,textarea,select').forEach(el=>{el.disabled=true;el.title='Read-only client preview'})
  workspace.querySelectorAll('button').forEach(el=>{
    if(el.classList.contains('dash-link'))return
    el.disabled=true
    el.title='Read-only client preview'
  })
}
function sidebarButton(label,view){return `<button class="side-btn" data-view="${view}">${label}</button>`}
function renderSidebar(){
  renderAdminModeBanner()
  let items=sidebarButton('▦  Dashboard','home')
  if(role()==='platform_admin')items+=sidebarButton('⚙  Admin Center','admin-center')+sidebarButton('◎  Organizations','partners')+sidebarButton('⌖  Locations','locations')+sidebarButton('♙  Contractors','contractors')+sidebarButton('▣  Jobs','jobs')+sidebarButton('☂  Coverage Requests','coverage')+sidebarButton('✉  Support Inbox','support-admin')
  if(role()==='partner')items+=sidebarButton('♙  Contractors','partner-contractors')+sidebarButton('▣  Jobs','jobs')+sidebarButton('☑  Requirements','requirements')
  if(role()==='contractor')items+=sidebarButton('✓  My WorkReady','contractor-home')+sidebarButton('▣  My Jobs','my-jobs')+sidebarButton('▤  Documents','documents')
  items+=sidebarButton('?  Help & Support','support')
  $('sidebar').innerHTML=items+`<div class="sidebar-brand"><img src="./workready-logo.png" alt="WorkReady"><small>GET CLEARED. GET COVERED. GET TO WORK.</small></div>`
  document.querySelectorAll('.side-btn').forEach(b=>b.onclick=()=>navigate(b.dataset.view,b))
  const first=document.querySelector('.side-btn[data-view="home"]'); if(first) first.classList.add('active')
}
async function navigate(view,btn){document.querySelectorAll('.side-btn').forEach(x=>x.classList.remove('active'));if(btn)btn.classList.add('active');const routes={home:renderHome,'admin-center':renderAdminCenter,partners:renderPartners,locations:renderLocations,contractors:renderAllContractors,jobs:renderJobs,'my-jobs':renderMyJobs,coverage:renderCoverage,requirements:renderRequirements,'partner-contractors':renderPartnerContractors,'contractor-home':renderContractorHome,documents:renderDocuments,'support-admin':renderSupportAdmin,support:openSupport};await (routes[view]||renderHome)();applyClientPreviewGuards()}

function card(title,body){return `<section class="workspace-card"><h2>${title}</h2>${body}</section>`}
function stat(label,n){return `<div class="stat"><small>${label}</small><b>${n}</b></div>`}
function escapeHtml(v=''){return String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]))}
function brandHeader(partner,subtitle=''){
  if(!partner)return ''
  return `<div class="partner-brand">${partner.logo_url?`<div class="partner-brand-logo"><img src="${partner.logo_url}" alt="${escapeHtml(partner.name)} logo"></div>`:''}<div><span class="eyebrow blue">${partner.account_type==='location'?'LOCATION':'ORGANIZATION'}</span><h1>${escapeHtml(partner.name)}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div></div>`
}
async function uploadBrandLogo(partnerId,file){
  if(!file)return null
  if(file.size>2097152)throw new Error('Logo must be 2 MB or smaller.')
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Logo must be PNG, JPG, or WEBP.')
  const ext=(file.name.split('.').pop()||'png').toLowerCase()
  const path=`${partnerId}/logo-${crypto.randomUUID()}.${ext}`
  const {error}=await sb.storage.from('workready-branding').upload(path,file,{contentType:file.type})
  if(error)throw error
  return sb.storage.from('workready-branding').getPublicUrl(path).data.publicUrl
}



function dashboardStat(label,value,sub='',tone='blue',icon='•'){
  return `<div class="dash-stat-card"><div class="dash-stat-icon ${tone}">${icon}</div><div><small>${label}</small><b>${value}</b>${sub?`<span>${sub}</span>`:''}</div></div>`
}
function pct(n,total){return total?Math.round((n/total)*100):0}
function partnerScopeIds(partner,locations=[]){
  if(!partner)return []
  return partner.account_type==='master'?[partner.id,...locations.map(x=>x.id)]:[partner.id]
}
async function renderExecutiveDashboard(){
  const isPlatform=role()==='platform_admin'
  let partner=null, locations=[], scopeIds=[]
  if(!isPlatform){
    partner=await choosePartner()
    if(!partner)return $('workspace').innerHTML=card('No Partner Assigned','<p>Your account is signed in but is not assigned to a WorkReady organization or location yet.</p>')
    if(partner.account_type==='master'){
      const lr=await sb.from('wr_partners').select('id,name').eq('parent_partner_id',partner.id).order('name')
      locations=lr.data||[]
    }
    scopeIds=partnerScopeIds(partner,locations)
  }

  let contractorQuery=sb.from('wr_partner_contractors').select('id,status,coverage_choice,workready_score,created_at,partner_id,wr_contractor_businesses(legal_name,email,trade),wr_partners(name)')
  if(!isPlatform) contractorQuery=contractorQuery.in('partner_id',scopeIds)

  let docsQuery=sb.from('wr_documents').select('id,document_type,expiration_date,review_status,created_at,partner_contractor_id,wr_partner_contractors(partner_id,wr_contractor_businesses(legal_name))')
  let activityQuery=sb.from('wr_activity_log').select('id,event_type,details,created_at,partner_id,contractor_business_id').order('created_at',{ascending:false}).limit(8)
  if(!isPlatform) activityQuery=activityQuery.in('partner_id',scopeIds)

  const [contractorsRes,docsRes,activityRes] = await Promise.all([contractorQuery,docsQuery,activityQuery])
  const contractors=contractorsRes.data||[]
  let docs=docsRes.data||[]
  if(!isPlatform) docs=docs.filter(d=>scopeIds.includes(d.wr_partner_contractors?.partner_id))
  const activity=activityRes.data||[]

  const total=contractors.length
  const ready=contractors.filter(x=>x.status==='workready').length
  const pending=contractors.filter(x=>['draft','invited','started','documents_under_review','coverage_assistance'].includes(x.status)).length
  const overdue=contractors.filter(x=>x.status==='action_required').length
  const expiring=docs.filter(d=>{
    if(!d.expiration_date)return false
    const days=(new Date(d.expiration_date)-new Date())/86400000
    return days>=0&&days<=30
  }).sort((a,b)=>new Date(a.expiration_date)-new Date(b.expiration_date)).slice(0,6)

  const title=isPlatform?'WorkReady Platform':partner.name
  const subtitle=isPlatform?'Here’s what’s happening across the WorkReady network.':partner.account_type==='master'
    ?`Corporate view across ${locations.length} location${locations.length===1?'':'s'}.`
    :'Here’s what’s happening with your contractor compliance.'

  const readyPct=pct(ready,total), pendingPct=pct(pending,total), overduePct=pct(overdue,total)

  $('workspace').innerHTML=`
    <div class="dash-topline">
      <div><h1>Welcome back${state.profile?.full_name?', '+escapeHtml(state.profile.full_name.split(' ')[0]):''}!</h1><p>${escapeHtml(subtitle)}</p></div>
      <div class="dash-org-chip"><b>${escapeHtml(title)}</b><small>${isPlatform?'Platform Admin':partner.account_type==='master'?'Corporate Partner':'Location / Subpartner'}</small></div>
    </div>

    <div class="dash-stats">
      ${dashboardStat('Total Contractors',total,isPlatform?'Across all partners':partner.account_type==='master'?'Across all locations':'Assigned to this location','blue','♙')}
      ${dashboardStat('WorkReady',ready,`${readyPct}% of total`,'green','✓')}
      ${dashboardStat('Pending',pending,`${pendingPct}% of total`,'orange','◷')}
      ${dashboardStat('Action Required',overdue,`${overduePct}% of total`,'red','!')}
    </div>

    <div class="dash-grid-two">
      <section class="dash-panel">
        <div class="dash-panel-head"><h2>Compliance Overview</h2><button class="dash-link" data-view="contractors">View contractors →</button></div>
        <div class="compliance-layout">
          <div class="donut" style="--ready:${readyPct};--pending:${pendingPct};--overdue:${overduePct}">
            <div><b>${total}</b><span>Total</span></div>
          </div>
          <div class="legend">
            <p><i class="legend-dot green"></i><span>WorkReady</span><b>${ready} (${readyPct}%)</b></p>
            <p><i class="legend-dot orange"></i><span>Pending</span><b>${pending} (${pendingPct}%)</b></p>
            <p><i class="legend-dot red"></i><span>Action Required</span><b>${overdue} (${overduePct}%)</b></p>
          </div>
        </div>
      </section>

      <section class="dash-panel">
        <div class="dash-panel-head"><h2>Recent Activity</h2></div>
        <div class="activity-list">
          ${activity.length?activity.map(a=>`<div class="activity-item"><span class="activity-badge">✓</span><div><b>${escapeHtml(String(a.event_type||'Activity').replaceAll('_',' '))}</b><small>${new Date(a.created_at).toLocaleString()}</small></div></div>`).join(''):
          `<div class="empty-state"><b>No recent activity yet</b><span>Contractor onboarding, document and compliance activity will appear here.</span></div>`}
        </div>
      </section>
    </div>

    <section class="dash-panel dash-operations-panel">
      <div class="dash-panel-head"><h2>Work Operations</h2><button class="dash-link" data-view="jobs">Open Jobs →</button></div>
      <div class="operations-copy"><div><b>Assign work. Verify completion. Approve payment.</b><span>Jobs connects contractor readiness to the actual work your network needs completed.</span></div><div class="operations-flow"><span>Assigned</span><i>→</i><span>Accepted</span><i>→</i><span>In Progress</span><i>→</i><span>Completed</span><i>→</i><span>Approved</span><i>→</i><span>Ready to Pay</span></div></div>
    </section>

    <section class="dash-panel">
      <div class="dash-panel-head"><h2>Upcoming Expirations</h2><button class="dash-link" data-view="${isPlatform?'contractors':'partner-contractors'}">View all →</button></div>
      ${expiring.length?`<div class="table-wrap light-table"><table><thead><tr><th>Contractor</th><th>Document</th><th>Expires</th><th>Status</th></tr></thead><tbody>${expiring.map(d=>`<tr><td><b>${escapeHtml(d.wr_partner_contractors?.wr_contractor_businesses?.legal_name||'Contractor')}</b></td><td>${escapeHtml(d.document_type)}</td><td>${new Date(d.expiration_date+'T12:00:00').toLocaleDateString()}</td><td><span class="pill warn">Expiring soon</span></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state horizontal"><b>No documents expiring in the next 30 days.</b><span>Upcoming COI, insurance and license expirations will appear here.</span></div>`}
    </section>
  `
  document.querySelectorAll('.dash-link[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view))
}
async function renderHome(){
  const r=role()
  if(r==='platform_admin'||r==='partner'){
    const result=await renderExecutiveDashboard()
    applyClientPreviewGuards()
    return result
  }
  return renderContractorHome()
}


async function renderAdminCenter(){
  if(role()!=='platform_admin')return renderHome()
  const [partnersRes,pcsRes,jobsRes,usersRes,auditRes]=await Promise.all([
    sb.from('wr_partners').select('id,name,account_type,parent_partner_id,status,archived_at,suspended_at,primary_contact_email,created_at').order('created_at',{ascending:false}),
    sb.from('wr_partner_contractors').select('id,status,archived_at,partner_id'),
    sb.from('wr_jobs').select('id,status,payment_status,partner_id'),
    sb.from('wr_partner_users').select('id,disabled_at,partner_id'),
    sb.from('wr_admin_audit_log').select('*').order('created_at',{ascending:false}).limit(20)
  ])
  const partners=partnersRes.data||[], pcs=pcsRes.data||[], jobs=jobsRes.data||[], users=usersRes.data||[], audit=auditRes.data||[]
  const masters=partners.filter(p=>p.account_type==='master')
  const locations=partners.filter(p=>p.account_type==='location')
  const activeAccounts=partners.filter(p=>p.status==='active'&&!p.archived_at).length
  const suspended=partners.filter(p=>p.suspended_at&&!p.archived_at).length
  const archived=partners.filter(p=>p.archived_at).length
  const ready=pcs.filter(p=>p.status==='workready'&&!p.archived_at).length
  const openJobs=jobs.filter(j=>['assigned','accepted','in_progress','completed'].includes(j.status)).length
  const disabledUsers=users.filter(u=>u.disabled_at).length

  $('workspace').innerHTML=`<div class="dash-topline"><div><span class="eyebrow blue">UNIVERSAL ADMIN</span><h1>Platform Admin Center</h1><p>Operate every WorkReady account from one place with controlled overrides, account lifecycle tools, user management, feature controls, and an immutable admin audit trail.</p></div></div>
  <div class="dash-stats compact-stats">
    ${dashboardStat('Organizations',masters.length,`${locations.length} locations`,'blue','◎')}
    ${dashboardStat('Active Accounts',activeAccounts,`${suspended} suspended · ${archived} archived`,'green','✓')}
    ${dashboardStat('WorkReady Contractors',ready,`${pcs.filter(p=>!p.archived_at).length} relationships`,'blue','♙')}
    ${dashboardStat('Open Jobs',openJobs,`${jobs.filter(j=>j.payment_status==='ready').length} ready to pay`,'orange','▣')}
  </div>
  ${card('Global Account Search',`<div class="admin-search-row"><input id="adminSearch" placeholder="Search organization, location, contact email…"><select id="adminFilter"><option value="all">All accounts</option><option value="master">Organizations</option><option value="location">Locations</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></div><div id="adminSearchResults"></div>`)}
  ${card('Common SaaS Operations',`<div class="admin-capability-grid">
    <div><b>Account lifecycle</b><span>Activate, suspend, archive, restore, and permanently delete with confirmation.</span></div>
    <div><b>User administration</b><span>Invite admins, change roles, disable access, restore access, and remove memberships.</span></div>
    <div><b>Compliance overrides</b><span>Approve, waive, or force WorkReady/action-required status with reason and optional expiration.</span></div>
    <div><b>Configuration</b><span>Edit account profile, feature flags, requirements, locations, contractors, jobs, and branding.</span></div>
    <div><b>Safe support access</b><span>Use read-only View as Client or enter audited Support Action Mode to make changes on the client's behalf without impersonating their identity.</span></div>
    <div><b>Auditability</b><span>Every privileged admin action is recorded separately from ordinary user activity.</span></div>
  </div>`)}
  ${card('Recent Privileged Actions',`<div class="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>${audit.length?audit.map(a=>`<tr><td>${fmtDateTime(a.created_at)}</td><td><b>${escapeHtml(a.action.replaceAll('_',' '))}</b></td><td>${escapeHtml(a.entity_name||a.entity_type||'—')}</td><td>${escapeHtml(a.reason||'—')}</td></tr>`).join(''):`<tr><td colspan="4">No privileged actions yet.</td></tr>`}</tbody></table></div>`)}
  ${disabledUsers?`<div class="admin-footnote">${disabledUsers} partner user membership${disabledUsers===1?' is':'s are'} currently disabled.</div>`:''}`

  const renderResults=()=>{
    const term=$('adminSearch').value.trim().toLowerCase(),filter=$('adminFilter').value
    let rows=partners.filter(p=>{
      const hay=[p.name,p.primary_contact_email].filter(Boolean).join(' ').toLowerCase()
      const matchesTerm=!term||hay.includes(term)
      const matchesFilter=filter==='all'||filter===p.account_type||(filter==='suspended'&&p.suspended_at&&!p.archived_at)||(filter==='archived'&&p.archived_at)
      return matchesTerm&&matchesFilter
    }).slice(0,40)
    $('adminSearchResults').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Status</th><th>Contact</th><th></th></tr></thead><tbody>${rows.length?rows.map(p=>`<tr><td><b>${escapeHtml(p.name)}</b></td><td>${p.account_type==='master'?'Organization':'Location'}</td><td>${p.archived_at?'<span class="pill">Archived</span>':p.suspended_at?'<span class="pill warn">Suspended</span>':`<span class="pill ${p.status==='active'?'ready':''}">${escapeHtml(p.status)}</span>`}</td><td>${escapeHtml(p.primary_contact_email||'—')}</td><td><div class="actions"><button class="btn primary admin-open-account" data-id="${p.id}">Manage</button><button class="btn secondary admin-preview-account" data-id="${p.id}">View as Client</button><button class="btn support-action-btn admin-support-account" data-id="${p.id}">Support Mode</button></div></td></tr>`).join(''):`<tr><td colspan="5">No matching accounts.</td></tr>`}</tbody></table></div>`
    document.querySelectorAll('.admin-open-account').forEach(b=>b.onclick=()=>renderAdminAccount(b.dataset.id))
    document.querySelectorAll('.admin-preview-account').forEach(b=>b.onclick=()=>startClientPreview(b.dataset.id))
    document.querySelectorAll('.admin-support-account').forEach(b=>b.onclick=()=>startSupportActionMode(b.dataset.id))
  }
  $('adminSearch').oninput=renderResults;$('adminFilter').onchange=renderResults;renderResults()
}

async function renderAdminAccount(partnerId){
  if(role()!=='platform_admin')return renderHome()
  const [{data:partner,error},usersRes,invitesRes,pcsRes,setsRes,flagsRes,overridesRes,auditRes]=await Promise.all([
    sb.from('wr_partners').select('*').eq('id',partnerId).single(),
    sb.rpc('wr_platform_list_partner_users',{p_partner_id:partnerId}),
    sb.from('wr_partner_admin_invites').select('*').eq('partner_id',partnerId).is('accepted_at',null).order('created_at',{ascending:false}),
    sb.from('wr_partner_contractors').select('id,status,coverage_choice,workready_score,archived_at,requirement_set_id,wr_contractor_businesses(id,legal_name,email,trade)').eq('partner_id',partnerId).order('created_at',{ascending:false}),
    sb.from('wr_requirement_sets').select('id,name,is_active,version,is_corporate_baseline,corporate_locked').eq('partner_id',partnerId).order('created_at',{ascending:false}),
    sb.from('wr_partner_feature_flags').select('*').eq('partner_id',partnerId),
    sb.from('wr_admin_overrides').select('*').in('partner_contractor_id',(await sb.from('wr_partner_contractors').select('id').eq('partner_id',partnerId)).data?.map(x=>x.id)||['00000000-0000-0000-0000-000000000000']).eq('is_active',true).order('created_at',{ascending:false}),
    sb.from('wr_admin_audit_log').select('*').eq('partner_id',partnerId).order('created_at',{ascending:false}).limit(25)
  ])
  if(error)return $('workspace').innerHTML=card('Unable to load account',`<p>${escapeHtml(error.message)}</p>`)
  state.activePartner=partner
  const users=usersRes.data||[],invites=invitesRes.data||[],pcs=pcsRes.data||[],sets=setsRes.data||[],flags=flagsRes.data||[],overrides=overridesRes.data||[],audit=auditRes.data||[]
  const isArchived=Boolean(partner.archived_at),isSuspended=Boolean(partner.suspended_at)
  const featureDefaults=['jobs','w9_requests','agreements','coverage_assistance','payments_preview','support_chat']
  const featureMap=Object.fromEntries(flags.map(f=>[f.flag_key,f]))
  const statusLabel=isArchived?'Archived':isSuspended?'Suspended':partner.status==='active'?'Active':'Inactive'

  $('workspace').innerHTML=`<div class="admin-account-header"><button id="backAdminCenter" class="btn ghost">← Admin Center</button><div><span class="eyebrow blue">UNIVERSAL ADMIN · ${partner.account_type==='master'?'ORGANIZATION':'LOCATION'}</span><h1>${escapeHtml(partner.name)}</h1><p>${escapeHtml(partner.primary_contact_email||'No primary contact email')} · <span class="pill ${statusLabel==='Active'?'ready':statusLabel==='Suspended'?'warn':''}">${statusLabel}</span></p></div><div class="actions"><button id="adminViewAsClient" class="btn primary">View as Client</button><button id="adminSupportActionMode" class="btn support-action-btn">Support Action Mode</button><button id="adminOpenContractors" class="btn secondary">Contractors</button><button id="adminOpenRequirements" class="btn secondary">Requirements</button>${partner.account_type==='master'?'<button id="adminOpenLocations" class="btn secondary">Locations</button>':''}</div></div>
  <div class="dash-stats compact-stats">
    ${dashboardStat('Users',users.length,`${users.filter(u=>u.disabled_at).length} disabled`,'blue','♙')}
    ${dashboardStat('Contractors',pcs.filter(p=>!p.archived_at).length,`${pcs.filter(p=>p.status==='workready'&&!p.archived_at).length} WorkReady`,'green','✓')}
    ${dashboardStat('Requirement Sets',sets.length,`${sets.filter(s=>s.is_active).length} active`,'blue','☑')}
    ${dashboardStat('Active Overrides',overrides.length,'Privileged exceptions','orange','!')}
  </div>

  ${card('Account Profile & Branding',`<div class="form-grid">
    <div><label>Account name</label><input id="aaName" value="${escapeHtml(partner.name||'')}"></div>
    <div><label>Primary contact</label><input id="aaContact" value="${escapeHtml(partner.primary_contact_name||'')}"></div>
    <div><label>Contact email</label><input id="aaEmail" type="email" value="${escapeHtml(partner.primary_contact_email||'')}"></div>
    <div><label>Contact phone</label><input id="aaPhone" value="${escapeHtml(partner.primary_contact_phone||'')}"></div>
    ${partner.account_type==='location'?`<div><label>Location code</label><input id="aaCode" value="${escapeHtml(partner.location_code||'')}"></div>`:'<input id="aaCode" type="hidden" value="">'}
    <div><label>Address</label><input id="aaAddress" value="${escapeHtml(partner.address_line1||'')}"></div>
    <div><label>Address line 2</label><input id="aaAddress2" value="${escapeHtml(partner.address_line2||'')}"></div>
    <div><label>City</label><input id="aaCity" value="${escapeHtml(partner.city||'')}"></div>
    <div><label>State</label><input id="aaState" maxlength="2" value="${escapeHtml(partner.state||'')}"></div>
    <div><label>ZIP</label><input id="aaZip" value="${escapeHtml(partner.postal_code||'')}"></div>
    <div><label>Logo</label><input id="aaLogo" type="file" accept="image/png,image/jpeg,image/webp"><small>${partner.logo_url?'Current logo is active. Upload to replace.':'No logo uploaded.'}</small></div>
  </div><div class="actions"><button id="saveAdminAccount" class="btn primary">Save Account</button></div>`)}

  ${card('Users & Access',`<div class="admin-inline-form"><input id="aaInviteEmail" type="email" placeholder="new.admin@company.com"><select id="aaInviteRole"><option value="admin">Admin</option><option value="corporate_admin">Corporate Admin</option><option value="location_admin">Location Admin</option><option value="member">Member</option><option value="owner">Owner</option></select><button id="aaInviteBtn" class="btn primary">Invite User</button></div>
  <div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>${users.length?users.map(u=>`<tr><td><b>${escapeHtml(u.full_name||u.email||'User')}</b><br><small>${escapeHtml(u.email||u.user_id)}</small></td><td><select class="aa-user-role" data-id="${u.partner_user_id}">${['owner','admin','corporate_admin','location_admin','member'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${r.replaceAll('_',' ')}</option>`).join('')}</select></td><td>${u.disabled_at?'<span class="pill warn">Disabled</span>':'<span class="pill ready">Enabled</span>'}</td><td><div class="actions"><button class="btn light aa-toggle-user" data-id="${u.partner_user_id}" data-enabled="${u.disabled_at?'true':'false'}">${u.disabled_at?'Restore':'Disable'}</button><button class="btn danger aa-remove-user" data-id="${u.partner_user_id}">Remove</button></div></td></tr>`).join(''):`<tr><td colspan="4">No users assigned to this account.</td></tr>`}</tbody></table></div>
  ${invites.length?`<h3>Pending Invitations</h3><div class="table-wrap"><table><tbody>${invites.map(i=>`<tr><td>${escapeHtml(i.email)}</td><td>${escapeHtml(i.role.replaceAll('_',' '))}</td><td>Expires ${new Date(i.expires_at).toLocaleDateString()}</td><td><button class="btn light aa-revoke-invite" data-id="${i.id}">Revoke</button></td></tr>`).join('')}</tbody></table></div>`:''}`)}

  ${card('Feature Controls',`<p>Enable or disable account-level product modules without changing code. These flags are ready for rollout control and enterprise packaging.</p><div class="feature-flag-grid">${featureDefaults.map(key=>{const f=featureMap[key];const enabled=f?f.enabled:true;return `<label class="feature-flag-card"><input class="aa-flag" type="checkbox" data-key="${key}" ${enabled?'checked':''}><span><b>${key.replaceAll('_',' ')}</b><small>${f?'Account override':'Default enabled'}</small></span></label>`}).join('')}</div><div class="actions"><button id="saveFlags" class="btn secondary">Save Feature Controls</button></div>`)}

  ${card('Contractor Administration & Overrides',`<div class="table-wrap"><table><thead><tr><th>Contractor</th><th>Status</th><th>Score</th><th>Override</th><th></th></tr></thead><tbody>${pcs.length?pcs.map(pc=>`<tr><td><b>${escapeHtml(pc.wr_contractor_businesses?.legal_name||'Contractor')}</b><br><small>${escapeHtml(pc.wr_contractor_businesses?.email||pc.wr_contractor_businesses?.trade||'')}</small></td><td>${pc.archived_at?'<span class="pill">Archived</span>':`<span class="pill ${pc.status==='workready'?'ready':pc.status==='action_required'?'warn':''}">${escapeHtml(pc.status.replaceAll('_',' '))}</span>`}</td><td>${pc.workready_score??'—'}</td><td><button class="btn light aa-override-contractor" data-id="${pc.id}">Override</button></td><td><button class="btn ${pc.archived_at?'secondary':'danger'} aa-archive-contractor" data-id="${pc.id}" data-archive="${pc.archived_at?'false':'true'}">${pc.archived_at?'Restore':'Archive'}</button></td></tr>`).join(''):`<tr><td colspan="5">No contractors assigned.</td></tr>`}</tbody></table></div>
  ${overrides.length?`<h3>Active Overrides</h3><div class="table-wrap"><table><thead><tr><th>Decision</th><th>Reason</th><th>Expires</th><th></th></tr></thead><tbody>${overrides.map(o=>`<tr><td>${escapeHtml(o.decision.replaceAll('_',' '))}</td><td>${escapeHtml(o.reason)}</td><td>${o.expires_at?new Date(o.expires_at).toLocaleString():'No expiration'}</td><td><button class="btn light aa-revoke-override" data-id="${o.id}">Revoke</button></td></tr>`).join('')}</tbody></table></div>`:''}`)}

  ${card('Account Lifecycle',`<div class="lifecycle-actions">
    <button id="aaActivate" class="btn secondary">Activate / Restore</button>
    <button id="aaSuspend" class="btn warn-btn">Suspend Access</button>
    <button id="aaArchive" class="btn danger">Archive Account</button>
  </div><p class="muted">Suspension is reversible and intended for billing, security, or contractual holds. Archiving removes the account from normal active operations while preserving records.</p>
  <div class="danger-zone"><h3>Danger Zone</h3><p>Permanent deletion is intentionally protected. The account must be archived first, then you must type the exact account name and provide a reason. This can cascade through related WorkReady records.</p><input id="aaDeleteConfirm" placeholder="Type ${escapeHtml(partner.name)}"><input id="aaDeleteReason" placeholder="Reason for permanent deletion"><button id="aaDeletePermanent" class="btn danger">Permanently Delete Account</button></div>`)}

  ${card('Privileged Audit Trail',`<div class="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>${audit.length?audit.map(a=>`<tr><td>${fmtDateTime(a.created_at)}</td><td><b>${escapeHtml(a.action.replaceAll('_',' '))}</b></td><td>${escapeHtml(a.entity_name||a.entity_type||'—')}</td><td>${escapeHtml(a.reason||'—')}</td></tr>`).join(''):`<tr><td colspan="4">No privileged activity for this account yet.</td></tr>`}</tbody></table></div>`)}
  `

  $('backAdminCenter').onclick=renderAdminCenter
  $('adminViewAsClient').onclick=()=>startClientPreview(partner.id)
  $('adminSupportActionMode').onclick=()=>startSupportActionMode(partner.id)
  $('adminOpenContractors').onclick=()=>renderPartnerContractors()
  $('adminOpenRequirements').onclick=()=>renderRequirements()
  if($('adminOpenLocations'))$('adminOpenLocations').onclick=()=>renderLocations()

  $('saveAdminAccount').onclick=async()=>{
    const {error}=await sb.rpc('wr_platform_update_partner',{
      p_partner_id:partner.id,p_name:$('aaName').value.trim(),p_primary_contact_name:$('aaContact').value.trim(),
      p_primary_contact_email:$('aaEmail').value.trim(),p_primary_contact_phone:$('aaPhone').value.trim(),
      p_location_code:$('aaCode').value.trim(),p_address_line1:$('aaAddress').value.trim(),p_address_line2:$('aaAddress2').value.trim(),
      p_city:$('aaCity').value.trim(),p_state:$('aaState').value.trim(),p_postal_code:$('aaZip').value.trim()
    })
    if(error)return toast(error.message)
    const file=$('aaLogo').files[0]
    if(file){
      try{const logo_url=await uploadBrandLogo(partner.id,file);const r=await sb.from('wr_partners').update({logo_url}).eq('id',partner.id);if(r.error)throw r.error}
      catch(e){return toast(`Account saved; logo failed: ${e.message}`)}
    }
    toast('Account updated');renderAdminAccount(partner.id)
  }

  $('aaInviteBtn').onclick=async()=>{
    const email=$('aaInviteEmail').value.trim();if(!email)return toast('Enter an email address')
    const {error}=await sb.rpc('wr_platform_invite_partner_admin',{p_partner_id:partner.id,p_email:email,p_role:$('aaInviteRole').value})
    if(error)return toast(error.message);toast('Administrator invitation queued');renderAdminAccount(partner.id)
  }

  document.querySelectorAll('.aa-user-role').forEach(s=>s.onchange=async()=>{
    const {error}=await sb.rpc('wr_platform_set_partner_user_role',{p_partner_user_id:s.dataset.id,p_role:s.value})
    if(error)return toast(error.message);toast('Role updated')
  })
  document.querySelectorAll('.aa-toggle-user').forEach(b=>b.onclick=async()=>{
    const enabling=b.dataset.enabled==='true'
    const reason=prompt(`${enabling?'Restore':'Disable'} this user's access — reason (optional):`)||''
    const {error}=await sb.rpc('wr_platform_set_partner_user_enabled',{p_partner_user_id:b.dataset.id,p_enabled:enabling,p_reason:reason||null})
    if(error)return toast(error.message);toast(enabling?'Access restored':'Access disabled');renderAdminAccount(partner.id)
  })
  document.querySelectorAll('.aa-remove-user').forEach(b=>b.onclick=async()=>{
    const reason=prompt('Reason for removing this account membership:');if(reason===null)return
    if(!confirm('Remove this user from the account? Their WorkReady user identity is not deleted.'))return
    const {error}=await sb.rpc('wr_platform_remove_partner_user',{p_partner_user_id:b.dataset.id,p_reason:reason||null})
    if(error)return toast(error.message);toast('Membership removed');renderAdminAccount(partner.id)
  })
  document.querySelectorAll('.aa-revoke-invite').forEach(b=>b.onclick=async()=>{
    if(!confirm('Revoke this pending invitation?'))return
    const {error}=await sb.rpc('wr_platform_revoke_partner_admin_invite',{p_invite_id:b.dataset.id,p_reason:'Revoked by platform admin'})
    if(error)return toast(error.message);toast('Invitation revoked');renderAdminAccount(partner.id)
  })

  $('saveFlags').onclick=async()=>{
    for(const el of document.querySelectorAll('.aa-flag')){
      const {error}=await sb.from('wr_partner_feature_flags').upsert({partner_id:partner.id,flag_key:el.dataset.key,enabled:el.checked,updated_by:state.user.id,updated_at:new Date().toISOString()},{onConflict:'partner_id,flag_key'})
      if(error)return toast(error.message)
    }
    toast('Feature controls saved')
  }

  document.querySelectorAll('.aa-override-contractor').forEach(b=>b.onclick=()=>renderAdminOverrideForm(partner,b.dataset.id))
  document.querySelectorAll('.aa-archive-contractor').forEach(b=>b.onclick=async()=>{
    const archive=b.dataset.archive==='true'
    const reason=prompt(`${archive?'Archive':'Restore'} this contractor relationship — reason:`);if(reason===null)return
    const {error}=await sb.rpc('wr_platform_archive_contractor',{p_partner_contractor_id:b.dataset.id,p_archive:archive,p_reason:reason||null})
    if(error)return toast(error.message);toast(archive?'Contractor archived':'Contractor restored');renderAdminAccount(partner.id)
  })
  document.querySelectorAll('.aa-revoke-override').forEach(b=>b.onclick=async()=>{
    const reason=prompt('Reason for revoking this override:');if(!reason)return
    const {error}=await sb.rpc('wr_platform_revoke_override',{p_override_id:b.dataset.id,p_reason:reason})
    if(error)return toast(error.message);toast('Override revoked');renderAdminAccount(partner.id)
  })

  const setState=async(next)=>{
    const reason=next==='active'?'Restored by platform admin':prompt(`Reason for ${next}:`)
    if(next!=='active'&&reason===null)return
    const {error}=await sb.rpc('wr_platform_set_partner_state',{p_partner_id:partner.id,p_state:next,p_reason:reason||null})
    if(error)return toast(error.message);toast(`Account ${next}`);renderAdminAccount(partner.id)
  }
  $('aaActivate').onclick=()=>setState('active')
  $('aaSuspend').onclick=()=>setState('suspended')
  $('aaArchive').onclick=()=>setState('archived')
  $('aaDeletePermanent').onclick=async()=>{
    const confirmation=$('aaDeleteConfirm').value,reason=$('aaDeleteReason').value.trim()
    if(confirmation!==partner.name)return toast('Confirmation must exactly match the account name')
    if(!reason)return toast('A deletion reason is required')
    if(!confirm('PERMANENTLY delete this account and related WorkReady records? This cannot be undone.'))return
    const {error}=await sb.rpc('wr_platform_delete_partner',{p_partner_id:partner.id,p_confirmation:confirmation,p_reason:reason})
    if(error)return toast(error.message);toast('Account permanently deleted');state.activePartner=null;renderAdminCenter()
  }
}

async function renderAdminOverrideForm(partner,pcId){
  const {data:pc,error}=await sb.from('wr_partner_contractors').select('id,status,requirement_set_id,wr_contractor_businesses(legal_name,email)').eq('id',pcId).single()
  if(error)return toast(error.message)
  const {data:reqs}=pc.requirement_set_id?await sb.from('wr_requirements').select('id,label,category').eq('requirement_set_id',pc.requirement_set_id).order('sort_order'):({data:[]})
  $('workspace').innerHTML=`${brandHeader(partner,'Universal Admin Override')}
  ${card(`Override — ${escapeHtml(pc.wr_contractor_businesses?.legal_name||'Contractor')}`,`<div class="secure-note"><b>Privileged action:</b> Overrides should be exceptional, documented, time-bound when possible, and reviewable in the admin audit trail.</div><div class="form-grid">
    <div><label>Decision</label><select id="ovDecision"><option value="approved">Approve compliance</option><option value="waived">Waive requirement</option><option value="rejected">Reject compliance</option><option value="workready">Force WorkReady status</option><option value="action_required">Force Action Required status</option></select></div>
    <div><label>Specific requirement (optional)</label><select id="ovRequirement"><option value="">Entire contractor / no specific requirement</option>${(reqs||[]).map(r=>`<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}</select></div>
    <div><label>Expiration (recommended)</label><input id="ovExpires" type="datetime-local"></div>
    <div class="full-span"><label>Business reason</label><textarea id="ovReason" rows="5" placeholder="Document why this exception is appropriate, who approved it, and any follow-up required."></textarea></div>
  </div><div class="actions"><button id="saveOverride" class="btn danger">Create Admin Override</button><button id="cancelOverride" class="btn ghost">Cancel</button></div>`)}`
  $('cancelOverride').onclick=()=>renderAdminAccount(partner.id)
  $('saveOverride').onclick=async()=>{
    const reason=$('ovReason').value.trim();if(!reason)return toast('Override reason is required')
    if(!confirm('Create this privileged compliance override?'))return
    const {error}=await sb.rpc('wr_platform_override_contractor',{
      p_partner_contractor_id:pcId,p_decision:$('ovDecision').value,p_reason:reason,
      p_requirement_id:$('ovRequirement').value||null,p_expires_at:$('ovExpires').value?new Date($('ovExpires').value).toISOString():null
    })
    if(error)return toast(error.message);toast('Admin override created');renderAdminAccount(partner.id)
  }
}

async function renderPartners(){
  const {data:partners,error}=await sb.from('wr_partners').select('*').eq('account_type','master').order('created_at',{ascending:false})
  if(error)return $('workspace').innerHTML=card('Unable to load organizations',`<p>${escapeHtml(error.message)}</p>`)
  $('workspace').innerHTML=`<h1>Organizations</h1><p>Create each corporate partner, franchise system, or contractor network once. Add individual branches underneath it as locations.</p>
  ${card('Add Organization',`<div class="form-grid">
    <div><label>Organization name</label><input id="pName" placeholder="City Wide Facility Solutions"></div>
    <div><label>Program slug</label><input id="pSlug" placeholder="city-wide"></div>
    <div><label>Primary contact</label><input id="pContact"></div>
    <div><label>Contact email</label><input id="pEmail" type="email"></div>
    <div><label>Contact phone</label><input id="pPhone"></div>
    <div><label>Organization logo</label><input id="pLogo" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG or WEBP · max 2 MB</small></div>
  </div><div class="actions"><button id="savePartner" class="btn primary">Create Organization</button></div>`)}
  ${card('Organization Directory',`<div class="table-wrap"><table><thead><tr><th>Brand</th><th>Organization</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody>${(partners||[]).map(p=>`<tr><td>${p.logo_url?`<img class="table-logo" src="${p.logo_url}" alt="">`:'—'}</td><td><b>${escapeHtml(p.name)}</b></td><td>${escapeHtml(p.primary_contact_email||'—')}</td><td><span class="pill ready">${escapeHtml(p.status)}</span></td><td><div class="actions"><button class="btn primary admin-partner" data-id="${p.id}">Manage Account</button><button class="btn secondary preview-partner" data-id="${p.id}">View as Client</button><button class="btn support-action-btn support-partner" data-id="${p.id}">Support Mode</button><button class="btn secondary manage-partner" data-id="${p.id}">Requirements</button><button class="btn light locations-partner" data-id="${p.id}">Locations</button></div></td></tr>`).join('')}</tbody></table></div>`)}`

  $('savePartner').onclick=async()=>{
    const name=$('pName').value.trim()
    if(!name)return toast('Enter an organization name')
    const slug=($('pSlug').value.trim()||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))
    const {data,error}=await sb.from('wr_partners').insert({
      name,slug,account_type:'master',parent_partner_id:null,
      primary_contact_name:$('pContact').value.trim(),
      primary_contact_email:$('pEmail').value.trim(),
      primary_contact_phone:$('pPhone').value.trim(),
      created_by:state.user.id
    }).select().single()
    if(error)return toast(error.message)
    let org=data
    try{
      const file=$('pLogo').files[0]
      if(file){
        const logo_url=await uploadBrandLogo(data.id,file)
        const upd=await sb.from('wr_partners').update({logo_url}).eq('id',data.id).select().single()
        if(upd.error)throw upd.error
        org=upd.data
      }
    }catch(e){toast(`Organization created; logo upload failed: ${e.message}`)}
    state.activePartner=org
    toast('Organization created')
    await renderLocations()
  }
  document.querySelectorAll('.admin-partner').forEach(b=>b.onclick=async()=>{state.activePartner=(partners||[]).find(p=>p.id===b.dataset.id);await renderAdminAccount(b.dataset.id)})
  document.querySelectorAll('.preview-partner').forEach(b=>b.onclick=()=>startClientPreview(b.dataset.id))
  document.querySelectorAll('.support-partner').forEach(b=>b.onclick=()=>startSupportActionMode(b.dataset.id))
  document.querySelectorAll('.manage-partner').forEach(b=>b.onclick=async()=>{state.activePartner=(partners||[]).find(p=>p.id===b.dataset.id);await renderRequirements()})
  document.querySelectorAll('.locations-partner').forEach(b=>b.onclick=async()=>{state.activePartner=(partners||[]).find(p=>p.id===b.dataset.id);await renderLocations()})
}

async function renderLocations(){
  let master=state.activePartner
  if(master?.account_type==='location'&&master.parent_partner_id){
    master=(await sb.from('wr_partners').select('*').eq('id',master.parent_partner_id).single()).data
  }
  if(!master||master.account_type!=='master'){
    master=(await sb.from('wr_partners').select('*').eq('account_type','master').order('name').limit(1).maybeSingle()).data
  }
  if(!master)return $('workspace').innerHTML=card('Create an Organization First','<p>Locations must belong to a master organization.</p>')
  state.activePartner=master
  const {data:locations,error}=await sb.from('wr_partners').select('*').eq('parent_partner_id',master.id).eq('account_type','location').order('name')
  if(error)return $('workspace').innerHTML=card('Unable to load locations',`<p>${escapeHtml(error.message)}</p>`)

  $('workspace').innerHTML=`${brandHeader(master,'Corporate / master account')}
  ${card('Add Location / Subaccount',`<div class="form-grid">
    <div><label>Location name</label><input id="lName" placeholder="City Wide — Columbia"></div>
    <div><label>Location code</label><input id="lCode" placeholder="COL-SC"></div>
    <div><label>Address</label><input id="lAddress"></div>
    <div><label>City</label><input id="lCity"></div>
    <div><label>State</label><input id="lState" maxlength="2"></div>
    <div><label>ZIP</label><input id="lZip"></div>
    <div><label>Location logo (optional)</label><input id="lLogo" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG or WEBP · max 2 MB</small></div>
    <div class="check-card"><label><input id="lInherit" type="checkbox" checked> Inherit corporate requirements</label><small>Recommended. Corporate-locked requirements remain mandatory.</small></div>
  </div><div class="actions"><button id="saveLocation" class="btn primary">Create Location</button></div>`)}
  ${card('Locations',`<div class="table-wrap"><table><thead><tr><th>Brand</th><th>Location</th><th>Code</th><th>Market</th><th>Requirements</th><th></th></tr></thead><tbody>${(locations||[]).map(l=>`<tr><td>${l.logo_url?`<img class="table-logo" src="${l.logo_url}" alt="">`:(master.logo_url?`<img class="table-logo faded" src="${master.logo_url}" alt="">`:'—')}</td><td><b>${escapeHtml(l.name)}</b></td><td>${escapeHtml(l.location_code||'—')}</td><td>${escapeHtml([l.city,l.state].filter(Boolean).join(', ')||'—')}</td><td>${l.inherit_parent_requirements?'Inherited + local':'Local only'}</td><td><div class="actions"><button class="btn primary admin-location" data-id="${l.id}">Manage Account</button><button class="btn secondary preview-location" data-id="${l.id}">View as Client</button><button class="btn support-action-btn support-location" data-id="${l.id}">Support Mode</button><button class="btn secondary config-location" data-id="${l.id}">Configure</button><button class="btn light contractors-location" data-id="${l.id}">Contractors</button></div></td></tr>`).join('')}</tbody></table></div>`)}`

  $('saveLocation').onclick=async()=>{
    const name=$('lName').value.trim()
    if(!name)return toast('Enter a location name')
    const slug=`${master.slug}-${($('lCode').value.trim()||name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${Math.random().toString(36).slice(2,6)}`
    const {data,error}=await sb.rpc('wr_create_partner_location',{
      p_parent_partner_id:master.id,
      p_name:name,
      p_slug:slug,
      p_location_code:$('lCode').value.trim()||null,
      p_primary_contact_name:null,
      p_primary_contact_email:null,
      p_primary_contact_phone:null,
      p_address_line1:$('lAddress').value.trim()||null,
      p_address_line2:null,
      p_city:$('lCity').value.trim()||null,
      p_state:$('lState').value.trim().toUpperCase()||null,
      p_postal_code:$('lZip').value.trim()||null,
      p_inherit_parent_requirements:$('lInherit').checked
    })
    if(error)return toast(error.message)
    const location=data
    try{
      const file=$('lLogo').files[0]
      if(file){
        const logo_url=await uploadBrandLogo(location.id,file)
        const upd=await sb.from('wr_partners').update({logo_url}).eq('id',location.id)
        if(upd.error)throw upd.error
      }
    }catch(e){toast(`Location created; logo upload failed: ${e.message}`)}
    state.activePartner=master
    toast('Location created')
    await renderLocations()
  }
  document.querySelectorAll('.admin-location').forEach(b=>b.onclick=async()=>{state.activePartner=(locations||[]).find(l=>l.id===b.dataset.id);await renderAdminAccount(b.dataset.id)})
  document.querySelectorAll('.preview-location').forEach(b=>b.onclick=()=>startClientPreview(b.dataset.id))
  document.querySelectorAll('.support-location').forEach(b=>b.onclick=()=>startSupportActionMode(b.dataset.id))
  document.querySelectorAll('.config-location').forEach(b=>b.onclick=async()=>{state.activePartner=(locations||[]).find(l=>l.id===b.dataset.id);await renderRequirements()})
  document.querySelectorAll('.contractors-location').forEach(b=>b.onclick=async()=>{state.activePartner=(locations||[]).find(l=>l.id===b.dataset.id);await renderPartnerContractors()})
}

async function choosePartner(){
  if(isSupportActionMode())return state.supportActionPartner
  if(isClientPreview())return state.clientPreviewPartner
  if(state.activePartner)return state.activePartner
  if(role()==='partner')return state.partnerMemberships[0]?.wr_partners
  const {data}=await sb.from('wr_partners').select('*').order('name').limit(1).maybeSingle();state.activePartner=data;return data
}

async function renderRequirements(){
  const partner=await choosePartner();if(!partner)return $('workspace').innerHTML=card('No Partner Selected','<p>Create or select a partner first.</p>')
  const {data:sets}=await sb.from('wr_requirement_sets').select('*').eq('partner_id',partner.id).order('created_at',{ascending:false})
  $('workspace').innerHTML=`${brandHeader(partner,'Contractor Program Setup')}
  ${card('1. Program Basics',`<div class="form-grid"><div><label>Requirement set name</label><input id="setName" value="Standard Contractor Requirements"></div><div><label>Source requirements file</label><input id="sourceFile" type="file"></div></div>`)}
  ${card('2. Insurance & Compliance Requirements',`<div class="check-grid">
    <div class="check-card"><label><input id="reqW9" type="checkbox" checked> W-9 required</label></div>
    <div class="check-card"><label><input id="reqGL" type="checkbox" checked> General Liability</label><input id="glLimit" type="number" value="1000000"><input id="glAgg" type="number" value="2000000"></div>
    <div class="check-card"><label><input id="reqWC" type="checkbox" checked> Workers' Compensation</label><input id="wcLimit" type="number" value="500000"></div>
    <div class="check-card"><label><input id="reqAuto" type="checkbox"> Commercial Auto</label><input id="autoLimit" type="number" value="1000000"></div>
    <div class="check-card"><label><input id="reqUmb" type="checkbox"> Umbrella / Excess</label><input id="umbLimit" type="number" value="1000000"></div>
    <div class="check-card"><label><input id="reqAI" type="checkbox"> Additional Insured</label><label><input id="reqWOS" type="checkbox"> Waiver of Subrogation</label><label><input id="reqPNC" type="checkbox"> Primary & Noncontributory</label></div>
    <div class="check-card"><label><input id="reqLicense" type="checkbox"> Business / contractor license</label></div>
    <div class="check-card"><label><input id="reqOther" type="checkbox"> Other requirement</label><input id="otherLabel" placeholder="Safety certification"></div>
  </div><label>Notes shown to contractors</label><textarea id="reqNotes"></textarea>`)}
  ${card('3. Independent Contractor Agreement',`<div class="check-card"><label><input id="reqICA" type="checkbox"> Require electronic signature on an Independent Contractor Agreement</label></div><label>Agreement title</label><input id="icaTitle" value="Independent Contractor Agreement"><label>Agreement text</label><textarea id="icaBody" rows="14" placeholder="Paste the partner-approved Independent Contractor Agreement here. WorkReady will preserve the exact text/version the contractor signs."></textarea><small>Use partner-approved legal language. WorkReady stores the exact agreement snapshot, version, signer, consent, timestamp, and user agent.</small>`)}
  ${card('4. Contractor Invitation',`<label>Email subject</label><input id="inviteSubject" value="${partner.contractor_invite_subject||"You're invited to complete your WorkReady contractor profile"}"><label>Message</label><textarea id="inviteBody">${partner.contractor_invite_message||`Hi {{contractor_name}},

{{partner_name}} has invited you to complete contractor onboarding through WorkReady.

In your secure portal you can complete or upload your W-9, provide insurance and business documents, and sign any required contractor agreement.

Already have coverage? Upload your current insurance documents and we'll compare them against the requirements.

Don't have coverage or aren't sure? WorkReady can help you get set up based on the requirements for the work you're being assigned.

Get Cleared. Get Covered. Get to Work.`}</textarea><div class="actions"><button id="saveProgram" class="btn primary">Save Contractor Program</button></div>`)}
  ${card('Existing Requirement Sets' ,`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Version</th><th>Active</th></tr></thead><tbody>${(sets||[]).map(s=>`<tr><td>${s.name}</td><td>${s.version}</td><td>${s.is_active?'Yes':'No'}</td></tr>`).join('')}</tbody></table></div>`)}`

  $('saveProgram').onclick=async()=>{
    let path=null,file=$('sourceFile').files[0]
    if(file){path=`partners/${partner.id}/requirements/${crypto.randomUUID()}-${file.name}`;const up=await sb.storage.from('workready-documents').upload(path,file);if(up.error)return toast(up.error.message)}
    const {data:set,error}=await sb.from('wr_requirement_sets').insert({partner_id:partner.id,name:$('setName').value.trim()||'Standard Contractor Requirements',source_document_path:path,created_by:state.user.id,is_corporate_baseline:partner.account_type==='master'}).select().single()
    if(error)return toast(error.message)
    const n=$('reqNotes').value.trim(),rows=[]
    const baseReq={required:true,additional_insured_required:false,waiver_subrogation_required:false,primary_noncontributory_required:false,corporate_locked:false,notes:n}
    if($('reqW9').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'w9',label:'Completed W-9'})
    if($('reqGL').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'general_liability',label:'General Liability',minimum_limit:$('glLimit').value||null,aggregate_limit:$('glAgg').value||null,additional_insured_required:Boolean($('reqAI').checked),waiver_subrogation_required:Boolean($('reqWOS').checked),primary_noncontributory_required:Boolean($('reqPNC').checked)})
    if($('reqWC').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'workers_comp',label:"Workers' Compensation",minimum_limit:$('wcLimit').value||null,waiver_subrogation_required:Boolean($('reqWOS').checked)})
    if($('reqAuto').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'commercial_auto',label:'Commercial Auto',minimum_limit:$('autoLimit').value||null})
    if($('reqUmb').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'umbrella',label:'Umbrella / Excess',minimum_limit:$('umbLimit').value||null})
    if($('reqLicense').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'business_license',label:'Business / Contractor License'})
    if($('reqOther').checked&&$('otherLabel').value.trim())rows.push({...baseReq,requirement_set_id:set.id,category:'other',label:$('otherLabel').value.trim()})
    if($('reqICA').checked)rows.push({...baseReq,requirement_set_id:set.id,category:'independent_contractor_agreement',label:$('icaTitle').value.trim()||'Independent Contractor Agreement'})
    if(rows.length){const rr=await sb.from('wr_requirements').insert(rows);if(rr.error)return toast(rr.error.message)}
    if($('reqICA').checked){
      const body=$('icaBody').value.trim();if(!body)return toast('Paste the approved Independent Contractor Agreement text before saving.')
      const {data:prior}=await sb.from('wr_agreement_templates').select('version').eq('partner_id',partner.id).order('version',{ascending:false}).limit(1)
      const version=(prior?.[0]?.version||0)+1
      const deact=await sb.from('wr_agreement_templates').update({is_active:false}).eq('partner_id',partner.id).eq('is_active',true);if(deact.error)return toast(deact.error.message)
      const ar=await sb.from('wr_agreement_templates').insert({partner_id:partner.id,title:$('icaTitle').value.trim()||'Independent Contractor Agreement',agreement_body:body,version,is_active:true,created_by:state.user.id})
      if(ar.error)return toast(ar.error.message)
    }
    await sb.from('wr_partners').update({contractor_invite_subject:$('inviteSubject').value.trim(),contractor_invite_message:$('inviteBody').value}).eq('id',partner.id)
    toast('Contractor program saved');await renderRequirements()
  }
}

async function renderPartnerContractors(){
  const partner=await choosePartner();if(!partner)return $('workspace').innerHTML=card('No Partner','<p>No partner assigned.</p>')
  const [{data:sets},{data:rows}] = await Promise.all([
    sb.from('wr_requirement_sets').select('*').eq('partner_id',partner.id).eq('is_active',true).order('created_at',{ascending:false}),
    sb.from('wr_partner_contractors').select('id,status,coverage_choice,workready_score,created_at,wr_contractor_businesses(id,legal_name,dba_name,contact_name,email,trade,state,city)').eq('partner_id',partner.id).order('created_at',{ascending:false})
  ])
  const pcIds=(rows||[]).map(x=>x.id)
  let forms=[],requests=[],docs=[]
  if(pcIds.length){
    const [fRes,rRes,dRes]=await Promise.all([
      sb.from('wr_w9_forms').select('partner_contractor_id,status,tin_type,tin_last4,signed_name,signed_at').in('partner_contractor_id',pcIds),
      sb.from('wr_w9_requests').select('id,partner_contractor_id,status,requested_at,completed_at').in('partner_contractor_id',pcIds).order('requested_at',{ascending:false}),
      sb.from('wr_documents').select('partner_contractor_id,document_type,created_at').in('partner_contractor_id',pcIds)
    ])
    forms=fRes.data||[];requests=rRes.data||[];docs=dRes.data||[]
  }
  const w9Meta=(pcId)=>{
    const form=forms.find(f=>f.partner_contractor_id===pcId&&['submitted','verified'].includes(f.status))
    const upload=docs.find(d=>d.partner_contractor_id===pcId&&String(d.document_type).toLowerCase().replace('-','')==='w9')
    const request=requests.find(r=>r.partner_contractor_id===pcId&&r.status==='requested')
    if(form)return {label:'Complete',cls:'ready',detail:`${form.tin_type?.toUpperCase()||'TIN'} ending ${form.tin_last4||'••••'}`}
    if(upload)return {label:'Uploaded',cls:'ready',detail:'Existing W-9 received'}
    if(request)return {label:'Requested',cls:'warn',detail:`Sent ${new Date(request.requested_at).toLocaleDateString()}`}
    return {label:'Not requested',cls:'',detail:'W-9 needed'}
  }

  $('workspace').innerHTML=`${brandHeader(partner,'Contractors')}<p>Add contractors, send secure onboarding invitations, and request W-9s without collecting taxpayer IDs by email.</p>
  ${card('Add Contractor',`<div class="form-grid"><div><label>Business name</label><input id="cBusiness"></div><div><label>Contact name</label><input id="cContact"></div><div><label>Email</label><input id="cEmail" type="email"></div><div><label>Trade</label><input id="cTrade"></div><div><label>State</label><input id="cState"></div><div><label>Requirement set</label><select id="cSet">${(sets||[]).map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div></div><div class="actions"><button id="inviteContractor" class="btn primary">Create Contractor Invitation</button></div><div id="inviteResult"></div>`)}
  ${card('Contractor Roster',`<div class="table-wrap"><table><thead><tr><th>Contractor</th><th>Trade</th><th>Readiness</th><th>W-9</th><th>Coverage</th><th></th></tr></thead><tbody>${(rows||[]).length?(rows||[]).map(x=>{const m=w9Meta(x.id);return `<tr><td><b>${escapeHtml(x.wr_contractor_businesses?.legal_name||'')}</b><br><small>${escapeHtml(x.wr_contractor_businesses?.email||'')}</small></td><td>${escapeHtml(x.wr_contractor_businesses?.trade||'—')}</td><td><span class="pill ${x.status==='workready'?'ready':'warn'}">${escapeHtml(x.status.replaceAll('_',' '))}</span></td><td><span class="pill ${m.cls}">${m.label}</span><br><small>${escapeHtml(m.detail)}</small></td><td>${escapeHtml(x.coverage_choice||'—')}</td><td><button class="btn light request-w9" data-id="${x.id}">${m.label==='Complete'||m.label==='Uploaded'?'Request Updated W-9':'Request W-9'}</button></td></tr>`}).join(''):`<tr><td colspan="6">No contractors yet.</td></tr>`}</tbody></table></div>`)}`

  document.querySelectorAll('.request-w9').forEach(b=>b.onclick=()=>renderRequestW9(b.dataset.id,partner))

  $('inviteContractor').onclick=async()=>{
    const email=$('cEmail').value.trim(),legal_name=$('cBusiness').value.trim();if(!email||!legal_name)return toast('Business name and email are required')
    const {data:c,error:ce}=await sb.from('wr_contractor_businesses').insert({legal_name,contact_name:$('cContact').value.trim(),email,trade:$('cTrade').value.trim(),state:$('cState').value.trim(),created_by:state.user.id}).select().single()
    if(ce)return toast(ce.message)
    const {data:pc,error:pe}=await sb.from('wr_partner_contractors').insert({partner_id:partner.id,contractor_business_id:c.id,requirement_set_id:$('cSet').value||null,status:'invited',invited_at:new Date().toISOString(),created_by:state.user.id}).select().single()
    if(pe)return toast(pe.message)
    const {data:inv,error:ie}=await sb.from('wr_invitations').insert({partner_contractor_id:pc.id,email,invited_by:state.user.id}).select('token').single()
    if(ie)return toast(ie.message)
    const link=`https://workready.frantech-solutions.com/?contractor_invite=${inv.token}`
    const body=(partner.contractor_invite_message||'').replaceAll('{{contractor_name}}',$('cContact').value.trim()||legal_name).replaceAll('{{partner_name}}',partner.name)
    $('inviteResult').innerHTML=`<div class="message success"><b>Invitation created</b><br><br>A branded email has been queued using ${escapeHtml(partner.name)}'s branding and logo. You can also copy the secure invitation manually below.<br><br><b>Secure invite:</b><br><code>${link}</code><div class="actions"><button class="btn secondary" id="copyInvite">Copy Invitation</button></div></div>`
    $('copyInvite').onclick=()=>navigator.clipboard.writeText(`${partner.contractor_invite_subject||'WorkReady Invitation'}

${body}

Get Started: ${link}`).then(()=>toast('Invitation copied'))
  }
}

async function renderRequestW9(pcId,partner){
  const {data:pc,error}=await sb.from('wr_partner_contractors').select('id,partner_id,contractor_business_id,wr_contractor_businesses(legal_name,dba_name,contact_name,email,city,state)').eq('id',pcId).single()
  if(error)return toast(error.message)
  const c=pc.wr_contractor_businesses||{}
  $('workspace').innerHTML=`${brandHeader(partner,'Request W-9')}
  ${card('Prepare W-9 Request',`<div class="w9-request-banner"><b>${escapeHtml(c.legal_name||'Contractor')}</b><span>${escapeHtml(c.email||'No email on file')}</span></div><p>Pre-fill only the basic business information you already know. The contractor will review it, enter their own SSN/EIN, certify the information, and electronically sign inside WorkReady.</p>
  <div class="form-grid">
    <div><label>Legal name</label><input id="rqLegal" value="${escapeHtml(c.legal_name||'')}"></div>
    <div><label>Business / DBA</label><input id="rqBusiness" value="${escapeHtml(c.dba_name||'')}"></div>
    <div><label>Address</label><input id="rqAddress" placeholder="Business mailing address"></div>
    <div><label>Address line 2</label><input id="rqAddress2" placeholder="Suite, unit, etc."></div>
    <div><label>City</label><input id="rqCity" value="${escapeHtml(c.city||'')}"></div>
    <div><label>State</label><input id="rqState" value="${escapeHtml(c.state||'')}"></div>
    <div><label>ZIP</label><input id="rqZip"></div>
  </div>
  <div class="secure-note"><b>Security:</b> Do not ask the contractor for their SSN/EIN here. WorkReady sends them to the authenticated W-9 form where the TIN is encrypted and only the last four digits are displayed afterward.</div>
  <div class="actions"><button id="sendW9Request" class="btn primary">Send W-9 Request</button><button id="cancelW9Request" class="btn ghost">Back to Contractors</button></div>`)}`
  $('cancelW9Request').onclick=renderPartnerContractors
  $('sendW9Request').onclick=async()=>{
    if(!c.email)return toast('Add an email address for this contractor before requesting a W-9')
    const btn=$('sendW9Request');btn.disabled=true;btn.textContent='Sending…'
    const {data,error}=await sb.rpc('wr_request_w9',{
      p_partner_contractor_id:pc.id,
      p_legal_name:$('rqLegal').value.trim()||null,
      p_business_name:$('rqBusiness').value.trim()||null,
      p_address_line1:$('rqAddress').value.trim()||null,
      p_address_line2:$('rqAddress2').value.trim()||null,
      p_city:$('rqCity').value.trim()||null,
      p_state:$('rqState').value.trim()||null,
      p_postal_code:$('rqZip').value.trim()||null
    })
    btn.disabled=false;btn.textContent='Send W-9 Request'
    if(error)return toast(error.message)
    toast('W-9 request sent securely')
    await renderPartnerContractors()
  }
}


function money(v){return v===null||v===undefined||v===''?'—':Number(v).toLocaleString(undefined,{style:'currency',currency:'USD'})}
function fmtDateTime(v){return v?new Date(v).toLocaleString():'—'}
function jobStatusClass(status){return ['approved'].includes(status)?'ready':['completed','assigned','accepted','in_progress'].includes(status)?'warn':''}
async function jobPartnerOptions(){
  if(role()==='platform_admin'){
    const {data}=await sb.from('wr_partners').select('id,name,account_type,parent_partner_id').eq('status','active').order('name')
    return data||[]
  }
  const partner=await choosePartner()
  if(!partner)return []
  if(partner.account_type==='master'){
    const {data}=await sb.from('wr_partners').select('id,name,account_type,parent_partner_id').or(`id.eq.${partner.id},parent_partner_id.eq.${partner.id}`).eq('status','active').order('name')
    return data||[partner]
  }
  return [partner]
}
async function loadJobContractors(partnerId,selectId='jobContractor'){
  const sel=$(selectId);if(!sel)return
  sel.innerHTML='<option value="">Loading contractors…</option>'
  const {data,error}=await sb.from('wr_partner_contractors').select('id,status,wr_contractor_businesses(legal_name,trade,email)').eq('partner_id',partnerId).not('status','eq','inactive').order('created_at',{ascending:false})
  if(error){sel.innerHTML='<option value="">Unable to load contractors</option>';return}
  sel.innerHTML='<option value="">Select contractor</option>'+((data||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.wr_contractor_businesses?.legal_name||'Contractor')} ${x.wr_contractor_businesses?.trade?'— '+escapeHtml(x.wr_contractor_businesses.trade):''}</option>`).join(''))
}
async function renderJobs(){
  const partners=await jobPartnerOptions()
  const allowedIds=partners.map(p=>p.id)
  let q=sb.from('wr_jobs').select('id,partner_id,partner_contractor_id,title,job_type,scheduled_start,due_at,agreed_amount,status,payment_status,created_at,wr_partners(name),wr_partner_contractors(contractor_business_id,wr_contractor_businesses(legal_name,trade,email))').order('created_at',{ascending:false})
  if(role()!=='platform_admin'&&allowedIds.length)q=q.in('partner_id',allowedIds)
  const {data:jobs,error}=await q
  if(error)return $('workspace').innerHTML=card('Unable to load jobs',`<p>${escapeHtml(error.message)}</p>`)
  const rows=jobs||[]
  const active=rows.filter(j=>['assigned','accepted','in_progress'].includes(j.status)).length
  const review=rows.filter(j=>j.status==='completed').length
  const readyPay=rows.filter(j=>j.payment_status==='ready').length
  const approved=rows.filter(j=>j.status==='approved').length
  const partnerOpts=partners.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}${p.account_type==='location'?' · Location':''}</option>`).join('')
  $('workspace').innerHTML=`<div class="dash-topline"><div><h1>Jobs</h1><p>Assign work, communicate with contractors, verify completion, and move approved work toward payment.</p></div></div>
  <div class="dash-stats compact-stats">
    ${dashboardStat('Active Jobs',active,'Assigned or in progress','blue','▣')}
    ${dashboardStat('Needs Review',review,'Submitted by contractors','orange','✓')}
    ${dashboardStat('Approved',approved,'Completed and approved','green','✓')}
    ${dashboardStat('Ready to Pay',readyPay,'Payment integration next','green','$')}
  </div>
  ${card('Create Job / Work Order',`<div class="form-grid">
    <div><label>Company / location</label><select id="jobPartner">${partnerOpts}</select></div>
    <div><label>Contractor</label><select id="jobContractor"><option value="">Select company first</option></select></div>
    <div><label>Job title</label><input id="jobTitle" placeholder="HVAC service call — Unit 304"></div>
    <div><label>Job type</label><select id="jobType"><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></div>
    <div><label>Scheduled start</label><input id="jobStart" type="datetime-local"></div>
    <div><label>Due date / time</label><input id="jobDue" type="datetime-local"></div>
    <div><label>Agreed amount</label><input id="jobAmount" type="number" step="0.01" min="0" placeholder="175.00"></div>
    <div><label>Service address</label><input id="jobAddress" placeholder="123 Main St, Columbia, SC"></div>
    <div class="full-span recurring-field"><label>Recurring schedule</label><input id="jobRecurrence" placeholder="Example: Weekly every Monday"></div>
    <div class="full-span"><label>Scope / instructions</label><textarea id="jobDescription" rows="5" placeholder="Describe exactly what needs to be completed, access instructions, materials, standards, and anything the contractor needs to know."></textarea></div>
    <div class="full-span"><label>Completion checklist</label><textarea id="jobChecklist" rows="5" placeholder="One required item per line&#10;Inspect unit&#10;Complete repair&#10;Upload after photo&#10;Clean work area"></textarea><small>Each line becomes a required completion item the contractor must check off before submitting the job.</small></div>
  </div><div class="actions"><button id="createJob" class="btn primary">Assign Job</button></div>`)}
  ${card('Job Pipeline',`<div class="table-wrap"><table><thead><tr><th>Job</th><th>Contractor</th><th>Company / Location</th><th>Due</th><th>Amount</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>${rows.length?rows.map(j=>`<tr><td><b>${escapeHtml(j.title)}</b><br><small>${escapeHtml(j.job_type.replace('_',' '))}</small></td><td>${escapeHtml(j.wr_partner_contractors?.wr_contractor_businesses?.legal_name||'Unassigned')}</td><td>${escapeHtml(j.wr_partners?.name||'')}</td><td>${j.due_at?new Date(j.due_at).toLocaleDateString():'—'}</td><td>${money(j.agreed_amount)}</td><td><span class="pill ${jobStatusClass(j.status)}">${escapeHtml(j.status.replaceAll('_',' '))}</span></td><td>${j.payment_status==='ready'?'<span class="pill ready">Ready to pay</span>':escapeHtml(j.payment_status.replaceAll('_',' '))}</td><td><button class="btn light view-job" data-id="${j.id}">Open</button></td></tr>`).join(''):`<tr><td colspan="8">No jobs yet. Create your first work order above.</td></tr>`}</tbody></table></div>`)}`

  const jp=$('jobPartner')
  if(jp?.value)await loadJobContractors(jp.value)
  if(jp)jp.onchange=()=>loadJobContractors(jp.value)
  document.querySelectorAll('.view-job').forEach(b=>b.onclick=()=>renderJobDetail(b.dataset.id))
  $('createJob').onclick=async()=>{
    const partner_id=$('jobPartner').value,partner_contractor_id=$('jobContractor').value,title=$('jobTitle').value.trim()
    if(!partner_id||!partner_contractor_id||!title)return toast('Company/location, contractor, and job title are required')
    const payload={
      partner_id,partner_contractor_id,title,
      description:$('jobDescription').value.trim()||null,
      job_type:$('jobType').value,
      recurrence_rule:$('jobType').value==='recurring'?($('jobRecurrence').value.trim()||null):null,
      service_address:$('jobAddress').value.trim()||null,
      scheduled_start:$('jobStart').value?new Date($('jobStart').value).toISOString():null,
      due_at:$('jobDue').value?new Date($('jobDue').value).toISOString():null,
      agreed_amount:$('jobAmount').value||null,
      status:'assigned',
      created_by:state.user.id
    }
    const {data:job,error}=await sb.from('wr_jobs').insert(payload).select().single()
    if(error)return toast(error.message)
    const checklist=$('jobChecklist').value.split('\n').map(x=>x.trim()).filter(Boolean)
    if(checklist.length){
      const {error:ce}=await sb.from('wr_job_completion_items').insert(checklist.map((label,i)=>({job_id:job.id,label,is_required:true,sort_order:i})))
      if(ce)return toast(`Job created, but checklist failed: ${ce.message}`)
    }
    toast('Job assigned')
    await renderJobDetail(job.id)
  }
}
async function renderMyJobs(){
  const businessIds=state.contractorMemberships.map(x=>x.contractor_business_id)
  if(!businessIds.length)return $('workspace').innerHTML=card('No Contractor Profile','<p>No contractor business is linked to this account.</p>')
  const {data:pcs}=await sb.from('wr_partner_contractors').select('id').in('contractor_business_id',businessIds)
  const pcIds=(pcs||[]).map(x=>x.id)
  if(!pcIds.length)return $('workspace').innerHTML=card('My Jobs','<p>No partner programs are linked to your account yet.</p>')
  const {data:jobs,error}=await sb.from('wr_jobs').select('id,title,job_type,service_address,scheduled_start,due_at,agreed_amount,status,payment_status,wr_partners(name)').in('partner_contractor_id',pcIds).order('created_at',{ascending:false})
  if(error)return $('workspace').innerHTML=card('Unable to load jobs',`<p>${escapeHtml(error.message)}</p>`)
  $('workspace').innerHTML=`<div class="dash-topline"><div><h1>My Jobs</h1><p>Accept assigned work, communicate, document completion, and track approval.</p></div></div>
  <div class="job-card-grid">${(jobs||[]).length?(jobs||[]).map(j=>`<button class="job-summary-card contractor-job" data-id="${j.id}"><div class="job-summary-top"><span class="pill ${jobStatusClass(j.status)}">${escapeHtml(j.status.replaceAll('_',' '))}</span><b>${money(j.agreed_amount)}</b></div><h3>${escapeHtml(j.title)}</h3><p>${escapeHtml(j.wr_partners?.name||'')}</p><small>${j.due_at?'Due '+new Date(j.due_at).toLocaleString():'No due date set'}</small>${j.payment_status==='ready'?'<div class="ready-pay-banner">Approved · Ready for payment</div>':''}</button>`).join(''):`<div class="empty-state"><b>No jobs assigned yet.</b><span>New work from participating companies will appear here.</span></div>`}</div>`
  document.querySelectorAll('.contractor-job').forEach(b=>b.onclick=()=>renderJobDetail(b.dataset.id))
}
async function renderJobDetail(jobId){
  const {data:job,error}=await sb.from('wr_jobs').select('*,wr_partners(id,name,logo_url,account_type),wr_partner_contractors(id,contractor_business_id,status,wr_contractor_businesses(legal_name,email,trade))').eq('id',jobId).single()
  if(error)return $('workspace').innerHTML=card('Unable to load job',`<p>${escapeHtml(error.message)}</p>`)
  state.activeJob=job
  const [{data:items},{data:messages},{data:attachments}]=await Promise.all([
    sb.from('wr_job_completion_items').select('*').eq('job_id',job.id).order('sort_order'),
    sb.from('wr_job_messages').select('*').eq('job_id',job.id).order('created_at'),
    sb.from('wr_job_attachments').select('*').eq('job_id',job.id).order('created_at')
  ])
  const isContractor=role()==='contractor'
  const requiredMissing=(items||[]).filter(x=>x.is_required&&!x.is_completed).length
  const canWork=isContractor&&['assigned','accepted','in_progress','completed','rejected'].includes(job.status)
  $('workspace').innerHTML=`<div class="job-detail-head"><button class="btn ghost" id="backJobs">← Back</button><div><span class="pill ${jobStatusClass(job.status)}">${escapeHtml(job.status.replaceAll('_',' '))}</span><h1>${escapeHtml(job.title)}</h1><p>${escapeHtml(job.wr_partners?.name||'')} · ${escapeHtml(job.wr_partner_contractors?.wr_contractor_businesses?.legal_name||'')}</p></div><div class="job-amount"><small>Agreed Amount</small><b>${money(job.agreed_amount)}</b></div></div>
  <div class="job-detail-grid">
    <section class="dash-panel">
      <div class="dash-panel-head"><h2>Work Order</h2></div>
      <div class="job-meta-grid"><div><small>Type</small><b>${escapeHtml(job.job_type.replace('_',' '))}</b></div><div><small>Scheduled</small><b>${fmtDateTime(job.scheduled_start)}</b></div><div><small>Due</small><b>${fmtDateTime(job.due_at)}</b></div><div><small>Service Address</small><b>${escapeHtml(job.service_address||'—')}</b></div>${job.job_type==='recurring'?`<div class="full-span"><small>Recurring Schedule</small><b>${escapeHtml(job.recurrence_rule||'Recurring')}</b></div>`:''}</div>
      <h3>Scope & Instructions</h3><div class="scope-copy">${escapeHtml(job.description||'No additional instructions provided.').replaceAll('\n','<br>')}</div>
      ${isContractor?`<div class="actions job-action-row">${job.status==='assigned'?'<button id="acceptJob" class="btn primary">Accept Job</button>':''}${job.status==='accepted'?'<button id="startJob" class="btn primary">Start Job</button>':''}${job.status==='rejected'?'<button id="startJob" class="btn primary">Resume Work</button>':''}</div>`:''}
    </section>
    <section class="dash-panel">
      <div class="dash-panel-head"><h2>Completion Checklist</h2><span>${(items||[]).filter(x=>x.is_completed).length}/${(items||[]).length} complete</span></div>
      <div class="job-checklist">${(items||[]).length?(items||[]).map(i=>`<label class="job-check-item ${i.is_completed?'done':''}"><input type="checkbox" class="job-check" data-id="${i.id}" ${i.is_completed?'checked':''} ${!isContractor?'disabled':''}><span>${escapeHtml(i.label)}${i.is_required?' <small>Required</small>':''}</span></label>`).join(''):'<p>No completion checklist was added for this job.</p>'}</div>
      ${isContractor&&['accepted','in_progress','rejected'].includes(job.status)?`<label>Completion notes</label><textarea id="completionNotes" rows="4" placeholder="What was completed? Note materials, issues, follow-up, or anything the company should know.">${escapeHtml(job.completion_notes||'')}</textarea><div class="actions"><button id="submitCompletion" class="btn primary" ${requiredMissing?'disabled':''}>Submit Job as Complete</button></div>${requiredMissing?`<small>Complete ${requiredMissing} required checklist item${requiredMissing===1?'':'s'} before submitting.</small>`:''}`:''}
      ${job.completion_notes?`<div class="completion-note"><b>Contractor completion notes</b><p>${escapeHtml(job.completion_notes)}</p></div>`:''}
      ${!isContractor&&job.status==='completed'?`<label>Review notes</label><textarea id="reviewNotes" rows="3" placeholder="Optional approval or revision notes"></textarea><div class="actions"><button id="approveJob" class="btn primary">Approve · Ready to Pay</button><button id="rejectJob" class="btn secondary">Send Back for Revision</button></div>`:''}
      ${job.status==='approved'?`<div class="payment-ready-card"><b>✓ Approved for Payment</b><span>This job is marked Ready to Pay. The payment-provider integration will use this approved record as the payment trigger.</span></div>`:''}
      ${job.status==='rejected'&&job.approval_notes?`<div class="message error"><b>Revision requested</b><br>${escapeHtml(job.approval_notes)}</div>`:''}
    </section>
  </div>
  <div class="job-detail-grid">
    <section class="dash-panel">
      <div class="dash-panel-head"><h2>Proof of Completion</h2></div>
      ${isContractor?`<div class="form-grid"><div><label>Proof type</label><select id="proofType"><option value="before_photo">Before photo</option><option value="after_photo">After photo</option><option value="completion_document">Completion document</option><option value="general">Other attachment</option></select></div><div><label>Upload</label><input id="proofFile" type="file" accept="image/*,application/pdf"></div></div><button id="uploadProof" class="btn secondary">Upload Proof</button>`:''}
      <div class="proof-list">${(attachments||[]).length?(attachments||[]).map(a=>`<div class="proof-row"><span>${escapeHtml(a.attachment_type.replaceAll('_',' '))}</span><b>${escapeHtml(a.file_name||'Attachment')}</b><small>${new Date(a.created_at).toLocaleString()}</small></div>`).join(''):'<p>No proof uploaded yet.</p>'}</div>
    </section>
    <section class="dash-panel">
      <div class="dash-panel-head"><h2>Job Communication</h2></div>
      <div class="job-thread">${(messages||[]).length?(messages||[]).map(m=>`<div class="job-message ${m.sender_user_id===state.user.id?'mine':''}"><p>${escapeHtml(m.message)}</p><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join(''):'<p>No messages yet. Use this thread for job-specific communication.</p>'}</div>
      <div class="job-message-compose"><textarea id="jobMessage" rows="3" placeholder="Send a message about this job…"></textarea><button id="sendJobMessage" class="btn secondary">Send Message</button></div>
    </section>
  </div>`
  $('backJobs').onclick=()=>isContractor?renderMyJobs():renderJobs()
  if($('acceptJob'))$('acceptJob').onclick=async()=>{const {error}=await sb.rpc('wr_accept_job',{p_job_id:job.id});if(error)return toast(error.message);toast('Job accepted');renderJobDetail(job.id)}
  if($('startJob'))$('startJob').onclick=async()=>{const {error}=await sb.rpc('wr_start_job',{p_job_id:job.id});if(error)return toast(error.message);toast(job.status==='rejected'?'Job resumed':'Job started');renderJobDetail(job.id)}
  document.querySelectorAll('.job-check').forEach(cb=>cb.onchange=async()=>{const {error}=await sb.rpc('wr_set_job_item_completed',{p_item_id:cb.dataset.id,p_completed:cb.checked});if(error){toast(error.message);cb.checked=!cb.checked}else renderJobDetail(job.id)})
  if($('submitCompletion'))$('submitCompletion').onclick=async()=>{const {error}=await sb.rpc('wr_submit_job_completion',{p_job_id:job.id,p_notes:$('completionNotes').value.trim()||null});if(error)return toast(error.message);toast('Job submitted for approval');renderJobDetail(job.id)}
  if($('approveJob'))$('approveJob').onclick=async()=>{const {error}=await sb.rpc('wr_review_job',{p_job_id:job.id,p_approve:true,p_notes:$('reviewNotes').value.trim()||null});if(error)return toast(error.message);toast('Job approved and marked ready to pay');renderJobDetail(job.id)}
  if($('rejectJob'))$('rejectJob').onclick=async()=>{const {error}=await sb.rpc('wr_review_job',{p_job_id:job.id,p_approve:false,p_notes:$('reviewNotes').value.trim()||'Please review and resubmit.'});if(error)return toast(error.message);toast('Job returned for revision');renderJobDetail(job.id)}
  if($('sendJobMessage'))$('sendJobMessage').onclick=async()=>{const message=$('jobMessage').value.trim();if(!message)return;const {error}=await sb.from('wr_job_messages').insert({job_id:job.id,sender_user_id:state.user.id,message});if(error)return toast(error.message);$('jobMessage').value='';renderJobDetail(job.id)}
  if($('uploadProof'))$('uploadProof').onclick=async()=>{
    const f=$('proofFile').files[0];if(!f)return toast('Choose a photo or document')
    const contractorBusinessId=job.wr_partner_contractors?.contractor_business_id
    if(!contractorBusinessId)return toast('Contractor business not found for this job')
    const path=`contractors/${contractorBusinessId}/jobs/${job.id}/${crypto.randomUUID()}-${f.name}`
    const up=await sb.storage.from('workready-documents').upload(path,f,{contentType:f.type});if(up.error)return toast(up.error.message)
    const {error}=await sb.from('wr_job_attachments').insert({job_id:job.id,attachment_type:$('proofType').value,storage_path:path,file_name:f.name,uploaded_by:state.user.id})
    if(error)return toast(error.message)
    toast('Proof uploaded');renderJobDetail(job.id)
  }
}

async function renderAllContractors(){
  const {data}=await sb.from('wr_partner_contractors').select('status,coverage_choice,workready_score,wr_partners(name),wr_contractor_businesses(legal_name,email,trade)').order('created_at',{ascending:false})
  $('workspace').innerHTML=`<h1>All Contractors</h1>${card('Network',`<div class="table-wrap"><table><thead><tr><th>Contractor</th><th>Partner</th><th>Status</th><th>Coverage</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${x.wr_contractor_businesses?.legal_name||''}<br><small>${x.wr_contractor_businesses?.email||''}</small></td><td>${x.wr_partners?.name||''}</td><td>${x.status}</td><td>${x.coverage_choice||'—'}</td></tr>`).join('')}</tbody></table></div>`)}`}

async function renderCoverage(){
  const {data}=await sb.from('wr_coverage_requests').select('*,wr_partner_contractors(wr_partners(name),wr_contractor_businesses(legal_name,email))').order('created_at',{ascending:false})
  $('workspace').innerHTML=`<h1>Coverage Requests</h1>${card('Insurance Opportunity Queue',`<div class="table-wrap"><table><thead><tr><th>Contractor</th><th>Partner</th><th>Status</th><th>Created</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${x.wr_partner_contractors?.wr_contractor_businesses?.legal_name||''}</td><td>${x.wr_partner_contractors?.wr_partners?.name||''}</td><td>${x.status}</td><td>${new Date(x.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>`)}`}

async function getActiveAgreementForPartner(partner){
  let {data}=await sb.from('wr_agreement_templates').select('*').eq('partner_id',partner.id).eq('is_active',true).order('version',{ascending:false}).limit(1)
  if(data?.length)return data[0]
  if(partner.parent_partner_id){
    const parent=(await sb.from('wr_agreement_templates').select('*').eq('partner_id',partner.parent_partner_id).eq('is_active',true).order('version',{ascending:false}).limit(1)).data
    if(parent?.length)return parent[0]
  }
  return null
}


async function openW9RequestToken(token){
  const {data:req,error}=await sb.from('wr_w9_requests').select('id,token,status,legal_name,business_name,address_line1,address_line2,city,state,postal_code,requested_at,partner_contractor_id,wr_partner_contractors(id,status,coverage_choice,workready_score,contractor_business_id,requirement_set_id,wr_partners(id,name,parent_partner_id,logo_url,account_type),wr_contractor_businesses(legal_name,dba_name,email,contact_name))').eq('token',token).maybeSingle()
  if(error){toast(error.message);return false}
  if(!req)return false
  const pc=req.wr_partner_contractors
  state.activeContractor=pc
  if(req.status==='completed'){
    $('workspace').innerHTML=`${brandHeader(pc.wr_partners,'W-9 Request')}${card('W-9 Complete',`<div class="completion-celebration"><span>✓</span><div><h3>Your W-9 has already been received.</h3><p>No additional action is required for this request.</p></div></div><div class="actions"><button id="goContractorHome" class="btn primary">Go to My WorkReady</button></div>`)}`
    $('goContractorHome').onclick=()=>{state.pendingW9Token=null;history.replaceState({},'',location.pathname+'#dashboard');renderContractorHome()}
    return true
  }
  const {data:existing}=await sb.from('wr_w9_forms').select('legal_name,business_name,tax_classification,other_classification,address_line1,address_line2,city,state,postal_code,tin_type,tin_last4,signed_name,status').eq('partner_contractor_id',pc.id).maybeSingle()
  const {data:docs}=await sb.from('wr_documents').select('id,document_type').eq('partner_contractor_id',pc.id)
  const uploaded=(docs||[]).some(d=>String(d.document_type).toLowerCase().replace('-','')==='w9')
  $('workspace').innerHTML=`${brandHeader(pc.wr_partners,'W-9 Request')}
  ${card('W-9 Requested',`<div class="w9-request-banner"><b>${escapeHtml(pc.wr_partners?.name||'A participating company')} requested your W-9</b><span>Requested ${new Date(req.requested_at).toLocaleDateString()}</span></div><p>Review the business information below. You will enter your SSN/EIN yourself inside the secure form and electronically certify your submission.</p><div class="request-prefill-preview"><div><small>Legal name</small><b>${escapeHtml(req.legal_name||pc.wr_contractor_businesses?.legal_name||'Not pre-filled')}</b></div><div><small>DBA</small><b>${escapeHtml(req.business_name||pc.wr_contractor_businesses?.dba_name||'—')}</b></div><div><small>Mailing address</small><b>${escapeHtml([req.address_line1,req.address_line2,req.city,req.state,req.postal_code].filter(Boolean).join(', ')||'Not pre-filled')}</b></div></div><div class="actions"><button id="completeRequestedW9" class="btn primary">Review & Complete Online</button><button id="uploadRequestedW9" class="btn secondary">Upload Existing W-9</button></div><div id="requestedUploadArea"></div>`)}`
  $('completeRequestedW9').onclick=()=>renderW9(existing,req)
  $('uploadRequestedW9').onclick=()=>{
    $('requestedUploadArea').innerHTML=`<div class="workspace-card"><label>Existing signed W-9</label><input id="requestedW9File" type="file" accept="application/pdf,image/png,image/jpeg"><button id="submitRequestedUpload" class="btn primary">Upload Securely</button></div>`
    $('submitRequestedUpload').onclick=async()=>{
      const f=$('requestedW9File').files[0];if(!f)return toast('Choose your W-9 file')
      const path=`contractors/${pc.contractor_business_id}/w9/${crypto.randomUUID()}-${f.name}`
      const up=await sb.storage.from('workready-documents').upload(path,f);if(up.error)return toast(up.error.message)
      const {error}=await sb.from('wr_documents').insert({contractor_business_id:pc.contractor_business_id,partner_contractor_id:pc.id,document_type:'W-9',file_path:path,file_name:f.name,mime_type:f.type,uploaded_by:state.user.id})
      if(error)return toast(error.message)
      state.pendingW9Token=null;history.replaceState({},'',location.pathname+'#dashboard');toast('W-9 uploaded securely');renderContractorHome()
    }
  }
  return true
}

async function renderContractorHome(){
  const ids=state.contractorMemberships.map(x=>x.contractor_business_id)
  const {data:programs}=await sb.from('wr_partner_contractors').select('id,status,coverage_choice,workready_score,contractor_business_id,requirement_set_id,wr_partners(id,name,parent_partner_id,logo_url,account_type),wr_requirement_sets(name)').in('contractor_business_id',ids)
  state.activeContractor=programs?.[0]||null
  if(!state.activeContractor)return $('workspace').innerHTML=card('No Program Assigned','<p>You are signed in, but no contractor program is linked to this account yet.</p>')
  const pc=state.activeContractor
  const [{data:reqs},{data:w9},{data:docs},{data:w9Requests}] = await Promise.all([
    pc.requirement_set_id?sb.from('wr_requirements').select('*').eq('requirement_set_id',pc.requirement_set_id).order('sort_order'):Promise.resolve({data:[]}),
    sb.from('wr_w9_forms').select('*').eq('partner_contractor_id',pc.id).maybeSingle(),
    sb.from('wr_documents').select('*').eq('partner_contractor_id',pc.id).order('created_at',{ascending:false}),
    sb.from('wr_w9_requests').select('*').eq('partner_contractor_id',pc.id).eq('status','requested').order('requested_at',{ascending:false}).limit(1)
  ])
  const agreement=await getActiveAgreementForPartner(pc.wr_partners)
  const signature=agreement?(await sb.from('wr_agreement_signatures').select('*').eq('agreement_template_id',agreement.id).eq('partner_contractor_id',pc.id).maybeSingle()).data:null
  const uploadedW9=(docs||[]).some(d=>['w-9','w9'].includes(String(d.document_type).toLowerCase()))
  const w9Done=uploadedW9||['submitted','verified'].includes(w9?.status)
  const insuranceRequired=(reqs||[]).some(r=>['general_liability','workers_comp','commercial_auto','umbrella'].includes(r.category))
  const coverageDocs=(docs||[]).filter(d=>!['w-9','w9'].includes(String(d.document_type).toLowerCase()))
  const coverageDone=!insuranceRequired||(pc.coverage_choice==='existing'&&coverageDocs.length>0)||['need_coverage','unsure'].includes(pc.coverage_choice)
  const agreementRequired=(reqs||[]).some(r=>r.category==='independent_contractor_agreement')&&agreement
  const agreementDone=!agreementRequired||!!signature
  const steps=[w9Done,coverageDone,agreementDone]
  const progress=Math.round(steps.filter(Boolean).length/steps.length*100)
  $('workspace').innerHTML=`${brandHeader(pc.wr_partners,pc.wr_requirement_sets?.name||'Contractor requirements')}
  ${card('Your Readiness',`<div class="stat"><small>Progress</small><b>${progress}%</b></div><div style="height:10px;background:#14263a;border-radius:99px;overflow:hidden;margin:14px 0"><span style="display:block;width:${progress}%;height:100%;background:linear-gradient(90deg,#0e6dfd,#55e21b)"></span></div><p>Status: <span class="pill ${pc.status==='workready'?'ready':'warn'}">${pc.status.replaceAll('_',' ')}</span></p>`)}
  ${card('Required Steps',`<div class="workspace-card"><h3>1. W-9</h3><p>${w9Done?'Submitted':w9Requests?.length?`Requested by ${escapeHtml(pc.wr_partners?.name||'partner')} — review the pre-filled information and complete securely.`:'Upload an existing W-9 or complete one securely online.'}</p><button id="w9Btn" class="btn ${!w9Done&&w9Requests?.length?'primary':'secondary'}">${w9Done?'View / Update W-9':w9Requests?.length?'Complete Requested W-9':'Complete W-9'}</button></div><div class="workspace-card"><h3>2. Insurance</h3>${(reqs||[]).filter(r=>['general_liability','workers_comp','commercial_auto','umbrella'].includes(r.category)).map(r=>`<p><b>${escapeHtml(r.label)}</b> ${r.minimum_limit?'— $'+Number(r.minimum_limit).toLocaleString()+' minimum':''}</p>`).join('')}<div class="actions"><button class="btn primary choice" data-choice="existing">I Have Coverage</button><button class="btn secondary choice" data-choice="need_coverage">I Need Coverage</button><button class="btn secondary choice" data-choice="unsure">I'm Not Sure</button></div><div id="coverageUpload"></div></div>${agreementRequired?`<div class="workspace-card"><h3>3. ${escapeHtml(agreement.title)}</h3><p>${signature?'Signed '+new Date(signature.signed_at).toLocaleDateString():'Review and electronically sign the required agreement.'}</p><button id="agreementBtn" class="btn ${signature?'secondary':'primary'}">${signature?'View Signed Agreement':'Review & Sign'}</button></div>`:''}`)}`
  $('w9Btn').onclick=()=>w9Requests?.length?openW9RequestToken(w9Requests[0].token):renderW9Choice(w9,uploadedW9)
  document.querySelectorAll('.choice').forEach(b=>b.onclick=()=>setCoverageChoice(b.dataset.choice))
  if(agreementRequired)$('agreementBtn').onclick=()=>renderAgreement(agreement,signature)
  if(pc.coverage_choice==='existing')renderCoverageUpload()
}

async function renderW9Choice(existing,uploaded){
  $('workspace').innerHTML=`<h1>W-9</h1><p>Choose the easiest option for your business.</p>${card('Submit Your W-9',`<div class="option-grid"><div class="workspace-card"><h3>Upload Existing W-9</h3><p>Already have a completed W-9? Upload it securely.</p><input id="w9UploadFile" type="file" accept="application/pdf,image/png,image/jpeg"><button id="uploadW9" class="btn primary">Upload W-9</button>${uploaded?'<p><span class="pill ready">W-9 already uploaded</span></p>':''}</div><div class="workspace-card"><h3>Complete W-9 Online</h3><p>Enter your taxpayer information securely and electronically certify it.</p><button id="onlineW9" class="btn secondary">Complete Online</button></div></div><div class="actions"><button id="backContractor" class="btn ghost">Back</button></div>`)} `
  $('backContractor').onclick=renderContractorHome
  $('onlineW9').onclick=()=>renderW9(existing)
  $('uploadW9').onclick=async()=>{
    const f=$('w9UploadFile').files[0];if(!f)return toast('Choose your W-9 file')
    const path=`contractors/${state.activeContractor.contractor_business_id}/w9/${crypto.randomUUID()}-${f.name}`
    const up=await sb.storage.from('workready-documents').upload(path,f);if(up.error)return toast(up.error.message)
    const {error}=await sb.from('wr_documents').insert({contractor_business_id:state.activeContractor.contractor_business_id,partner_contractor_id:state.activeContractor.id,document_type:'W-9',file_path:path,file_name:f.name,mime_type:f.type,uploaded_by:state.user.id})
    if(error)return toast(error.message);toast('W-9 uploaded securely');renderContractorHome()
  }
}

async function renderW9(existing,request=null){
  $('workspace').innerHTML=`<h1>Complete W-9 Online</h1>${card('Taxpayer Information',`<div class="secure-note"><b>Secure taxpayer form:</b> Your full SSN/EIN is entered only by you, encrypted before storage, and never included in notification emails. WorkReady displays only the last four digits after submission.</div><div class="form-grid"><div><label>Legal name</label><input id="w9Legal" value="${escapeHtml(existing?.legal_name||request?.legal_name||state.activeContractor?.wr_contractor_businesses?.legal_name||'')}"></div><div><label>Business / DBA</label><input id="w9Business" value="${escapeHtml(existing?.business_name||request?.business_name||state.activeContractor?.wr_contractor_businesses?.dba_name||'')}"></div><div><label>Tax classification</label><select id="w9Class"><option value="individual">Individual / Sole Proprietor</option><option value="c_corp">C Corporation</option><option value="s_corp">S Corporation</option><option value="partnership">Partnership</option><option value="llc">LLC</option><option value="other">Other</option></select></div><div><label>Other classification</label><input id="w9Other" value="${escapeHtml(existing?.other_classification||'')}"></div><div><label>Address</label><input id="w9Address" value="${escapeHtml(existing?.address_line1||request?.address_line1||'')}"></div><div><label>Address line 2</label><input id="w9Address2" value="${escapeHtml(existing?.address_line2||request?.address_line2||'')}"></div><div><label>City</label><input id="w9City" value="${escapeHtml(existing?.city||request?.city||'')}"></div><div><label>State</label><input id="w9State" value="${escapeHtml(existing?.state||request?.state||'')}"></div><div><label>ZIP</label><input id="w9Zip" value="${escapeHtml(existing?.postal_code||request?.postal_code||'')}"></div><div><label>TIN type</label><select id="w9TinType"><option value="ein">EIN</option><option value="ssn">SSN</option></select></div><div><label>Full SSN / EIN</label><input id="w9Tin" inputmode="numeric" autocomplete="off" placeholder="9 digits"></div><div><label>Authorized signer</label><input id="w9Signer" value="${escapeHtml(existing?.signed_name||'')}"></div></div><label><input id="w9Cert" type="checkbox" style="width:auto"> Under penalties of perjury, I certify that the information I am providing is correct and I consent to use this electronic signature for this W-9 submission.</label><div class="actions"><button id="saveW9" class="btn primary">Sign & Submit W-9</button><button id="backW9" class="btn ghost">Back</button></div>`)} `
  if(existing?.tax_classification)$('w9Class').value=existing.tax_classification
  if(existing?.tin_type)$('w9TinType').value=existing.tin_type
  $('backW9').onclick=()=>request?openW9RequestToken(request.token):renderW9Choice(existing,false)
  $('saveW9').onclick=async()=>{
    if(!$('w9Cert').checked)return toast('Electronic certification is required')
    const tin=$('w9Tin').value.replace(/\D/g,'');if(tin.length!==9)return toast('Enter a complete 9-digit SSN or EIN')
    if(!$('w9Legal').value.trim()||!$('w9Signer').value.trim())return toast('Legal name and authorized signer are required')
    const {error}=await sb.rpc('wr_submit_w9_secure',{
      p_partner_contractor_id:state.activeContractor.id,p_legal_name:$('w9Legal').value.trim(),p_business_name:$('w9Business').value.trim()||null,
      p_tax_classification:$('w9Class').value,p_other_classification:$('w9Other').value.trim()||null,p_address_line1:$('w9Address').value.trim(),p_address_line2:$('w9Address2').value.trim()||null,
      p_city:$('w9City').value.trim(),p_state:$('w9State').value.trim(),p_postal_code:$('w9Zip').value.trim(),p_tin_type:$('w9TinType').value,p_tin:tin,
      p_signed_name:$('w9Signer').value.trim(),p_user_agent:navigator.userAgent
    })
    if(error)return toast(error.message)
    state.pendingW9Token=null
    history.replaceState({},'',location.pathname+'#dashboard')
    toast('W-9 signed and submitted securely')
    renderContractorHome()
  }
}

async function renderAgreement(agreement,signature){
  $('workspace').innerHTML=`<h1>${escapeHtml(agreement.title)}</h1>${card(signature?'Signed Agreement':'Review & Sign',`<div class="agreement-copy">${escapeHtml(signature?.agreement_snapshot||agreement.agreement_body).replaceAll('\n','<br>')}</div>${signature?`<div class="signature-record"><p><b>Signed by:</b> ${escapeHtml(signature.signer_name)}</p><p><b>Title:</b> ${escapeHtml(signature.signer_title||'—')}</p><p><b>Signed:</b> ${new Date(signature.signed_at).toLocaleString()}</p><p><b>Agreement version:</b> ${signature.agreement_version}</p></div>`:`<div class="form-grid"><div><label>Full legal name</label><input id="icaSigner"></div><div><label>Title / capacity</label><input id="icaTitleSigner" placeholder="Owner, Member, President"></div></div><label><input id="icaConsent" type="checkbox" style="width:auto"> I have reviewed this agreement, agree to be bound by it, and consent to use my typed name as my electronic signature.</label><div class="actions"><button id="signICA" class="btn primary">Sign Agreement</button></div>`}<div class="actions"><button id="backAgreement" class="btn ghost">Back</button></div>`)} `
  $('backAgreement').onclick=renderContractorHome
  if(!signature)$('signICA').onclick=async()=>{
    const name=$('icaSigner').value.trim();if(!name)return toast('Enter your full legal name')
    if(!$('icaConsent').checked)return toast('Electronic signature consent is required')
    const {error}=await sb.from('wr_agreement_signatures').insert({agreement_template_id:agreement.id,partner_contractor_id:state.activeContractor.id,contractor_business_id:state.activeContractor.contractor_business_id,signer_user_id:state.user.id,signer_name:name,signer_title:$('icaTitleSigner').value.trim()||null,consent_to_electronic_signature:true,agreement_version:agreement.version,agreement_snapshot:agreement.agreement_body,user_agent:navigator.userAgent})
    if(error)return toast(error.message);toast('Agreement signed');renderContractorHome()
  }
}

async function setCoverageChoice(choice){
  const {error}=await sb.rpc('wr_set_coverage_choice',{p_partner_contractor_id:state.activeContractor.id,p_choice:choice});if(error)return toast(error.message)
  state.activeContractor.coverage_choice=choice
  if(choice==='existing')renderCoverageUpload();else{toast('Coverage assistance request created');renderContractorHome()}
}
function renderCoverageUpload(){
  $('coverageUpload').innerHTML=`<div class="workspace-card"><h3>Upload Existing Coverage</h3><label>Document type</label><select id="docType"><option>COI</option><option>General Liability</option><option>Workers Compensation</option><option>Commercial Auto</option><option>Umbrella</option><option>License</option><option>Other</option></select><label>File</label><input id="docFile" type="file"><button id="uploadDoc" class="btn primary">Upload for Review</button></div>`
  $('uploadDoc').onclick=uploadDocument
}
async function uploadDocument(){
  const f=$('docFile').files[0];if(!f)return toast('Choose a file')
  const path=`contractors/${state.activeContractor.contractor_business_id}/${crypto.randomUUID()}-${f.name}`
  const up=await sb.storage.from('workready-documents').upload(path,f);if(up.error)return toast(up.error.message)
  const {error}=await sb.from('wr_documents').insert({contractor_business_id:state.activeContractor.contractor_business_id,partner_contractor_id:state.activeContractor.id,document_type:$('docType').value,file_path:path,file_name:f.name,mime_type:f.type,uploaded_by:state.user.id})
  if(error)return toast(error.message);toast('Document uploaded for review');renderContractorHome()
}
async function renderDocuments(){
  const ids=state.contractorMemberships.map(x=>x.contractor_business_id)
  const {data}=await sb.from('wr_documents').select('*').in('contractor_business_id',ids).order('created_at',{ascending:false})
  $('workspace').innerHTML=`<h1>Documents</h1>${card('Your WorkReady Wallet',`<div class="table-wrap"><table><thead><tr><th>Document</th><th>Status</th><th>Expires</th></tr></thead><tbody>${(data||[]).map(d=>`<tr><td>${d.document_type}<br><small>${d.file_name}</small></td><td>${d.review_status}</td><td>${d.expiration_date||'—'}</td></tr>`).join('')}</tbody></table></div>`)}`}

$('supportBtn').onclick=openSupport;$('closeSupport').onclick=()=>$('supportDrawer').classList.add('hidden');$('sendSupport').onclick=sendSupport
async function getOrCreateSupportThread(){
  if(state.supportThread)return state.supportThread
  const {data:threads}=await sb.from('wr_support_threads').select('*').eq('created_by',state.user.id).in('status',['open','pending']).order('created_at',{ascending:false}).limit(1)
  if(threads?.length){state.supportThread=threads[0];return state.supportThread}
  let partner_id=null,contractor_business_id=null
  if(role()==='partner')partner_id=state.partnerMemberships[0]?.partner_id||null
  if(role()==='contractor')contractor_business_id=state.contractorMemberships[0]?.contractor_business_id||null
  const {data,error}=await sb.from('wr_support_threads').insert({created_by:state.user.id,partner_id,contractor_business_id,subject:'WorkReady Support'}).select().single()
  if(error)throw error;state.supportThread=data;return data
}
async function openSupport(){
  $('supportDrawer').classList.remove('hidden');const thread=await getOrCreateSupportThread();await loadSupportMessages(thread.id)
}
async function loadSupportMessages(threadId){
  const {data}=await sb.from('wr_support_messages').select('*').eq('thread_id',threadId).order('created_at')
  $('supportThread').innerHTML=(data||[]).map(m=>`<div class="chat-msg ${m.sender_user_id===state.user.id?'me':''}">${m.body}<small>${new Date(m.created_at).toLocaleString()}</small></div>`).join('')||'<p style="color:#9fb1c5">Send us a message and WorkReady support can respond here.</p>'
  $('supportThread').scrollTop=$('supportThread').scrollHeight
}
async function sendSupport(){
  const body=$('supportMessage').value.trim();if(!body)return
  const t=await getOrCreateSupportThread()
  const {error}=await sb.from('wr_support_messages').insert({thread_id:t.id,sender_user_id:state.user.id,body})
  if(error)return toast(error.message);$('supportMessage').value='';await loadSupportMessages(t.id)
}
async function renderSupportAdmin(){
  const {data}=await sb.from('wr_support_threads').select('*').order('updated_at',{ascending:false})
  $('workspace').innerHTML=`<h1>Support Inbox</h1>${card('Conversations',`<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Status</th><th>Priority</th><th>Updated</th><th></th></tr></thead><tbody>${(data||[]).map(t=>`<tr><td>${t.subject}</td><td>${t.status}</td><td>${t.priority}</td><td>${new Date(t.updated_at).toLocaleString()}</td><td><button class="btn secondary support-open" data-id="${t.id}">Open</button></td></tr>`).join('')}</tbody></table></div>`)}` 
  document.querySelectorAll('.support-open').forEach(b=>b.onclick=async()=>{state.supportThread=(data||[]).find(t=>t.id===b.dataset.id);$('supportDrawer').classList.remove('hidden');await loadSupportMessages(b.dataset.id)})
}

sb.auth.onAuthStateChange(async(event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    showAuth();
    $('normalAuth').classList.add('hidden');
    $('recoveryAuth').classList.remove('hidden');
    $('authTitle').textContent='Choose a New Password';
    $('authSubtitle').textContent='Set a new password for your WorkReady account.';
    return;
  }

  if(event==='SIGNED_IN' && session?.user){
    state.user=session.user;
    // Covers confirmation links and restored login events.
    if(!$('appView').classList.contains('hidden')) return;
    await enterApp();
  }

  if(event==='SIGNED_OUT'){
    state.user=null;
  }
})

async function init(){
  const q=new URL(location.href).searchParams;
  const {data:{session},error}=await sb.auth.getSession();

  if(error){
    console.error('Session restore error',error);
  }

  if(q.get('contractor_invite')||q.get('partner_invite')){
    if(session){
      await enterApp();
    }else{
      showAuth();
      authMessage('Invitation detected. Sign in or create an account using the invited email address.','success');
    }
    return;
  }

  if(session || location.hash==='#dashboard'){
    if(session) await enterApp();
    else showAuth();
    return;
  }

  showMarketing();
}
init()
