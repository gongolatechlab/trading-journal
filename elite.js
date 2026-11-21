/* Gongola Journal Elite v1: non-invasive theme controls.
   Does not access myTrades, dailyNotes, journalSettings, or Supabase. */
(function () {
  'use strict';
  const KEY = 'gongolaJournalAppearance';
  const THEMES = [
    {id:'obsidian', title:'Obsidian Gold', short:'Gold', desc:'Executive · precise'},
    {id:'midnight', title:'Midnight Blue', short:'Blue', desc:'Fintech · refined'},
    {id:'slate', title:'Slate Minimal', short:'Slate', desc:'Calm · focused'}
  ];
  const allowed = new Set(THEMES.map(t => t.id));
  function storedTheme() {
    try { const id = localStorage.getItem(KEY); return allowed.has(id) ? id : 'obsidian'; }
    catch { return 'obsidian'; }
  }
  function activate(id) {
    if(!allowed.has(id)) return;
    document.documentElement.setAttribute('data-journal-theme',id);
    try { localStorage.setItem(KEY,id); } catch { /* Storage may be restricted. */ }
    document.querySelectorAll('[data-gj-choice]').forEach(button => {
      const active = button.getAttribute('data-gj-choice') === id;
      button.setAttribute('aria-pressed',String(active));
      button.title = active ? 'Current journal design' : 'Switch journal design';
    });
  }
  // Set palette before most of the app paints.
  activate(storedTheme());
  function buildSettingsPicker() {
    const target = document.getElementById('view-settings');
    if(!target || target.querySelector('.gj-design-panel')) return;
    const panel = document.createElement('section');
    panel.className = 'gj-design-panel';
    panel.setAttribute('aria-label','Journal appearance');
    const heading = document.createElement('div');
    heading.className = 'gj-design-heading';
    heading.innerHTML = '<div><h2>Journal appearance</h2><p>Three simple, elite workspaces. Your trades and settings stay unchanged.</p></div><span class="gj-tag">DESIGN</span>';
    const grid = document.createElement('div');
    grid.className = 'gj-theme-grid';
    grid.setAttribute('role','group');
    grid.setAttribute('aria-label','Choose appearance');
    THEMES.forEach(theme => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gj-theme';
      button.setAttribute('data-gj-choice',theme.id);
      button.setAttribute('aria-label','Use '+theme.title+' appearance');
      const swatch=document.createElement('div');
      swatch.className='gj-swatch gj-swatch--'+theme.id;
      swatch.innerHTML='<i></i><i></i><i></i>';
      const title=document.createElement('div'); title.className='gj-theme-title'; title.textContent=theme.title;
      const sub=document.createElement('div'); sub.className='gj-theme-sub'; sub.textContent=theme.desc;
      button.append(swatch,title,sub);
      button.addEventListener('click',()=>activate(theme.id));
      grid.append(button);
    });
    panel.append(heading,grid);
    const title = target.querySelector('h1');
    if(title) title.insertAdjacentElement('afterend',panel);
    else target.prepend(panel);
  }
  function buildSidebarPicker() {
    const nav=document.querySelector('body > nav');
    if(!nav || nav.querySelector('.gj-sidebar-picker')) return;
    const wrap=document.createElement('div');
    wrap.className='px-2 mb-4';
    const label=document.createElement('div');label.className='gj-sidebar-label';label.textContent='Appearance';
    const picker=document.createElement('div');picker.className='gj-sidebar-picker';
    picker.setAttribute('role','group');picker.setAttribute('aria-label','Journal appearance');
    THEMES.forEach(theme=>{
      const button=document.createElement('button');button.type='button';
      button.textContent=theme.short;button.setAttribute('data-gj-choice',theme.id);
      button.setAttribute('aria-label','Switch to '+theme.title);
      button.addEventListener('click',()=>activate(theme.id));picker.append(button);
    });
    wrap.append(label,picker);
    const footer=nav.querySelector('div.space-y-2.pt-4');
    if(footer)footer.before(wrap);else nav.append(wrap);
  }
  function init() {
    buildSettingsPicker();buildSidebarPicker();activate(storedTheme());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
