/* mgviz report — boot */
(function boot() {
  if (!D.samples.length) { $('#view-overview').hidden = false; $('#view-overview').innerHTML = '<div class="empty">No samples found in this project.</div>'; return; }
  render();
})();
