(function(){
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count-up numbers: format with the element's own prefix/suffix/locale grouping.
  function formatCount(el, value){
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    return prefix + Math.round(value).toLocaleString('en-US') + suffix;
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

  // Hero entrance, staggered via each element's own transition-delay.
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      document.querySelectorAll('.hero-anim').forEach(function(el){ el.classList.add('in'); });
      document.querySelectorAll('.hero-anim [data-count]').forEach(function(el){ animateCount(el); });
    });
  });

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
