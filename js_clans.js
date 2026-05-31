/* ============================================================================
   HINOKUNI — REGISTRE DYNAMIQUE DES CLANS  (composant premium, autonome)
   ============================================================================
   PRINCIPE (cahier des charges)
   -----------------------------------------------------------------------------
   • UNE seule source de vérité : un sujet Forumactif dont le 1er message
     contient un bloc de données. L'admin n'ajoute/retire QUE des pseudos.
   • Tout le reste est généré automatiquement :
        - résolution pseudo -> profil (uid, avatar, couleur de groupe, lien)
        - construction des cartes
        - comptage des membres
        - statistiques globales (total clans, total membres, clan dominant,
          répartition visuelle)
   • Architecture "userData" : chaque membre porte un objet userData prévu pour
     accueillir TOUTES les données du profil (même celles inexploitées aujourd'hui)
     sans refonte future.
   • Rendu : slider horizontal moderne, cartes immersives, CSS 100% encapsulé
     (préfixe .hnkc-), aucun conflit avec le thème. Injecté juste au-dessus du
     footer sur la page d'accueil (ou dans #hnk-clans-root si présent).

   OÙ LE COLLER
   -----------------------------------------------------------------------------
   Ce fichier est hébergé sur GitHub (illi60/hnk) puis chargé via le loader
   jsDelivr (voir js_clans_LOADER.txt). Aucune balise <script> ici.

   LA SEULE CHOSE À CONFIGURER : HNKC_CONFIG.TOPIC_ID ci-dessous.
   ============================================================================ */
