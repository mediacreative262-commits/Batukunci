/* Batu Kunci motion enhancements · no dependency, progressive enhancement */
(function(){
  'use strict';
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = [
    '.view-hero','.view-overview','.view-section','.view-footer',
    '.labs-hero','.labs-discover','.labs-feature-grid','.weekly-duty-board',
    '.workspace-stats','.insight-panel','.page-head','.gallery-featured',
    '.calendar-workspace-card','.settings-section'
  ].join(',');
  function prepare(root){
    if(reduce || !('IntersectionObserver' in window)) return;
    const nodes = Array.from((root||document).querySelectorAll(targets));
    nodes.forEach((node,index)=>{
      if(node.dataset.bkMotionReady==='1') return;
      node.dataset.bkMotionReady='1';
      node.classList.add('bk-reveal');
      const direction = index%3===1?'right':(index%3===2?'left':'up');
      node.dataset.bkDirection=direction;
      node.style.setProperty('--bk-reveal-delay',`${Math.min(index%4,3)*65}ms`);
      observer.observe(node);
    });
  }
  const observer = !reduce && 'IntersectionObserver' in window ? new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      entry.target.classList.add('bk-visible');
      observer.unobserve(entry.target);
    });
  },{threshold:.12,rootMargin:'0px 0px -7% 0px'}) : null;
  function init(){
    if(!observer) return;
    prepare(document);
    // Dynamic panels and cards may be inserted after data arrives.
    const mo = new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType!==1) return;
      if(node.matches && node.matches(targets)) prepare(node.parentNode||document);
      else if(node.querySelector && node.querySelector(targets)) prepare(node);
    })));
    mo.observe(document.body,{childList:true,subtree:true});
    // Re-run reveal on newly selected workspace pages without animating every child.
    document.addEventListener('click',event=>{
      const trigger=event.target.closest('[data-nav],.page-home-btn,[onclick*="showView("]');
      if(!trigger) return;
      requestAnimationFrame(()=>prepare(document));
    },{passive:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
