/* Gespeichertes Farbschema vor dem ersten Rendern anwenden (verhindert Aufblitzen). */
try { var t = localStorage.getItem('klarkontor.theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { /* ignore */ }
