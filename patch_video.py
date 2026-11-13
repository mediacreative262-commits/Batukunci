from pathlib import Path
root=Path('/mnt/data/bk_video')
# helper functions in data.js
p=root/'data.js'; s=p.read_text()
needle='function driveEmbedUrl(link) {'
insert='''function mediaKind(item = {}) {
  const declared = String(item.type || item.mimeType || '').toLowerCase();
  const link = String(item.link || item.url || '').toLowerCase();
  return declared.startsWith('video/') || declared === 'video' || /\\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(link) ? 'video' : 'image';
}
function isDirectVideoUrl(link = '') {
  return /^https?:\\/\\//i.test(link) && /\\.(mp4|webm|m4v)(?:[?#]|$)/i.test(link);
}
function driveVideoPreviewUrl(link) {
  const m = String(link || '').match(/\\/d\\/([a-zA-Z0-9_-]{10,})/) || String(link || '').match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview?autoplay=1&mute=1` : null;
}

'''
s=s.replace(needle,insert+needle)
p.write_text(s)
# upload form metadata and preview rendering in app.js
p=root/'app.js'; s=p.read_text()
s=s.replace("      link: row.querySelector('.aset-link').value.trim(),\n      akun: row.querySelector('.aset-akun').value,", "      link: row.querySelector('.aset-link').value.trim(),\n      akun: row.querySelector('.aset-akun').value,\n      type: row.dataset.mediaType || (isDirectVideoUrl(row.querySelector('.aset-link').value.trim()) ? 'video' : 'image'),")
s=s.replace("      row.querySelector('.aset-link').value = result.viewLink;\n      if (!row.querySelector('.aset-label').value)", "      row.querySelector('.aset-link').value = result.viewLink;\n      row.dataset.mediaType = file.type.startsWith('video/') ? 'video' : 'image';\n      if (!row.querySelector('.aset-label').value)")
s=s.replace("      document.getElementById('gallery-link').value = result.viewLink;", "      document.getElementById('gallery-link').value = result.viewLink;\n      document.getElementById('gallery-link').dataset.mediaType = file.type.startsWith('video/') ? 'video' : 'image';")
# project detail assets replace iframe markup
old='''          const url = driveEmbedUrl(a.link);
          return `<div class="aset-preview">
            <div class="aset-preview-label">${escapeHtml(a.label || 'Aset')}${a.akun ? ' · ' + escapeHtml(a.akun) : ''}</div>
            ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : `<div class="aset-empty">Link belum diisi / belum valid.</div>`}
          </div>`;'''
new='''          const url = driveEmbedUrl(a.link);
          const video = mediaKind(a) === 'video';
          const direct = video && isDirectVideoUrl(a.link);
          const preview = !url && !a.link ? '' : video
            ? (direct ? `<video class="bk-video-player" controls playsinline preload="metadata" src="${escapeAttr(a.link)}"></video>` : `<div class="bk-video-shell"><iframe class="bk-video-frame" data-video-preview="1" data-src="${escapeAttr(driveVideoPreviewUrl(a.link) || url || '')}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" title="${escapeAttr(a.label || 'Video preview')}"></iframe><button type="button" class="bk-video-full" onclick="window.open('${escapeAttr(a.link)}','_blank','noopener')">▶ Tonton penuh</button></div>`)
            : (url ? `<iframe src="${url}" loading="lazy"></iframe>` : `<div class="aset-empty">Link belum diisi / belum valid.</div>`);
          return `<div class="aset-preview ${video ? 'aset-preview-video' : ''}">
            <div class="aset-preview-label">${escapeHtml(a.label || 'Aset')}${a.akun ? ' · ' + escapeHtml(a.akun) : ''}${video ? ' · VIDEO' : ''}</div>
            ${preview || `<div class="aset-empty">Link belum diisi / belum valid.</div>`}
          </div>`;'''
