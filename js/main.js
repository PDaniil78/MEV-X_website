(function(){
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count-up numbers: format with the element's own prefix/suffix/locale grouping.
  // data-decimals (default 0) keeps whole-number counters unchanged while letting
  // counters like "$18.3M" or "x11.5" animate to a fixed number of decimal places.
  function formatCount(el, value){
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var fixed = value.toFixed(decimals);
    var parts = fixed.split('.');
    parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
    return prefix + parts.join('.') + suffix;
  }
  function animateCount(el){
    var target = parseFloat(el.getAttribute('data-count'));
    if(isNaN(target)) return;
    if(el._countRaf) cancelAnimationFrame(el._countRaf);
    if(reduceMotion){ el.textContent = formatCount(el, target); return; }
    var start = null, duration = 1300;
    function tick(ts){
      if(!start) start = ts;
      var p = Math.min(1, (ts-start)/duration);
      var eased = 1 - Math.pow(1-p, 3);
      el.textContent = formatCount(el, target*eased);
      if(p < 1){ el._countRaf = requestAnimationFrame(tick); }
      else { el._countRaf = null; }
    }
    el._countRaf = requestAnimationFrame(tick);
  }
  function resetCount(el){
    if(reduceMotion) return;
    if(el._countRaf) cancelAnimationFrame(el._countRaf);
    el.textContent = formatCount(el, 0);
  }

  // Scroll-triggered reveal for sections below the fold; replays each time a
  // section re-enters view, in either scroll direction.
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        entry.target.classList.toggle('in', entry.isIntersecting);
        var counters = entry.target.querySelectorAll('[data-count]');
        counters.forEach(entry.isIntersecting ? animateCount : resetCount);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('in'); });
    document.querySelectorAll('.reveal [data-count]').forEach(function(el){ el.textContent = formatCount(el, parseFloat(el.getAttribute('data-count'))); });
  }

  // Hover replay for the traction tiles: re-run the count-up (and, for the
  // growth card, the chart's line/area draw-in) each time the pointer enters,
  // regardless of scroll state. Chart elements get transition:none for the
  // instant they're reset to their start state, so the redraw never flashes
  // backwards before playing forwards again.
  if(!reduceMotion){
    document.querySelectorAll('.proof-item.reveal, .growth-card.reveal').forEach(function(card){
      card.addEventListener('mouseenter', function(){
        var counters = card.querySelectorAll('[data-count]');
        var chartEls = card.querySelectorAll('.growth-stroke, .growth-stroke-back, .growth-stroke-mid, .growth-area, .growth-dot');
        chartEls.forEach(function(el){ el.style.transition = 'none'; });
        card.classList.remove('in');
        counters.forEach(resetCount);
        void card.offsetWidth;
        chartEls.forEach(function(el){ el.style.transition = ''; });
        requestAnimationFrame(function(){
          card.classList.add('in');
          counters.forEach(animateCount);
        });
      });
    });
  }

  // Hero entrance, staggered via each element's own transition-delay.
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      document.querySelectorAll('.hero-anim').forEach(function(el){ el.classList.add('in'); });
      document.querySelectorAll('.hero-anim [data-count]').forEach(function(el){ animateCount(el); });
    });
  });

  // Partner logo rows: one line each, pannable by wheel/trackpad (native
  // overflow-x) or click-drag. The edge fade only appears on a side that
  // still has more to scroll to -- never over a logo already scrolled flush
  // to that edge -- so it's kept in sync with scroll position, not just
  // "does this row overflow at all".
  document.querySelectorAll('.partner-grid').forEach(function(grid){
    function syncFade(){
      var atStart = grid.scrollLeft <= 1;
      var atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 1;
      grid.style.setProperty('--fade-l', atStart ? '0px' : '28px');
      grid.style.setProperty('--fade-r', atEnd ? '0px' : '28px');
    }
    syncFade();
    grid.addEventListener('scroll', syncFade, { passive: true });
    window.addEventListener('resize', syncFade);
    window.addEventListener('load', syncFade);

    var dragging = false, startX = 0, startScroll = 0, moved = false;
    grid.addEventListener('pointerdown', function(e){
      // Touch/pen already get native scrolling on this overflow-x:auto row --
      // the click-drag affordance below is a mouse-only nicety. Engaging it
      // for touch fights the browser's own scroll+tap handling and is what
      // made partner logos feel unclickable on phones/tablets.
      if(e.pointerType !== 'mouse') return;
      // Starting the drag gesture from a logo link steals its click via
      // pointer capture on some browsers; let those clicks through
      // untouched instead of tracking a drag.
      if(e.target.closest('a')) return;
      dragging = true; moved = false;
      startX = e.clientX; startScroll = grid.scrollLeft;
      grid.classList.add('dragging');
      grid.setPointerCapture(e.pointerId);
    });
    grid.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dx = e.clientX - startX;
      if(Math.abs(dx) > 3) moved = true;
      grid.scrollLeft = startScroll - dx;
    });
    ['pointerup','pointercancel','pointerleave'].forEach(function(evt){
      grid.addEventListener(evt, function(){ dragging = false; grid.classList.remove('dragging'); });
    });
    // Suppress the click a drag ends on, so dragging never fires as a stray click.
    grid.addEventListener('click', function(e){ if(moved){ e.preventDefault(); moved = false; } }, true);
  });

  // RPC endpoints modal -- opened from the nav link and the RPC product card.
  var rpcModal = document.getElementById('rpc-modal');
  if(rpcModal){
    function openRpcModal(){
      rpcModal.hidden = false;
      requestAnimationFrame(function(){ rpcModal.classList.add('in'); });
      document.body.style.overflow = 'hidden';
    }
    function closeRpcModal(){
      rpcModal.classList.remove('in');
      document.body.style.overflow = '';
      setTimeout(function(){ rpcModal.hidden = true; }, reduceMotion ? 0 : 250);
    }
    document.querySelectorAll('.rpc-trigger').forEach(function(el){
      el.addEventListener('click', function(e){ e.preventDefault(); openRpcModal(); });
    });
    rpcModal.querySelector('.modal-close').addEventListener('click', closeRpcModal);
    rpcModal.addEventListener('click', function(e){ if(e.target === rpcModal) closeRpcModal(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !rpcModal.hidden) closeRpcModal(); });
    rpcModal.querySelectorAll('.rpc-copy').forEach(function(btn){
      btn.addEventListener('click', function(){
        var url = btn.getAttribute('data-url');
        var reset = function(){ btn.textContent = 'copy'; };
        var showCopied = function(){ btn.textContent = 'copied'; setTimeout(reset, 1400); };
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(url).then(showCopied, reset);
        } else {
          reset();
        }
      });
    });
  }

  // Sticky scroll-progress bar.
  var progressBar = document.getElementById('scroll-progress');
  var progressTicking = false;
  function updateProgress(){
    var doc = document.documentElement, body = document.body;
    var scrollTop = Math.max(doc.scrollTop, body.scrollTop);
    var scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
    var clientHeight = doc.clientHeight || window.innerHeight;
    var scrollable = scrollHeight - clientHeight;
    var pct = scrollable > 0 ? Math.min(1, scrollTop / scrollable) : 0;
    progressBar.style.transform = 'scaleX(' + pct + ')';
    progressTicking = false;
  }
  window.addEventListener('scroll', function(){
    if(!progressTicking){ requestAnimationFrame(updateProgress); progressTicking = true; }
  }, { passive: true });
  updateProgress();
})();

/* Mobile navigation.
   Under 760px the link row is a dropdown panel instead of an inline row -- see
   the .nav-toggle block in style.css. Everything here is a no-op on pages that
   predate the burger, or on desktop where the panel is never displayed. */
(function(){
  var nav = document.querySelector('nav');
  if(!nav) return;
  var toggle = nav.querySelector('.nav-toggle');
  var links = nav.querySelector('.navlinks');
  if(!toggle || !links) return;

  function setOpen(open){
    nav.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', function(e){
    e.stopPropagation();
    setOpen(!nav.classList.contains('nav-open'));
  });

  // Following a link, or jumping to an anchor on the same page, should not
  // leave the panel covering what you navigated to.
  links.addEventListener('click', function(e){
    if(e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', function(e){
    if(nav.classList.contains('nav-open') && !nav.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && nav.classList.contains('nav-open')){
      setOpen(false);
      toggle.focus();
    }
  });

  // Rotating a phone past the breakpoint would otherwise leave nav-open set,
  // which does nothing visible on desktop but leaves the burger mis-labelled.
  window.addEventListener('resize', function(){
    if(window.innerWidth > 760 && nav.classList.contains('nav-open')) setOpen(false);
  });
})();
