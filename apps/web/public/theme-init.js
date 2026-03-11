(function () {
  var t = 'system';
  try {
    t = localStorage.getItem('theme') || 'system';
  } catch (e) {}
  var d =
    t === 'dark' ||
    (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (d) document.documentElement.classList.add('dark');
})();