if old not in s: print('detail old not found')
else: s=s.replace(old,new)
# Home project card video preview before detail
s=s.replace("  return `<div class=\"project-card\" onclick=\"toggleExpand('${p.id}')\">\n    <div class=\"project-card-top\">", "  const videoAsset = (p.aset || []).find(a => mediaKind(a) === 'video');\n  const homeVideo = videoAsset ? (isDirectVideoUrl(videoAsset.link) ? `<video class=\"bk-home-video\" muted playsinline loop preload=\"none\" src=\"${escapeAttr(videoAsset.link)}\"></video>` : `<div class=\"bk-home-video-drive\"><iframe class=\"bk-video-frame\" data-video-preview=\"1\" data-src=\"${escapeAttr(driveVideoPreviewUrl(videoAsset.link) || '')}\" loading=\"lazy\" allow=\"autoplay; fullscreen\" title=\"Video preview\"></iframe><span>VIDEO PREVIEW</span></div>`) : '';\n  return `<div class=\"project-card\" onclick=\"toggleExpand('${p.id}')\">\n    <div class=\"project-card-top\">")
s=s.replace("    <div class=\"assignee-names\">${names.join(', ')}</div>\n    ${detail}", "    <div class=\"assignee-names\">${names.join(', ')}</div>\n    ${homeVideo ? `<div class=\"bk-home-video-wrap\" onclick=\"event.stopPropagation()\">${homeVideo}</div>` : ''}\n    ${detail}")
# Gallery store type and render
s=s.replace("await db.collection('gallery').add({ label, link, akun, albumId, fileId:", "await db.collection('gallery').add({ label, link, akun, albumId, type: document.getElementById('gallery-link').dataset.mediaType || (isDirectVideoUrl(link) ? 'video' : 'image'), fileId:")
s=s.replace("  return `<div class=\"gallery-item\">\n    ${url ? `<iframe src=\"${url}\" loading=\"lazy\"></iframe>` : `<div class=\"aset-empty\">Link belum valid</div>`}", "  const video = mediaKind(g) === 'video';\n  return `<div class=\"gallery-item ${video ? 'gallery-item-video' : ''}\">\n    ${video ? (isDirectVideoUrl(g.link) ? `<video controls muted playsinline preload=\"metadata\" src=\"${escapeAttr(g.link)}\"></video>` : `<div class=\"bk-video-shell\"><iframe class=\"bk-video-frame\" data-video-preview=\"1\" data-src=\"${escapeAttr(driveVideoPreviewUrl(g.link) || url || '')}\" loading=\"lazy\" allow=\"autoplay; fullscreen\"></iframe><button type=\"button\" class=\"bk-video-full\" onclick=\"window.open('${escapeAttr(g.link)}','_blank','noopener')\">▶ Tonton penuh</button></div>`) : (url ? `<iframe src=\"${url}\" loading=\"lazy\"></iframe>` : `<div class=\"aset-empty\">Link belum valid</div>`)}")
# preview function gallery type marker
s=s.replace("document.getElementById('gallery-link').value = result.viewLink;", "document.getElementById('gallery-link').value = result.viewLink;\n      document.getElementById('gallery-link').dataset.mediaType = file.type.startsWith('video/') ? 'video' : 'image';")
# observer helper append near end
s += '''\n/* Video previews: lazy start on viewport, stop after five seconds or when off-screen. */\n(function(){\n  const timers = new WeakMap();\n  function mount(root=document){\n    const nodes=[...root.querySelectorAll('[data-video-preview]')];\n    if(!('IntersectionObserver' in window)){ nodes.forEach(n=>{ n.src=n.dataset.src||''; }); return; }\n    const io=new IntersectionObserver(entries=>entries.forEach(entry=>{\n      const el=entry.target;\n      if(entry.isIntersecting){\n        if(!el.src && el.dataset.src){ el.src=el.dataset.src; }\n        clearTimeout(timers.get(el));\n        timers.set(el,setTimeout(()=>{ el.src='about:blank'; },5000));\n      } else { clearTimeout(timers.get(el)); if(el.src && el.src!=='about:blank') el.src='about:blank'; }\n    }),{threshold:.55});\n    nodes.forEach(n=>io.observe(n));\n  }\n  window.BKVideoPreview={mount};\n  document.addEventListener('DOMContentLoaded',()=>mount());\n  const oldRenderHome=window.renderHome;\n  if(typeof oldRenderHome==='function') window.renderHome=function(){oldRenderHome();mount(document.getElementById('project-list')||document);};\n})();\n'''
p.write_text(s)
# CSS
css='''\n/* Video asset previews */\n.bk-home-video-wrap{margin-top:14px;max-width:230px;aspect-ratio:3/4;overflow:hidden;border-radius:16px;background:#171717;position:relative}\n.bk-home-video,.bk-home-video-drive iframe{width:100%;height:100%;object-fit:cover;border:0;display:block}\n.bk-home-video-drive{width:100%;height:100%;position:relative}\n.bk-home-video-drive span{position:absolute;left:10px;bottom:10px;background:#111b;color:#fff;padding:5px 8px;border-radius:6px;font-size:10px;letter-spacing:.08em;pointer-events:none}\n.bk-video-shell{position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;border-radius:12px;background:#171717}\n.bk-video-shell iframe{width:100%;height:100%;border:0;display:block}\n.bk-video-full{position:absolute;left:10px;bottom:10px;border:0;border-radius:999px;background:#fff;color:#171717;padding:8px 12px;font-weight:700;font-size:12px;cursor:pointer}\n.bk-video-player,.gallery-item video{width:100%;aspect-ratio:3/4;object-fit:cover;border:0;border-radius:12px;background:#111;display:block}\n.aset-preview-video{max-width:420px}\n@media(max-width:600px){.bk-home-video-wrap{max-width:min(68vw,230px)}.bk-video-shell{border-radius:10px}}\n@media(prefers-reduced-motion:reduce){.bk-home-video-wrap{scroll-behavior:auto}}\n'''
(root/'video-preview.css').write_text(css)
# link CSS in app and view
for fn in ['app.html','view.html']:
 p=root/fn; s=p.read_text(); marker='</head>'
 s=s.replace(marker,'<link rel="stylesheet" href="video-preview.css?v=33.1">\n'+marker)
 p.write_text(s)
