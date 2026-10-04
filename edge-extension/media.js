globalThis.ZZZMedia = (() => {
  const https = value => {try {const u=new URL(value);return u.protocol==='https:'&&!u.username?u.href:''}catch{return ''}};
  function video(value){
    const url=https(value);if(!url)return null;const u=new URL(url);let code;
    if(['youtube.com','www.youtube.com','www.youtube-nocookie.com','youtu.be'].includes(u.hostname)){
      code=u.hostname==='youtu.be'?u.pathname.slice(1):/^\/(embed|shorts)\//.test(u.pathname)?u.pathname.split('/')[2]:u.searchParams.get('v');
      if(/^[A-Za-z0-9_-]{11}$/.test(code||''))return {type:'youtube',url:'https://www.youtube-nocookie.com/embed/'+code};
    }
    if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){code=u.pathname.split('/').at(-1);if(/^\d+$/.test(code))return {type:'vimeo',url:'https://player.vimeo.com/video/'+code}}
    if(/\.(mp4|webm|ogv)$/i.test(u.pathname))return {type:'video',url};
    return null;
  }
  function normalize(d){
    const doc=new DOMParser().parseFromString(d._sText||'','text/html');doc.querySelectorAll('script,style').forEach(x=>x.remove());
    const candidates=[...doc.querySelectorAll('[src],[href]')].flatMap(x=>[x.getAttribute('src'),x.getAttribute('href')]).filter(Boolean);
    function walk(x){if(typeof x==='string')candidates.push(x);else if(x && typeof x==='object')Object.values(x).forEach(walk)}
    walk(d._aPreviewMedia);walk(d._aPreviewContent);
    const videos=[...new Map(candidates.map(video).filter(Boolean).map(x=>[x.url,x])).values()];
    const images=(d._aPreviewMedia?._aImages||[]).map(x=>({url:https(x._sBaseUrl+'/'+x._sFile),caption:x._sCaption||''})).filter(x=>x.url);
    const files=(d._aFiles||[]).filter(x=>!x._bIsArchived && /^https:\/\/gamebanana\.com\/dl\/\d+\/?$/.test(x._sDownloadUrl||'')).map(x=>({name:x._sFile,url:x._sDownloadUrl,size:x._nFilesize,version:x._sVersion||''}));
    return {media_schema:2,source_visibility:['show','hide'].includes(d._sInitialVisibility)?d._sInitialVisibility:'unknown',images,videos,files,view_count:d._nViewCount,total_likes_at_scan:d._nLikeCount,download_count:d._nDownloadCount,author:d._aSubmitter?._sName||'',category:d._aCategory?._sName||'Mod',description:(doc.body.textContent||'').trim().slice(0,2000),sensitive:d._sInitialVisibility==='hide'||['nu','pn','sc','ft'].some(x=>Object.hasOwn(d._aContentRatings||{},x))};
  }
  return {normalize};
})();
