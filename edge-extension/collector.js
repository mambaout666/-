(() => {
  if (document.getElementById('zzz-weekly-collector')) return;
  if (location.origin !== 'https://gamebanana.com') return;
  const core = globalThis.ZZZCollectorCore;
  const KEY = 'zzz-weekly-collector-checkpoint-v1';
  let state, running = false, stopped = false, nextRequest = 0;
  const urls = [];
  const host = document.createElement('div');
  host.id = 'zzz-weekly-collector';
  host.style.cssText = 'position:fixed;right:18px;top:18px;width:440px;max-width:95vw;z-index:2147483647';
  const shadow = host.attachShadow({mode: 'closed'});
  shadow.innerHTML = `<style>:host{color-scheme:dark}*{box-sizing:border-box}section{font:14px/1.6 system-ui;background:#14202d;color:#e9f2fa;padding:20px;border:1px solid #597080;border-radius:14px;box-shadow:0 10px 50px #0009;max-height:92vh;overflow:auto}h2{font-size:20px;margin:0 0 12px;color:#f7d85e}button,a{font:inherit}button{border:0;padding:9px;margin:4px 3px 4px 0;border-radius:6px;background:#f7d85e;color:#15202d;cursor:pointer}button:disabled{opacity:.45;cursor:default}a{color:#8fd5fb;margin-right:12px}pre{white-space:pre-wrap;max-height:230px;overflow:auto;background:#0c141e;padding:12px}small{color:#b9cbd8}</style>
  <section><h2>绝区零 · 本周新作榜</h2><p>请先登录 GameBanana，采集时保留此标签页。</p>
  <button id="start">采集本周新作</button><button id="trial">试抓 20 条</button><button id="resume">继续上次</button><button id="stop" disabled>停止</button><button id="close">关闭</button>
  <pre id="status">就绪 · v1.2.1</pre><div id="downloads"></div>
  <small>北京时间周一至开始时刻发布的新作，按累计点赞取前十。<br>每周点“采集本周新作”重新开始；“继续上次”保留旧范围。<br>试抓仅用于检查连接，不代表完整榜单。</small></section>`;
  document.documentElement.appendChild(host);
  const $ = id => shadow.getElementById(id);
  function status(text) { $('status').textContent = text; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { throw new Error('本地断点无法保存，请检查浏览器站点存储是否已满'); }
  }
  function progress() {
    const allChecked = state.indexDone && Object.keys(state.counts).length === state.mods.length && !Object.keys(state.errors).length;
    const phase = running ? '采集中，请保留此标签页' : allChecked ? (state.maxMods ? '试抓完成 · 样本排行' : core.report(state).status === 'complete' ? '采集完成' : '列表发生变化 · 当前为部分结果') : '尚未完成，可继续上次任务';
    const fast = state.scope === 'new_week';
    const coverage = fast ? `已读列表 ${Math.max(0, state.nextPage - 1)} 页，发现本周新作 ${state.mods.length} 个` : `索引：${state.mods.length}/${state.siteTotal ?? '?'}`;
    status(`模式：${fast ? '本周新作' : state.maxMods ? '最新 ' + state.maxMods + ' 条试抓' : '旧版全量周榜'}\n${fast ? '发布时间' : '区间'}：${core.iso(state.start)} 至 ${core.iso(state.end)}\n${coverage}\n已统计：${Object.keys(state.counts).length}，失败：${Object.keys(state.errors).length}\n${phase}`);
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function get(endpoint, params, records = true) {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (stopped) throw new Error('已停止');
      const wait = Math.max(0, nextRequest - Date.now());
      nextRequest = Math.max(Date.now(), nextRequest) + 400;
      await sleep(wait);
      if (stopped) throw new Error('已停止');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      let delay = 2 ** (attempt + 1) * 1000;
      try {
        const url = new URL('/apiv12/' + endpoint, location.origin);
        url.search = new URLSearchParams(params).toString();
        const response = await fetch(url, {credentials: 'same-origin', signal: controller.signal, headers: {Accept: 'application/json'}});
        if (!response.ok) {
          if (![429, 500, 502, 503, 504].includes(response.status)) {
            const error = new Error(`HTTP ${response.status}，请检查登录状态或站点权限`);
            error.permanent = true; throw error;
          }
          const retry = Number(response.headers.get('Retry-After'));
          if (Number.isFinite(retry) && retry > 0) delay = Math.max(delay, retry * 1000);
          throw new Error(`临时请求失败 HTTP ${response.status}`);
        }
        const result = await response.json();
        if (!result || typeof result !== 'object' || (records && !Array.isArray(result._aRecords))) { const error = new Error('接口未返回预期数据，可能需要重新登录'); error.permanent = true; throw error; }
        return result;
      } catch (error) {
        if (error.permanent || attempt === 3 || stopped) throw error;
        nextRequest = Math.max(nextRequest, Date.now() + delay);
      } finally { clearTimeout(timer); }
    }
  }
  async function indexMods() {
    const seen = new Set(state.mods.map(mod => mod.id));
    while (!state.indexDone && !stopped) {
      const page = state.nextPage;
      const {rows, total, done} = core.parsePage(await get('Mod/Index', {_nPage: page, _nPerpage: 50, '_aFilters[Generic_Game]': 19567, _sSort: 'Generic_Newest'}), page);
      if (state.siteTotal !== undefined && state.siteTotal !== total) state.indexChanged = true;
      state.siteTotal = total;
      let added = 0;
      for (const row of rows) {
        if (row._aGame?._idRow !== 19567 || !Number.isInteger(row._idRow)) throw new Error('接口未正确筛选绝区零，已停止');
        if (seen.has(row._idRow)) continue;
        seen.add(row._idRow); added++;
        state.mods.push({id: row._idRow, name: String(row._sName ?? ''), url: `https://gamebanana.com/mods/${row._idRow}`, total_likes_at_index: row._nLikeCount});
      }
      if (rows.length && !added) throw new Error('Mod 列表重复分页，已停止');
      state.nextPage++;
      if (state.maxMods && state.mods.length >= state.maxMods) {
        state.mods = state.mods.slice(0, state.maxMods); state.indexDone = true; state.limited = state.mods.length < total;
      } else if (done) state.indexDone = true;
      save(); progress();
    }
  }
  function downloads() {
    $('downloads').replaceChildren();
    urls.splice(0).forEach(URL.revokeObjectURL);
    if (!state) return;
    const report = core.report(state), complete = report.status === 'complete';
    const fast = state.scope === 'new_week';
    const title = fast ? (complete ? '本周新作点赞前十（不含老 Mod）' : '本周新作部分结果（尚未完整）') : complete ? '当前会话可见范围的本周点赞前十' : '部分采集结果（不是全站前十）';
    const stem = fast ? (complete ? 'new_week_top10' : 'new_week_partial') : complete ? 'weekly_top10' : 'partial_ranking';
    const heading = document.createElement('p'); heading.textContent = title; $('downloads').append(heading);
    if (!complete && !report.results.length) { heading.textContent = '尚未取得可导出的结果，请重试或继续上次任务。'; return; }
    const fields = ['rank', 'name', 'weekly_likes', 'url', 'total_likes_at_scan'];
    const csv = '\uFEFF' + [fields, ...report.results.map(r => fields.map(key => r[key]))].map(row => row.map(core.csvCell).join(',')).join('\r\n');
    const text = title + '\n' + report.window_start_inclusive + ' 至 ' + report.window_end_exclusive + (fast ? '\n以上是发布时间范围；按列表读取时的累计点赞排序' : '') + '\n\n' + report.results.map(r => `${r.rank}. ${r.name} | ${fast ? '新作获赞' : '本周'} ${r.weekly_likes} 赞\n${r.url}`).join('\n');
    const html = globalThis.ZZZShowcase.render(report);
    for (const [extension, content, type] of [['json', JSON.stringify(report, null, 2), 'application/json'], ['csv', csv, 'text/csv'], ['txt', text, 'text/plain'], ['html', html, 'text/html']]) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], {type: type + ';charset=utf-8'})); urls.push(a.href);
      a.download = `${stem}_${state.end}.${extension}`; a.textContent = extension.toUpperCase(); $('downloads').append(a);
    }
  }
  async function execute(mode, maxMods) {
    if (running) return;
    const work = async () => {
      if (mode === 'resume') {
        state = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (!state || state.version !== 1 || !Array.isArray(state.mods) || !state.counts || !state.errors) throw new Error('没有可继续的有效断点');
      } else {
        const previous = localStorage.getItem(KEY);
        if (previous) localStorage.setItem(KEY + '-previous', previous);
        state = {version: 1, scope: mode === 'fast' ? 'new_week' : 'all_visible', ...core.weekWindow(), mods: [], counts: {}, errors: {}, nextPage: 1, indexDone: false, maxMods, limited: false};
        save();
      }
      running = true; stopped = false;
      $('downloads').replaceChildren(); urls.splice(0).forEach(URL.revokeObjectURL);
      ['start', 'trial', 'resume', 'close'].forEach(id => $(id).disabled = true); $('stop').disabled = false;
      try {
        if (state.scope === 'new_week') await core.indexNewWeek(get, state, () => {save(); progress();}, () => stopped);
        else await indexMods();
        const pending = state.mods.filter(mod => !Object.hasOwn(state.counts, mod.id));
        let cursor = 0;
        async function worker() {
          while (!stopped && cursor < pending.length) {
            const mod = pending[cursor++];
            try { state.counts[mod.id] = await core.countLikes(get, mod.id, state.start, state.end); delete state.errors[mod.id]; }
            catch (error) { if (!stopped) state.errors[mod.id] = error.message; }
            save(); progress();
          }
        }
        const outcomes = await Promise.allSettled(Array.from({length: 4}, worker));
        const failure = outcomes.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        state.details ||= {};
        const featured = core.report(state).results;
        for (const mod of featured) {
          if (stopped) break;
          if (state.details[mod.id]?.media_schema === 2 && !state.details[mod.id].media_error) continue;
          status(`正在补充图片、浏览量和下载文件：${mod.name}`);
          try {
            const detail = await get(`Mod/${mod.id}/ProfilePage`, {}, false);
            if (detail._idRow !== mod.id || detail._aGame?._idRow !== 19567) throw new Error('详情所属游戏或 ID 不匹配');
            state.details[mod.id] = globalThis.ZZZMedia.normalize(detail);
          } catch (error) { state.details[mod.id] = {media_error:error.message}; }
          save();
        }
      } finally {
        running = false;
        ['start', 'trial', 'resume', 'close'].forEach(id => $(id).disabled = false); $('stop').disabled = true;
        progress(); downloads();
      }
    };
    try {
      await navigator.locks.request(KEY, {ifAvailable: true}, async lock => {
        if (!lock) throw new Error('另一个 GameBanana 标签页正在采集，请回到该标签页');
        await work();
      });
    } catch (error) { status(error.message); }
  }
  $('start').onclick = () => execute('fast', 0);
  $('trial').onclick = () => execute('new', 20);
  $('resume').onclick = () => execute('resume');
  $('stop').onclick = () => { stopped = true; status('正在停止，等待当前请求收尾并保存断点'); };
  $('close').onclick = () => { if (!running) { urls.forEach(URL.revokeObjectURL); host.remove(); } };
})();