# view.js video detail preview
p=root/'view.js'; s=p.read_text()
old='''            const url = driveEmbedUrl(a.link);
            return `<div class="aset-preview">
              <div class="aset-preview-label">${esc(a.label || 'Aset')}</div>
              ${url ? `<iframe src="${url}" loading="lazy" title="${esc(a.label || 'Preview aset')}"></iframe>` : '<div class="aset-missing">Preview tidak tersedia.</div>'}
            </div>`;'''
new='''            const url = driveEmbedUrl(a.link);
            const video = mediaKind(a) === 'video';
            const preview = video ? (isDirectVideoUrl(a.link) ? `<video class="bk-video-player" controls playsinline preload="metadata" src="${esc(a.link)}"></video>` : `<div class="bk-video-shell"><iframe data-video-preview="1" data-src="${esc(driveVideoPreviewUrl(a.link) || url || '')}" loading="lazy" allow="autoplay; fullscreen" title="${esc(a.label || 'Video preview')}"></iframe><button class="bk-video-full" type="button" onclick="window.open('${esc(a.link)}','_blank','noopener')">▶ Tonton penuh</button></div>`) : (url ? `<iframe src="${url}" loading="lazy" title="${esc(a.label || 'Preview aset')}"></iframe>` : '<div class="aset-missing">Preview tidak tersedia.</div>');
            return `<div class="aset-preview ${video ? 'aset-preview-video' : ''}"><div class="aset-preview-label">${esc(a.label || 'Aset')}${video ? ' · VIDEO' : ''}</div>${preview}</div>`;'''
if old not in s: print('view detail old not found')
else: s=s.replace(old,new)
# Add mount invocation after render project list
s=s.replace("  list.innerHTML = filtered.map((p, index) => {", "  list.innerHTML = filtered.map((p, index) => {")
# after map end known marker
s=s.replace("  }).join('');\n}\n\nfunction openProject", "  }).join('');\n  window.BKVideoPreview?.mount?.(list);\n}\n\nfunction openProject",1)
p.write_text(s)
# deployment docs
(root/'DEPLOY-VIDEO-PREVIEW-33.1.md').write_text('''# Deploy Build 33.1 — Video Preview\n\nReplace `app.js`, `view.js`, `app.html`, and `view.html`. Add `video-preview.css`. Keep existing Firebase Rules and Apps Script unchanged.\n\nVideo assets should be marked with `type: "video"` (the direct upload flow records MIME type). For manually pasted links, use direct MP4/WebM URLs or ensure the asset is a Google Drive file link with viewer access.\n\nDrive preview uses an embedded player. Browser autoplay may be blocked by device/browser policy; direct MP4/WebM supports muted inline preview more consistently. Drive embed preview is unloaded after five seconds or when it leaves the viewport. Full playback opens the source in a new tab.\n\nAutomatic upload through the existing Apps Script bridge retains its existing 15 MB limit. Larger videos should be uploaded manually to Drive and linked.\n''')
(root/'CHANGELOG-VIDEO-PREVIEW-33.1.md').write_text('''# Build 33.1 — Video Preview\n\n- Adds video asset metadata on direct upload and gallery save.\n- Adds 3:4 project video preview in Home and project detail.\n- Adds Gallery video rendering.\n- Adds viewport-triggered muted Drive preview, unloaded after 5 seconds or when off-screen.\n- Adds direct MP4/WebM native video support.\n- Adds responsive video styles.\n\nLimitations: Drive iframe autoplay depends on browser policy and file sharing. Existing Apps Script upload limit remains 15 MB. Full playback opens Drive source separately.\n''')