(function () {
  'use strict';

  /* =========================================================================
     1. CONFIGURATION  — la seule zone à éditer
     ========================================================================= */
  var CONFIG = {
    /* >>> ID du sujet servant de base de données (ex: /t42-... -> 42) <<< */
    TOPIC_ID: 1,

    /* Où injecter le composant.
       - Si un élément #hnk-clans-root existe (ex: posé dans overall_footer_begin
         juste avant <footer class="hnk-footer">), il est utilisé en priorité.
       - Sinon, sur la page d'accueil uniquement, le composant est inséré
         automatiquement juste avant le footer. */
    ANCHOR_SELECTOR: '#hnk-clans-root',
    FOOTER_SELECTOR: '.hnk-footer',
    INDEX_ONLY: true,            // n'auto-injecte que sur l'accueil
    TITLE: 'Registre des Clans',

    /* Enrichissement profond : un fetch /u{id} supplémentaire par membre pour
       récupérer rang / image de fond / champs profil. Coûteux -> OFF par défaut.
       L'architecture userData reste prête à les recevoir quoi qu'il arrive. */
    DEEP_ENRICH: false,

    CACHE_TTL: 12 * 60 * 60 * 1000,   // 12 h
    MEMBER_TTL: 24 * 60 * 60 * 1000,  // 24 h (résolution pseudo -> profil)
    MAX_PARALLEL: 5,                  // requêtes simultanées (anti-rafale serveur)
    MAX_AVATARS: 5,                   // avatars visibles par carte
    EAGER: true,                      // true = tout charge tout de suite (pas de lazy au scroll)
    VERSION: 'v1'
  };
  /* Permet de surcharger TOPIC_ID depuis l'extérieur :
     window.HNKC_CONFIG = { TOPIC_ID: 42 };  (placé avant le loader) */
  if (window.HNKC_CONFIG) {
    for (var k in window.HNKC_CONFIG) {
      if (Object.prototype.hasOwnProperty.call(window.HNKC_CONFIG, k)) CONFIG[k] = window.HNKC_CONFIG[k];
    }
  }

  /* =========================================================================
     2. BIBLIOTHÈQUE D'EMBLÈMES (SVG currentColor) + métadonnées par défaut
        Réutilise les blasons du thème. Extensible : ajouter une entrée suffit.
     ========================================================================= */
  var CRESTS = {
    uchiha:   '<svg viewBox="0 0 64 64" fill="none"><path d="M27.5 41 L36.5 41 L34.8 60 L29.2 60 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter"/><circle cx="32" cy="26" r="18" fill="none" stroke="currentColor" stroke-width="3"/><path d="M 14.4 26 A 18 18 0 0 1 49.6 26 Q 32 36.5 14.4 26 Z" fill="currentColor"/></svg>',
    hyuga:    '<svg viewBox="0 0 64 64" fill="none"><path d="M 6 14 C 8 8, 14 8, 14 14 L 32 52 L 50 14 C 50 8, 56 8, 58 14" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M 32 16 C 28 22, 24 28, 28 34 C 30 38, 36 38, 36 32 C 36 28, 32 27, 31 30 C 30.3 32, 33 33, 33 31" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    sarutobi: '<svg viewBox="0 0 64 64" fill="none"><line x1="32" y1="14" x2="32" y2="58" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="32" cy="11" r="3.6" fill="none" stroke="currentColor" stroke-width="3"/><path d="M 32 28 C 26 28, 20 30, 16 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="13" cy="42" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M 32 28 C 38 28, 44 30, 48 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="51" cy="42" r="5" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
    senju:    '<svg viewBox="0 0 96 44" fill="none"><path d="M 48 12 L 48 32 M 42 22 L 54 22" stroke="currentColor" stroke-width="3.2" stroke-linecap="square"/><path d="M 38 22 A 7 7 0 1 0 31 29 L 38 29" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M 2 22 Q 14 17 22 21 Q 24 22 22 23 Q 14 27 2 22 Z" fill="currentColor"/><path d="M 58 22 A 7 7 0 1 1 65 29 L 58 29" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M 94 22 Q 82 17 74 21 Q 72 22 74 23 Q 82 27 94 22 Z" fill="currentColor"/></svg>',
    uzumaki:  '<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 14 A 18 18 0 1 1 14 32 A 14 14 0 1 1 42 32 A 10 10 0 1 1 22 32 A 6 6 0 1 1 34 32" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="square"/></svg>',
    /* blason générique (clan inconnu) : tomoe stylisé */
    /* clan MINEUR : croissant (lune pas encore pleine) -> clan en devenir,
       qui recevra son propre blason une fois promu au rang majeur. */
    _minor:   '<svg viewBox="0 0 64 64" fill="none"><path d="M 39 7 A 26 26 0 1 0 39 57 A 21 21 0 1 1 39 7 Z" fill="currentColor"/><circle cx="49" cy="19" r="2.6" fill="currentColor"/></svg>',
    _default: '<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 18 a14 14 0 1 1 -12 7 a8 8 0 1 0 12 -7 Z" fill="currentColor"/></svg>'
  };

  /* Couleurs & kanji par défaut (surchargeable via le sujet). */
  var CLAN_DEFAULTS = {
    uchiha:   { color: '#C0392B', kanji: '火' },
    hyuga:    { color: '#8E7CC3', kanji: '白' },
    senju:    { color: '#3Fa34D', kanji: '木' },
    uzumaki:  { color: '#E67E22', kanji: '渦' },
    sarutobi: { color: '#C99B3A', kanji: '猿' }
  };
  var EMBER = '#FF5722';
  /* Palette d'affichage : chaque clan SANS couleur définie ni défaut connu
     reçoit une teinte distincte et stylée (couleur de CLAN, indépendante des
     couleurs de groupe). Cyclée par ordre d'apparition. */
  var PALETTE = ['#FF5722','#36B5C9','#9B59B6','#E0B341','#2ECC71','#E74C3C','#5D7CF5','#FF7AA8','#16A085','#D35400','#7F8CFF','#B5C92E'];

  /* =========================================================================
     3. UTILITAIRES
     ========================================================================= */
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function el(tag, cls, html){ var n=document.createElement(tag); if(cls)n.className=cls; if(html!=null)n.innerHTML=html; return n; }
  function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function clean(s){ return (s||'').replace(/ /g,' ').replace(/\s+/g,' ').trim(); }
  /* slug accent-insensible, sans le mot "clan" ni espaces : "Hyûga" -> "hyuga" */
  function slug(s){
    return (s||'').toString().toLowerCase()
      .normalize ? (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/clan/g,'').replace(/[^a-z0-9]/g,'')
                 : (s||'').toString().toLowerCase().replace(/clan/g,'').replace(/[^a-z0-9]/g,'');
  }
  function uidFromUrl(url){ var m=(url||'').match(/\/u(\d+)/); return m?m[1]:null; }
  function readColorFrom(node){
    if(!node) return '';
    var c = node.matches && node.matches('[style*="color"]') ? node : (node.querySelector ? node.querySelector('[style*="color"]') : null);
    c = c || node;
    var col = (c.style && c.style.color) ? c.style.color : '';
    if(!col){ var a=(c.getAttribute && c.getAttribute('style'))||''; var m=a.match(/color\s*:\s*([^;]+)/i); if(m)col=clean(m[1]); }
    return col;
  }

  /* ---- cache localStorage versionné + TTL ---- */
  var Cache = {
    key: function(name){ return 'hnkc-'+CONFIG.VERSION+'-'+name; },
    get: function(name, ttl){
      try{
        var raw=localStorage.getItem(this.key(name)); if(!raw)return null;
        var o=JSON.parse(raw); if(!o||!o._t)return null;
        o._stale = (Date.now()-o._t > (ttl||CONFIG.CACHE_TTL));
        return o;
      }catch(e){ return null; }
    },
    set: function(name, data){
      try{ data._t=Date.now(); localStorage.setItem(this.key(name), JSON.stringify(data)); }catch(e){}
    }
  };

  /* ---- file de fetch limitée (anti-rafale) ---- */
  var Net = {
    q: [], active: 0,
    fetch: function(url){
      var self=this;
      return new Promise(function(resolve){
        self.q.push(function(){
          return fetch(url, {credentials:'same-origin', cache:'no-store', redirect:'follow'})
            .then(function(r){ return r.text(); })
            .then(function(t){ resolve(t); }, function(){ resolve(''); });
        });
        self.pump();
      });
    },
    pump: function(){
      var self=this;
      while(self.active < CONFIG.MAX_PARALLEL && self.q.length){
        var job=self.q.shift(); self.active++;
        job().then(function(){ self.active--; self.pump(); }, function(){ self.active--; self.pump(); });
      }
    }
  };
  function parseHTML(t){ return new DOMParser().parseFromString(t||'', 'text/html'); }

  /* =========================================================================
     4. PARSING DU SUJET-BASE DE DONNÉES
        Format attendu (dans un bloc [code] du 1er message — voir doc) :

           [Uchiha]
           type = Majeur
           couleur = #C0392B
           embleme = uchiha
           kanji = 火
           desc = Détenteurs du Sharingan.
           Madara
           Itachi
           Shisui

           [Hyûga]
           type = Majeur
           Hinata
           Neji

        Règles : [Nom] = nouveau clan · "clé = valeur" = métadonnée ·
        toute autre ligne non vide = un pseudo. Lignes vides ignorées.
     ========================================================================= */
  var META_KEYS = { type:1, couleur:1, color:1, embleme:1, emblem:1, kanji:1, desc:1, description:1, slug:1 };

  /* lit le texte d'un noeud en convertissant <br> et blocs en vrais sauts de
     ligne. INDISPENSABLE : dans un document fetch+DOMParser (non rendu),
     innerText ne restitue pas les retours ligne -> on normalise à la main. */
  function nodeText(node){
    if(!node) return '';
    var od = node.ownerDocument || document;
    var c = node.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('br'), function(br){
      if(br.parentNode) br.parentNode.replaceChild(od.createTextNode('\n'), br);
    });
    Array.prototype.forEach.call(c.querySelectorAll('p,div,li,dd,tr'), function(b){
      b.appendChild(od.createTextNode('\n'));
    });
    return c.textContent || '';
  }

  function extractDataText(doc){
    /* 1) priorité : premier bloc de code du 1er message */
    var code = doc.querySelector('.hnk-post-content dl.codebox dd, .hnk-post-content .codebox dd, dl.codebox dd, .codebox dd, .codebox code, pre, code.codebox, .code');
    if(code && clean(code.textContent).length > 4) return nodeText(code);
    /* 2) fallback : corps du 1er message (conteneur réel du thème) */
    var post = doc.querySelector('.hnk-post-content, .post .content, .postbody .content, .post-entry, .entry-content, .postbody, .hnk-post .content, .post');
    return nodeText(post);
  }

  function parseClans(text){
    var lines = (text||'').replace(/\r/g,'').split('\n');
    var clans = [], cur = null;
    for(var i=0;i<lines.length;i++){
      var raw = lines[i];
      var line = clean(raw);
      if(!line) continue;
      if(line.charAt(0)===';' || line.indexOf('//')===0) continue; // commentaire

      var mHead = line.match(/^\[\s*(.+?)\s*\]$/);                 // [Nom de clan]
      if(mHead){
        cur = newClan(mHead[1]);
        clans.push(cur);
        continue;
      }
      var mMeta = line.match(/^([A-Za-zéè]+)\s*[:=]\s*(.+)$/);     // clé = valeur
      if(mMeta && META_KEYS[ mMeta[1].toLowerCase() ] && cur){
        applyMeta(cur, mMeta[1].toLowerCase(), clean(mMeta[2]));
        continue;
      }
      if(cur){                                                     // sinon : pseudo
        var pseudo = line.replace(/^[-*•·]\s*/,'');                // tolère puces
        if(pseudo) cur.members.push(newMember(pseudo));
      }
    }
    /* finalise : couleur de CLAN distincte + kanji/emblème/type par défaut */
    clans.forEach(function(c,i){ c.color = clanColor(c, i); finalizeClan(c); });
    return clans.filter(function(c){ return c.members.length || c.keepEmpty; });
  }

  /* couleur de CLAN garantie & distincte (indépendante de la couleur de groupe) */
  function clanColor(c, i){
    if(c.color) return c.color;
    var d = CLAN_DEFAULTS[c.slug] || CLAN_DEFAULTS[c.emblem];
    return d ? d.color : PALETTE[i % PALETTE.length];
  }

  function newClan(name){
    var s = slug(name);
    return { name: clean(name), slug: s, type:'', color:'', emblem:'', kanji:'', desc:'', members:[], keepEmpty:false };
  }
  function applyMeta(clan, key, val){
    if(key==='type') clan.type=val;
    else if(key==='couleur'||key==='color') clan.color=val;
    else if(key==='embleme'||key==='emblem') clan.emblem=slug(val);
    else if(key==='kanji') clan.kanji=val;
    else if(key==='desc'||key==='description') clan.desc=val;
    else if(key==='slug') clan.slug=slug(val);
    clan.keepEmpty = true; // un clan explicitement décrit reste affiché même vide
  }
  function finalizeClan(c){
    var d = CLAN_DEFAULTS[c.slug] || CLAN_DEFAULTS[c.emblem] || {};
    if(!c.color)  c.color  = EMBER;
    if(!c.kanji)  c.kanji  = d.kanji || '';
    if(!c.emblem) c.emblem = CRESTS[c.slug] ? c.slug : (/mineur|minor/i.test(c.type) ? '_minor' : '_default');
    if(!c.type)   c.type   = 'Clan';
  }
  function crestSvg(name){ return CRESTS[name] || CRESTS[slug(name)] || CRESTS._default; }

  /* =========================================================================
     5. RÉSOLUTION PSEUDO -> PROFIL  (memberlist) + architecture userData
        Chaque membre reçoit un userData extensible : tout y est prévu, même
        les champs non exploités aujourd'hui (posts, rang, champs profil…).
     ========================================================================= */
  function newMember(pseudo){
    return {
      pseudo: clean(pseudo),
      resolved: false,
      userData: {            /* <- contrat de données stable et extensible */
        id: null,
        profileUrl: null,
        avatar: null,
        groupColor: null,
        rank: null,          // rempli si DEEP_ENRICH
        clan: null,
        bg: null,            // image de fond profil (DEEP_ENRICH)
        posts: null,         // réservés au futur
        joined: null,
        lastVisit: null,
        online: null,
        fields: {}           // champs de profil arbitraires (futur-proof)
      }
    };
  }

  /* mémo en RAM pour éviter de re-résoudre le même pseudo dans une page */
  var memberMemo = {};

  function resolveMember(m){
    var pkey = m.pseudo.toLowerCase();
    if(memberMemo[pkey]) { Object.assign(m.userData, memberMemo[pkey]); m.resolved=true; return Promise.resolve(m); }

    var cache = Cache.get('member-'+pkey, CONFIG.MEMBER_TTL);
    if(cache){ Object.assign(m.userData, cache.data); m.resolved=true; memberMemo[pkey]=cache.data;
      if(!cache._stale) return Promise.resolve(m); /* sinon refresh silencieux ci-dessous */ }

    var url = '/memberlist?username=' + encodeURIComponent(m.pseudo);
    return Net.fetch(url).then(function(html){
      if(html){
        var data = pickMemberFromList(parseHTML(html), m.pseudo);
        if(data){
          Object.assign(m.userData, data);
          m.resolved = true;
          memberMemo[pkey] = data;
          Cache.set('member-'+pkey, { data: data });
        }
      }
      return CONFIG.DEEP_ENRICH && m.userData.profileUrl ? deepEnrich(m) : m;
    });
  }

  /* sélectionne la carte memberlist dont le pseudo correspond exactement */
  function pickMemberFromList(doc, pseudo){
    var want = slug(pseudo), exact=null, first=null;
    var cards = doc.querySelectorAll('.hnk-member[data-hnk-profile], .hnk-member, li.row, .memberlist tr');
    for(var i=0;i<cards.length;i++){
      var c=cards[i];
      var nm = c.querySelector('.nm, .username, a[href*="/u"]');
      if(!nm) continue;
      var name = clean(nm.textContent);
      if(!name) continue;
      var link = c.getAttribute('data-hnk-profile') || '';
      if(!link){ var a=c.querySelector('a[href*="/u"]'); link=a?a.getAttribute('href'):''; }
      var img = c.querySelector('.av img, img.avatar, img[src*="avatar"]');
      var rec = {
        id: uidFromUrl(link),
        profileUrl: link || (uidFromUrl(link)?('/u'+uidFromUrl(link)):null),
        avatar: img ? (img.getAttribute('src')||null) : null,
        groupColor: readColorFrom(nm) || null
      };
      if(!first) first = rec;
      if(slug(name) === want){ exact = rec; break; }
    }
    return exact || first;
  }

  /* enrichissement profond optionnel : rang / image de fond / champs (/u{id}) */
  function deepEnrich(m){
    return Net.fetch(m.userData.profileUrl).then(function(html){
      if(!html) return m;
      var d = parseHTML(html);
      var info = d.querySelector('.hnk-profile-info');
      if(info) Array.prototype.forEach.call(info.querySelectorAll('.item'), function(it){
        var key=it.querySelector('.k'), val=it.querySelector('.v'); if(!key||!val) return;
        var kk = clean(key.textContent).replace(/\s*:\s*$/,'').toLowerCase();
        var vv = clean((val.querySelector('.field_uneditable')||val).textContent);
        if(kk==='clan') m.userData.clan=vv;
        else if(kk==='rang'||kk==='rank') m.userData.rank=vv;
        else if(kk.indexOf('image de fond')>-1){ var im=val.querySelector('img'); if(im)m.userData.bg=im.getAttribute('src'); }
        else m.userData.fields[kk]=vv;
      });
      var pkey=m.pseudo.toLowerCase();
      memberMemo[pkey]=m.userData; Cache.set('member-'+pkey, { data:m.userData });
      return m;
    });
  }

  /* =========================================================================
     6. STATISTIQUES GLOBALES
     ========================================================================= */
  function computeStats(clans){
    var totalMembers=0, top=null;
    clans.forEach(function(c){
      totalMembers += c.members.length;
      if(!top || c.members.length > top.members.length) top=c;
    });
    return { clans: clans.length, members: totalMembers, top: top };
  }

  /* =========================================================================
     7. RENDU — CSS encapsulé + DOM (stats + slider + cartes)
     ========================================================================= */
  function injectCSS(){
    if(document.getElementById('hnkc-style')) return;
    var s=el('style'); s.id='hnkc-style'; s.type='text/css'; s.textContent=CSS; document.head.appendChild(s);
  }

  function memberChip(m){
    var u=m.userData;
    var a=el('a','hnkc-mem'); a.href=u.profileUrl||'javascript:void(0)'; a.title=m.pseudo;
    if(!u.profileUrl) a.setAttribute('data-pending','1');
    if(u.groupColor) a.style.setProperty('--c', u.groupColor);
    var av=el('span','hnkc-mem-av');
    if(u.avatar){
      var img=document.createElement('img'); img.loading='lazy'; img.alt=m.pseudo; img.src=u.avatar; av.appendChild(img);
    }else{
      av.classList.add('is-fallback');
      av.appendChild(el('span','hnkc-ini', esc((m.pseudo||'?').charAt(0).toUpperCase())));
    }
    a.appendChild(av);
    a.appendChild(el('span','hnkc-mem-nm', esc(m.pseudo)));
    return a;
  }

  function buildCard(clan, maxMembers){
    var card=el('article','hnkc-card');
    card.style.setProperty('--clan', clan.color);
    card.setAttribute('data-type', slug(clan.type));

    card.appendChild(el('span','hnkc-crest', crestSvg(clan.emblem)));
    if(clan.kanji) card.appendChild(el('span','hnkc-ghost', esc(clan.kanji)));

    var top=el('div','hnkc-card-top');
    top.appendChild(el('span','hnkc-type', esc(clan.type)));
    top.appendChild(el('span','hnkc-count', '<b>'+clan.members.length+'</b> '+(clan.members.length>1?'membres':'membre')));
    card.appendChild(top);

    var body=el('div','hnkc-card-body');
    body.appendChild(el('h3','hnkc-name', esc(clan.name)));
    if(clan.desc) body.appendChild(el('p','hnkc-desc', esc(clan.desc)));
    card.appendChild(body);

    /* aperçu membres : avatars empilés + reste */
    var roster=el('div','hnkc-roster');
    var avas=el('div','hnkc-mems');
    var shown=clan.members.slice(0, CONFIG.MAX_AVATARS);
    shown.forEach(function(m){ avas.appendChild(memberChip(m)); });
    var rest=clan.members.length - shown.length;
    if(rest>0) avas.appendChild(el('span','hnkc-more','+'+rest+' autre'+(rest>1?'s':'')));
    roster.appendChild(avas);
    card.appendChild(roster);

    /* barre de population relative au clan le plus peuplé */
    var pct = maxMembers ? Math.round(clan.members.length/maxMembers*100) : 0;
    var bar=el('div','hnkc-bar'); var fill=el('i'); fill.style.width=Math.max(pct,6)+'%'; bar.appendChild(fill);
    card.appendChild(bar);

    /* lazy : remplit les avatars manquants quand la carte entre dans le viewport */
    card._clan=clan; card._avas=avas; card._shown=shown;
    return card;
  }

  function buildDistribution(clans, total){
    var wrap=el('div','hnkc-distrib');
    clans.slice().sort(function(a,b){return b.members.length-a.members.length;}).forEach(function(c){
      if(!c.members.length) return;
      var seg=el('span','hnkc-seg');
      seg.style.width=(total? (c.members.length/total*100):0)+'%';
      seg.style.background=c.color;
      seg.title=c.name+' — '+c.members.length;
      wrap.appendChild(seg);
    });
    return wrap;
  }

  /* graphique d'effectifs : barres horizontales triées, ligne de moyenne,
     badge sur/sous-représentation par rapport à la moyenne. */
  function buildChart(clans, stats){
    var sorted = clans.slice().sort(function(a,b){ return b.members.length-a.members.length; });
    var max = stats.top ? stats.top.members.length : 0;
    var avg = stats.clans ? stats.members/stats.clans : 0;
    var avgPct = max ? (avg/max*100) : 0;

    var chart=el('div','hnkc-chart');
    var head=el('div','hnkc-chart-head');
    head.appendChild(el('span','hnkc-chart-t','Effectifs par clan'));
    head.appendChild(el('span','hnkc-chart-avg','Moyenne <b>'+(Math.round(avg*10)/10)+'</b> / clan'));
    chart.appendChild(head);

    var rows=el('div','hnkc-chart-rows');
    rows.style.setProperty('--avgf', (max ? avg/max : 0));   // fraction unitless 0..1
    sorted.forEach(function(c){
      var n=c.members.length;
      var pct = max ? Math.round(n/max*100) : 0;
      var delta = avg ? Math.round((n-avg)/avg*100) : 0;   // +/- % vs moyenne
      var sign = delta>0?'over':(delta<0?'under':'even');
      var row=el('div','hnkc-crow'); row.style.setProperty('--clan', c.color);
      var nm=el('span','hnkc-crow-name');
    var cc=el('span','hnkc-crow-crest', crestSvg(c.emblem));
    nm.appendChild(cc);
    nm.appendChild(el('span','hnkc-crow-label', esc(c.name)));
    row.appendChild(nm);
      var track=el('span','hnkc-crow-track');
      var fill=el('i','hnkc-crow-fill'); fill.style.width=Math.max(pct,3)+'%'; track.appendChild(fill);
      var val=el('b','hnkc-crow-val', String(n)); track.appendChild(val);
      row.appendChild(track);
      var arrow = delta>0?'▲':(delta<0?'▼':'■');
      row.appendChild(el('span','hnkc-crow-delta is-'+sign, arrow+' '+(delta>0?'+':'')+delta+'%'));
      rows.appendChild(row);
    });
    chart.appendChild(rows);
    var leg=el('div','hnkc-chart-leg');
    leg.innerHTML='<span class="is-over">▲ sur-représenté</span><span class="is-under">▼ sous-représenté</span><span class="is-avgline">┊ moyenne</span>';
    chart.appendChild(leg);
    return chart;
  }

  function render(root, clans, stats){
    injectCSS();
    var max = stats.top ? stats.top.members.length : 0;

    var sec=el('section','hnkc'); sec.setAttribute('data-hnkc','');
    var wrap=el('div','hnkc-wrap');

    /* --- en-tête + stats globales --- */
    var head=el('header','hnkc-head');
    head.appendChild(el('h2','hnkc-title', '<span class="hnkc-title-jp">氏族</span><span>'+esc(CONFIG.TITLE)+'</span>'));
    head.appendChild(el('p','hnkc-sub','La répartition des shinobi entre les grandes lignées du pays.'));

    var st=el('div','hnkc-stats');
    st.appendChild(statBox(stats.clans, 'Clans'));
    st.appendChild(statBox(stats.members, stats.members>1?'Shinobi recensés':'Shinobi recensé'));
    st.appendChild(statBox(stats.top?stats.top.name:'—', 'Clan dominant', true));
    head.appendChild(st);
    head.appendChild(buildDistribution(clans, stats.members));
    head.appendChild(buildChart(clans, stats));
    wrap.appendChild(head);

    /* --- slider --- */
    var slider=el('div','hnkc-slider');
    var prev=el('button','hnkc-nav hnkc-prev'); prev.type='button'; prev.setAttribute('aria-label','Précédent'); prev.innerHTML='&#8249;';
    var next=el('button','hnkc-nav hnkc-next'); next.type='button'; next.setAttribute('aria-label','Suivant'); next.innerHTML='&#8250;';
    var track=el('div','hnkc-track');
    var cards=[];
    clans.forEach(function(c){ var card=buildCard(c, max); track.appendChild(card); cards.push(card); });
    slider.appendChild(prev); slider.appendChild(track); slider.appendChild(next);
    wrap.appendChild(slider);

    /* --- pagination points --- */
    var dots=el('div','hnkc-dots');
    wrap.appendChild(dots);

    sec.appendChild(el('div','hnkc-side left','<span class="lbl">Registre des clans</span><span class="jp">氏族</span>'));
    sec.appendChild(el('div','hnkc-side right','<span class="jp">氏族</span><span class="lbl">Registre des clans</span>'));
    sec.appendChild(wrap);
    root.innerHTML=''; root.appendChild(sec);

    wireSlider(track, prev, next, dots, cards);
    observeCards(cards);
    return sec;
  }

  function statBox(value, label, small){
    var b=el('div','hnkc-stat'+(small?' is-text':''));
    b.appendChild(el('b', null, esc(String(value))));
    b.appendChild(el('span', null, esc(label)));
    return b;
  }

  /* squelette de chargement */
  function renderSkeleton(root){
    injectCSS();
    var sec=el('section','hnkc is-loading'); sec.setAttribute('data-hnkc','');
    var wrap=el('div','hnkc-wrap');
    wrap.appendChild(el('header','hnkc-head','<h2 class="hnkc-title"><span class="hnkc-title-jp">氏族</span><span>'+esc(CONFIG.TITLE)+'</span></h2>'));
    var slider=el('div','hnkc-slider'); var track=el('div','hnkc-track');
    for(var i=0;i<4;i++) track.appendChild(el('article','hnkc-card hnkc-skel'));
    slider.appendChild(track); wrap.appendChild(slider); sec.appendChild(wrap);
    root.innerHTML=''; root.appendChild(sec);
  }

  /* =========================================================================
     8. SLIDER — flèches, molette, drag, clavier, snap, points
     ========================================================================= */
  function wireSlider(track, prev, next, dots, cards){
    function step(){ var c=track.querySelector('.hnkc-card'); return c ? c.offsetWidth + 18 : 320; }
    function update(){
      var max = track.scrollWidth - track.clientWidth - 2;
      prev.classList.toggle('is-off', track.scrollLeft <= 2);
      next.classList.toggle('is-off', track.scrollLeft >= max);
      var idx = Math.round(track.scrollLeft / step());
      Array.prototype.forEach.call(dots.children, function(d,i){ d.classList.toggle('on', i===idx); });
    }
    prev.addEventListener('click', function(){ track.scrollBy({left:-step()*1.2, behavior:'smooth'}); });
    next.addEventListener('click', function(){ track.scrollBy({left: step()*1.2, behavior:'smooth'}); });

    /* molette verticale -> défilement horizontal */
    track.addEventListener('wheel', function(e){
      if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){ track.scrollLeft += e.deltaY; e.preventDefault(); }
    }, {passive:false});

    /* drag souris/tactile */
    var down=false, sx=0, sl=0, moved=false;
    track.addEventListener('pointerdown', function(e){ down=true; moved=false; sx=e.clientX; sl=track.scrollLeft; track.classList.add('is-drag'); });
    window.addEventListener('pointermove', function(e){ if(!down)return; var dx=e.clientX-sx; if(Math.abs(dx)>4)moved=true; track.scrollLeft=sl-dx; });
    window.addEventListener('pointerup', function(){ down=false; track.classList.remove('is-drag'); });
    track.addEventListener('click', function(e){ if(moved){ e.preventDefault(); e.stopPropagation(); } }, true);

    /* clavier */
    track.setAttribute('tabindex','0');
    track.addEventListener('keydown', function(e){
      if(e.key==='ArrowRight'){ track.scrollBy({left:step(),behavior:'smooth'}); e.preventDefault(); }
      if(e.key==='ArrowLeft'){ track.scrollBy({left:-step(),behavior:'smooth'}); e.preventDefault(); }
    });

    /* points (un par carte) */
    cards.forEach(function(c,i){
      var d=el('button','hnkc-dot'); d.type='button'; d.setAttribute('aria-label','Clan '+(i+1));
      d.addEventListener('click', function(){ track.scrollTo({left: i*step(), behavior:'smooth'}); });
      dots.appendChild(d);
    });

    track.addEventListener('scroll', function(){ window.requestAnimationFrame(update); });
    window.addEventListener('resize', update);
    update();
  }

  /* apparition des cartes + résolution lazy des avatars manquants */
  function observeCards(cards){
    function fill(card){
      var clan=card._clan; if(!clan || card._filled) return; card._filled=true;
      clan.members.forEach(function(m){
        resolveMember(m).then(function(){
          /* met à jour les avatars déjà affichés (src réel quand dispo) */
          if(card._shown.indexOf(m) > -1){
            var i=card._shown.indexOf(m);
            var node=card._avas.children[i];          // le <a.hnkc-mem>
            if(node){
              if(m.userData.profileUrl){ node.href=m.userData.profileUrl; node.removeAttribute('data-pending'); }
              if(m.userData.groupColor) node.style.setProperty('--c', m.userData.groupColor);
              var av=node.querySelector ? node.querySelector('.hnkc-mem-av') : null;
              if(av && m.userData.avatar && av.classList.contains('is-fallback')){
                av.classList.remove('is-fallback'); av.innerHTML='';
                var im=document.createElement('img'); im.loading='lazy'; im.alt=m.pseudo; im.src=m.userData.avatar; av.appendChild(im);
              }
            }
          }
        });
      });
    }
    /* EAGER (défaut) : on résout TOUTES les cartes tout de suite (via la file
       de N requêtes max), avec un léger décalage de fondu. LAZY (EAGER:false) :
       on attend que la carte entre dans le viewport (IntersectionObserver). */
    if(CONFIG.EAGER || !('IntersectionObserver' in window)){
      cards.forEach(function(c,i){ setTimeout(function(){ c.classList.add('is-in'); }, i*60); fill(c); });
    }else{
      var io=new IntersectionObserver(function(ents){
        ents.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('is-in'); fill(en.target); io.unobserve(en.target); } });
      }, {rootMargin:'120px'});
      cards.forEach(function(c){ io.observe(c); });
    }
  }

  /* =========================================================================
     9. ORCHESTRATION
     ========================================================================= */
  function findRoot(){
    /* INDEX_ONLY gate d'abord : l'ancre choisit seulement OÙ s'affiche le
       composant, pas SUR QUELLE page. Ainsi l'ancre peut vivre dans le footer
       global tout en n'affichant le registre que sur l'accueil. */
    if(CONFIG.INDEX_ONLY && !isIndex()) return null;
    var anchor=document.querySelector(CONFIG.ANCHOR_SELECTOR);
    if(anchor) return anchor;
    var footer=document.querySelector(CONFIG.FOOTER_SELECTOR);
    if(footer){ var root=el('div'); root.id='hnk-clans-root'; footer.parentNode.insertBefore(root, footer); return root; }
    return null;
  }
  function isIndex(){
    var p=location.pathname.replace(/\/+$/,'');
    if(p==='' || p==='/forum' || p==='/index' || /\/h\d+-/.test('')) return true;
    /* Forumactif : page d'accueil = "/" ; certains forums utilisent /forum */
    return p==='' || p==='/forum';
  }

  function start(){
    var root=findRoot();
    if(!root) return;                 // pas la bonne page
    if(!CONFIG.TOPIC_ID){ root.innerHTML=''; return; }

    renderSkeleton(root);

    /* cache du sujet pour un affichage quasi-instantané */
    var topicCache=Cache.get('topic', CONFIG.CACHE_TTL);
    if(topicCache && topicCache.clans){
      var clansC=hydrate(topicCache.clans);
      render(root, clansC, computeStats(clansC));
      if(!topicCache._stale) return;  // frais -> stop ; sinon refresh ci-dessous
    }

    Net.fetch('/t'+CONFIG.TOPIC_ID+'-a').then(function(html){
      if(!html){ console.warn('[HNKClans] fetch vide pour /t'+CONFIG.TOPIC_ID+' (sujet introuvable, privé, ou non accessible au visiteur).'); if(!topicCache) showError(root); return; }
      if(/mode=sendpassword|name=\"password\"|Veuillez entrer votre nom/.test(html)){
        console.warn('[HNKClans] /t'+CONFIG.TOPIC_ID+' a renvoyé la page de CONNEXION : ce visiteur n\'a pas le droit de lire le sujet. Ouvre la lecture du forum aux Invités/au groupe concerné.');
        if(!topicCache) showError(root); return;
      }
      var text=extractDataText(parseHTML(html));
      var clans=parseClans(text);
      if(!clans.length){
        console.warn('[HNKClans] aucun clan parsé. Texte extrait ('+text.length+' car.) :\n'+text.slice(0,300));
        console.warn('[HNKClans] -> vérifie que les données sont dans un bloc [code] du 1er message et que des lignes [NomDeClan] existent.');
        if(!topicCache) showError(root); return;
      }
      Cache.set('topic', { clans: dehydrate(clans) });
      render(root, clans, computeStats(clans));
    });
  }

  /* sérialisation du cache sujet (sans les userData volatils) */
  function dehydrate(clans){
    return clans.map(function(c){
      return { name:c.name, slug:c.slug, type:c.type, color:c.color, emblem:c.emblem, kanji:c.kanji, desc:c.desc,
               members: c.members.map(function(m){ return m.pseudo; }) };
    });
  }
  function hydrate(arr){
    return arr.map(function(o){
      var c=newClan(o.name); c.slug=o.slug; c.type=o.type; c.color=o.color; c.emblem=o.emblem; c.kanji=o.kanji; c.desc=o.desc;
      c.members=(o.members||[]).map(newMember); return c;
    });
  }

  function showError(root){
    /* Échec d'accès (sujet non lisible par ce visiteur -> page de login renvoyée)
       ou mauvaise config : on MASQUE proprement le composant côté visiteur.
       L'admin garde le diagnostic précis en console (voir start()).
       Pour forcer l'affichage d'un message de debug : HNKC_CONFIG.DEBUG = true */
    if(CONFIG.DEBUG){
      var sec=el('section','hnkc'); sec.setAttribute('data-hnkc','');
      sec.innerHTML='<div class="hnkc-wrap"><div class="hnkc-empty">Registre des clans indisponible.<br><small>Vérifie HNKC_CONFIG.TOPIC_ID, le format du sujet, et les droits de lecture du sujet.</small></div></div>';
      root.innerHTML=''; root.appendChild(sec);
    } else {
      root.innerHTML='';
    }
  }

  /* =========================================================================
     10. CSS ENCAPSULÉ
     ========================================================================= */
  var CSS = [
'.hnkc *{box-sizing:border-box}',
'.hnkc{--ember:var(--ember,#FF5722);--ember-hot:var(--ember-hot,#FF7A4D);',
'  --ui:var(--ui,"Inter",system-ui,sans-serif);--display:var(--display,"Anton",Impact,sans-serif);--jp:var(--jp,"Noto Serif JP",serif);',
'  --bone:var(--bone,#EDE7DA);--smoke:var(--smoke,#8A8F99);--white:var(--white,#fff);',
'  position:relative;margin:40px 0 6px;padding:38px 64px 42px;color:var(--bone);font-family:var(--ui);',
'  background:linear-gradient(180deg,#07080a 0%,#06070a 100%);',
'  border-top:1px solid rgba(255,87,34,.18);border-bottom:1px solid rgba(255,87,34,.14)}',
'.hnkc-wrap{position:relative;max-width:1180px;margin:0 auto}',
/* libellés verticaux latéraux (comme VIE DU FORUM) */
'.hnkc-side{position:absolute;top:0;bottom:0;width:64px;display:flex;align-items:center;justify-content:center;gap:14px;z-index:1;pointer-events:none}',
'.hnkc-side.left{left:0}.hnkc-side.right{right:0}',
'.hnkc-side .lbl{writing-mode:vertical-rl;transform:rotate(180deg);font:800 12px/1 var(--display);letter-spacing:.7em;text-transform:uppercase;color:rgba(255,255,255,.30)}',
'.hnkc-side .jp{writing-mode:vertical-rl;font-family:var(--jp);font-size:20px;letter-spacing:.32em;color:rgba(255,87,34,.5);text-shadow:0 0 12px rgba(255,87,34,.35)}',
/* en-tête centré */
'.hnkc-head{margin-bottom:18px;text-align:center}',
'.hnkc-title{margin:0 0 6px;font:900 22px/1 var(--display);letter-spacing:.28em;text-transform:uppercase;color:var(--white);display:flex;align-items:center;justify-content:center;gap:16px}',
'.hnkc-title-jp{font-family:var(--jp);font-size:26px;letter-spacing:.18em;font-weight:700;color:var(--ember);text-shadow:0 0 16px rgba(255,87,34,.55)}',
'.hnkc-sub{margin:0 auto 18px;max-width:560px;color:var(--smoke);font:400 11.5px/1.6 var(--ui);letter-spacing:.04em}',
/* stats globales */
'.hnkc-stats{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0 12px}',
'.hnkc-stat{flex:1;min-width:130px;background:#0A0B0E;border:1px solid rgba(255,87,34,.22);padding:14px 16px;clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px)}',
'.hnkc-stat b{display:block;font:900 28px/1 var(--display);color:var(--white)}',
'.hnkc-stat.is-text b{font:700 17px/1.15 var(--jp);color:var(--ember);text-shadow:0 0 14px rgba(255,87,34,.4)}',
'.hnkc-stat span{display:block;margin-top:6px;font:800 8.5px/1.2 var(--ui);letter-spacing:.24em;text-transform:uppercase;color:var(--smoke)}',
/* répartition */
'.hnkc-distrib{display:flex;height:8px;overflow:hidden;background:rgba(255,255,255,.05);border:1px solid rgba(255,87,34,.18)}',
'.hnkc-seg{height:100%;min-width:3px;opacity:.9;transition:opacity .2s}.hnkc-seg:hover{opacity:1}',
/* graphique effectifs */
'.hnkc-chart{margin-top:16px;background:#0A0B0E;border:1px solid rgba(255,87,34,.22);padding:16px 18px;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}',
'.hnkc-chart-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px}',
'.hnkc-chart-t{font:800 9.5px/1 var(--ui);letter-spacing:.26em;text-transform:uppercase;color:var(--bone)}',
'.hnkc-chart-avg{font:600 10px/1 var(--ui);letter-spacing:.04em;color:var(--smoke)}.hnkc-chart-avg b{color:var(--ember);font-weight:800}',
'.hnkc-chart-rows{position:relative;display:flex;flex-direction:column;gap:9px}',
'.hnkc-chart-rows::after{content:"";position:absolute;top:0;bottom:0;left:calc(128px + (100% - 190px) * var(--avgf,0));width:0;border-left:1px dashed rgba(255,255,255,.42);pointer-events:none;z-index:3}',
'.hnkc-crow{--clan:var(--ember);display:grid;grid-template-columns:120px 1fr 54px;align-items:center;gap:8px}',
'.hnkc-crow-name{font:700 11px/1.2 var(--ui);color:var(--bone);display:flex;align-items:center;gap:8px;min-width:0}',
'.hnkc-crow-crest{flex:0 0 18px;width:18px;height:18px;color:var(--clan);display:inline-flex;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--clan) 60%,transparent))}',
'.hnkc-crow-crest svg{width:100%;height:100%;display:block}',
'.hnkc-crow-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.hnkc-crow-track{position:relative;height:20px;background:rgba(255,255,255,.05);overflow:hidden;display:flex;align-items:center}',
'.hnkc-crow-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,color-mix(in srgb,var(--clan) 78%,#000),var(--clan));box-shadow:0 0 14px color-mix(in srgb,var(--clan) 55%,transparent);width:0;transform-origin:left;animation:hnkcGrow .9s ease forwards}',
'.hnkc-crow-val{position:relative;z-index:2;margin-left:auto;padding-right:8px;font:800 11px/1 var(--ui);color:var(--white);text-shadow:0 1px 3px rgba(0,0,0,.9)}',
'.hnkc-crow-delta{font:800 9.5px/1 var(--ui);letter-spacing:.04em;text-align:right;white-space:nowrap}',
'.hnkc-crow-delta.is-over{color:#54D88B}.hnkc-crow-delta.is-under{color:#FF6B6B}.hnkc-crow-delta.is-even{color:var(--smoke)}',
'.hnkc-chart-leg{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,87,34,.16);font:800 8.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase}',
'.hnkc-chart-leg span{color:var(--smoke)}.hnkc-chart-leg .is-over{color:#54D88B}.hnkc-chart-leg .is-under{color:#FF6B6B}',
/* slider */
'.hnkc-slider{position:relative;margin-top:14px}',
'.hnkc-track{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:14px 2px 18px;scrollbar-width:none;-ms-overflow-style:none;cursor:grab}',
'.hnkc-track::-webkit-scrollbar{display:none}',
'.hnkc-track.is-drag{cursor:grabbing;scroll-snap-type:none}',
'.hnkc-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:42px;height:42px;border:1px solid rgba(255,87,34,.42);',
'  background:rgba(7,8,10,.9);color:var(--ember);font:400 24px/1 var(--display);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.18s;',
'  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}',
'.hnkc-nav:hover{border-color:var(--ember);color:var(--white);box-shadow:0 0 18px rgba(255,87,34,.45)}',
'.hnkc-prev{left:-10px}.hnkc-next{right:-10px}',
'.hnkc-nav.is-off{opacity:0;pointer-events:none}',
/* carte (DA VIE DU FORUM : coins biseautés, bordure ember, blason+kanji) */
'.hnkc-card{--clan:var(--ember);position:relative;flex:0 0 300px;width:300px;min-height:382px;scroll-snap-align:start;overflow:hidden;isolation:isolate;',
'  background:#0A0B0E;border:1px solid rgba(255,87,34,.22);padding:22px;display:flex;flex-direction:column;',
'  clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);',
'  opacity:0;transform:translateY(16px);transition:opacity .5s,transform .5s,border-color .25s,box-shadow .25s}',
'.hnkc-card.is-in{opacity:1;transform:none}',
'.hnkc-card::before{content:"";position:absolute;inset:0;z-index:0;background:radial-gradient(120% 80% at 80% 2%,color-mix(in srgb,var(--clan) 14%,transparent),transparent 58%);pointer-events:none}',
'.hnkc-card:hover{border-color:rgba(255,87,34,.62);box-shadow:0 14px 34px rgba(255,87,34,.20);transform:translateY(-3px)}',
'.hnkc-crest{position:absolute;right:-14px;top:40px;z-index:0;width:172px;height:172px;color:var(--clan);opacity:.46;pointer-events:none;',
'  filter:drop-shadow(0 0 6px var(--clan)) drop-shadow(0 0 20px color-mix(in srgb,var(--clan) 55%,transparent));transition:transform .5s,opacity .3s}',
'.hnkc-card:hover .hnkc-crest{transform:scale(1.05) rotate(-3deg);opacity:.62}',
'.hnkc-crest svg{width:100%;height:100%;display:block}',
'.hnkc-ghost{position:absolute;left:-6px;bottom:-30px;z-index:0;font:700 150px/1 var(--jp);color:color-mix(in srgb,var(--clan) 12%,transparent);pointer-events:none;user-select:none}',
'.hnkc-card-top{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px}',
'.hnkc-type{font:800 8.5px/1 var(--ui);letter-spacing:.24em;text-transform:uppercase;color:var(--ember-hot);',
'  border:1px solid rgba(255,87,34,.45);background:linear-gradient(180deg,rgba(255,87,34,.14),rgba(255,87,34,.04));padding:6px 11px;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}',
'.hnkc-card[data-type="legendaire"] .hnkc-type{color:#F2C14E;border-color:rgba(242,193,78,.5);background:rgba(242,193,78,.12)}',
'.hnkc-count{font:600 11px/1 var(--ui);color:var(--smoke)}.hnkc-count b{color:var(--bone);font-weight:800;font-size:13px}',
'.hnkc-card-body{position:relative;z-index:2;margin-top:auto;padding-top:92px}',
'.hnkc-name{font:900 28px/1 var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--white);margin:0;text-shadow:0 0 16px rgba(255,87,34,.18)}',
'.hnkc-desc{margin:9px 0 0;font:400 12px/1.55 var(--ui);color:rgba(255,255,255,.7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
/* roster */
'.hnkc-roster{position:relative;z-index:2;margin-top:16px}',
'.hnkc-mems{display:flex;flex-wrap:wrap;gap:6px}',
'.hnkc-mem{--c:var(--clan);display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:3px 10px 3px 3px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:30px;text-decoration:none;transition:border-color .2s,background .2s,transform .2s}',
'.hnkc-mem:hover{border-color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);transform:translateY(-1px)}',
'.hnkc-mem[data-pending]{opacity:.5}',
'.hnkc-mem-av{flex:0 0 22px;width:22px;height:22px;border-radius:50%;overflow:hidden;background:#14171C;box-shadow:0 0 0 1.5px var(--c);display:flex;align-items:center;justify-content:center}',
'.hnkc-mem-av img{width:100%;height:100%;object-fit:cover;display:block}',
'.hnkc-ini{font:800 11px/1 var(--display);color:var(--c)}',
'.hnkc-mem-nm{font:700 11px/1 var(--ui);color:var(--bone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:118px;letter-spacing:.02em}',
'.hnkc-mem:hover .hnkc-mem-nm{color:var(--white)}',
'.hnkc-more{display:inline-flex;align-items:center;padding:0 6px;font:800 10px/1 var(--ui);color:var(--ember);letter-spacing:.04em}',
/* jauge population */
'.hnkc-bar{position:relative;z-index:2;margin-top:16px;height:4px;background:rgba(255,255,255,.07);overflow:hidden}',
'.hnkc-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--clan),color-mix(in srgb,var(--clan) 50%,#fff));box-shadow:0 0 12px var(--clan);width:0;animation:hnkcGrow .9s ease forwards}',
'@keyframes hnkcGrow{from{transform:scaleX(0);transform-origin:left}to{transform:scaleX(1)}}',
/* points */
'.hnkc-dots{display:flex;justify-content:center;gap:7px;margin-top:8px}',
'.hnkc-dot{width:7px;height:7px;border:none;background:rgba(255,255,255,.18);cursor:pointer;padding:0;transition:.2s}',
'.hnkc-dot.on{background:var(--ember);width:20px}',
/* squelette + vide */
'.hnkc-skel{opacity:1;transform:none;background:linear-gradient(110deg,#0c0d10 30%,#16181d 50%,#0c0d10 70%);background-size:200% 100%;animation:hnkcShimmer 1.3s infinite}',
'@keyframes hnkcShimmer{from{background-position:200% 0}to{background-position:-200% 0}}',
'.hnkc-empty{text-align:center;padding:40px 16px;color:var(--smoke);font:500 14px/1.6 var(--ui);border:1px dashed rgba(255,87,34,.2)}',
/* responsive */
'@media(max-width:1000px){.hnkc-side{display:none}.hnkc{padding-left:24px;padding-right:24px}}',
'@media(max-width:900px){.hnkc-title{font-size:20px}.hnkc-card{flex-basis:260px;width:260px;min-height:352px}}',
'@media(max-width:560px){.hnkc{padding:28px 14px 32px}.hnkc-card{flex-basis:82%;width:82%}.hnkc-nav{display:none}.hnkc-stat{min-width:46%}.hnkc-crow{grid-template-columns:104px 1fr 50px}.hnkc-chart-rows::after{left:calc(112px + (100% - 170px) * var(--avgf,0))}}',
'@media(prefers-reduced-motion:reduce){.hnkc-card{transition:none}.hnkc-bar i,.hnkc-crow-fill{animation:none;width:auto}.hnkc-skel{animation:none}}'
].join('\n');

  /* =========================================================================
     11. GO
     ========================================================================= */
  ready(start);

  /* API publique (debug / intégrations futures) */
  window.HNKClans = { config: CONFIG, reload: function(){ try{ for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i); if(key&&key.indexOf('hnkc-')===0){localStorage.removeItem(key);i--;}} }catch(e){} start(); } };

  /* hook de test (no-op en navigateur) */
  try{ if(typeof module!=='undefined' && module.exports){ module.exports={ parseClans:parseClans, slug:slug, clanColor:clanColor, computeStats:computeStats, extractDataText:extractDataText, pickMemberFromList:pickMemberFromList }; } }catch(e){}

})();
