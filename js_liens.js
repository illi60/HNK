/* ============================================================
   HINOKUNI - Liens RP (Presentation + Carnet de bord) -> kanji cliquables
   ------------------------------------------------------------
   2 facons de l'installer :

   A) RECOMMANDE (robuste, comme hnktheme.css) : heberger CE fichier sur
      GitHub (repo illi60/hnk) sous le nom js_liens.js, puis coller dans
      PA > Codes JS un NOUVEAU code "HINOKUNI Liens" (Toutes les pages,
      sans balise script, Active) contenant UNIQUEMENT ce loader :

      (function(){var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/gh/illi60/hnk@main/js_liens.js';
      s.async=true;document.head.appendChild(s);})();

   B) DIRECT : coller tout ce fichier dans le code "HINOKUNI Liens".
      /!\ Verifier que la DERNIERE ligne collee est bien  })();
          (un collage tronque casse tout le bundle JS du forum).

   Code autonome (IIFE) : ne touche NI js_feeds NI js_memberlist.
   ============================================================ */
(function () {

/* ---- Cache + file partagee des fiches profil /uN (anti-scraper FA : mutualise memberlist + liens, 1 seul fetch/profil, concurrence globale 2) ---- */
window.__hnkProfileHtml=window.__hnkProfileHtml||(function(){var mem=Object.create(null),q=[],active=0,MAX=2,TTL=15*60*1000;function sg(u){try{var r=JSON.parse(sessionStorage.getItem('hnk-pf-'+u)||'null');if(r&&(Date.now()-r._t)<TTL)return r.h;}catch(e){}return null;}function ss(u,h){try{sessionStorage.setItem('hnk-pf-'+u,JSON.stringify({_t:Date.now(),h:h}));}catch(e){}}function pump(){while(active<MAX&&q.length){active++;(q.shift())();}}function fr(u){return new Promise(function(res){q.push(function(){window.fetch(u,{credentials:'same-origin'}).then(function(r){return r.text();}).then(function(h){ss(u,h);active--;pump();res(h);},function(){active--;pump();res('');});});pump();});}return function(u){if(mem[u])return mem[u];var c=sg(u);var p=(c!=null)?Promise.resolve(c):fr(u);mem[u]=p;return p;};})();
  'use strict';

  var KJ = { pres: '紹', cb: '帳' };

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function fieldVal(v) {
    var u = v && v.querySelector ? v.querySelector('.field_uneditable') : null;
    return clean(u ? u.textContent : (v ? v.textContent : ''));
  }

  /* URL d'un champ texte : vide, chemin relatif, ou URL complete */
  function cbUrl(t) {
    t = clean(t).replace(/ /g, '');
    if (t.length < 3) return '';
    if (/^https?:\/\//i.test(t) || t.charAt(0) === '/') return t;
    if (/^www\./i.test(t) || /^[\w.-]+\.[a-z]{2,}/i.test(t)) return 'https://' + t;
    return '/' + t.replace(/^\/+/, '');
  }

  /* Extrait {pres,cb} d'une liste de .item ; retire les lignes traitees si remove=true */
  function extract(items, remove) {
    var links = {};
    Array.prototype.forEach.call(items, function (it) {
      var k = it.querySelector('.k'), v = it.querySelector('.v');
      if (!k || !v) return;
      var key = clean(k.textContent).toLowerCase().replace(/\s*:\s*$/, '');
      if (key.indexOf('présentation') > -1 || key.indexOf('presentation') > -1) {
        var u = cbUrl(fieldVal(v)); if (u) links.pres = u;
        if (remove && it.parentNode) it.parentNode.removeChild(it);
      } else if (key.indexOf('carnet de bord') > -1) {
        var u2 = cbUrl(fieldVal(v)); if (u2) links.cb = u2;
        if (remove && it.parentNode) it.parentNode.removeChild(it);
      }
    });
    return links;
  }

  /* Markup commun : <a> kanji + libelle (style via le conteneur) */
  function html(links) {
    var h = '';
    if (links.pres) h += '<a href="' + links.pres + '" target="_blank" rel="noopener" title="Présentation"><span class="kj">' + KJ.pres + '</span><span class="tx">Présentation</span></a>';
    if (links.cb) h += '<a href="' + links.cb + '" target="_blank" rel="noopener" title="Carnet de bord"><span class="kj">' + KJ.cb + '</span><span class="tx">Carnet de bord</span></a>';
    return h;
  }

  /* ---- PROFIL : liens en haut, a cote du pseudo (fetch de la fiche) ---- */
  function doProfile() {
    var card = document.querySelector('.hnk-profile-card');
    var main = document.querySelector('.hnk-main');
    if (!card || !main) return;
    var h2 = main.querySelector('h2');
    if (!h2 || (h2.parentNode && h2.parentNode.classList.contains('hnk-id-row'))) return;
    var url = location.pathname;
    if (!/^\/u\d+/.test(url)) return;
    window.__hnkProfileHtml(url).then(function (txt) {
      var doc = new DOMParser().parseFromString(txt, 'text/html');
      var info = doc.querySelector('.hnk-profile-info');
      var links = info ? extract(info.querySelectorAll('.item'), false) : {};
      if ((!links.pres && !links.cb) || (h2.parentNode && h2.parentNode.classList.contains('hnk-id-row'))) return;
      var nm = card.querySelector('.nm');
      var sc = nm && (nm.querySelector('[style*="color"]') || nm);
      var col = sc ? getComputedStyle(sc).color : '';
      var row = document.createElement('div');
      row.className = 'hnk-id-row';
      if (col) row.style.setProperty('--hnk-clan', col);
      h2.parentNode.insertBefore(row, h2);
      row.appendChild(h2);
      var lk = document.createElement('div');
      lk.className = 'hnk-links';
      lk.innerHTML = html(links);
      row.appendChild(lk);
    }).catch(function () {});
  }

  /* ---- SUJETS : en bas de l'avatar ---- */
  function doPosts() {
    Array.prototype.forEach.call(document.querySelectorAll('.hnk-post'), function (p) {
      var sf = p.querySelector('.hnk-side-fields');
      var av = p.querySelector('.hnk-post-av');
      if (!sf || !av || av.querySelector('.hnk-av-links')) return;
      var links = extract(sf.querySelectorAll('.item'), true);
      if (!links.pres && !links.cb) return;
      var box = document.createElement('div');
      box.className = 'hnk-av-links';
      box.innerHTML = html(links);
      av.appendChild(box);
    });
  }

  /* ---- MEMBRES : pied de carte (fetch /u{ID} + cache 6h + lazy) ---- */
  var TTL = 6 * 60 * 60 * 1000;
  function ck(id) { return 'hnk-lk-' + id + '-v1'; }
  function readC(id) {
    try {
      var o = JSON.parse(localStorage.getItem(ck(id)) || 'null');
      if (!o || !o._t || Date.now() - o._t > TTL) return null;
      return o;
    } catch (e) { return null; }
  }
  function writeC(id, d) {
    try { d._t = Date.now(); localStorage.setItem(ck(id), JSON.stringify(d)); } catch (e) {}
  }
  function uid(u) { var m = (u || '').match(/\/u(\d+)/); return m ? m[1] : null; }

  function fillCard(card, links) {
    var acts = card.querySelector('[data-hnk-acts]') || card.querySelector('.acts');
    if (!acts) return;
    var h = html(links);
    if (h) acts.innerHTML = h;
  }

  var queue = [], active = 0;
  function pump() {
    while (active < 3 && queue.length) {
      var job = queue.shift();
      active++;
      job().then(done, done);
    }
  }
  function done() { active--; pump(); }

  function fetchCard(card, url) {
    return window.__hnkProfileHtml(url).then(function (txt) {
      var doc = new DOMParser().parseFromString(txt, 'text/html');
      var info = doc.querySelector('.hnk-profile-info');
      var links = info ? extract(info.querySelectorAll('.item'), false) : {};
      var id = uid(url);
      if (id) writeC(id, links);
      fillCard(card, links);
    }).catch(function () {});
  }

  function doMembers() {
    var cards = document.querySelectorAll('.hnk-member[data-hnk-profile]');
    if (!cards.length) return;
    function enrich(card) {
      if (card.getAttribute('data-hnk-lk')) return;
      card.setAttribute('data-hnk-lk', '1');
      var url = card.getAttribute('data-hnk-profile');
      var id = uid(url);
      var c = id ? readC(id) : null;
      if (c) fillCard(card, c);
      if (!c) { queue.push(function () { return fetchCard(card, url); }); pump(); }
    }
    /* Plus d'IntersectionObserver - enrichissement immediat. */
    Array.prototype.forEach.call(cards, enrich);
  }

  function run() { doProfile(); doPosts(); doMembers(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
