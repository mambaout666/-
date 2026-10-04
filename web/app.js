(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const safe = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null;
  const fmt = value => number(value) === null ? '—' : new Intl.NumberFormat('zh-CN', {notation:'compact',maximumFractionDigits:1}).format(Number(value));
  const full = value => number(value) === null ? '未提供' : new Intl.NumberFormat('zh-CN').format(Number(value));
  const eye = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const heart = '<svg viewBox="0 0 24 24"><path d="M20.6 4.6a5.3 5.3 0 0 0-7.5 0L12 5.7l-1.1-1.1a5.3 5.3 0 0 0-7.5 7.5L12 21l8.6-8.9a5.3 5.3 0 0 0 0-7.5Z"/></svg>';
  function normalize(input) {
    if (!input || !Array.isArray(input.results)) throw new Error('请选择采集器导出的 JSON 结果');
    return {...input, status: input.status === 'complete' ? 'complete' : 'partial', results: input.results.map((r,i) => ({...r,
      id: Number(r.id) || i + 1, rank: Number(r.rank) || i + 1, name:String(r.name || '未命名模组'),
      url:safe(r.url), author:String(r.author || 'GameBanana creator'), category:String(r.category || 'MOD'),
      images:Array.isArray(r.images) ? r.images.map(x => ({url:safe(x.url), caption:String(x.caption || r.name)})).filter(x => x.url) : [],
      videos:Array.isArray(r.videos) ? r.videos.filter(x => ['youtube','vimeo','video'].includes(x.type) && safe(x.url)) : [],
      files:Array.isArray(r.files) ? r.files.filter(x => {try {return new URL(x.url).origin === 'https://gamebanana.com' && /^\/dl\/\d+\/?$/.test(new URL(x.url).pathname)} catch {return false}}) : [],
      sensitive:Boolean(r.sensitive), description:String(r.description || ''),
    }))};
  }
  let report = normalize(JSON.parse($('report-data').textContent));
  let config = JSON.parse($('site-config').textContent), activeFilter = 'all', query = '', activeMod, gallery = [], galleryIndex = 0;
  function notify(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 3600); }
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open); $('drawer').inert = !open; $('page').inert = open;
    $('scrim').hidden = !open; $('menu-button').setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    (open ? document.querySelector('.drawer-close') : $('menu-button')).focus();
  }
  function cover() {
    const valid = r => canShowImages(r) && r.images.length;
    return report.results.find(r => r.id === Number(config.hero_id) && valid(r)) || report.results.find(valid);
  }
  function canShowImages(row) {
    if (config.show_rated_images === true) return true;
    if (row.source_visibility === 'show') return true;
    if (row.source_visibility === 'hide') return false;
    return !row.sensitive;
  }
  function applyConfig() {
    document.title = String(config.title || '模组放映室'); $('page-title').textContent = document.title.replace(' · ', '\n');
    $('eyebrow').textContent = String(config.eyebrow || 'MOD JOURNAL'); $('subtitle').textContent = String(config.subtitle || '');
    if (/^#[0-9a-f]{6}$/i.test(config.accent || '')) document.documentElement.style.setProperty('--accent',config.accent);
    document.body.classList.toggle('no-motion',config.motion === false);
    $('title-input').value = document.title; $('subtitle-input').value = config.subtitle || ''; $('eyebrow-input').value = config.eyebrow || ''; $('motion-input').checked = config.motion !== false;
    $('rated-input').checked = config.show_rated_images === true;
  }
  function bindImages(scope) {
    scope.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const box = document.createElement('div'); box.className = 'missing-media';
      box.innerHTML = '<strong>N / E</strong><span>预览暂不可用 · 可查看原页面</span>'; img.replaceWith(box);
    }, {once:true}));
  }
  function render() {
    const fast = report.selection?.mode === 'new_week';
    applyConfig(); const item = cover();
    $('hero-media').innerHTML = item ? `<img src="${esc(item.images[0].url)}" alt="${esc(item.name)}" fetchpriority="high">` : '<div class="missing-media"><strong>N / E</strong></div>';
    bindImages($('hero-media')); $('cover-open').textContent = item ? item.name + ' ↗' : 'YOUR NEXT DISCOVERY'; $('cover-open').disabled = !item;
    $('cover-open').onclick = () => item && openDetail(item.id); $('cover-counter').textContent = item ? '01 / ' + String(item.images.length).padStart(2,'0') : '00 / 00';
    const date = String(report.window_end_exclusive || report.generated_at || '').slice(0,10);
    $('edition-label').textContent = date ? `EDITION ${date.replaceAll('-','.')}` : 'DATA EDITION'; $('hero-date').textContent = date.replaceAll('-',' / ');
    const author = String(config.author || '偷瓜ing');
    $('footer-date').textContent = `${date ? date + ' / ' : ''}网站作者：${author}`;
    $('window-label').textContent = `${String(report.window_start_inclusive || '').slice(0,10)} — ${String(report.window_end_exclusive || '').slice(0,16).replace('T',' ')} · 北京时间`;
    $('status-badge').textContent = report.status === 'complete' ? '本期统计已完成' : report.selection?.mode === 'latest_sample' ? '最新样本试抓 · 非全站周榜' : '部分采集 · 非全站前十'; $('status-badge').classList.toggle('partial',report.status !== 'complete');
    $('coverage-label').textContent = `已检查 ${full(report.checked)} / ${full(report.site_total)} 个 Mod`;
    if (fast) {
      $('status-badge').textContent = report.status === 'complete' ? '本周新作榜 · 不含老 Mod' : '本周新作 · 尚未完整';
      $('coverage-label').textContent = `已统计 ${full(report.checked)} 个本周新作 · 列表 ${full(report.index_pages_read)} 页`;
      $('window-label').textContent = '新作发布时间：' + $('window-label').textContent;
    }
    $('sort').querySelector('[value="weekly"]').textContent = fast ? '新作获赞' : '本周获赞';
    $('entry-count').textContent = String(report.results.length).padStart(2,'0');
    $('data-notes').textContent = report.status === 'complete' ? '本期排行覆盖本次采集会话可见且成功完成统计的内容' : '本页只展示当前已采集的部分内容，卡片排序不代表全站前十';
    if (report.selection?.mode === 'latest_sample') $('data-notes').textContent = `本次先取最新发布的 ${report.selection.limit} 个 Mod，再按本周获赞选出本页结果；不是随机抽样，也不是全站周榜`;
    if (fast) $('data-notes').textContent = `只收录上述时间范围内发布的新 Mod，老 Mod 的更新不计入；按读取列表时的累计点赞选出前十${report.status === 'complete' ? '，已扫描到本周边界或列表末尾' : '，扫描尚未完整，当前排名可能变化'}`;
    $('metric-notes').textContent = fast ? '新作获赞取自列表采集时刻；浏览量和累计点赞取自稍后的详情采集，数值可能不同，实时接口不是冻结快照' : '浏览量与累计点赞取自详情采集时刻；本周获赞按北京时间周一至统计截止时刻计算，实时接口不是冻结快照';
    $('data-notes').textContent += ' 页面排序只重排本期已收录内容，不会重新抓取网站';
    renderCards();
  }
  function renderCards() {
    const mode = $('sort').value;
    const rows = report.results.filter(r => (!query || `${r.name} ${r.author}`.toLowerCase().includes(query)) && (activeFilter === 'all' || r.images.length));
    const field = mode === 'views' ? 'view_count' : mode === 'likes' ? 'total_likes_at_scan' : 'weekly_likes';
    rows.sort((a,b) => (number(b[field]) ?? -1) - (number(a[field]) ?? -1) || a.id - b.id);
    $('mod-grid').innerHTML = rows.map(r => {
      const picture = !canShowImages(r) ? '<div class="restricted"><strong>◌</strong><span>分级预览已折叠 · 可在「编辑这一期」中显示</span></div>' : r.images[0] ? `<img src="${esc(r.images[0].url)}" alt="${esc(r.name)}" loading="lazy">` : '<div class="missing-media"><strong>N / E</strong><span>作者暂未提供图片</span></div>';
      const file = r.files[0];
      return `<article class="mod-card"><button class="card-media" data-detail="${r.id}" aria-label="预览 ${esc(r.name)}">${picture}<span class="rank-badge">${String(r.rank).padStart(2,'0')}</span><span class="media-badge">${`▧ ${String(r.images.length).padStart(2,'0')} IMAGES`}</span><span class="media-arrow">↗</span></button><div class="card-category"><span>${esc(r.category)}</span><span>BY ${esc(r.author)}</span></div><h3 class="card-title"><button data-detail="${r.id}">${esc(r.name)}</button></h3><div class="card-stats"><span title="浏览量 ${full(r.view_count)}">${eye}${fmt(r.view_count)}</span><span title="累计点赞 ${full(r.total_likes_at_scan)}">${heart}${fmt(r.total_likes_at_scan)}</span><span class="weekly" title="${report.selection?.mode === 'new_week' ? '列表采集时的新作累计点赞' : '本周获赞'}">${report.selection?.mode === 'new_week' ? '新作 ' : '本周 +'}${fmt(r.weekly_likes)}</span></div><div class="card-actions">${file ? `<a class="download-link" href="${esc(file.url)}" target="_blank" rel="noopener noreferrer" download><span>下载模组 <small>${esc(file.version || '')}</small></span><span>↓</span></a>` : `<a class="download-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span>前往原页获取</span><span>↗</span></a>`}<button class="more-button" data-detail="${r.id}">${r.files.length > 1 ? `${r.files.length} 个文件` : '查看详情'}</button></div></article>`;
    }).join('');
    $('empty').hidden = rows.length > 0; bindImages($('mod-grid'));
    document.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => openDetail(Number(b.dataset.detail)));
    if ('IntersectionObserver' in window) { const observer = new IntersectionObserver(entries => entries.forEach(e => {if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.05}); document.querySelectorAll('.mod-card').forEach(c=>observer.observe(c)); }
    else document.querySelectorAll('.mod-card').forEach(c=>c.classList.add('visible'));
  }
  function openDetail(id) {
    activeMod = report.results.find(r => r.id === id); if (!activeMod) return;
    gallery = canShowImages(activeMod) ? activeMod.images.map(i=>({...i,type:'image'})) : []; galleryIndex=0;
    $('detail-content').innerHTML = `<div class="detail-stage" id="detail-stage"></div><div class="gallery-nav"><button id="prev-media" aria-label="上一张">←</button><span id="media-number"></span><button id="next-media" aria-label="下一张">→</button></div><div class="detail-info"><p class="eyebrow dark">${esc(activeMod.category)} / BY ${esc(activeMod.author)}</p><h2>${esc(activeMod.name)}</h2><div class="detail-stats"><span>浏览 ${full(activeMod.view_count)}</span><span>累计点赞 ${full(activeMod.total_likes_at_scan)}</span><span>${report.selection?.mode === 'new_week' ? '新作获赞' : '本周获赞'} ${full(activeMod.weekly_likes)}</span></div><p class="detail-description">${esc(activeMod.description.slice(0,900))}</p><div class="file-list">${activeMod.files.map(f=>`<a class="file-item" href="${esc(f.url)}" download target="_blank" rel="noopener noreferrer"><span>${esc(f.name)}<small>${f.size ? (Number(f.size)/1048576).toFixed(1)+' MB' : '文件大小未提供'} ${esc(f.version || '')}</small></span><span>直接下载 ↓</span></a>`).join('')}</div><a class="source-link" href="${esc(activeMod.url)}" target="_blank" rel="noopener noreferrer">查看作者原页面 ↗</a></div>`;
    $('prev-media').onclick=()=>{galleryIndex=(galleryIndex-1+gallery.length)%gallery.length;renderMedia()};
    $('next-media').onclick=()=>{galleryIndex=(galleryIndex+1)%gallery.length;renderMedia()};
    renderMedia(); $('detail-dialog').showModal();
  }
  function renderMedia() {
    const stage=$('detail-stage'), item=gallery[galleryIndex]; stage.replaceChildren();
    $('media-number').textContent = gallery.length ? `${galleryIndex+1} / ${gallery.length}` : '暂无可展示预览'; $('prev-media').disabled=$('next-media').disabled=gallery.length<2;
    if(!item){stage.innerHTML=canShowImages(activeMod)?'<p class="stage-empty">作者暂未提供可展示的图片</p>':'<p class="stage-empty">分级预览已折叠，可在「目录 → 编辑这一期」中显示</p>';return}
    if(item.type==='image'){const img=document.createElement('img');img.src=safe(item.url);img.alt=item.caption || activeMod.name;stage.append(img);bindImages(stage);return}

  }
  $('menu-button').onclick=()=>setMenu(true);document.querySelector('.drawer-close').onclick=$('scrim').onclick=()=>setMenu(false);
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && document.body.classList.contains('menu-open'))setMenu(false);if(e.key==='Tab' && document.body.classList.contains('menu-open')){const nodes=[...$('drawer').querySelectorAll('button,input')].filter(n=>!n.disabled && n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus()}}});
  document.querySelector('.dialog-close').onclick=()=>$('detail-dialog').close();$('detail-dialog').addEventListener('close',()=>$('detail-content').replaceChildren());
  function filter(value){activeFilter=value;document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===value));renderCards()}
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>filter(b.dataset.filter));document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{filter(b.dataset.nav);setMenu(false);$('collection').scrollIntoView()});
  $('search').oninput=e=>{query=e.target.value.trim().toLowerCase();renderCards()};$('sort').onchange=renderCards;
  $('settings-open').onclick=()=>{$('settings').hidden=false;document.querySelectorAll('.nav-item').forEach(b=>b.hidden=true);$('title-input').focus()};
  $('settings-back').onclick=()=>{$('settings').hidden=true;document.querySelectorAll('.nav-item').forEach(b=>b.hidden=false)};
  $('settings-apply').onclick=()=>{config={...config,title:$('title-input').value.trim()||'模组放映室',subtitle:$('subtitle-input').value,eyebrow:$('eyebrow-input').value,motion:$('motion-input').checked,show_rated_images:$('rated-input').checked};render();notify('本期设置已应用，保存当前页面即可保留');setMenu(false)};
  $('import-open').onclick=$('import-bottom').onclick=()=>$('import-file').click();
  $('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('请选择小于 20 MB 的结果文件');const input=JSON.parse(await file.text());report=normalize(input);render();setMenu(false);notify('本期数据已更新，标题与模板保持不变')}catch(err){notify(err.message)}finally{e.target.value=''}};
  $('save-page').onclick=()=>{setMenu(false);const clone=document.documentElement.cloneNode(true);clone.querySelector('#report-data').textContent=JSON.stringify(report).replaceAll('<','\\u003c');clone.querySelector('#site-config').textContent=JSON.stringify(config).replaceAll('<','\\u003c');clone.querySelector('body').classList.remove('menu-open');clone.querySelector('body').style.overflow='';clone.querySelector('#page').removeAttribute('inert');clone.querySelector('#drawer').setAttribute('inert','');clone.querySelector('#scrim').hidden=true;clone.querySelector('#detail-dialog').removeAttribute('open');clone.querySelector('#detail-content').replaceChildren();const blob=new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mod-journal-'+String(report.window_end_exclusive||'edition').slice(0,10)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000)};
  render();
})();
