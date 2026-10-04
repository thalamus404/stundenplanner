// Bekannt: ein Schreibzugriff beim Laden und ein resize-Hörer.
try { localStorage.setItem('pruef', '1'); } catch (e) { /* ohne Speicher */ }
addEventListener('resize', () => {});
