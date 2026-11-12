/* Batu Kunci Build 31 — progressive UI layer.
 * Keeps Firebase/data workflows in app.js; this file owns visual components only.
 */
(function () {
  'use strict';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let projectChart = null;
  let dutySwiper = null;
  let gallerySwiper = null;
  let dutyCalendar = null;
  let chatObserver = null;

  const palette = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? {text:'#E8EEF5',muted:'#96A5B6',line:'#344150',surface:'#202A35',blue:'#7DA6C8',teal:'#70AFA6',gold:'#C9A66D',grid:'rgba(210,225,240,.08)'}
      : {text:'#1B2A39',muted:'#718092',line:'#E3E9EF',surface:'#FFFFFF',blue:'#315E80',teal:'#4E9489',gold:'#B58B4D',grid:'rgba(40,65,90,.08)'};
  };
  const escapeText = value => String(value ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

  function refreshIcons(scope = document) {
    if (window.lucide?.createIcons) {
      try { window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); } catch (e) { console.warn('Lucide icons', e); }
    }
  }

  function animatePage(el) {
    if (!el || reduceMotion || !window.gsap) return;
    window.gsap.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .26, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
  }

  function observeChatSurfaces() {
    if (chatObserver) chatObserver.disconnect();
    const containers = document.querySelectorAll('#group-messages,#dm-messages,#project-comments,#project-list,.project-comments-list,#ai-messages');
    chatObserver = new MutationObserver(records => {
      if (reduceMotion || !window.gsap) return;
      const added = records.flatMap(r => [...r.addedNodes]).filter(n => n.nodeType === 1 && (n.matches?.('.chat-message,.ai-message') || n.querySelector?.('.chat-message,.ai-message')));
      const targets = added.flatMap(n => n.matches?.('.chat-message,.ai-message') ? [n] : [...n.querySelectorAll('.chat-message,.ai-message')]).slice(-8);
      if (targets.length) window.gsap.fromTo(targets, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .22, stagger: .025, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    });
    containers.forEach(el => chatObserver.observe(el, { childList: true, subtree: true }));
  }

  function confirm(message, title = 'Konfirmasi') {
    if (!window.Swal) return Promise.resolve(window.confirm(message));
    return window.Swal.fire({
      title, text: message, icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Ya, lanjutkan', cancelButtonText: 'Batal',
      reverseButtons: true, focusCancel: true,
      customClass: { popup: 'bk-swal-popup', title: 'bk-swal-title', htmlContainer: 'bk-swal-copy', confirmButton: 'bk-swal-confirm', cancelButton: 'bk-swal-cancel' },
      buttonsStyling: false
    }).then(result => !!result.isConfirmed);
  }

  function prompt(message, value = '', confirmText = 'Simpan') {
    if (!window.Swal) return Promise.resolve(window.prompt(message, value));
    return window.Swal.fire({
      title: message, input: 'text', inputValue: value, showCancelButton: true,
      confirmButtonText: confirmText, cancelButtonText: 'Batal', reverseButtons: true,
      inputValidator: v => String(v || '').trim() ? undefined : 'Isi nama terlebih dahulu.',
      customClass: { popup: 'bk-swal-popup', title: 'bk-swal-title', input: 'bk-swal-input', confirmButton: 'bk-swal-confirm', cancelButton: 'bk-swal-cancel' },
      buttonsStyling: false
    }).then(result => result.isConfirmed ? String(result.value || '').trim() : null);
  }

  function renderProjectChart(projects = []) {
    const canvas = document.getElementById('project-status-chart');
    const legend = document.getElementById('project-status-legend');
    if (!canvas || !window.Chart) return;
    const counts = [
      projects.filter(p => p.status === 'belum').length,
      projects.filter(p => p.status === 'proses').length,
      projects.filter(p => p.status === 'selesai').length
    ];
    const p = palette();
    if (projectChart) projectChart.destroy();
    projectChart = new window.Chart(canvas, {
      type: 'doughnut',
      data: { labels: ['Belum mulai', 'Dalam proses', 'Selesai'], datasets: [{ data: counts, backgroundColor: [p.blue, p.gold, p.teal], borderColor: p.surface, borderWidth: 5, hoverOffset: 6, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { backgroundColor: p.surface, titleColor: p.text, bodyColor: p.text, borderColor: p.line, borderWidth: 1, padding: 11, displayColors: true } }, animation: reduceMotion ? false : { duration: 500, easing: 'easeOutQuart' } }
    });
    if (legend) legend.innerHTML = [
      ['Belum mulai', counts[0], p.blue], ['Dalam proses', counts[1], p.gold], ['Selesai', counts[2], p.teal]
    ].map(([label, n, color]) => `<div class="insight-legend-row"><span class="insight-legend-label"><i style="--legend-color:${color}"></i>${label}</span><strong>${n}</strong></div>`).join('');
  }

  function mountDutySwiper(wrap) {
    if (!wrap || !window.Swiper) return;
    if (dutySwiper) { dutySwiper.destroy(true, true); dutySwiper = null; }
    const cards = [...wrap.querySelectorAll(':scope > .duty-team-card')];
    if (!cards.length) return;
    wrap.classList.add('swiper','bk-duty-swiper');
    wrap.innerHTML = `<div class="swiper-wrapper">${cards.map(card => `<div class="swiper-slide">${card.outerHTML}</div>`).join('')}</div><div class="swiper-pagination"></div>`;
    dutySwiper = new window.Swiper(wrap, {
      slidesPerView: 1.08, spaceBetween: 12, speed: 420, grabCursor: true,
      watchOverflow: true, pagination: { el: wrap.querySelector('.swiper-pagination'), clickable: true },
      breakpoints: { 600: { slidesPerView: 2, spaceBetween: 14 }, 1050: { slidesPerView: 3, spaceBetween: 16 } },
      a11y: { enabled: true }
    });
  }

  function renderGallerySwiper(items = []) {
    const section = document.getElementById('gallery-featured-section');
    const host = document.getElementById('gallery-featured-slides');
    if (!section || !host || !window.Swiper) return;
    if (gallerySwiper) { gallerySwiper.destroy(true, true); gallerySwiper = null; }
    const selected = [...items].slice().sort((a,b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds*1000 : 0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds*1000 : 0);
      return tb - ta;
    }).slice(0, 10);
    section.classList.toggle('hidden', !selected.length);
    host.innerHTML = selected.map(item => {
      const image = typeof window.driveImageUrl === 'function' ? window.driveImageUrl(item.link, 700) : '';
      const albums = typeof ALBUMS !== 'undefined' ? ALBUMS : [];
      const albumName = albums.find(a => a.id === item.albumId)?.nama || 'Gallery';
      return `<article class="swiper-slide gallery-featured-slide"><div class="gallery-featured-image ${image ? '' : 'is-fallback'}">${image ? `<img src="${image}" alt="${String(item.label || 'Hasil karya').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}" loading="lazy" onerror="this.remove();this.parentElement.classList.add('is-fallback')">` : ''}<span class="gallery-featured-fallback"><i data-lucide="image"></i></span></div><div class="gallery-featured-copy"><small>${escapeText(albumName)}</small><strong>${escapeText(item.label || 'Tanpa judul')}</strong></div></article>`;
    }).join('');
    if (!selected.length) return;
    gallerySwiper = new window.Swiper('#gallery-featured-swiper', {
      slidesPerView: 1.25, spaceBetween: 12, speed: 480, grabCursor: true,
      navigation: { nextEl: '#gallery-swiper-next', prevEl: '#gallery-swiper-prev' },
      breakpoints: { 520: { slidesPerView: 2.1, spaceBetween: 14 }, 900: { slidesPerView: 3.15, spaceBetween: 16 }, 1200: { slidesPerView: 4, spaceBetween: 18 } },
      a11y: { enabled: true }
    });
    refreshIcons();
  }

  function isoLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function mondayOf(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() - ((result.getDay()+6)%7));
    return result;
  }
  function rosterWeek(cycleLength, anchor, monday, anchorWeek = 1) {
    const anchorDate = new Date(`${anchor}T00:00:00`);
    const weeks = Math.floor((monday - anchorDate) / 604800000);
    return ((anchorWeek - 1 + weeks) % cycleLength + cycleLength) % cycleLength;
  }
  function renderDutyCalendar(schedule) {
    const node = document.getElementById('duty-calendar');
    if (!node) return;
    if (!window.FullCalendar) { node.innerHTML = '<p class="calendar-fallback">Kalender interaktif belum berhasil dimuat. Jadwal tetap bisa dilihat dan diubah melalui form di bawah.</p>'; return; }
    const p = palette();
    node.innerHTML = '';
    if (dutyCalendar) dutyCalendar.destroy();
    const eventSource = (fetchInfo, success) => {
      const events = [];
      let weekStart = mondayOf(fetchInfo.start);
      const hardEnd = new Date(fetchInfo.end.getFullYear(), fetchInfo.end.getMonth(), fetchInfo.end.getDate());
      while (weekStart < hardEnd) {
        const start = isoLocalDate(weekStart);
        const endDate = new Date(weekStart); endDate.setDate(endDate.getDate()+7);
        const end = isoLocalDate(endDate);
        const m = rosterWeek(4, schedule.mediaAnchorMonday, weekStart, 4);
        const h = m;
        const g = rosterWeek(3, schedule.managerialAnchorMonday, weekStart, 1);
        const media = schedule.media[m] || {names:[],pic:''};
        const humas = schedule.humas[h] || {names:[],pic:''};
        const managerial = schedule.managerial[g] || {names:[],pic:''};
        events.push({ title:`Media · MG ${m+1} · ${(media.names||[]).join(', ')}`, start, end, allDay:true, backgroundColor:p.blue, borderColor:p.blue, extendedProps:{team:'media'} });
        events.push({ title:`Humas · MG ${h+1} · ${(humas.names||[]).join(', ')}`, start, end, allDay:true, backgroundColor:p.teal, borderColor:p.teal, extendedProps:{team:'humas'} });
        events.push({ title:`Manajerial · MG ${g+1} · ${(managerial.names||[]).join(', ')}`, start, end, allDay:true, backgroundColor:p.gold, borderColor:p.gold, textColor:'#182330', extendedProps:{team:'managerial'} });
        weekStart = endDate;
      }
      success(events);
    };
    dutyCalendar = new window.FullCalendar.Calendar(node, {
      initialView: window.innerWidth < 700 ? 'listMonth' : 'dayGridMonth',
      height: 'auto', expandRows: true, firstDay: 1, locale: 'id',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' },
      buttonText: { today: 'Hari ini', month: 'Bulan', week: 'Minggu', list: 'Agenda' },
      events: eventSource, eventDisplay: 'block', displayEventTime: false,
      dayMaxEvents: 3, nowIndicator: true, stickyHeaderDates: true,
      eventDidMount(info) { info.el.title = info.event.title; },
      windowResize() { if (window.innerWidth < 640 && dutyCalendar.view.type === 'timeGridWeek') dutyCalendar.changeView('listMonth'); }
    });
    dutyCalendar.render();
  }

  function init() {
    refreshIcons();
    observeChatSurfaces();
    document.addEventListener('click', e => {
      if (e.target.closest('[data-nav],.chat-tab,.chat-list-item')) setTimeout(refreshIcons, 0);
    });
    // Repaint chart/calendar when the workspace switches light/dark mode.
    const themeObserver = new MutationObserver(() => {
      if (typeof PROJECTS !== 'undefined') renderProjectChart(PROJECTS);
      if (dutyCalendar && typeof DUTY_SCHEDULE !== 'undefined') renderDutyCalendar(DUTY_SCHEDULE);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme','data-skin'] });
  }

  window.BKUI = { refreshIcons, animatePage, confirm, prompt, renderProjectChart, mountDutySwiper, renderGallerySwiper, renderDutyCalendar, observeChatSurfaces };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
