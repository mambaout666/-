(function (root) {
  const HOUR = 3600000;
  function weekWindow(now = Date.now()) {
    const local = new Date(now + 8 * HOUR);
    const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return {start: Math.floor((monday.getTime() - 8 * HOUR) / 1000), end: Math.floor(now / 1000)};
  }
  function iso(stamp) {
    return new Date(stamp * 1000 + 8 * HOUR).toISOString().slice(0, 19) + '+08:00';
  }
  function parsePage(data, page) {
    const meta = data?._aMetadata;
    if (!Array.isArray(data?._aRecords) || !Number.isInteger(meta?._nRecordCount) || meta._nRecordCount < 0 || !Number.isInteger(meta?._nPerpage) || meta._nPerpage < 1) throw new Error('接口分页结构发生变化');
    const done = meta._bIsComplete === true || page * meta._nPerpage >= meta._nRecordCount;
    if (!data._aRecords.length && !done) throw new Error('分页意外为空');
    return {rows: data._aRecords, total: meta._nRecordCount, done};
  }
  async function countLikes(get, id, start, end) {
    const seen = new Set();
    let count = 0, previous = Infinity, totalAtStart;
    for (let page = 1; page <= 10000; page++) {
      const {rows, total, done} = parsePage(await get(`Mod/${id}/Likes`, {_nPage: page, _nPerpage: 50}), page);
      if (totalAtStart === undefined) totalAtStart = total;
      let oldest = Infinity, added = 0;
      for (const row of rows) {
        const stamp = row._tsDateAdded, member = row._aSubmitter?._idRow;
        if (!Number.isInteger(stamp) || !Number.isInteger(member)) throw new Error('缺少点赞时间或去重标识');
        if (seen.has(member)) continue;
        if (stamp > previous) throw new Error('点赞记录没有按时间倒序排列，已停止此项统计');
        previous = stamp; oldest = stamp; seen.add(member); added++;
        if (stamp >= start && stamp < end) count++;
      }
      if (oldest < start || done) return {weekly_likes: count, total_likes_at_scan: totalAtStart, like_pages_read: page, checked_at: iso(Math.floor(Date.now() / 1000))};
      if (rows.length && !added) throw new Error('接口重复返回同一页');
    }
    throw new Error('点赞分页超过保护上限');
  }
  async function totalLikes(get, id, value) {
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (Number.isSafeInteger(parsed) && parsed >= 0) return {likes: parsed, source: 'index'};
    // Index omits _nLikeCount for some zero-like submissions. Verify the total
    // with one request; do not enumerate like timestamps or assume zero.
    try {
      const {total} = parsePage(await get(`Mod/${id}/Likes`, {_nPage: 1, _nPerpage: 1}), 1);
      if (!Number.isSafeInteger(total)) throw new Error('点赞总数无效');
      return {likes: total, source: 'likes_metadata'};
    } catch (error) { throw new Error(`Mod #${id} 点赞数读取失败：${error.message}`); }
  }
  async function indexNewWeek(get, state, onPage = () => {}, stopped = () => false) {
    const seen = new Set(state.newWeekSeen || []);
    while (!state.indexDone && !stopped()) {
      const page = state.nextPage || 1;
      const {rows, total, done} = parsePage(await get('Mod/Index', {_nPage: page, _nPerpage: 50, '_aFilters[Generic_Game]': 19567, _sSort: 'Generic_Newest'}), page);
      let previous = state.previousPublished ?? Infinity, crossed = false, fresh = 0;
      const pending = [], pageSeen = new Set(seen);
      for (const row of rows) {
        const stamp = row._tsDateAdded, id = row._idRow;
        if (row._aGame?._idRow !== 19567 || !Number.isInteger(id) || !Number.isInteger(stamp)) throw new Error('缺少发布时间或游戏信息，已停止新作统计');
        if (pageSeen.has(id)) continue;
        if (stamp > previous) throw new Error('列表不是按发布时间倒序，已停止，避免漏掉新作');
        previous = stamp; pageSeen.add(id); fresh++;
        if (stamp < state.start) crossed = true;
        if (stamp < state.start || stamp >= state.end) continue;
        const {likes, source} = await totalLikes(get, id, row._nLikeCount);
        pending.push({id, name: String(row._sName ?? ''), url: `https://gamebanana.com/mods/${id}`, published_at: stamp, total_likes_at_index: likes, likes_source: source});
      }
      if (rows.length && !fresh) throw new Error('Mod 列表重复分页，已停止');
      if (state.siteTotal !== undefined && state.siteTotal !== total) state.indexChanged = true;
      state.siteTotal = total;
      const checked_at = iso(Math.floor(Date.now() / 1000));
      for (const mod of pending) {
        state.mods.push(mod);
        state.counts[mod.id] = {weekly_likes: mod.total_likes_at_index, total_likes_at_scan: mod.total_likes_at_index, like_pages_read: 0, checked_at};
      }
      state.newWeekSeen = [...pageSeen];
      pageSeen.forEach(id => seen.add(id));
      state.previousPublished = previous === Infinity ? null : previous;
      state.nextPage = page + 1;
      state.indexDone = crossed || done;
      await onPage();
    }
  }
  function report(state) {
    const newWeek = state.scope === 'new_week';
    const ranked = state.mods.filter(mod => Object.hasOwn(state.counts, mod.id)).map(mod => ({...mod, ...state.counts[mod.id], ...(state.details?.[mod.id] || {})}));
    ranked.sort((a, b) => b.weekly_likes - a.weekly_likes || a.id - b.id);
    const complete = state.indexDone && !state.limited && !state.indexChanged && (newWeek || state.mods.length === state.siteTotal) && ranked.length === state.mods.length && !Object.keys(state.errors).length;
    return {status: complete ? 'complete' : 'partial', scope: 'GameBanana content visible to the current browser session; not guaranteed to include every site submission',
      selection: {mode: newWeek ? 'new_week' : state.maxMods > 0 ? 'latest_sample' : 'all_visible', limit: state.maxMods || 0, index_order: 'newest', ranking_metric: newWeek ? 'new_mod_total_likes_at_collection' : 'weekly_likes'},
      metric: newWeek ? 'cumulative likes observed during collection for mods published in the selected window; excludes older mods' : 'surviving likes created in the selected time window', window_start_inclusive: iso(state.start), window_end_exclusive: iso(state.end),
      generated_at: iso(Math.floor(Date.now() / 1000)), index_pages_read: (state.nextPage || 1) - 1,
      site_total: state.siteTotal, indexed: state.mods.length, checked: ranked.length, errors: state.errors,
      caveat: 'Live API is not an atomic snapshot; cancelled/private likes are unavailable.',
      results: ranked.slice(0, 10).map((row, index) => ({rank: index + 1, ...row}))};
  }
  function csvCell(value) {
    let text = String(value);
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  }
  const api = {weekWindow, iso, parsePage, countLikes, totalLikes, indexNewWeek, report, csvCell, escapeHtml};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZZZCollectorCore = api;
})(globalThis);
