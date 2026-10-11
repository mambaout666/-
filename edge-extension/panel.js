/* Shared, dependency-free UI for the extension popup and in-page collector. */
(() => {
  const icons = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9M10 5H5v14h14v-5"/></svg>',
  };
  const styles = `
    :host{color-scheme:light;display:block}
    .mj,.mj *{box-sizing:border-box}.mj{--ink:#27372f;--muted:#7c8881;--color:#39745b;--tint:#edf5ef;--slide:0;color:var(--ink);background:#fff;font:13px/1.6 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;text-align:left;border:1px solid #e7ebe7;border-radius:24px;overflow:hidden;box-shadow:0 18px 65px #183c2720;width:100%;isolation:isolate}
    .mj button,.mj a{-webkit-tap-highlight-color:transparent}.mj button{font:inherit;cursor:pointer}.mj button:disabled{cursor:not-allowed;opacity:.45}.mj button:focus-visible,.mj a:focus-visible{outline:3px solid var(--color);outline-offset:3px}.mj a{color:inherit;text-decoration:none}.mj svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}.mj [hidden]{display:none!important}
    .mj-head{display:flex;align-items:center;justify-content:space-between;padding:22px 25px 0}.mj-brand{display:flex;align-items:center;gap:10px}.mj-monogram{display:grid;place-items:center;width:32px;height:32px;background:var(--ink);color:white;border-radius:10px;font-size:15px}.mj-brand strong{font-size:11px;letter-spacing:2px;font-weight:700}.mj-brand small{display:block;font-size:9px;letter-spacing:1.4px;color:var(--muted);margin-top:1px}.mj-close{border:0;background:#f3f5f3;border-radius:50%;width:28px;height:28px;color:var(--muted);font-size:20px!important;line-height:1}.mj-edition{font-size:9px;letter-spacing:1.3px;border:1px solid #e4e9e4;padding:4px 8px;border-radius:20px;color:#778279}
    .mj-body{padding:24px 25px 22px}.mj-intro{display:flex;justify-content:space-between;align-items:center;margin-bottom:17px}.mj-intro h1{font-size:24px;letter-spacing:-1px;line-height:1.3;margin:0;font-weight:650}.mj-intro p{margin:6px 0 0;font-size:11px;color:var(--muted)}.mj-intro>span{font-size:11px;letter-spacing:2px;color:#b4bcb6;writing-mode:vertical-rl}
    .mj-label{display:flex;justify-content:space-between;color:var(--muted);font-size:10px;margin-bottom:9px}.mj-label span:last-child{letter-spacing:1.5px;font-size:9px}.mj-switch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:5px;background:#f3f5f3;border-radius:14px;position:relative;gap:0}.mj-indicator{position:absolute;left:5px;top:5px;bottom:5px;width:calc((100% - 10px)/4);border:1px solid #e5ebe5;background:white;border-radius:10px;box-shadow:0 2px 6px #263a2c0c;transform:translateX(calc(var(--slide)*100%));transition:transform .42s cubic-bezier(.22,1,.36,1)}.mj-switch button{position:relative;border:0;border-radius:10px;background:transparent;padding:9px 1px;color:#8a938c;white-space:nowrap;font-size:11px;transition:color .25s}.mj-switch button[aria-checked=true]{color:var(--color);font-weight:650}
    .mj-feature{position:relative;overflow:hidden;display:flex;align-items:center;min-height:154px;background:var(--tint);border:1px solid color-mix(in srgb,var(--color) 12%,transparent);border-radius:18px;margin-top:16px;padding:23px 20px;transition:background .4s,border-color .4s}.mj-feature-copy{position:relative;z-index:1;max-width:74%}.mj-kicker{font-size:9px;letter-spacing:2px;color:var(--color);margin:0 0 10px}.mj-feature h2{font-size:23px;line-height:1.25;margin:0 0 7px;letter-spacing:-.6px;font-weight:650}.mj-feature p{font-size:11px;color:#738277;margin:0}.mj-feature .mj-english{font-size:8px;letter-spacing:1.1px;margin-top:13px;opacity:.7}.mj-art{position:absolute;right:-17px;top:10px;width:153px;height:153px;display:grid;place-items:center;color:var(--color);opacity:.65;pointer-events:none;transition:color .4s}.mj-ring{position:absolute;width:132px;height:132px;border:1px solid currentColor;border-radius:50%;opacity:.18}.mj-ring:nth-child(2){width:97px;height:97px}.mj-ring:nth-child(3){width:155px;height:61px;transform:rotate(-40deg);opacity:.28}.mj-orbit-dot{position:absolute;top:13px;right:39px;width:7px;height:7px;border:2px solid var(--tint);background:currentColor;border-radius:50%}.mj-art b{font:italic 72px/1 Georgia,serif;opacity:.45;transform:rotate(-12deg)}.mj-art svg{position:absolute;bottom:16px;left:24px;width:19px;height:19px}
    .mj-window{display:flex;align-items:center;justify-content:space-between;margin:16px 0 20px}.mj-window small{display:block;color:var(--muted);font-size:10px}.mj-window strong{font-size:11px;letter-spacing:.5px;font-weight:500}.mj-window>span{border:1px solid #e6ebe6;border-radius:8px;font-size:9px;padding:4px 7px;color:#758176}.mj-primary{display:flex;align-items:center;justify-content:space-between;width:100%;background:var(--color);color:#fff;border:0;border-radius:12px;padding:13px 16px;font-weight:600!important;transition:background .4s,transform .2s,box-shadow .2s;box-shadow:0 4px 12px color-mix(in srgb,var(--color) 15%,transparent)}.mj-primary:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 6px 16px color-mix(in srgb,var(--color) 25%,transparent)}.mj-primary>span{display:flex;align-items:center;gap:8px}.mj-secondary{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px}.mj-secondary button{border:1px solid #e5ebe5;border-radius:10px;padding:8px;background:white;color:#67776b;font-size:11px}.mj-secondary button:not(:disabled):hover{background:var(--tint)}.mj-stop{width:100%;margin-top:9px;border:1px solid #e7d5cd;background:#fff8f5;padding:8px;border-radius:10px;color:#9a6045;font-size:11px!important}
    .mj-session{display:flex;gap:6px;align-items:center;color:#8a958c;font-size:10px;margin:12px 0 0}.mj-dot{width:5px;height:5px;border-radius:50%;background:#7ca68b;flex-shrink:0}.mj-source{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:var(--color)!important;margin-top:10px}.mj-source svg{width:12px;height:12px}
    .mj-status{border-top:1px solid #eef1ee;margin-top:18px;padding-top:16px}.mj-state-line{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600}.mj-state-line .mj-dot{background:var(--color)}.mj-log{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);font:10px/1.8 "Segoe UI","Microsoft YaHei",sans-serif;margin:7px 0 0;max-height:110px;overflow:auto}.mj[data-error=true] .mj-log{color:#a55f47}.mj[data-error=true] .mj-state-line .mj-dot{background:#be785a}.mj-metrics{display:flex;gap:22px;margin:11px 0 2px}.mj-metrics strong{font-size:22px;line-height:1.1;font-weight:500;letter-spacing:-.5px}.mj-metrics small{display:block;font-size:9px;color:var(--muted);margin-top:4px}
    .mj-loader{position:relative;height:20px;width:64px;margin-left:auto;overflow:hidden}.mj-loader i{position:absolute;left:12px;width:27px;height:3px;background:#8cae9a;border-radius:5px;animation:mj-drift 1.8s ease-in-out infinite}.mj-loader i:nth-child(2){top:7px;background:#a2b4d3;animation-delay:-.4s;width:21px}.mj-loader i:nth-child(3){top:14px;background:#d4b27d;animation-delay:-.8s;width:32px}@keyframes mj-drift{0%,100%{transform:translateX(-8px)}50%{transform:translateX(16px)}}
    .mj-downloads{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:13px}.mj-downloads a{border:1px solid #dce6dd;background:#f8fbf8;border-radius:10px;padding:10px 3px;text-align:center;font-size:10px;font-weight:600;color:var(--color)}.mj-downloads a:hover{background:var(--tint);border-color:var(--color)}.mj-downloads a:first-child{background:var(--tint)}.mj-downloads a small{display:block;font-size:8px;font-weight:400;opacity:.65;margin-top:1px}
    .mj-foot{display:flex;justify-content:space-between;align-items:center;padding:12px 25px;background:#fafbf9;border-top:1px solid #edf0eb;font-size:8px;letter-spacing:1.2px;color:#9aa299}.mj-foot span:last-child{letter-spacing:.2px}.mj[data-busy=true] .mj-primary svg:last-child{opacity:.5}
    .mj[data-popup=true] .mj-head{padding-top:14px}.mj[data-popup=true] .mj-body{padding-top:14px;padding-bottom:12px}.mj[data-popup=true] .mj-intro{margin-bottom:10px}.mj[data-popup=true] .mj-intro h1{font-size:22px}.mj[data-popup=true] .mj-intro p{margin-top:4px}.mj[data-popup=true] .mj-intro>span{writing-mode:horizontal-tb;font-size:8px;letter-spacing:1px}.mj[data-popup=true] .mj-label{margin-bottom:6px}.mj[data-popup=true] .mj-switch button{padding-top:7px;padding-bottom:7px}.mj[data-popup=true] .mj-feature{min-height:112px;margin-top:10px;padding-top:14px;padding-bottom:14px}.mj[data-popup=true] .mj-art{top:-3px}.mj[data-popup=true] .mj-feature h2{font-size:21px}.mj[data-popup=true] .mj-kicker{margin-bottom:7px}.mj[data-popup=true] .mj-feature .mj-english{margin-top:9px}.mj[data-popup=true] .mj-window{margin:10px 0 12px}.mj[data-popup=true] .mj-primary{padding-top:11px;padding-bottom:11px}.mj[data-popup=true] .mj-session{margin-top:9px}.mj[data-popup=true] .mj-source{margin-top:7px}.mj[data-popup=true] .mj-status{margin-top:10px;padding-top:9px}.mj[data-popup=true] .mj-foot{padding-top:8px;padding-bottom:8px}
    @media(prefers-reduced-motion:reduce){.mj *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    @media(max-width:370px){.mj-body{padding:20px 17px}.mj-head{padding:18px 17px 0}.mj-foot{padding:12px 17px}.mj-feature{padding:20px 16px}.mj-feature h2{font-size:21px}.mj-art{right:-35px}.mj-switch button{font-size:10px}}
  `;
  function create(root, {gameId = 19567, popup = false, onChange = () => {}} = {}) {
    const core = globalThis.ZZZCollectorCore;
    root.innerHTML = `<style>${styles}</style><section class="mj" aria-label="模组周刊采集器">
      <header class="mj-head"><div class="mj-brand"><span class="mj-monogram">${icons.spark}</span><div><strong>MOD JOURNAL</strong><small>A WEEKLY DISCOVERY</small></div></div>${popup ? '<span class="mj-edition">VOL. 02</span>' : '<button class="mj-close" id="close" aria-label="关闭采集面板">×</button>'}</header>
      <div class="mj-body"><div class="mj-intro"><div><h1>每周，发现新模样。</h1><p>四个世界，一份属于你的模组周刊。</p></div><span>WEEKLY / 10</span></div>
      <div class="mj-label"><span>选择你的世界</span><span>01 — 04</span></div>
      <div class="mj-switch" role="radiogroup" aria-label="选择游戏"><span class="mj-indicator" aria-hidden="true"></span>${globalThis.ModGames.map(g => `<button type="button" role="radio" data-game="${g.id}" aria-checked="false" tabindex="-1">${g.short_name}</button>`).join('')}</div>
      <div class="mj-feature"><div class="mj-feature-copy"><div class="mj-kicker">THIS WEEK'S NEW MODS</div><h2 id="game-name"></h2><p id="game-note"></p><div class="mj-english" id="game-english"></div></div><div class="mj-art" aria-hidden="true"><i class="mj-ring"></i><i class="mj-ring"></i><i class="mj-ring"></i><i class="mj-orbit-dot"></i><b id="game-mark"></b>${icons.spark}</div></div>
      <div class="mj-window"><div><small>本周新作 · 累计点赞前十</small><strong id="week-range"></strong></div><span>北京时间</span></div>
      <button class="mj-primary" id="${popup ? 'open' : 'start'}"><span>${icons.spark}${popup ? '打开采集面板' : '采集本周新作'}</span>${icons.arrow}</button>
      ${popup ? '' : '<div class="mj-secondary"><button id="trial">试抓 20 条</button><button id="resume">继续上次</button></div><button class="mj-stop" id="stop" hidden disabled>停止采集 · 保存进度</button>'}
      <p class="mj-session"><span class="mj-dot"></span>使用当前登录会话 · 不读取或导出 Cookie</p>
      <a class="mj-source" id="game-source" target="_blank" rel="noopener noreferrer">前往游戏主页 ${icons.external}</a>
      <div class="mj-status" role="status" aria-live="polite" aria-atomic="true"><div class="mj-state-line"><span class="mj-dot"></span><span id="phase">准备好，开始新的发现</span><span class="mj-loader" id="loader" hidden aria-hidden="true"><i></i><i></i><i></i></span></div><div class="mj-metrics" id="metrics" hidden><div><strong id="found">0</strong><small id="found-label">本周新作</small></div><div><strong id="pages">0</strong><small>已读列表页</small></div><div><strong id="checked">0</strong><small>已统计</small></div></div><pre class="mj-log" id="status">${popup ? '在已登录的 GameBanana 标签页打开面板，即可开始采集。' : '选择游戏后开始；每款游戏的进度单独保存。'}</pre></div>
      <div class="mj-downloads" id="downloads" hidden aria-label="导出采集结果"></div></div>
      <footer class="mj-foot"><span>CURATED FROM GAMEBANANA</span><span>v2.0 · 新作榜</span></footer></section>`;
    const $ = id => root.querySelector(`#${id}`);
    const panel = root.querySelector('.mj');
    panel.dataset.popup = String(popup);
    const choices = [...root.querySelectorAll('[data-game]')];
    let selected;
    function select(value, notify = true) {
      selected = core.game(value);
      panel.style.setProperty('--slide', globalThis.ModGames.indexOf(selected));
      panel.style.setProperty('--color', selected.color);
      panel.style.setProperty('--tint', selected.tint);
      choices.forEach(button => {
        const active = Number(button.dataset.game) === selected.id;
        button.setAttribute('aria-checked', String(active)); button.tabIndex = active ? 0 : -1;
      });
      $('game-name').textContent = selected.name;
      $('game-note').textContent = `去${selected.city}，寻找本周的新灵感。`;
      $('game-english').textContent = selected.english;
      $('game-mark').textContent = selected.mark;
      $('game-source').href = `https://gamebanana.com/mods/games/${selected.id}`;
      const window = core.weekWindow();
      $('week-range').textContent = `${core.iso(window.start).slice(5,10).replace('-',' / ')} — ${core.iso(window.end).slice(5,10).replace('-',' / ')}`;
      if (notify) onChange(selected);
    }
    choices.forEach(button => {
      button.onclick = () => select(Number(button.dataset.game));
      button.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const index = choices.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 4) % 4;
        if (choices[next].disabled) return;
        select(Number(choices[next].dataset.game)); choices[next].focus();
      };
    });
    select(gameId, false);
    return {$, select, get game() {return selected;},
      message(text, phase, error = false) {
        $('status').textContent = text; if (phase) $('phase').textContent = phase;
        panel.dataset.error = String(error);
      },
      busy(value) {
        panel.dataset.busy = String(value); $('loader').hidden = !value;
        for (const button of [...choices, ...['start','trial','resume','close','open'].map($).filter(Boolean)]) button.disabled = value;
        if ($('stop')) { $('stop').disabled = !value; $('stop').hidden = !value; }
      },
      progress(state, phase, text) {
        $('metrics').hidden = false; $('found').textContent = state.mods.length;
        $('found-label').textContent = state.scope === 'new_week' ? '本周新作' : '样本模组';
        $('pages').textContent = Math.max(0, state.nextPage - 1);
        $('checked').textContent = Object.keys(state.counts).length;
        if (phase || text) this.message(text || '', phase);
      },
      reset() { $('metrics').hidden = true; $('downloads').hidden = true; $('downloads').replaceChildren(); }
    };
  }
  globalThis.ModPanel = {create};
})();
