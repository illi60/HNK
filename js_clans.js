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

  /* ====== NOYAU HNK — annuaire des membres en UN gros pull (partage par tous les modules) ======
     stale-while-revalidate : le cache sert au paint instantane ; on re-pull frais a chaque charge
     (throttle 45s anti-burst). Source = page /memberlist (cartes .hnk-member[data-hnk-profile]),
     pagination suivie et bornee. Si vide/echec -> les modules retombent sur leur logique d'origine. */
  window.HNK = window.HNK || (function(){
    var LS='hnk-dir-v1', THROTTLE=45000, MAXPAGES=12;
    var _map=null, _t=0, _inflight=null, _subs=[];
    function norm(s){return (s||'').toString().replace(/\s+/g,' ').trim().toLowerCase();}
    (function(){try{var o=JSON.parse(localStorage.getItem(LS)||'null');if(o&&o.map){_map=o.map;_t=o._t||0;}}catch(e){}})();
    function parsePage(html, map){
      var doc=new DOMParser().parseFromString(html,'text/html');
      var cards=doc.querySelectorAll('.hnk-member[data-hnk-profile]');
      Array.prototype.forEach.call(cards,function(c){
        var nm=c.querySelector('.nm'); var name=nm?(nm.textContent||'').replace(/\s+/g,' ').trim():'';
        if(!name)return;
        var link=c.getAttribute('data-hnk-profile')||''; var um=link.match(/\/u(\d+)/);
        var img=c.querySelector('.av img, img.avatar, img[src*="avatar"]'); var av=img?(img.getAttribute('src')||''):'';
        if(/spacer|blank|smiley|emoji|i_icon/i.test(av))av='';
        var cs=nm?(nm.querySelector('span[style*="color"]')||nm):null; var color='';
        if(cs){var mm=(cs.getAttribute('style')||'').match(/color\s*:\s*([^;]+)/i);if(mm)color=mm[1].trim();}
        map[norm(name)]={name:name,uid:um?um[1]:null,profileUrl:link||(um?'/u'+um[1]:null),avatar:av||null,color:color||null};
      });
      var nexts=[];
      Array.prototype.forEach.call(doc.querySelectorAll('a[href*="memberlist"]'),function(a){
        var h=a.getAttribute('href')||''; if(/[?&](start|page)=\d+/.test(h))nexts.push(h.split('#')[0]);
      });
      return nexts;
    }
    function pull(){
      if(_inflight)return _inflight;
      var map={}, seen={};
      function page(url,depth){
        seen[url]=1;
        return window.fetch(url,{credentials:'same-origin',cache:'default'}).then(function(r){return r.text();}).then(function(h){
          var nexts=parsePage(h,map);
          if(depth<MAXPAGES){for(var i=0;i<nexts.length;i++){if(!seen[nexts[i]])return page(nexts[i],depth+1);}}
          return null;
        }).catch(function(){return null;});
      }
      _inflight=page('/memberlist',0).then(function(){
        if(Object.keys(map).length){_map=map;_t=Date.now();try{localStorage.setItem(LS,JSON.stringify({map:_map,_t:_t}));}catch(e){}}
        _inflight=null;
        for(var i=0;i<_subs.length;i++){try{_subs[i](_map);}catch(e){}}
        return _map;
      });
      return _inflight;
    }
    return {
      get:function(p){return _map?(_map[norm(p)]||null):null;},
      snapshot:function(){return _map;},
      ready:function(){ if(_map&&(Date.now()-_t)<THROTTLE)return Promise.resolve(_map); return pull(); },
      refresh:function(){return pull();},
      onUpdate:function(cb){_subs.push(cb);}
    };
  })();

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
    MAX_PARALLEL: 2,                  // requêtes simultanées (anti-rafale serveur)
    MAX_AVATARS: 5,                   // avatars visibles par carte
    EAGER: true,                      // true = tout charge tout de suite (pas de lazy au scroll)
    VERSION: 'v2'   // bump = purge des anciens caches chez tous les visiteurs
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
    uchiha:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 600" fill="none"><path d="M236 215L221 217L195 224L162 240L139 257L122 274L102 300L120 328L134 343L151 357L185 376L223 387L208 522L278 522L279 524L287 523L285 520L275 387L297 382L319 374L347 358L376 332L399 299L394 299L387 287L366 263L344 245L328 235L306 225L282 218L263 215L237 215ZM249 209L249 210ZM236 65L203 71L183 78L160 90L132 112L108 142L100 156L90 182L84 216L86 253L91 274L98 292L100 293L113 274L130 256L151 239L167 229L203 214L220 210L251 207L272 209L295 214L315 221L333 230L364 252L382 270L399 294L401 293L406 281L414 250L415 211L412 192L405 169L395 148L384 131L356 102L341 91L321 80L300 72L279 67L263 65L237 65Z" fill="currentColor" fill-rule="evenodd"/></svg>',
    konoha:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><g fill="none" stroke="currentColor" stroke-width="4.20699" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="4" transform="matrix(1.35911,0,0,1.3562,265.674,124.785)"><path d="M -142.125,-55.25 C -140.875,-54.666667 -139.4375,-53.9375 -139.875,-49.875 C -141.1875,-46.3125 -143.6875,-43.270833 -150,-43.5 C -155.0625,-44.729167 -160.5625,-46.166667 -160.125,-56.25 C -159.6875,-61.458333 -154.25,-68.6875 -145,-68.75 C -131.625,-68.5625 -125.0625,-56.75 -125.625,-47.625 C -126.3125,-34.625 -136.70833,-27.875 -151,-26.625 C -158.66667,-26.625 -167.5625,-30.8125 -171.625,-37.125 C -176.6875,-43.6875 -178.64583,-57.208333 -174.375,-66.125 C -169.85417,-75.666667 -161.3244,-81.672042 -151.25,-81.875 C -141.89583,-82.0625 -135.75,-78.541667 -132.25,-76.375 L -124,-84.375"/><path d="M -172.625,-69.25 C -177.5736,-61.537772 -180.88532,-51.495796 -184.25,-45.375 C -186.66667,-40.125 -189.95833,-37.125 -193.375,-33.125 C -179.80766,-25.257434 -158.89934,-24.622727 -145.3125,-27.4375"/></g></svg>',
    hyuga:    '<svg viewBox="0 0 64 64" fill="none"><path d="M 6 14 C 8 8, 14 8, 14 14 L 32 52 L 50 14 C 50 8, 56 8, 58 14" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M 32 16 C 28 22, 24 28, 28 34 C 30 38, 36 38, 36 32 C 36 28, 32 27, 31 30 C 30.3 32, 33 33, 33 31" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    sarutobi: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 1800" fill="none"><path d="M894 394L871 397L848 404L824 416L804 432L790 447L776 469L766 494L761 520L761 547L765 569L772 589L779 603L790 619L800 631L827 652L852 664L872 670L873 669L875 671L875 854L873 856L845 853L813 846L780 835L755 824L724 807L699 790L683 778L651 747L673 723L683 707L691 689L698 652L696 624L688 598L680 582L667 564L648 546L619 529L591 521L556 520L521 529L496 543L480 556L470 567L456 589L445 619L442 639L442 656L448 687L459 711L472 730L488 746L504 757L536 771L558 775L589 774L613 767L656 809L684 830L725 855L754 869L800 885L840 894L871 897L875 899L875 970L873 972L838 976L808 983L778 993L744 1008L710 1028L685 1046L655 1072L642 1086L622 1081L604 1079L579 1081L555 1088L541 1095L525 1106L509 1122L498 1138L488 1160L483 1181L482 1205L485 1224L492 1245L500 1260L512 1276L535 1296L556 1307L575 1313L597 1316L626 1313L645 1307L666 1296L682 1283L699 1263L711 1239L718 1210L718 1184L715 1168L708 1148L696 1128L680 1111L679 1107L699 1088L723 1069L755 1049L773 1040L805 1027L830 1020L873 1013L875 1015L875 1389L883 1402L896 1408L907 1407L916 1402L921 1396L925 1384L924 1015L926 1013L954 1017L979 1023L1027 1041L1073 1068L1100 1089L1119 1107L1119 1110L1106 1123L1096 1137L1086 1158L1080 1184L1080 1210L1082 1223L1088 1242L1099 1263L1112 1279L1132 1296L1151 1306L1176 1314L1202 1316L1223 1313L1240 1308L1263 1296L1287 1275L1301 1255L1311 1232L1316 1207L1314 1175L1307 1152L1299 1136L1289 1122L1273 1106L1257 1095L1243 1088L1213 1080L1183 1080L1157 1087L1130 1060L1109 1043L1085 1026L1052 1007L1015 991L990 983L960 976L926 972L924 969L924 899L926 897L946 896L975 891L1016 880L1045 869L1080 852L1114 831L1143 809L1185 768L1218 775L1241 775L1272 768L1295 757L1311 746L1325 732L1344 704L1351 687L1355 671L1357 637L1351 608L1335 575L1316 553L1287 533L1256 522L1227 519L1191 525L1166 536L1144 552L1123 576L1111 598L1102 632L1102 663L1109 691L1124 720L1136 735L1148 746L1146 750L1112 781L1089 798L1067 812L1036 828L986 846L954 853L926 856L924 854L924 671L950 663L977 649L999 631L1015 611L1028 587L1034 570L1038 548L1038 518L1033 494L1022 467L1009 447L987 425L966 411L949 403L929 397L895 394ZM1192 1130L1202 1129L1218 1132L1239 1143L1250 1153L1258 1165L1262 1173L1266 1190L1264 1215L1259 1228L1252 1239L1245 1247L1230 1258L1218 1263L1203 1266L1192 1266L1178 1263L1164 1257L1154 1250L1138 1231L1133 1220L1130 1207L1130 1187L1133 1174L1144 1155L1162 1139L1174 1133L1191 1130ZM594 1130L613 1130L638 1140L654 1155L660 1164L668 1187L668 1207L666 1217L660 1231L653 1241L634 1257L617 1264L605 1266L584 1264L575 1261L558 1251L541 1232L537 1224L532 1205L532 1189L534 1180L537 1171L546 1156L553 1148L566 1138L580 1132L593 1130ZM1225 570L1241 570L1259 575L1281 589L1290 598L1298 610L1303 621L1307 638L1306 663L1302 676L1292 694L1281 706L1270 714L1258 720L1239 725L1220 725L1206 722L1190 715L1179 707L1169 697L1160 684L1156 675L1151 653L1152 635L1157 617L1173 593L1182 585L1199 575L1212 571L1224 570ZM566 570L581 570L600 575L622 589L638 609L645 625L648 640L646 666L640 682L630 697L609 715L596 721L580 725L560 725L546 722L531 715L521 708L512 700L502 686L495 670L492 655L492 639L495 625L501 610L510 597L523 585L540 575L553 571L565 570ZM893 445L906 444L926 448L941 454L956 464L968 476L979 492L986 510L989 527L988 547L983 565L975 581L966 593L957 602L942 612L922 620L911 622L888 622L874 619L857 612L844 603L833 593L821 576L814 559L810 538L811 519L816 501L825 484L832 475L853 457L873 448L892 445Z" fill="currentColor" fill-rule="evenodd"/></svg>',
    senju:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 400" fill="none"><path d="M748 8L718 12L692 21L663 38L639 61L621 86L606 121L600 149L597 189L491 188L490 105L475 105L474 188L358 189L356 158L351 130L345 111L335 90L314 61L299 46L278 31L262 23L236 14L192 10L156 15L136 22L105 39L81 59L44 116L30 127L14 133L5 150L30 142L48 131L70 108L89 82L102 69L120 56L156 41L174 37L202 35L234 39L258 53L280 74L296 96L308 119L316 140L323 168L325 181L324 190L282 191L280 167L273 143L262 125L247 109L231 98L209 89L186 85L165 85L137 91L121 98L105 108L95 118L77 144L68 152L54 157L49 167L67 162L77 156L112 120L131 109L159 101L189 100L200 102L214 109L229 121L237 130L247 145L255 163L259 177L260 192L8 200L8 202L22 203L259 208L261 210L257 232L253 243L242 262L230 275L218 284L209 289L193 294L163 294L132 286L109 272L78 239L68 233L49 227L54 237L69 243L79 253L97 279L104 286L126 300L142 306L157 309L198 308L219 302L232 296L245 287L261 271L268 261L278 237L282 209L326 211L325 233L318 267L311 286L294 316L286 326L262 348L239 361L219 366L183 366L164 363L144 357L120 346L102 333L89 320L70 294L48 271L30 260L5 252L14 269L30 275L44 286L78 339L91 353L117 372L132 380L155 388L173 391L212 391L236 388L262 379L278 371L300 355L326 326L342 298L353 263L356 244L358 210L474 212L475 300L490 300L491 212L597 211L599 240L603 265L617 304L630 325L646 344L659 356L676 368L710 383L721 386L747 389L778 389L798 386L820 379L839 369L860 354L873 342L910 285L921 275L942 266L950 250L929 256L908 268L889 287L863 321L849 334L836 343L818 352L798 359L769 364L740 364L722 361L703 352L687 341L672 327L654 303L643 281L634 253L630 230L629 211L673 209L678 238L685 255L697 272L713 287L732 298L753 305L770 307L803 306L824 300L852 283L879 247L889 239L901 235L906 225L891 229L878 236L863 250L850 266L827 282L797 291L765 292L758 291L741 284L729 276L715 262L701 238L695 216L696 209L951 202L951 200L930 199L695 192L694 188L696 175L701 158L709 141L717 129L739 108L754 100L763 98L798 99L825 107L847 121L877 153L889 160L906 165L901 155L886 149L876 139L852 107L824 91L810 86L794 83L766 83L752 85L734 91L720 98L710 105L695 120L686 133L676 160L674 190L630 190L632 166L639 138L646 119L662 89L673 74L698 50L718 38L733 34L764 33L783 35L812 43L832 52L851 65L869 83L887 108L904 126L926 140L950 148L942 131L924 124L909 111L875 58L868 50L849 36L822 21L800 13L771 8L749 8Z" fill="currentColor" fill-rule="evenodd"/></svg>',
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
    konoha:   { color: '#4CAF50', kanji: '葉' },
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
          return fetch(url, {credentials:'same-origin', cache:'default', redirect:'follow'})
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
      if(/^[^0-9A-Za-zÀ-ÿ\u3040-\u30ff\u4e00-\u9fff]+$/.test(line)) continue; // ligne décorative (==== ---- ~~~)

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

  /* Applique au membre une entree de l'annuaire global HNK (0 fetch). */
  function applyDir(m, d){
    var data = { id:d.uid, profileUrl:(d.profileUrl || (d.uid?('/u'+d.uid):null)), avatar:(d.avatar||null), groupColor:(d.color||null) };
    Object.assign(m.userData, data); m.resolved=true;
    var pkey=m.pseudo.toLowerCase(); memberMemo[pkey]=data; Cache.set('member-'+pkey, { data:data });
    return CONFIG.DEEP_ENRICH && m.userData.profileUrl ? deepEnrich(m) : m;
  }
  /* Resolution : annuaire global d'abord (1 seul pull /memberlist partage), repli cible
     sur l'ancienne resolution 1-par-1 uniquement si l'annuaire echoue ou n'a pas le membre. */
  function resolveMember(m){
    var pkey = m.pseudo.toLowerCase();
    if(memberMemo[pkey]) { Object.assign(m.userData, memberMemo[pkey]); m.resolved=true; return Promise.resolve(m); }
    if(window.HNK && HNK.ready){
      return HNK.ready().then(function(dir){
        var d = dir ? HNK.get(m.pseudo) : null;
        return d ? applyDir(m, d) : resolveMemberOld(m);
      }, function(){ return resolveMemberOld(m); });
    }
    return resolveMemberOld(m);
  }
  /* Ancienne resolution 1-par-1 (repli) : /memberlist?username= + cache 24h. */
  function resolveMemberOld(m){
    var pkey = m.pseudo.toLowerCase();
    var cache = Cache.get('member-'+pkey, CONFIG.MEMBER_TTL);
    if(cache){ Object.assign(m.userData, cache.data); m.resolved=true; memberMemo[pkey]=cache.data;
      if(!cache._stale) return Promise.resolve(m); }
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
      var nm = c.querySelector('.nm, .username');         // le pseudo (PAS le lien vide .lnk)
      var name = clean(nm ? nm.textContent : '');
      if(!name){ var na=c.querySelector('a[href*="/u"]'); name=clean(na?na.textContent:''); }
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
    var shown=clan.members;
    shown.forEach(function(m){ avas.appendChild(memberChip(m)); });
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
    var hadCache=false;
    if(topicCache && topicCache.clans){
      var clansC=hydrate(topicCache.clans);
      render(root, clansC, computeStats(clansC));
      hadCache=true;
      /* on NE s'arrête PAS : on relit TOUJOURS le sujet en arrière-plan pour
         refléter les modifs de l'admin dès le prochain chargement (le sujet =
         1 seule requête, peu coûteuse ; la résolution des membres reste cachée). */
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
      var fresh=dehydrate(clans);
      /* aucun changement depuis le cache -> pas de re-render (évite le flicker) */
      if(hadCache && topicCache && JSON.stringify(topicCache.clans)===JSON.stringify(fresh)) return;
      Cache.set('topic', { clans: fresh });
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
'.hnkc h2,.hnkc h3,.hnkc h4,.hnkc p{border:0 !important;outline:0 !important;background:none !important;box-shadow:none !important;text-decoration:none !important}',
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
'.hnkc-title{margin:0 0 7px;font:900 24px/1 var(--display);letter-spacing:.3em;text-transform:uppercase;color:var(--white);display:flex;align-items:center;justify-content:center;gap:18px;text-shadow:0 2px 14px rgba(0,0,0,.6)}',
'.hnkc-title-jp{font-family:var(--jp);font-size:31px;letter-spacing:.16em;font-weight:700;color:var(--ember);text-shadow:0 0 18px rgba(255,87,34,.6),0 0 2px rgba(255,87,34,.5)}',
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
'.hnkc .hnkc-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:42px;height:42px;border:1px solid rgba(255,87,34,.6) !important;',
'  background:rgba(7,8,10,.92) !important;color:var(--ember) !important;font:400 24px/1 var(--display) !important;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.18s;text-shadow:0 0 10px rgba(255,87,34,.5);',
'  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}',
'.hnkc .hnkc-nav:hover{border-color:var(--ember) !important;color:var(--white) !important;background:rgba(255,87,34,.18) !important;box-shadow:0 0 18px rgba(255,87,34,.5)}',
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
'.hnkc-mems{display:flex;flex-flow:row wrap;align-content:flex-start;gap:6px;max-height:104px;overflow-y:auto;overflow-x:hidden;padding:2px 5px 2px 2px;scrollbar-width:thin;scrollbar-color:rgba(255,87,34,.45) transparent}',
'.hnkc-mems::-webkit-scrollbar{width:5px}',
'.hnkc-mems::-webkit-scrollbar-thumb{background:rgba(255,87,34,.45);border-radius:3px}',
'.hnkc-mems::-webkit-scrollbar-track{background:transparent}',
/* puces avatars cote a cote : pseudo masque, revele au survol (la puce s\'allonge) */
'.hnkc-mem{--c:var(--clan);position:relative;display:inline-flex;align-items:center;border-radius:30px;background:transparent;text-decoration:none;transition:background .2s,box-shadow .2s}',
'.hnkc-mem:hover{background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent)}',
'.hnkc-mem[data-pending]{opacity:.55}',
'.hnkc-mem-av{flex:0 0 28px;width:28px;height:28px;border-radius:50%;overflow:hidden;background:#14171C;box-shadow:0 0 0 1.5px var(--c);display:flex;align-items:center;justify-content:center}',
'.hnkc-mem-av img{width:100%;height:100%;object-fit:cover;display:block}',
'.hnkc-ini{font:800 12px/1 var(--display);color:var(--c)}',
'.hnkc-mem-nm{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;font:700 11px/1 var(--ui);color:var(--white);letter-spacing:.02em;padding:0;transition:max-width .25s ease,opacity .18s ease,padding .25s ease}',
'.hnkc-mem:hover .hnkc-mem-nm{max-width:130px;opacity:1;padding:0 11px 0 8px}',
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
