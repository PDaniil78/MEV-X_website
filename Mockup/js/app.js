(function(){
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var c = document.getElementById('chart');
  var ctx = c.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var w = c.clientWidth, h = 150;
  c.width = w*dpr; c.height = h*dpr;
  ctx.scale(dpr,dpr);

  var pts = [22,25,21,28,34,31,40,44,39,47,52,49,58,55,63,61,68,72,66,75,80,77,85,88];
  var max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
  var pad = 8;
  function x(i){ return pad + (i/(pts.length-1)) * (w-pad*2); }
  function y(v){ return pad + (1 - (v-min)/(max-min)) * (h-pad*2); }

  var styles = getComputedStyle(document.documentElement);
  var gridColor = styles.getPropertyValue('--grid').trim() || 'rgba(255,255,255,.08)';
  var dataColor = styles.getPropertyValue('--chart-line').trim() || 'rgba(255,255,255,.85)';

  function drawGrid(){
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for(var g=1; g<4; g++){
      var gy = pad + (g/4)*(h-pad*2);
      ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(w,gy); ctx.stroke();
    }
  }

  function drawFrame(progress){
    ctx.clearRect(0,0,w,h);
    drawGrid();
    var count = Math.max(2, Math.round(pts.length * progress));
    var visible = pts.slice(0, count);

    var grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0, 'rgba(255,255,255,.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.moveTo(x(0), h-pad);
    visible.forEach(function(v,i){ ctx.lineTo(x(i), y(v)); });
    ctx.lineTo(x(visible.length-1), h-pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    visible.forEach(function(v,i){ i===0 ? ctx.moveTo(x(i),y(v)) : ctx.lineTo(x(i),y(v)); });
    ctx.strokeStyle = dataColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    var lastI = visible.length-1;
    ctx.beginPath();
    ctx.arc(x(lastI), y(visible[lastI]), 3.2, 0, Math.PI*2);
    ctx.fillStyle = dataColor;
    ctx.fill();
  }

  if(reduceMotion){
    drawFrame(1);
  } else {
    var start = null, duration = 1100;
    function tick(ts){
      if(!start) start = ts;
      var p = Math.min(1, (ts-start)/duration);
      var eased = 1 - Math.pow(1-p, 3);
      drawFrame(eased);
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

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

  // Magnetic CTAs, desktop pointer only, subtle pull toward the cursor.
  if(!reduceMotion && window.matchMedia('(pointer: fine)').matches){
    document.querySelectorAll('.btn, .navcta').forEach(function(el){
      el.addEventListener('mousemove', function(e){
        var r = el.getBoundingClientRect();
        var relX = e.clientX - r.left - r.width/2;
        var relY = e.clientY - r.top - r.height/2;
        el.style.transform = 'translate(' + (relX*0.22).toFixed(1) + 'px,' + (relY*0.35).toFixed(1) + 'px)';
      });
      el.addEventListener('mouseleave', function(){ el.style.transform = ''; });
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
