/*
 * Asset icons for the Mini App. No network, no image files, no dependencies.
 *
 *   currency pair  -> two overlapping round flags (base + quote), like a trading terminal
 *   index          -> flag of the region + the index number
 *   crypto         -> coloured coin with the ticker (pairs such as BTC/GBP: coin + flag)
 *   stock          -> ticker badge, colour derived from the ticker
 *   commodity      -> original pictogram (bars, drop, flame)
 *
 * Flags are drawn in a 36x24 space and cropped to a circle. Brand logos are NOT drawn here on purpose:
 * to use real (licensed) logos, drop SVG/PNG files into public/icons/ and list them in
 * public/icons/manifest.json, e.g. {"stock:AAPL": "aapl.svg", "crypto:BTC": "btc.svg", "flag:USD": "usd.svg"}.
 * Overrides replace a single glyph, so a pair icon keeps its other half.
 *
 * API: AssetIcons.render(asset, size) / .describe(asset) / .tab(name, size) / .setOverrides(map)
 */
(function (root) {
  'use strict';

  /* ---------------- tiny SVG helpers ---------------- */
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  function R(x, y, w, h, f) { return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" fill="' + f + '"/>'; }
  function C(x, y, r, f, stroke, sw) {
    return '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + f + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + sw + '"' : '') + '/>';
  }
  function P(pts, f) { return '<polygon points="' + pts + '" fill="' + f + '"/>'; }
  function L(x1, y1, x2, y2, stroke, sw) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>'; }
  function H() { var c = [].slice.call(arguments), h = 24 / c.length; return c.map(function (f, i) { return R(0, i * h, 36, h + 0.05, f); }).join(''); }
  function V() { var c = [].slice.call(arguments), w = 36 / c.length; return c.map(function (f, i) { return R(i * w, 0, w + 0.05, 24, f); }).join(''); }
  function star(cx, cy, r, f) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
      p.push(r2(cx + rr * Math.cos(a)) + ',' + r2(cy + rr * Math.sin(a)));
    }
    return P(p.join(' '), f);
  }
  function pentagram(cx, cy, r, stroke, sw) {
    var v = [0, 2, 4, 1, 3, 0].map(function (i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      return r2(cx + r * Math.cos(a)) + ',' + r2(cy + r * Math.sin(a));
    });
    return '<polyline points="' + v.join(' ') + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
  }
  /* Union Jack drawn in a nested <svg>, so the diagonals are clipped to the box */
  function jack(x, y, w, h) {
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="0 0 60 30" preserveAspectRatio="none">' +
      '<rect width="60" height="30" fill="#012169"/>' + L(0, 0, 60, 30, '#fff', 6) + L(60, 0, 0, 30, '#fff', 6) +
      L(0, 0, 60, 30, '#c8102e', 2.4) + L(60, 0, 0, 30, '#c8102e', 2.4) +
      R(25, 0, 10, 30, '#fff') + R(0, 10, 60, 10, '#fff') + R(27, 0, 6, 30, '#c8102e') + R(0, 12, 60, 6, '#c8102e') + '</svg>';
  }
  /* Nordic cross: background, cross colour, optional inner cross colour */
  function nordic(bg, cross, inner) {
    return R(0, 0, 36, 24, bg) + R(8, 0, 6, 24, cross) + R(0, 9, 36, 6, cross) +
      (inner ? R(9.5, 0, 3, 24, inner) + R(0, 10.5, 36, 3, inner) : '');
  }
  function stripes13() {
    var s = '';
    for (var i = 0; i < 13; i++) s += R(0, i * 24 / 13, 36, 24 / 13 + 0.05, i % 2 ? '#fff' : '#b22234');
    return s;
  }
  function dots(cols, rows, x0, y0, dx, dy, r, f) {
    var s = '';
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) s += C(x0 + i * dx, y0 + j * dy, r, f);
    return s;
  }
  function ring(cx, cy, rad, n, r, f) {
    var s = '';
    for (var i = 0; i < n; i++) { var a = i * 2 * Math.PI / n; s += C(cx + rad * Math.sin(a), cy - rad * Math.cos(a), r, f); }
    return s;
  }

  /* ---------------- flags: key -> [svg inner (36x24 space), left edge of the circular crop (default 6)] ---------------- */
  var FLAG = {
    USD: [stripes13() + R(0, 0, 16, 12.6, '#3c3b6e') + dots(4, 3, 2.6, 2.6, 3.7, 3.7, 0.95, '#fff'), 0],
    EUR: [R(0, 0, 36, 24, '#003399') + ring(18, 12, 7.2, 12, 1.15, '#ffcc00')],
    GBP: [jack(0, 0, 36, 24)],
    JPY: [R(0, 0, 36, 24, '#fff') + C(18, 12, 7, '#bc002d')],
    AUD: [R(0, 0, 36, 24, '#00247d') + jack(0, 0, 18, 12) + star(9, 18.2, 3.4, '#fff') + star(27, 5, 1.8, '#fff') + star(22, 11.5, 1.8, '#fff') + star(32, 11, 1.8, '#fff') + star(27, 19, 1.8, '#fff'), 2],
    NZD: [R(0, 0, 36, 24, '#00247d') + jack(0, 0, 18, 12) + [[27, 5.5], [23, 11], [31.5, 11], [27, 18.5]].map(function (p) { return star(p[0], p[1], 2.6, '#fff') + star(p[0], p[1], 1.7, '#cc142b'); }).join(''), 2],
    CAD: [V('#d52b1e', '#fff', '#d52b1e') + P('18,4.8 19.7,8.6 22.6,7.7 21.6,11.4 24.2,12.4 20.6,15 21.2,16.6 18.8,16.1 18.8,19.6 17.2,19.6 17.2,16.1 14.8,16.6 15.4,15 11.8,12.4 14.4,11.4 13.4,7.7 16.3,8.6', '#d52b1e')],
    CHF: [R(0, 0, 36, 24, '#d52b1e') + R(15.5, 4.5, 5, 15, '#fff') + R(10.5, 9.5, 15, 5, '#fff')],
    NOK: [nordic('#ba0c2f', '#fff', '#00205b'), 3],
    TRY: [R(0, 0, 36, 24, '#e30a17') + C(14, 12, 6.2, '#fff') + C(15.8, 12, 5, '#e30a17') + star(20.6, 12, 2.7, '#fff'), 4],
    RUB: [H('#fff', '#0039a6', '#d52b1e')],
    UAH: [H('#0057b7', '#ffd700')],
    HUF: [H('#cd2a3e', '#fff', '#436f4d')],
    CNH: [R(0, 0, 36, 24, '#de2910') + star(8, 7, 4.2, '#ffde00') + star(14.5, 3, 1.3, '#ffde00') + star(16.8, 5.8, 1.3, '#ffde00') + star(16.8, 9.2, 1.3, '#ffde00') + star(14.5, 12, 1.3, '#ffde00'), 2],
    INR: [H('#ff9933', '#fff', '#138808') + C(18, 12, 3, 'none', '#000080', 0.9)],
    SGD: [H('#ef3340', '#fff') + C(8, 6, 4.2, '#fff') + C(9.7, 6, 3.7, '#ef3340') + star(12.6, 3.8, 1, '#fff') + star(14.4, 5.6, 1, '#fff') + star(13.8, 8, 1, '#fff') + star(11.4, 8, 1, '#fff'), 2],
    CLP: [R(0, 0, 36, 24, '#fff') + R(0, 12, 36, 12, '#d52b1e') + R(0, 0, 12, 12, '#0039a6') + star(6, 6, 3.2, '#fff'), 0],
    MYR: [(function () { var s = ''; for (var i = 0; i < 14; i++) s += R(0, i * 24 / 14, 36, 24 / 14 + 0.05, i % 2 ? '#fff' : '#cc0001'); return s; })() + R(0, 0, 18, 13, '#010066') + C(7.4, 6.5, 3.7, '#fc0') + C(8.6, 6.5, 3.1, '#010066') + star(12.6, 6.5, 2.3, '#fc0'), 0],
    THB: [R(0, 0, 36, 4, '#a51931') + R(0, 4, 36, 4, '#f4f5f8') + R(0, 8, 36, 8, '#2d2a4a') + R(0, 16, 36, 4, '#f4f5f8') + R(0, 20, 36, 4, '#a51931')],
    VND: [R(0, 0, 36, 24, '#da251d') + star(18, 12.5, 7.4, '#ffff00')],
    PKR: [R(0, 0, 36, 24, '#01411c') + R(0, 0, 9, 24, '#fff') + C(23, 12, 6, '#fff') + C(25, 11, 5, '#01411c') + star(27.5, 8.8, 2, '#fff'), 3],
    COP: [R(0, 0, 36, 12, '#fcd116') + R(0, 12, 36, 6, '#003893') + R(0, 18, 36, 6, '#ce1126')],
    EGP: [H('#ce1126', '#fff', '#000') + C(18, 12, 2.2, '#c09300')],
    PHP: [R(0, 0, 36, 12, '#0038a8') + R(0, 12, 36, 12, '#ce1126') + P('0,0 21,12 0,24', '#fff') + C(6, 12, 2.6, '#fcd116'), 0],
    MXN: [V('#006847', '#fff', '#ce1126') + C(18, 12, 3.2, '#8c6d3f')],
    DZD: [V('#006233', '#fff') + C(18, 12, 6.2, '#d21034') + C(19.8, 12, 5, '#fff') + star(20.4, 12, 2.5, '#d21034')],
    ARS: [H('#74acdf', '#fff', '#74acdf') + C(18, 12, 2.8, '#f6b40e')],
    IDR: [H('#ce1126', '#fff')],
    BRL: [R(0, 0, 36, 24, '#009c3b') + P('18,2.5 33.5,12 18,21.5 2.5,12', '#ffdf00') + C(18, 12, 5.4, '#002776')],
    BDT: [R(0, 0, 36, 24, '#006a4e') + C(16.5, 12, 7, '#f42a41')],
    YER: [H('#ce1126', '#fff', '#000')],
    LBP: [R(0, 0, 36, 24, '#ed1c24') + R(0, 6, 36, 12, '#fff') + P('18,6.8 22.2,15 13.8,15', '#00a651') + R(17.3, 15, 1.4, 3, '#6d4c2a')],
    TND: [R(0, 0, 36, 24, '#e70013') + C(18, 12, 7, '#fff') + C(17, 12, 4.7, '#e70013') + C(18.4, 12, 3.9, '#fff') + star(18.9, 12, 2.3, '#e70013')],
    MAD: [R(0, 0, 36, 24, '#c1272d') + pentagram(18, 12.6, 6.4, '#006233', 1.3)],
    BHD: [R(0, 0, 36, 24, '#ce1126') + P('0,0 12,0 16,3 12,6 16,9 12,12 16,15 12,18 16,21 12,24 0,24', '#fff'), 0],
    AED: [R(0, 0, 36, 24, '#fff') + R(0, 0, 36, 8, '#00732f') + R(0, 16, 36, 8, '#000') + R(0, 0, 10, 24, '#ff0000'), 2],
    SAR: [R(0, 0, 36, 24, '#006c35') + R(9, 8, 18, 1.8, '#fff') + R(12, 11.4, 12, 1.8, '#fff') + R(9, 16.4, 18, 1.5, '#fff') + P('26,16.4 31,17.15 26,17.9', '#fff')],
    QAR: [R(0, 0, 36, 24, '#8a1538') + P('0,0 11,0 15,1.7 11,3.4 15,5.1 11,6.8 15,8.5 11,10.2 15,11.9 11,13.6 15,15.3 11,17 15,18.7 11,20.4 15,22.2 11,24 0,24', '#fff'), 2],
    OMR: [R(0, 0, 36, 8, '#fff') + R(0, 8, 36, 8, '#db161b') + R(0, 16, 36, 8, '#008000') + R(0, 0, 10, 24, '#db161b'), 2],
    JOD: [R(0, 0, 36, 8, '#000') + R(0, 8, 36, 8, '#fff') + R(0, 16, 36, 8, '#007a3d') + P('0,0 18,12 0,24', '#ce1126') + star(5.2, 12, 2.3, '#fff'), 0],
    NGN: [V('#008751', '#fff', '#008751')],
    KES: [R(0, 0, 36, 6.5, '#000') + R(0, 6.5, 36, 1, '#fff') + R(0, 7.5, 36, 9, '#bb0000') + R(0, 16.5, 36, 1, '#fff') + R(0, 17.5, 36, 6.5, '#006600') + '<ellipse cx="18" cy="12" rx="3.4" ry="6.2" fill="#bb0000" stroke="#000" stroke-width="0.9"/>'],
    ZAR: [R(0, 0, 36, 12, '#e03c31') + R(0, 12, 36, 12, '#001489') + P('0,0 5,0 18,9.5 36,9.5 36,14.5 18,14.5 5,24 0,24', '#007749') + P('0,6 7.5,12 0,18', '#000'), 0],
    /* regions used by index icons */
    ES: [R(0, 0, 36, 24, '#c60b1e') + R(0, 6, 36, 12, '#ffc400')],
    FR: [V('#0055a4', '#fff', '#ef4135')],
    DE: [H('#000', '#dd0000', '#ffce00')],
    NL: [H('#ae1c28', '#fff', '#21468b')],
    HK: [R(0, 0, 36, 24, '#de2910') + C(18, 12, 6, '#fff') + C(18, 12, 2, '#de2910')]
  };
  FLAG.CNY = FLAG.CNH;
  FLAG.DKK = [nordic('#c8102e', '#fff'), 3];
  FLAG.SEK = [nordic('#006aa7', '#fecc00'), 3];

  /* ---------------- crypto coins: name/ticker -> [text, background, text colour] ---------------- */
  var CRYPTO = {
    Bitcoin: ['₿', '#f7931a'], BTC: ['₿', '#f7931a'],
    Ethereum: ['Ξ', '#627eea'],
    Dash: ['D', '#008de4'],
    Chainlink: ['LINK', '#2a5ada'],
    BCH: ['BCH', '#8dc351'],
    BNB: ['BNB', '#f3ba2f', '#1b1b1b'],
    Solana: ['SOL', '#7c4dff'],
    Cardano: ['ADA', '#0d3cae'],
    TRON: ['TRX', '#e50914'],
    Toncoin: ['TON', '#0098ea'],
    Avalanche: ['AVAX', '#e84142'],
    Dogecoin: ['Ð', '#c2a633', '#1b1b1b'],
    Polkadot: ['DOT', '#e6007a'],
    Litecoin: ['Ł', '#345d9d'],
    Polygon: ['MATIC', '#8247e5'],
    'Bitcoin ETF': ['ETF', '#b36b00']
  };
  var CRYPTO_KEY = { Bitcoin: 'BTC', Ethereum: 'ETH', Dash: 'DASH', Chainlink: 'LINK', BNB: 'BNB', Solana: 'SOL', Cardano: 'ADA', TRON: 'TRX', Toncoin: 'TON', Avalanche: 'AVAX', Dogecoin: 'DOGE', Polkadot: 'DOT', Litecoin: 'LTC', Polygon: 'MATIC', 'Bitcoin ETF': 'BTCETF', BCH: 'BCH', BTC: 'BTC' };

  /* ---------------- indices: name -> [flag key, number shown on the badge] ---------------- */
  var INDEX = {
    SP500: ['USD', '500'], US100: ['USD', '100'], DJI30: ['USD', '30'],
    JPN225: ['JPY', '225'], 'AUS 200': ['AUD', '200'],
    E35EUR: ['ES', '35'], 'F40/EUR': ['FR', '40'], F40EUR: ['FR', '40'], 'CAC 40': ['FR', '40'],
    'D30/EUR': ['DE', '30'], D30EUR: ['DE', '30'], 'E50/EUR': ['EUR', '50'], E50EUR: ['EUR', '50'],
    '100GBP': ['GBP', '100'], 'AEX 25': ['NL', '25'], 'HONG KONG 33': ['HK', '33'], 'SMI 20': ['CHF', '20']
  };

  /* ---------------- stocks: name -> ticker (a plain identifier, not a logo) ---------------- */
  var STOCK = {
    Apple: 'AAPL', 'Boeing Company': 'BA', 'JPMorgan Chase & Co': 'JPM', "McDonald's": 'MCD', Microsoft: 'MSFT',
    'American Express': 'AXP', 'Johnson & Johnson': 'JNJ', 'Pfizer Inc': 'PFE', ExxonMobil: 'XOM', Cisco: 'CSCO',
    'FACEBOOK INC': 'META', Intel: 'INTC', Netflix: 'NFLX', Alibaba: 'BABA', Tesla: 'TSLA', 'Citigroup Inc': 'C',
    Amazon: 'AMZN', FedEx: 'FDX', VISA: 'V', VIX: 'VIX', 'Palantir Technologies': 'PLTR', 'GameStop Corp': 'GME',
    'Advanced Micro Devices': 'AMD', 'Coinbase Global': 'COIN', 'Marathon Digital Holdings': 'MARA'
  };

  /* ---------------- commodities: original pictograms on a 24x24 canvas ---------------- */
  function bars(top, face, side) {
    function bar(x, y, w, h) {
      var k = h * 0.35;
      return P((x + k) + ',' + y + ' ' + (x + w - k) + ',' + y + ' ' + (x + w) + ',' + (y + h) + ' ' + x + ',' + (y + h), face) +
        P((x + k) + ',' + y + ' ' + (x + w - k) + ',' + y + ' ' + (x + w - k - 0.6) + ',' + (y + h * 0.35) + ' ' + (x + k + 0.6) + ',' + (y + h * 0.35), top) +
        L(x + 1, y + h, x + w - 1, y + h, side, 0.6);
    }
    return bar(1.6, 12.6, 10.4, 6.6) + bar(12, 12.6, 10.4, 6.6) + bar(6.8, 5.6, 10.4, 6.6);
  }
  var DROP = 'M12 3.4s-5.9 6.2-5.9 10.2a5.9 5.9 0 0 0 11.8 0C17.9 9.600 12 3.400 12 3.400z';
  var FLAME = 'M12.200 3c.9 3-2.800 4.600-2.800 8.200a2.700 2.700 0 0 0 5.400 0c0-1-.4-1.700-1-2.500 2.600 1.200 4.100 3.600 4.100 6.300A5.800 5.800 0 0 1 12 20.800a5.800 5.800 0 0 1-5.800-6c0-4.700 5-5.700 6-11.800z';
  var CMD = {
    Gold: ['#3a2c06', bars('#fff0b3', '#f0bd2a', '#9a6b08')],
    Silver: ['#38424e', bars('#ffffff', '#cfd6de', '#7b8794')],
    'Platinum spot': ['#16384a', bars('#e8fbff', '#9fd3e6', '#4d8aa3')],
    'Palladium spot': ['#26233a', bars('#e6e0ff', '#a99fd6', '#5d5390')],
    'Brent Oil': ['#1f2937', '<path d="' + DROP + '" fill="#fbbf24"/><path d="M9.400 15.400a3.200 3.200 0 0 0 2.600 2" stroke="#1f2937" stroke-width="1.200" fill="none" stroke-linecap="round"/>'],
    'WTI Crude Oil': ['#0f3d2e', '<path d="' + DROP + '" fill="#34d399"/><path d="M9.400 15.400a3.200 3.200 0 0 0 2.600 2" stroke="#0f3d2e" stroke-width="1.200" fill="none" stroke-linecap="round"/>'],
    'Natural Gas': ['#0b2447', '<path d="' + FLAME + '" fill="#60a5fa"/><path d="M12 12.600c1.400 1.400 1.900 2.400 1.900 3.300a1.900 1.900 0 0 1-3.800 0c0-.9.500-1.900 1.900-3.300z" fill="#dbeafe"/>']
  };

  /* ---------------- tab / UI glyphs (stroke icons) ---------------- */
  var TAB = {
    forex: '<circle cx="12" cy="12" r="9"/><path d="M14.600 9.300c-.4-.9-1.400-1.500-2.600-1.500-1.500 0-2.600.8-2.600 2 0 2.800 5.200 1.300 5.200 4.100 0 1.200-1.100 2-2.600 2-1.300 0-2.300-.6-2.800-1.500M12 6.200v1.600m0 8.400v1.600"/>',
    crypto: '<path d="M8.500 6.500h5a2.600 2.600 0 0 1 0 5.200h-5m0 0h5.600a2.700 2.700 0 0 1 0 5.400H8.500M8.500 6.500v10.600M10.500 4.500v2m3-2v2m-3 10.600v2m3-2v2"/>',
    index: '<path d="M4 4v16h16"/><path d="M7.500 15l3.500-4.200 3 2.600 4.500-6"/>',
    commodity: '<path d="M12 3.500s-6 6.300-6 10.400a6 6 0 0 0 12 0C18 9.800 12 3.500 12 3.500z"/>',
    stock: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V6.500A1.500 1.500 0 0 1 10.500 5h3A1.500 1.500 0 0 1 15 6.500V8M4 13.500h16"/>',
    fav: '<path d="M12 3.800l2.600 5.300 5.800.8-4.200 4.100 1 5.800L12 17.100l-5.200 2.700 1-5.800-4.200-4.100 5.800-.8z"/>',
    sched: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  function tab(name, size) {
    size = size || 16;
    return '<svg class="ai-tab" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (TAB[name] || '') + '</svg>';
  }

  /* ---------------- rendering ---------------- */
  var overrides = {};
  function setOverrides(map) { overrides = map && typeof map === 'object' ? map : {}; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

  function glyphBox(inner, size, style) {
    return '<span class="ai" style="width:' + size + 'px;height:' + size + 'px;' + (style || '') + '">' + inner + '</span>';
  }
  function textInside(txt, size, color) {
    var n = txt.length, fs = Math.round(size * (n <= 1 ? 0.58 : n <= 2 ? 0.44 : n <= 3 ? 0.31 : n <= 4 ? 0.28 : 0.23));
    return '<span class="ai-t" style="font-size:' + fs + 'px;' + (color ? 'color:' + color : '') + '">' + esc(txt) + '</span>';
  }
  function flagSvg(key, label) {
    var f = FLAG[key];
    if (!f) return null;
    var x0 = f[1] == null ? 6 : f[1];
    return '<svg viewBox="' + x0 + ' 0 24 24" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + f[0] + '</svg>' +
      (label ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="0" y="14.600" width="24" height="9.400" fill="rgba(0,0,0,.58)"/><text x="12" y="21.600" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="' + (label.length > 3 ? 6.4 : 7.6) + '" fill="#fff">' + esc(label) + '</text></svg>' : '');
  }

  /* what an asset is made of: a list of glyph descriptors (1 or 2) */
  function describe(a) {
    var name = String(a.id).replace(/-OTC$/, ''), p;
    switch (a.cat) {
      case 'forex':
        p = name.split('/');
        return [{ k: 'flag', key: p[0] }, { k: 'flag', key: p[1] }];
      case 'crypto':
        if (name.indexOf('/') > 0) { p = name.split('/'); return [{ k: 'crypto', name: p[0] }, { k: 'flag', key: p[1] }]; }
        return [{ k: 'crypto', name: name }];
      case 'index': { var m = INDEX[name]; return [m ? { k: 'idx', key: m[0], num: m[1] } : { k: 'text', text: name.slice(0, 3) }]; }
      case 'stock': return [{ k: 'stock', key: STOCK[name] || name.slice(0, 4).toUpperCase() }];
      case 'commodity': return [{ k: 'cmd', name: name }];
    }
    return [{ k: 'text', text: name.slice(0, 3) }];
  }
  /* true when the glyph resolves to a real drawing (used by tests to catch assets without an icon) */
  function isKnown(g) {
    switch (g.k) {
      case 'flag': return !!FLAG[g.key];
      case 'crypto': return !!CRYPTO[g.name];
      case 'idx': return !!FLAG[g.key];
      case 'stock': return Object.keys(STOCK).some(function (n) { return STOCK[n] === g.key; });
      case 'cmd': return !!CMD[g.name];
    }
    return false;
  }
  function overrideKey(g) {
    if (g.k === 'flag') return 'flag:' + g.key;
    if (g.k === 'crypto') return 'crypto:' + (CRYPTO_KEY[g.name] || g.name);
    if (g.k === 'stock') return 'stock:' + g.key;
    if (g.k === 'cmd') return 'cmd:' + g.name.replace(/\s+/g, '-').toLowerCase();
    if (g.k === 'idx') return 'index:' + g.key + g.num;
    return '';
  }

  function glyph(g, size) {
    var ok = overrides[overrideKey(g)];
    if (ok) return glyphBox('<img class="ai-img" alt="" src="' + (/^(data:|https?:)/.test(ok) ? ok : '/icons/' + encodeURIComponent(ok)) + '">', size);
    var svg;
    switch (g.k) {
      case 'flag':
        svg = flagSvg(g.key);
        return svg ? glyphBox(svg, size) : glyphBox(textInside(g.key || '?', size), size, 'background:linear-gradient(135deg,hsl(' + hue(g.key || '?') + ' 45% 36%),hsl(' + hue(g.key || '?') + ' 45% 22%))');
      case 'idx':
        svg = flagSvg(g.key, g.num);
        return glyphBox(svg || textInside(g.num, size), size);
      case 'crypto': {
        var c = CRYPTO[g.name] || [g.name.slice(0, 3).toUpperCase(), 'hsl(' + hue(g.name) + ' 50% 35%)'];
        return glyphBox(textInside(c[0], size, c[2] || '#fff'), size, 'background:' + c[1]);
      }
      case 'stock': {
        var h = hue(g.key);
        return glyphBox(textInside(g.key, size), size, 'background:linear-gradient(135deg,hsl(' + h + ' 52% 40%),hsl(' + h + ' 52% 24%))');
      }
      case 'cmd': {
        var d = CMD[g.name];
        return glyphBox(d ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + d[1] + '</svg>' : textInside(g.name.slice(0, 2), size), size, 'background:' + (d ? d[0] : 'var(--sand)'));
      }
    }
    return glyphBox(textInside(g.text || '?', size), size);
  }

  /* HTML for one asset icon: single glyph or an overlapping pair */
  function render(asset, size) {
    size = size || 28;
    var gs = describe(asset);
    if (gs.length === 1) return glyph(gs[0], size);
    var overlap = Math.round(size * (gs[0].k === 'crypto' ? 0.14 : 0.34));   // a coin keeps its ticker readable
    return '<span class="ai-pair">' + glyph(gs[0], size) + glyph(gs[1], size).replace('class="ai"', 'class="ai ai-b"').replace('style="', 'style="margin-left:-' + overlap + 'px;') + '</span>';
  }

  root.AssetIcons = {
    render: render, describe: describe, isKnown: isKnown, tab: tab, setOverrides: setOverrides,
    flagKeys: Object.keys(FLAG), stockTickers: STOCK
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
