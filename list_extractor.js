// マルチサイト対応スナイパー v5if
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = t => (t || "").replace(/\s+/g, " ").trim();

  /* =========================================================
     高値要素定義
     ========================================================= */
  const HIGH_MATERIALS = [
    "カシミヤ","モヘア","シルク","ウール","リネン","レザー","スエード","アンゴラ","アルパカ",
    "cashmere","mohair","silk","wool","linen","leather","suede"
  ];
  // 高値色（ネイビー・ブラック系のみ残す）
  const HIGH_COLORS = ["ブラック","ネイビー","black","navy"];
  // XL以上のサイズのみ高値扱い
  const HIGH_SIZES  = ["XL","XXL","2XL","3XL","44","46","48","50","52"];
  const HIGH_WORDS  = ["コラボ","限定","collab","limited","supreme","off-white","offwhite"];

  // 除外する一般素材・色（検索キーワードに含めない）
  const COMMON_MATERIALS = [
    "コットン","ポリエステル","ナイロン","アクリル","レーヨン","綿","化繊",
    "cotton","polyester","nylon","acrylic","rayon"
  ];
  const COMMON_COLORS = [
    "ホワイト","レッド","ピンク","イエロー","オレンジ","パープル","ベージュ",
    "グレー","ブラウン","white","red","pink","yellow","orange","purple",
    "beige","gray","grey","brown","GRY","BLK","WHT","NVY","BEI"
  ];

  /* =========================================================
     セカスト専用：通称名マッピング
     カテゴリ文字列 → 検索で使いやすい通称
     ========================================================= */
  const CATEGORY_ALIAS = {
    "パーカー": "パーカー", "フーディ": "パーカー", "フーディー": "パーカー",
    "スウェット": "スウェット", "スエット": "スウェット", "トレーナー": "スウェット",
    "Tシャツ": "Tシャツ", "ティーシャツ": "Tシャツ",
    "デニム": "デニム", "ジーンズ": "デニム", "ジーパン": "デニム",
    "ジャケット": "ジャケット", "ブルゾン": "ブルゾン",
    "コート": "コート", "ダウン": "ダウンジャケット",
    "カーディガン": "カーディガン", "ニット": "ニット",
    "シャツ": "シャツ", "ポロシャツ": "ポロシャツ",
    "パンツ": "パンツ", "スラックス": "スラックス", "チノ": "チノパン",
    "スカート": "スカート", "ワンピース": "ワンピース",
    "カレッジ": "カレッジ", "スタジャン": "スタジャン",
    "トラックジャケット": "トラックジャケット", "トラックパンツ": "トラックパンツ",
    "ベスト": "ベスト", "タンクトップ": "タンクトップ",
    "キャップ": "キャップ", "ハット": "ハット", "ニット帽": "ニット帽",
    "バッグ": "バッグ", "リュック": "リュック", "トート": "トートバッグ",
    "スニーカー": "スニーカー", "ブーツ": "ブーツ",
  };

  /* =========================================================
     サイト定義
     ========================================================= */
  const SITE_CONFIG = {
    "2ndstreet": {
      test: u => u.hostname.includes("2ndstreet.jp") && u.pathname.startsWith("/search"),
      linkSelector: 'a[href*="/goods/detail/goodsId/"]',
      normalizeUrl: href => normalizeDetailUrl(href),
      hasLens: true
    },
    "kindal": {
      test: u => u.hostname.includes("shop.kind.co.jp") && u.pathname.startsWith("/search"),
      linkSelector: 'a[href*="/products/"]',
      normalizeUrl: href => normalizeDetailUrl(href),
      hasLens: true
    },
    "trefac": {
      test: u => u.hostname.includes("trefac.jp") && (u.pathname.includes("search") || u.pathname.includes("/store/")),
      linkSelector: 'a[href*="/store/"]',
      normalizeUrl: href => normalizeDetailUrl(href),
      hasLens: true,
      filterLink: link => {
        const href = link.getAttribute("href") || "";
        return /\/store\/\d{10,}\//.test(href) && !!link.querySelector("img");
      }
    },
    "yahooauction": {
      test: u => u.hostname.includes("auctions.yahoo.co.jp") &&
        (u.pathname.startsWith("/search") || u.pathname.startsWith("/closedsearch")),
      linkSelector: 'a[href*="/auction/"]',
      normalizeUrl: href => normalizeDetailUrl(href),
      hasLens: false
    }
  };

  function detectSite() {
    try {
      const u = new URL(location.href);
      for (const [key, cfg] of Object.entries(SITE_CONFIG)) {
        if (cfg.test(u)) return { key, cfg };
      }
    } catch {}
    return null;
  }

  function normalizeDetailUrl(href) {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      u.searchParams.delete("srsltid");
      return u.toString();
    } catch { return null; }
  }

  /* =========================================================
     Toast
     ========================================================= */
  const TOAST_ID = "__sniper_toast__";
  let toastTimer = null;
  function showToast(message, ms = 2400) {
    try {
      let el = document.getElementById(TOAST_ID);
      if (!el) {
        el = document.createElement("div");
        el.id = TOAST_ID;
        el.style.cssText = "position:fixed;left:12px;right:12px;bottom:72px;z-index:2147483647;" +
          "background:rgba(17,24,39,0.95);color:#fff;padding:10px 12px;border-radius:12px;" +
          "box-shadow:0 10px 30px rgba(0,0,0,0.25);font-size:13px;line-height:1.3;" +
          "font-family:system-ui,sans-serif;pointer-events:none;" +
          "transform:translateY(6px);opacity:0;transition:opacity 120ms ease,transform 120ms ease";
        document.documentElement.appendChild(el);
      }
      el.textContent = message;
      requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0px)"; });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        const e2 = document.getElementById(TOAST_ID); if (!e2) return;
        e2.style.opacity = "0"; e2.style.transform = "translateY(6px)";
        setTimeout(() => { const e3 = document.getElementById(TOAST_ID); if (e3) e3.remove(); }, 180);
      }, ms);
    } catch {}
  }

  /* =========================================================
     起動モーダル
     ========================================================= */
  const UI_ID = "__sniper_modal__";
  const safeRemoveModal = () => { const r = document.getElementById(UI_ID); if (r) r.remove(); };

  function chooseStartMode(siteName) {
    safeRemoveModal();
    return new Promise(resolve => {
      const root = document.createElement("div");
      root.id = UI_ID;
      root.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);" +
        "display:flex;align-items:center;justify-content:center;padding:14px";
      const panel = document.createElement("div");
      panel.style.cssText = "width:min(520px,100%);background:#fff;border-radius:14px;" +
        "padding:14px;font-family:system-ui,sans-serif";
      const title = document.createElement("div");
      title.textContent = siteName + " スナイパー";
      title.style.cssText = "font-size:16px;font-weight:700;margin:0 0 8px";
      const desc = document.createElement("div");
      desc.textContent = "分析ボタンを各商品に配置します。";
      desc.style.cssText = "font-size:13px;color:#333;margin:0 0 12px";
      const btnWrap = document.createElement("div");
      btnWrap.style.cssText = "display:grid;gap:10px";
      const mkBtn = (text, sub, mode, bg, color, border) => {
        const b = document.createElement("button");
        b.type = "button";
        b.style.cssText = "width:100%;text-align:left;padding:12px;border-radius:12px;" +
          "background:" + bg + ";color:" + color + ";border:1px solid " + border + ";" +
          "font-size:14px;cursor:pointer";
        b.innerHTML = '<div style="font-weight:700;margin:0 0 4px">' + text +
          '</div><div style="font-size:12px;opacity:.8">' + sub + '</div>';
        b.onclick = () => { safeRemoveModal(); resolve(mode); };
        return b;
      };
      btnWrap.append(
        mkBtn("実行", "商品一覧に分析ボタンを配置します", "run", "#111827", "#fff", "#111827"),
        mkBtn("キャンセル", "何もせず終了します", "abort", "#fff", "#b91c1c", "#fecaca")
      );
      panel.append(title, desc, btnWrap);
      root.append(panel);
      root.onclick = e => { if (e.target === root) { safeRemoveModal(); resolve("abort"); } };
      document.documentElement.append(root);
    });
  }

  /* =========================================================
     汎用ユーティリティ
     ========================================================= */
  function getDtValue(doc, keywords) {
    // dt→dd、th→td（nextElementSibling or 同行td）すべて対応
    const labels = [...doc.querySelectorAll("dt,th,.label,.item-label,.spec-name")];
    for (const label of labels) {
      if (keywords.some(k => clean(label.textContent).includes(k))) {
        const next = label.nextElementSibling;
        if (next) return clean(next.textContent);
        // th が tr 内にある場合、同じ tr 内の td を探す
        const tr = label.closest("tr");
        if (tr) {
          const td = tr.querySelector("td");
          if (td) return clean(td.textContent);
        }
      }
    }
    return "";
  }

  function getJsonLd(doc) {
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        const obj = Array.isArray(j) ? j[0] : j;
        if (obj["@type"] === "Product" || obj.name) return obj;
      } catch {}
    }
    return null;
  }

  // 型番パターン（全サイト対応強化版）
  function extractModelCode(text) {
    const patterns = [
      // UEO011A-206-49 など：英数字-数字-数字（3セグメント）
      /\b([A-Z]{1,4}\d{2,}[A-Z]?-\d{2,}-\d{2,})\b/i,
      // CT2933-100 / UEO011A-206 など：英字+数字-数字
      /\b([A-Z]{1,4}\d{3,}[A-Z]?-\d{2,}[A-Z0-9]*)\b/i,
      // 23-03150M / 14-00713M など：数字2桁-数字4桁以上+末尾英字任意
      /\b(\d{2}-\d{4,}[A-Z]?)\b/,
      // NT11601R / HR8693 など：英字1〜4+数字4桁以上+末尾英字任意
      /\b([A-Z]{1,4}\d{4,}[A-Z]?)\b/i,
      // 既存：英字-数字 (A03-05001)
      /\b([A-Z]{1,5}-\d{3,}[A-Z0-9-]*)\b/i,
      // 既存：英字+数字 (AB1234X)
      /\b([A-Z]{2,}\d{3,}[A-Z0-9]*)\b/,
      // 既存：数字+英字 (1234AB)
      /\b(\d{3,}[A-Z]{2,}[A-Z0-9-]*)\b/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1];
    }
    return "";
  }

  // 高値要素抽出
  function extractHighValueFactors(allText, sizeText) {
    const factors = [];
    const t = allText.toLowerCase();
    for (const m of HIGH_MATERIALS) {
      if (t.includes(m.toLowerCase())) factors.push(m);
    }
    for (const c of HIGH_COLORS) {
      if (t.includes(c.toLowerCase())) factors.push(c);
    }
    if (sizeText) {
      for (const s of HIGH_SIZES) {
        if (sizeText.toUpperCase().includes(s)) { factors.push(s); break; }
      }
    }
    for (const w of HIGH_WORDS) {
      if (t.includes(w.toLowerCase())) factors.push(w);
    }
    return [...new Set(factors)];
  }

  // 一般素材・色・サイズ記号を除去してクリーンな商品名に
  function cleanItemName(raw) {
    if (!raw) return "";
    let name = raw.split("/")[0].trim();
    name = name.replace(/\b[A-Z]{1,5}-\d{3,}[A-Z0-9-]*\b/gi, "");
    name = name.replace(/\b[A-Z]{2,}\d{3,}[A-Z0-9-]*\b/g, "");
    for (const m of COMMON_MATERIALS) name = name.replace(new RegExp(m, "gi"), "");
    for (const c of COMMON_COLORS)    name = name.replace(new RegExp(c, "gi"), "");
    name = name.replace(/\b(XS|S|M|L|XL|XXL|2XL|3XL|\d{2,3}cm|\d{2}号)\b/gi, "");
    name = name.replace(/[/\\|_,、。・]+/g, " ").replace(/\s+/g, " ").trim();
    return name;
  }


  /* =========================================================
     トレファク専用パーサー
     型番：td.gddescription_detail_data[0]
     商品名：p.gdname
     ========================================================= */
  function parseTrefac(doc) {
    // 型番：「型番」ラベル（th）の同行td を取得
    // 例: <th>型番</th><td class="gddescription_detail_data">CT2933-100</td>
    let modelCode = getDtValue(doc, ["型番","品番","モデル番号"]);
    if (!modelCode) {
      // fallback: td.gddescription_detail_data を全探索
      const tdCells = [...doc.querySelectorAll("td.gddescription_detail_data")];
      for (const td of tdCells) {
        const t = clean(td.textContent);
        if (/^[A-Z0-9][A-Z0-9\-]{2,}$/i.test(t) && t.length <= 20) {
          modelCode = t; break;
        }
      }
    }
    const itemNameEl = doc.querySelector("p.gdname");
    const rawName = clean(itemNameEl?.textContent || "");

    // ブランドと商品名を分離（"adidas　トラックパンツ" → brand:adidas, item:トラックパンツ）
    let brand = "";
    let itemName = rawName;
    const spaceMatch = rawName.match(/^([A-Za-z0-9 ]+?)[　\s]+(.+)$/);
    if (spaceMatch) {
      brand    = spaceMatch[1].trim();
      itemName = spaceMatch[2].trim();
    }

    // サイズ
    const sizeEl = doc.querySelector("p.gdsize");
    const sizeText = clean(sizeEl?.textContent || "");
    const sizeMatch = sizeText.match(/タグ表記サイズ[：:]\s*([^\s（(]+)/);
    const size = sizeMatch ? sizeMatch[1] : "";

    const scopeText = [rawName, size].join(" ");
    const highValueFactors = extractHighValueFactors(scopeText, size);

    return { brand, itemName, modelCode, highValueFactors };
  }

  /* =========================================================
     カインドオル専用パーサー
     h1.product-title に「商品名+型番」が混在
     例: "ボタンブルゾン14-00713M"
     ========================================================= */
  function parseKindal(doc) {
    const h1 = doc.querySelector("h1.product-title, h1");
    const rawName = clean(h1?.textContent || "");

    // 型番：「型番」ラベル（dt）の直後の dd を取得
    // 例: <dt>型番</dt><dd>TSAWF301SZ Boa Fleece Jacket</dd>
    let modelCode = getDtValue(doc, ["型番","品番","モデル番号","model no","sku"]);
    // getDtValueで取れた場合、先頭の英数字部分のみ抽出（商品名が混入している場合）
    // 例: "TSAWF301SZ Boa Fleece Jacket" → "TSAWF301SZ"
    if (modelCode) {
      const firstToken = modelCode.split(/[\s\u3000]/)[0];
      if (/^[A-Z0-9][A-Z0-9\-]{2,}$/i.test(firstToken)) modelCode = firstToken;
    }
    if (!modelCode) modelCode = extractModelCode(rawName);

    // ブランドはdt/ddから
    let brand = getDtValue(doc, ["ブランド","brand"]);
    const jld = getJsonLd(doc);
    if (!brand && jld) brand = (typeof jld.brand === "object" ? jld.brand.name : jld.brand) || "";
    brand = clean(brand);

    // 商品名：rawNameから型番除去
    let itemName = rawName.replace(modelCode, "").trim();
    itemName = cleanItemName(itemName);

    const size = getDtValue(doc, ["サイズ","size"]);
    const scopeText = [rawName, size, getDtValue(doc, ["素材","material"])].join(" ");
    const highValueFactors = extractHighValueFactors(scopeText, size);

    return { brand, itemName, modelCode, highValueFactors };
  }

  /* =========================================================
     ヤフオク専用パーサー
     h1タグ直接取得（クラス名が動的ハッシュのため）
     例: "adidas アディダス GD9923 ロゴプリント パーカー sizeL/イエロー"
     ========================================================= */
  function parseYahooAuction(doc) {
    const h1 = doc.querySelector("h1");
    const rawName = clean(h1?.textContent || "");

    // 型番を抽出
    const modelCode = extractModelCode(rawName);

    // ブランド候補：先頭の英字部分
    let brand = "";
    const brandMatch = rawName.match(/^([A-Za-z][A-Za-z0-9 ]*?)[\s　]/);
    if (brandMatch) brand = brandMatch[1].trim();

    // 商品名：ブランド部分を除いてクリーンアップ
    let itemName = rawName;
    if (brand) {
      // "adidas アディダス ..." → カタカナのブランド名表記も除去
      itemName = itemName.replace(new RegExp("^" + brand + "[\\s　]+"), "");
      // カタカナブランド名（先頭カタカナ列）も除去
      itemName = itemName.replace(/^[\u30A0-\u30FF]+[\s　]+/, "");
    }
    itemName = cleanItemName(itemName);

    // サイズ（"sizeL" "sizeXL" などの表記）
    const sizeMatch = rawName.match(/size([A-Z0-9]+)/i);
    const size = sizeMatch ? sizeMatch[1].toUpperCase() : "";

    const highValueFactors = extractHighValueFactors(rawName, size);

    return { brand, itemName, modelCode, highValueFactors };
  }

  /* =========================================================
     商品情報抽出メイン（サイト別に振り分け）
     ========================================================= */
  function extractProductInfo(doc, siteKey) {
    // セカスト（新エンジンpatch_fullExtractで処理するため汎用フォールバックへ）
    // トレファク
    if (siteKey === "trefac") {
      return parseTrefac(doc);
    }
    // カインドオル
    if (siteKey === "kindal") {
      return parseKindal(doc);
    }
    // ヤフオク
    if (siteKey === "yahooauction") {
      return parseYahooAuction(doc);
    }

    // ===== 汎用フォールバック =====
    const jld = getJsonLd(doc);
    let brand = getDtValue(doc, ["ブランド","brand"]);
    if (!brand && jld) brand = (typeof jld.brand === "object" ? jld.brand.name : jld.brand) || "";
    if (!brand) brand = clean(doc.querySelector("h1")?.textContent || "");
    brand = clean(brand);

    let size = getDtValue(doc, ["サイズ","size"]);
    if (!size && jld) size = jld.size || "";
    size = clean(size);

    const h1 = doc.querySelector("h1");
    let rawName = h1 ? clean(h1.textContent) : (jld?.name || "");
    let itemName = rawName;
    if (brand && itemName.toLowerCase().startsWith(brand.toLowerCase())) {
      itemName = itemName.slice(brand.length).trim();
    }
    itemName = cleanItemName(itemName);

    let modelCode = getDtValue(doc, ["型番","品番","モデル番号","model","sku"]);
    if (!modelCode && jld) modelCode = jld.mpn || jld.sku || "";
    if (!modelCode) modelCode = extractModelCode(rawName);
    if (!modelCode) {
      for (const el of doc.querySelectorAll("p,li,td,dd,span")) {
        const code = extractModelCode(clean(el.textContent));
        if (code) { modelCode = code; break; }
      }
    }
    modelCode = clean(modelCode);

    const scopeText = [rawName, size, getDtValue(doc, ["素材","material"])].join(" ");
    const highValueFactors = extractHighValueFactors(scopeText, size);

    return { brand, itemName, modelCode, highValueFactors };
  }

  /* =========================================================
     画像URL取得
     ========================================================= */
  function extractImageUrl(doc, siteKey) {
    if (siteKey === "trefac") {
      const i = doc.querySelector("img[src*='/image/item/']");
      if (i && i.src) return i.src.replace(/\/w\d+\//, "/w800/");
    }
    for (const sel of ["main img",".slick-slide img",".goodsMainImage img",".item-main img","img"]) {
      const i = doc.querySelector(sel);
      if (i && i.src) return i.src;
    }
    return "";
  }

  /* =========================================================
     詳細ページfetch
     ========================================================= */
  async function fetchDetailInfo(url, siteKey) {
    try {
      const r = await fetch(url, { credentials: "include" });
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const info = extractProductInfo(doc, siteKey); // ← siteKeyを渡す
      return { imageUrl: extractImageUrl(doc, siteKey), ...info };
    } catch {
      return { imageUrl: "", brand: "", itemName: "", modelCode: "", highValueFactors: [] };
    }
  }

  /* =========================================================
     Google Lens POST
     ========================================================= */
  async function openLensWithBlob(imageUrl, brand) {
    if (!imageUrl) return;
    let blob = null;
    try {
      const res = await fetch(imageUrl, { mode: "cors", credentials: "omit" });
      blob = await res.blob();
    } catch {
      try {
        blob = await new Promise((resolve, reject) => {
          const img = new Image(); img.crossOrigin = "anonymous";
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width; c.height = img.height;
            c.getContext("2d").drawImage(img, 0, 0);
            c.toBlob(b => b ? resolve(b) : reject(), "image/jpeg", 0.9);
          };
          img.onerror = reject;
          img.src = imageUrl;
        });
      } catch {
        showToast("画像取得失敗 — Lensをスキップします", 2400);
        return;
      }
    }
    const searchKw = (brand ? brand + " " : "") + "メルカリ";
    const file = new File([blob], "image.jpg", { type: "image/jpeg" });
    const newWin = window.open("", "_blank");
    if (!newWin) { showToast("ポップアップをブロックされています", 2400); return; }
    const d = newWin.document;
    d.open();
    d.write('<html><head><meta name="referrer" content="no-referrer"></head>' +
      '<body style="background:#0f172a;color:#fff;text-align:center;padding-top:20%">' +
      '<p>Lensへ転送中...</p></body></html>');
    d.close();
    await sleep(200);
    const form = d.createElement("form");
    form.method = "POST";
    form.action = "https://lens.google.com/upload?ep=gisbubu&hl=ja&q=" + encodeURIComponent(searchKw);
    form.enctype = "multipart/form-data";
    const inp = d.createElement("input");
    inp.type = "file"; inp.name = "encoded_image";
    const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files;
    form.appendChild(inp); d.body.appendChild(form); form.submit();
  }

  /* =========================================================
     サブメニュー
     ========================================================= */
  const SUB_ID = "__sniper_sub__";
  function safeRemoveSub() { const r = document.getElementById(SUB_ID); if (r) r.remove(); }

  function showSubMenu(anchorEl, info, detailUrl, siteKey) {
    safeRemoveSub();
    const imageUrl = info.imageUrl;
    const brand          = info._newBrand    || info.brand    || "";
    const itemName       = info._newItem     || info.itemName || "";
    const modelCode      = info._newModel    || info.modelCode || "";
    const highValueFactors = (info._newHighVals && info._newHighVals.length)
                             ? info._newHighVals : (info.highValueFactors || []);
    const kw1 = modelCode || null;
    const kw2parts = [brand, itemName, ...highValueFactors].filter(Boolean);
    const kw2 = kw2parts.length ? kw2parts.join(" ") : null;

    const menu = document.createElement("div");
    menu.id = SUB_ID;
    const rect = anchorEl.getBoundingClientRect();
    const top  = rect.bottom + window.scrollY + 4;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 230);
    menu.style.cssText =
      "position:absolute;top:" + top + "px;left:" + left + "px;" +
      "z-index:2147483647;background:#1e293b;border:1px solid rgba(255,255,255,0.15);" +
      "border-radius:12px;padding:8px;min-width:220px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,0.5);font-family:system-ui,sans-serif";

    const mkRow = (icon, label, sub, onclick) => {
      const row = document.createElement("button");
      row.type = "button";
      row.style.cssText =
        "display:flex;align-items:flex-start;gap:8px;width:100%;" +
        "background:none;border:none;color:#e2e8f0;padding:8px 10px;" +
        "border-radius:8px;cursor:pointer;text-align:left";
      row.innerHTML =
        '<span style="font-size:16px;flex-shrink:0">' + icon + '</span>' +
        '<span><span style="display:block;font-size:13px;font-weight:700">' + label + '</span>' +
        (sub ? '<span style="display:block;font-size:11px;color:#64748b;word-break:break-all">' +
          sub + '</span>' : '') + '</span>';
      row.onmouseenter = () => row.style.background = "rgba(255,255,255,0.07)";
      row.onmouseleave = () => row.style.background = "none";
      row.onclick = () => { safeRemoveSub(); onclick(); };
      return row;
    };

    const sep = () => {
      const d = document.createElement("div");
      d.style.cssText = "height:1px;background:rgba(255,255,255,0.08);margin:4px 0";
      return d;
    };

    // 📄 詳細ページ
    menu.appendChild(mkRow("📄", "詳細ページを開く", "", () => window.open(detailUrl, "_blank")));

    // 🔎 Lens（ヤフオクはなし）
    if (siteKey !== "yahooauction") {
      menu.appendChild(mkRow("🔎", "Lensで検索", brand || "",
        async () => await openLensWithBlob(imageUrl, brand)));
    }

    menu.appendChild(sep());

    // 🛍️ ① 型番検索
    if (kw1) {
      menu.appendChild(mkRow("🛍️", "① 型番検索", kw1,
        () => window.open(buildMercariUrl(kw1), "_blank")));
    } else {
      menu.appendChild(mkRow("🛍️", "① 型番検索", "（型番取得できず）",
        () => showToast("型番が取得できませんでした", 2000)));
    }

    // 🛍️ ② ブランド＋商品名＋高値要素
    if (kw2) {
      menu.appendChild(mkRow("🛍️", "② ブランド＋商品名", kw2,
        () => window.open(buildMercariUrl(kw2), "_blank")));
    }

    // 💎 シリーズ判定行を先に追加（判定結果は非同期で更新）
    const seriesRow = document.createElement("div");
    seriesRow.style.cssText = "padding:8px 10px;font-size:12px;color:#94a3b8;font-family:system-ui,sans-serif";
    seriesRow.textContent = "💎 シリーズ判定中...";
    menu.insertBefore(seriesRow, menu.firstChild);

    document.documentElement.appendChild(menu);

    // 型番からGoogle検索でシリーズ名を取得
    // 型番が英字を含む5文字以上の場合のみGoogle検索
    if (modelCode && modelCode.length >= 5 && /[A-Za-z]/.test(modelCode)) {
      // メッセージ受信リスナー登録
      const seriesListener = (msg) => {
        if (msg.type !== "SERIES_RESULT") return;
        chrome.runtime.onMessage.removeListener(seriesListener);

        const el = document.getElementById(SUB_ID);
        if (!el) return;
        const row = el.querySelector("div");
        if (!row) return;

        const SERIES_LIMITS = {
          "GRAND SEIKO": 80000, "グランドセイコー": 80000,
          "KING SEIKO": 30000, "キングセイコー": 30000,
          "PROSPEX": 25000, "プロスペックス": 25000,
          "PRESAGE": 20000, "プレザージュ": 20000,
          "BRIGHTZ": 18000, "ブライツ": 18000,
          "ASTRON": 40000, "アストロン": 40000,
          "LUKIA": 10000, "ルキア": 10000,
          "SEIKO 5 SPORT": 8000, "セイコー5スポーツ": 8000,
          "OCEANUS": 35000, "オシアナス": 35000,
          "MR-G": 70000, "MT-G": 35000,
          "FROGMAN": 20000, "フロッグマン": 20000,
          "MUDMASTER": 15000, "マッドマスター": 15000,
          "G-STEEL": 6000, "PRO TREK": 20000, "プロトレック": 20000,
          "THE CITIZEN": 70000, "CAMPANOLA": 50000, "カンパノラ": 50000,
          "ATTESA": 20000, "アテッサ": 20000,
          "PROMASTER": 18000, "プロマスター": 18000,
          "EXCEED": 8000, "エクシード": 8000,
        };

        if (msg.series) {
          const limit = SERIES_LIMITS[msg.series];
          row.style.color = "#fbbf24";
          row.style.fontWeight = "900";
          row.style.background = "rgba(0,0,0,0.3)";
          row.style.borderRadius = "6px";
          row.textContent = `💎 ${msg.series}（上限¥${limit ? limit.toLocaleString() : "?"}）`;
        } else {
          row.textContent = "💎 シリーズ判定：該当なし";
        }
      };
      chrome.runtime.onMessage.addListener(seriesListener);

      // Google検索を新タブで開く
      chrome.runtime.sendMessage({ type: "OPEN_SERIES_SEARCH", modelCode });
    } else {
      seriesRow.textContent = modelCode ? "💎 型番不明（数字のみ）" : "💎 型番なし（判定不可）";
    }

    setTimeout(() => {
      document.addEventListener("click", function handler(e) {
        if (!menu.contains(e.target)) {
          safeRemoveSub();
          document.removeEventListener("click", handler);
        }
      });
    }, 100);
  }

  
  /* ====== Patch領域 ====== */
  /* =========================================================
     メルカリURL構築
     ========================================================= */
  function buildMercariUrl(keyword) {
    return "https://jp.mercari.com/search?keyword=" + encodeURIComponent(keyword) +
      "&item_condition_id=3" +
      "&status=sold_out&seller_type=0&item_types=mercari&sort=created_time&order=desc";
  }
  /* ======================= */

  /* =========================================================
     ボタン注入
     ========================================================= */
  function injectAnalysisButtons(cfg, siteKey) {
    // PATCH: フェーズ1 ゴミ箱フィルター＆ホットハイライト初期化
    patch_applyListFilter(siteKey);

    const items = document.querySelectorAll(cfg.linkSelector);
    let addedCount = 0;

    items.forEach(link => {
      if (cfg.filterLink ? !cfg.filterLink(link) : !link.querySelector("img")) return;
      if (link.dataset.sniperBtn) return;
      link.dataset.sniperBtn = "true";

      link.style.position = "relative";
      if (window.getComputedStyle(link).display === "inline") link.style.display = "inline-block";

      const btn = document.createElement("button");
      btn.textContent = "🔍分析";
      btn.style.cssText =
        "position:absolute;right:4px;top:4px;z-index:2147483647;" +
        "background:rgba(220,38,38,0.95);color:#fff;border:2px solid #fff;" +
        "border-radius:6px;padding:8px 12px;font-size:12px;font-weight:bold;" +
        "box-shadow:0 4px 12px rgba(0,0,0,0.5);pointer-events:auto;line-height:1";

      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        safeRemoveSub();
        const orig = btn.textContent;
        btn.textContent = "⏳...";
        try {
          const detailUrl = cfg.normalizeUrl(link.getAttribute("href"));
          if (!detailUrl) return;
          const info = await fetchDetailInfo(detailUrl, siteKey);
          const rawText = patch_getItemText(link);
          const newEngineResult = patch_fullExtract(rawText);

          info._newBrand   = newEngineResult.brand;
          info._newItem    = newEngineResult.pureName;
          info._newModel   = newEngineResult.modelCode;
          info._newHighVals= newEngineResult.highVals;

          btn.textContent = orig;
          showSubMenu(btn, info, detailUrl, siteKey);
        } catch (err) {
          console.error("分析エラー:", err);
          btn.textContent = orig;
        }
      };

      link.appendChild(btn);
      addedCount++;
    });

    showToast(
      addedCount > 0
        ? addedCount + "件に分析ボタンを配置しました"
        : "商品が見つからないか、既に配置済みです",
      2600
    );
  }

  /* =========================================================
     メイン
     ========================================================= */
  const SITE_NAMES = {
    "2ndstreet":    "2nd STREET",
    "kindal":       "カインドオル",
    "trefac":       "トレファク",
    "yahooauction": "ヤフオク"
  };

  /* =========================================================
     Google レンズ結果ページ：メルカリリンクにintentボタン注入
     ========================================================= */
  function buildMercariIntent(keyword) {
    return "https://jp.mercari.com/search?keyword=" + encodeURIComponent(keyword);
  }

  // レンズ結果タイトルから不要な suffix を除去
  function cleanLensTitle(raw) {
    return raw
      .replace(/\s*[-–]\s*メルカリ.*$/i, "")   // "- メルカリ" 以降を除去
      .replace(/在庫あり|売り切れ|SOLD/gi, "")   // ステータス除去
      .replace(/\s+/g, " ")
      .trim();
  }

  function injectLensResultButtons() {
    // すでに注入済みならスキップ
    if (document.querySelector("[data-sniper-lens-btn]")) return;

    const links = [...document.querySelectorAll("a[href*='mercari.com']")];
    if (links.length === 0) return;

    let injected = 0;
    links.forEach(link => {
      if (link.dataset.sniperLensBtn) return;
      link.dataset.sniperLensBtn = "true";

      // タイトルテキスト：サイト名（Mercari等）を除いた最長テキストを取得
      const SKIP_WORDS = /^(mercari|メルカリ|yahoo|rakuten|amazon|楽天)$/i;
      const titleEl = [...link.querySelectorAll("div, span, p, h3")]
        .filter(el => el.children.length === 0)
        .filter(el => {
          const t = el.textContent.trim();
          return t.length > 4 && !SKIP_WORDS.test(t);
        })
        .sort((a, b) => b.textContent.trim().length - a.textContent.trim().length)[0];
      const raw = clean(titleEl?.textContent || "");
      const keyword = cleanLensTitle(raw);
      if (!keyword) return;

      const btn = document.createElement("a");
      btn.href = "#";
      btn.textContent = "📲 メルカリで開く（2タブ）";
      btn.style.cssText =
        "display:block;margin:4px 0 2px;padding:6px 10px;" +
        "background:#FF0211;color:#fff;border-radius:6px;" +
        "font-size:12px;font-weight:700;text-decoration:none;" +
        "font-family:system-ui,sans-serif;line-height:1.4;text-align:center";
      // クリック時に①絞り込みなし ②売り切れ&新しい順 の2タブを同時展開
      btn.onclick = (e) => {
        e.preventDefault();
        // ①絞り込みなし
        window.open("https://jp.mercari.com/search?keyword=" + encodeURIComponent(keyword), "_blank");
        // ②売り切れ＆新しい順
        window.open(buildMercariUrl(keyword), "_blank");
      };

      // タイトルテキストの直後に挿入（画像の下）
      const titleParent = titleEl?.parentElement || link.parentElement;
      if (titleParent) {
        titleParent.insertAdjacentElement("afterend", btn);
        injected++;
      }
    });

    if (injected > 0) showToast(injected + "件にアプリ起動ボタンを追加しました", 2000);
  }

  /* =========================================================
     メルカリ商品ページ：出品日→売れた日数を表示
     ========================================================= */
  async function generateDPoP(url, method) {
    try {
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );
      const pubKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
      // JWK thumbprint (RFC7638) - sha256 of canonical JSON
      const thumbprintStr = JSON.stringify({
        crv: pubKeyJwk.crv,
        kty: pubKeyJwk.kty,
        x: pubKeyJwk.x,
        y: pubKeyJwk.y
      });
      const thumbprintBuf = await crypto.subtle.digest("SHA-256",
        new TextEncoder().encode(thumbprintStr));
      const jkt = btoa(String.fromCharCode(...new Uint8Array(thumbprintBuf)))
        .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");

      const header = { typ: "dpop+jwt", alg: "ES256",
        jwk: { kty: pubKeyJwk.kty, crv: pubKeyJwk.crv, x: pubKeyJwk.x, y: pubKeyJwk.y } };
      const payload = {
        jti: Math.random().toString(36).slice(2),
        htm: method,
        htu: url,
        iat: Math.floor(Date.now() / 1000)
      };
      const b64 = obj => btoa(JSON.stringify(obj))
        .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
      const signing = b64(header) + "." + b64(payload);
      const sigBuf = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        new TextEncoder().encode(signing)
      );
      const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
        .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
      return signing + "." + sig;
    } catch(e) {
      return null;
    }
  }

  // 日時フォーマット
  function fmtDate(dt) {
    return dt.getFullYear() + "/" +
      String(dt.getMonth()+1).padStart(2,"0") + "/" +
      String(dt.getDate()).padStart(2,"0") + " " +
      String(dt.getHours()).padStart(2,"0") + ":" +
      String(dt.getMinutes()).padStart(2,"0") + ":" +
      String(dt.getSeconds()).padStart(2,"0");
  }

  // バッジ・日時枠を実際にDOMに挿入する（データを受け取って描画のみ担当）
  function renderMercariInfo(label, created, updated, isSold) {
    // バッジ（fixed）
    let badge = document.getElementById("__sniper_days__");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "__sniper_days__";
      badge.style.cssText =
        "position:fixed;bottom:80px;right:12px;z-index:2147483647;" +
        "padding:6px 12px;background:rgba(59,130,246,0.9);color:#fff;" +
        "border-radius:8px;font-size:0.85em;font-weight:700;" +
        "box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none;";
      document.body.appendChild(badge);
    }
    badge.textContent = "⏱ " + label;

    // 日時枠（インライン挿入）
    let wrap = document.getElementById("__sniper_datetime__");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "__sniper_datetime__";
      wrap.style.cssText =
        "margin:12px 16px;padding:10px 14px;" +
        "background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);" +
        "border-radius:10px;font-size:0.82em;color:#cbd5e1;line-height:2;";
    }
    wrap.innerHTML =
      "<div>📅 <b>出品日時</b>　" + fmtDate(created) + "</div>" +
      (isSold && updated ? "<div>🛒 <b>販売日時</b>　" + fmtDate(updated) + "</div>" : "");

    // 挿入先を毎回探して挿入（SPAで消えても再挿入できるように）
    if (!document.getElementById("__sniper_datetime__")) {
      const target =
        document.querySelector("#shopComment") ||
        document.querySelector("mer-item-details") ||
        document.querySelector("section") ||
        document.querySelector("main");
      if (target) {
        target.parentNode.insertBefore(wrap, target);
      } else {
        document.body.appendChild(wrap);
      }
    }
  }

  // API取得済みデータをキャッシュ（SPA遷移で再取得しないため）
  let _mercariCache = null;
  let _mercariCacheId = null;

  async function tryInjectMercariDays() {
    const idMatch = location.pathname.match(/\/(m\w+)/);
    if (!idMatch) return false;
    const itemId = idMatch[1];

    // キャッシュがあれば再描画のみ
    if (_mercariCacheId === itemId && _mercariCache) {
      const { label, created, updated, isSold } = _mercariCache;
      renderMercariInfo(label, created, updated, isSold);
      return true;
    }

    // APIから取得
    const apiUrl = "https://api.mercari.jp/items/get?id=" + itemId +
      "&include_item_attributes=true&include_product_page_component=true" +
      "&include_non_ui_item_attributes=true&include_donation=true" +
      "&include_item_attributes_sections=true&include_auction=true";

    generateDPoP(apiUrl, "GET").then(dpop => {
      const headers = { "X-Platform": "web", "Accept": "application/json" };
      if (dpop) headers["DPoP"] = dpop;
      return fetch(apiUrl, { credentials: "include", headers });
    })
    .then(r => r.json())
    .then(data => {
      const item = data.result?.data || data.data || data.result || data;
      if (!item || !item.created) return;

      const created = new Date(item.created * 1000);
      const updated = item.updated ? new Date(item.updated * 1000) : null;
      const now = new Date();
      const isSold = item.status === "ITEM_STATUS_SOLD_OUT" || item.status === "trading" || item.status === "sold_out";
      let label;
      if (isSold && updated) {
        const d = Math.round((updated - created) / 86400000);
        label = d <= 0 ? "当日売れた" : d + "日で売れた";
      } else {
        const d = Math.round((now - created) / 86400000);
        label = "出品から" + d + "日経過";
      }

      // キャッシュ保存
      _mercariCacheId = itemId;
      _mercariCache = { label, created, updated, isSold };

      renderMercariInfo(label, created, updated, isSold);
    })
    .catch(() => {});

    return true;
  }

  function isMercariItemPage() {
    return location.hostname.includes("jp.mercari.com") &&
      location.pathname.startsWith("/item/");
  }

  function isMercariShopsPage() {
    return (location.hostname.includes("mercari-shops.com") &&
            location.pathname.includes("/products/")) ||
           (location.hostname.includes("jp.mercari.com") &&
            location.pathname.startsWith("/shops/product/"));
  }

  // メルカリShops：GraphQLから日時を取得して表示
  function tryInjectShopsDays() {
    if (document.getElementById("__sniper_days__")) return;

    const idMatch = location.pathname.match(/\/products\/([^\/\?]+)/) ||
                    location.pathname.match(/\/shops\/product\/([^\/\?]+)/);
    if (!idMatch) return;
    const productId = idMatch[1];

    fetch('https://mercari-shops.com/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: '{ product(id:"' + productId + '"){createdAt updatedAt}}'
      })
    })
    .then(r => r.json())
    .then(data => {
      const p = data?.data?.product;
      if (!p || !p.createdAt) return;
      // 売り切れテキストが出るまで最大3秒リトライ
      const createdAt = p.createdAt;
      const updatedAt = p.updatedAt;
      const checkSold = (retry) => {
        // innerText はリフローを誘発するため textContent で代替。
        // document.body.textContent は <script> 内のJSONも拾い誤検知する危険があるため、
        // main / article / [role="main"] など実表示コンテナに絞って取得する。
        const _container = document.querySelector('main, article, [role="main"], #__next') || document.body;
        const _text = Array.from(_container.childNodes)
          .filter(n => n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE')
          .map(n => n.textContent)
          .join(' ');
        const isSold = /売り切れ|SOLD\s*OUT|sold.out/i.test(_text);
        if (isSold || retry <= 0) {
          _renderShopsInfo(createdAt, updatedAt, isSold);
        } else {
          setTimeout(() => checkSold(retry - 1), 500);
        }
      };
      checkSold(6);
    })
    .catch(() => {});
  }

  function _renderShopsInfo(createdTs, updatedTs, isSold) {
    if (document.getElementById("__sniper_days__")) return;

    const created = new Date(createdTs * 1000);
    const updated = updatedTs ? new Date(updatedTs * 1000) : null;
    const now = new Date();

    const d = isSold && updated
      ? Math.round((updated - created) / 86400000)
      : Math.round((now - created) / 86400000);
    const label = isSold && updated
      ? (d <= 0 ? "当日売れた" : d + "日で売れた")
      : "出品から" + d + "日経過";

    // バッジ
    const badge = document.createElement("div");
    badge.id = "__sniper_days__";
    badge.textContent = "⏱ " + label;
    badge.style.cssText =
      "position:fixed;bottom:80px;right:12px;z-index:2147483647;" +
      "padding:6px 12px;background:rgba(59,130,246,0.9);color:#fff;" +
      "border-radius:8px;font-size:0.85em;font-weight:700;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none;";
    document.body.appendChild(badge);

    // 日時枠：body直下に追加（SPAでmainが不安定なため）
    if (!document.getElementById("__sniper_datetime__")) {
      const wrap = document.createElement("div");
      wrap.id = "__sniper_datetime__";
      wrap.style.cssText =
        "position:fixed;bottom:140px;right:12px;z-index:2147483646;" +
        "padding:10px 14px;" +
        "background:rgba(15,23,42,0.95);border:1px solid rgba(59,130,246,0.4);" +
        "border-radius:10px;font-size:0.78em;color:#cbd5e1;line-height:2;" +
        "box-shadow:0 2px 8px rgba(0,0,0,0.4);";
      wrap.innerHTML =
        "<div>📅 <b>出品日時</b>　" + fmtDate(created) + "</div>" +
        (isSold && updated ? "<div>🛒 <b>販売日時</b>　" + fmtDate(updated) + "</div>" : "");
      document.body.appendChild(wrap);
    }
  }

  function isLensResultPage() {
    const u = new URL(location.href);
    return (u.hostname.includes("google.com") &&
      (u.pathname.includes("/search") || u.pathname.includes("/lens")));
  }

  function injectMercariDays() {
    tryInjectMercariDays();
  }

  async function main() {
    // メルカリShops商品ページ処理
    if (isMercariShopsPage()) {
      // Shopsはmainがすぐ存在するので即時実行
      setTimeout(tryInjectShopsDays, 500);
      return;
    }

    // メルカリ商品ページ処理
    if (isMercariItemPage()) {
      // 対象要素が出現するまで最大10秒ポーリング
      const waitForTarget = () => new Promise(resolve => {
        const start = Date.now();
        const check = () => {
          const el = document.querySelector("#shopComment") ||
                     document.querySelector("mer-item-details") ||
                     document.querySelector("section") ||
                     document.querySelector("main");
          if (el || Date.now() - start > 10000) {
            resolve();
          } else {
            setTimeout(check, 300);
          }
        };
        check();
      });
      await waitForTarget();
      tryInjectMercariDays();
      // PATCH: フェーズ4 利益計算ツール（別タブで開く）
      patch_injectCalcButton();

      // MutationObserverでDOMの変化を監視し消えたら再挿入
      const observer = new MutationObserver(() => {
        const badgeGone    = !document.getElementById("__sniper_days__");
        const datetimeGone = !document.getElementById("__sniper_datetime__");
        if (badgeGone || datetimeGone) {
          tryInjectMercariDays();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 30000);
      return;
    }

    // Googleレンズ結果ページ処理
    if (isLensResultPage()) {
      // 初回実行
      await sleep(1500); // ページ描画待ち
      injectLensResultButtons();
      return;
    }

    const site = detectSite();
    if (!site) return;
    const mode = await chooseStartMode(SITE_NAMES[site.key] || site.key);
    if (mode === "abort") return;
    // 既存ボタンをリセット
    document.querySelectorAll("[data-sniper-btn]").forEach(el => delete el.dataset.sniperBtn);
    /* ====== Patch領域 ====== */
    document.querySelectorAll("button").forEach(b => {
      if (b.textContent === "🔍分析" || b.textContent === "⏳...") b.remove();
    });
    injectAnalysisButtons(site.cfg, site.key);
    
    // ★ 新規追加：AI一括抽出＆送信ボタンの注入
    patch_injectAiBatchButton(site.cfg, site.key);

    // ★ 新規追加：ページ読み込み時にバックグラウンドで自動鑑定を走らせる
    patch_autoAiAppraisal(site.cfg, site.key);
  }

  // ★ 新規追加：AIバッチ送信関数
  // ↓↓↓（ここから下の既存コードは絶対に消さずにそのまま残す！）↓↓↓
  function patch_injectAiBatchButton(cfg, siteKey) {
    if (document.getElementById("__patch_ai_batch__")) return;
    const btn = document.createElement("div");
    btn.id = "__patch_ai_batch__";
    btn.innerHTML = "🤖 AI一括抽出＆送信";
    btn.style.cssText =
      "position:fixed;left:12px;bottom:80px;z-index:2147483640;" +
      "background:linear-gradient(135deg,#db2777,#be185d);color:#fff;" +
      "border-radius:12px;padding:10px 16px;font-size:13px;font-weight:800;" +
      "font-family:system-ui,sans-serif;cursor:pointer;" +
      "box-shadow:0 4px 16px rgba(219,39,119,0.5);letter-spacing:1px;";

    btn.onclick = async () => {
      const totalPages = parseInt(prompt("何ページ収集しますか？", "10"));
      if (!totalPages || isNaN(totalPages) || totalPages < 1) return;

      const currentUrl = new URL(location.href);
      const startPage = parseInt(currentUrl.searchParams.get("page") || "1");

      const allCandidates = [];
      const GAS_URL = "YOUR_API_KEY";

      for (let p = startPage; p < startPage + totalPages; p++) {
        btn.innerHTML = `⏳ ${p - startPage + 1}/${totalPages}ページ取得中... 計${allCandidates.length}件`;

        try {
          // ページHTMLをfetch
          const pageUrl = new URL(location.href);
          pageUrl.searchParams.set("page", p);
          const res = await fetch(pageUrl.toString(), { credentials: "include" });
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, "text/html");

          // 黄色枠判定（fetchしたページのリンクに対して）
          const links = doc.querySelectorAll(cfg.linkSelector);
          for (const link of links) {
            const text = (link.textContent || "").replace(/\s+/g, " ").trim().replace(/^NEW\s*/i, "");
            if (!text) continue;

            // 価格取得
            const secaEl = link.querySelector(".itemCard_price:not(.-off):not([class*='label'])");
            const pm = secaEl ? secaEl.textContent.replace(/[,，￥¥\s]/g, "").match(/\d+/) : null;
            const price = (pm && parseInt(pm[0], 10) > 100)
              ? parseInt(pm[0], 10)
              : (() => { const m = link.textContent.replace(/[,，]/g, "").match(/[¥￥](\d{3,})/); return m ? parseInt(m[1], 10) : null; })();

            if (!price || price < 3000) continue;

            // ゴミ除外
            const isJunk = EXCLUDE_WORDS_P.some(w => text.toLowerCase().includes(w.toLowerCase()));
            if (isJunk) continue;

            // ブランド・型番抽出
            const _hb = _getHotBrands();
            const sortedKeys = Object.keys(_hb).sort((a, b) => b.length - a.length);
            let brand = "";
            let upperLimit = undefined;
            for (const k of sortedKeys) {
              const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
              if (re.test(text)) { brand = k; upperLimit = _hb[k]; break; }
            }
            if (!brand || !upperLimit || price > upperLimit) continue;

            // 固有名詞・型番で判定
            const SERIES_KEYWORDS = {
              "PROSPEX": 25000, "プロスペックス": 25000,
              "PRESAGE": 20000, "プレザージュ": 20000,
              "BRIGHTZ": 18000, "ブライツ": 18000,
              "ASTRON": 40000, "アストロン": 40000,
              "OCEANUS": 35000, "オシアナス": 35000,
              "GRAND SEIKO": 80000, "グランドセイコー": 80000,
              "KING SEIKO": 30000, "キングセイコー": 30000,
              "FROGMAN": 20000, "フロッグマン": 20000,
              "MUDMASTER": 15000, "マッドマスター": 15000,
              "CAMPANOLA": 50000, "カンパノラ": 50000,
              "ATTESA": 20000, "アテッサ": 20000,
            };
            const WATCH_BRANDS = ["SEIKO","セイコー","CASIO","カシオ","CITIZEN","シチズン",
              "Grand Seiko","グランドセイコー","ASTRON","アストロン","PROSPEX","プロスペックス",
              "ORIENT","オリエント","G-SHOCK","Gショック","OCEANUS","オシアナス"];
            const isWatchBrand = WATCH_BRANDS.some(wb => brand.toLowerCase() === wb.toLowerCase());

            // 型番取得
            const blocks = text.split("/").map(s => s.trim()).filter(Boolean);
            let modelCode = "";
            for (const b of blocks) {
              if (/^[A-Z0-9][A-Z0-9\-]{3,}$/i.test(b) && !/^(XS|S|M|L|XL|XXL|BLK|WHT|NVY|GRY|SLV|BLU|BRW|GRN|KHK|CRM)$/i.test(b)) {
                modelCode = b; break;
              }
            }

            const watchMatch = modelCode ? lookupWatchPrefix(modelCode) : null;
            let seriesName = "";
            let isYellow = false;

            if (watchMatch && price <= watchMatch[1]) {
              seriesName = watchMatch[0]; isYellow = true;
            } else if (!watchMatch && modelCode) {
              // 固有名詞チェック
              for (const [kw, lim] of Object.entries(SERIES_KEYWORDS)) {
                if (text.toLowerCase().includes(kw.toLowerCase()) && price <= lim) {
                  seriesName = kw; isYellow = true; break;
                }
              }
            } else if (!modelCode && !isWatchBrand) {
              isYellow = true; seriesName = brand;
            }

            if (!isYellow) continue;

            const href = link.getAttribute("href");
            const url = href ? new URL(href, location.origin).toString() : "";
            if (!url) continue;

            const img = link.querySelector("img");
            const mercariUrl = modelCode
              ? `https://jp.mercari.com/search?keyword=${encodeURIComponent(modelCode)}&item_condition_id=3&status=sold_out&seller_type=0&item_types=mercari&sort=created_time&order=desc`
              : `https://jp.mercari.com/search?keyword=${encodeURIComponent((brand + " " + (text.split("/")[1] || "")).trim())}&item_condition_id=3&status=sold_out&seller_type=0&item_types=mercari&sort=created_time&order=desc`;

            allCandidates.push({
              title: text, price, url,
              imageUrl: img ? img.src : "",
              modelNum: modelCode || "",
              brand: brand || "",
              seriesName, mercariUrl
            });
          }
        } catch(e) {
          console.error(`${p}ページ取得エラー:`, e);
        }

        // 揺らぎ：2〜4秒ランダム待機
        const wait = 2000 + Math.floor(Math.random() * 2000);
        await new Promise(r => setTimeout(r, wait));
      }

      // 全ページ完了
      if (allCandidates.length === 0) {
        btn.innerHTML = "🤖 一括送信";
        showToast(`${totalPages}ページ収集完了 該当0件`, 3000);
        return;
      }

      btn.innerHTML = `🚀 送信中 (${allCandidates.length}件)...`;
      try {
        const res = await fetch(GAS_URL, {
          method: "POST",
          body: JSON.stringify(allCandidates)
        });
        const resultText = await res.text();
        console.log("GAS response:", resultText);
        btn.innerHTML = `✅ 完了`;
        showToast(`${totalPages}ページ収集 計${allCandidates.length}件をスプシに送信しました`, 5000);
        setTimeout(() => { btn.innerHTML = "🤖 一括送信"; }, 5000);
      } catch(e) {
        btn.innerHTML = "❌ 送信エラー";
        showToast("送信失敗: " + e.message, 4000);
        setTimeout(() => { btn.innerHTML = "🤖 一括送信"; }, 4000);
      }
    };
    document.body.appendChild(btn);
  }

  main().catch(e => console.error(e));

  // スクロールによる再起動トリガー（絞り込み後のURL変化なしDOM更新対応）
  if (!window.__sniperScrollTrigger__) {
    window.__sniperScrollTrigger__ = true;
    let _lastScrollY = 0;
    let _scrollCooldown = false;

    window.addEventListener("scroll", () => {
      if (_scrollCooldown) return;
      const scrollY = window.scrollY;
      // 下スワイプ（上にスクロール後に下に戻す動作）を検知
      if (scrollY < _lastScrollY - 80) {
        const site = detectSite();
        if (!site) { _lastScrollY = scrollY; return; }

        _scrollCooldown = true;
        setTimeout(() => { _scrollCooldown = false; }, 3000);

        // 既存ボタンをリセットして再注入
        document.querySelectorAll("button").forEach(b => {
          if (b.textContent === "🔍分析" || b.textContent === "⏳...") b.remove();
        });
        document.querySelectorAll("[data-sniper-btn]").forEach(el => delete el.dataset.sniperBtn);
        const oldBatch = document.getElementById("__patch_ai_batch__");
        if (oldBatch) oldBatch.remove();

        injectAnalysisButtons(site.cfg, site.key);
        patch_injectAiBatchButton(site.cfg, site.key);
        showToast("🔄 拡張機能を再起動しました", 2000);
      }
      _lastScrollY = scrollY;
    }, { passive: true });
  }
/* ======================= */

  /* =========================================================
     🔥 PATCH LAYER: フェーズ1〜4
     Frozen層（バッジ・日時表示）には一切干渉しない独立ブロック
     ========================================================= */

  // -------------------------------------------------------
  // PATCH: 辞書データ（直接埋め込み・外部ファイル依存なし）
  // -------------------------------------------------------
  const _getHotBrands = () => ({
    // =========================================================
    // 【ストリート・スケーター】
    // =========================================================
    "Supreme": 15000, "Stussy": 8000, "A BATHING APE": 10000,
    "WTAPS": 15000, "NEIGHBORHOOD": 15000, "WACKO MARIA": 15000,
    "KITH": 12000, "Palace Skateboards": 10000, "C.E": 8000,
    "TIGHTBOOTH": 10000, "BlackEyePatch": 8000, "F.C.Real Bristol": 12000,
    "SOPHNET.": 8000, "uniform experiment": 8000, "NUMBER (N)INE": 10000,
    "UNDERCOVER": 15000, "GOODENOUGH": 12000, "TENDERLOIN": 15000,
    "CHALLENGER": 10000, "PORKCHOP": 8000, "DESCENDANT": 12000,
    "COOTIE": 10000, "CALEE": 8000, "RADIALL": 8000, "WEIRDO": 8000,
    "GLAD HAND": 10000, "GANGSTERVILLE": 8000, "MASSES": 8000,
    "FEAR OF GOD": 20000, "ESSENTIALS": 8000, "Off-White": 20000,
    "VETEMENTS": 20000, "Human Made": 12000, "Girls Don't Cry": 15000,
    "WASTED YOUTH": 10000, "FR2": 6000,
    "CVTVLIST": 20000, "カタリスト": 20000,
    "PRO CLUB": 3000, "プロクラブ": 3000,
    // =========================================================
    // 【国内デザイナーズ（ドメブラ）】
    // =========================================================
    "Sacai": 20000, "kolor": 15000,
    "COMME des GARCONS": 12000, "コムデギャルソン": 12000, "コムでギャルソン": 12000,
    "JUNYA WATANABE": 15000, "ジュンヤワタナベ": 15000,
    "Yohji Yamamoto": 20000, "ISSEY MIYAKE": 15000, "イッセイミヤケ": 15000,
    "Needles": 18000, "ENGINEERED GARMENTS": 12000, "Engineered Garments": 12000,
    "South2 West8": 12000, "AURALEE": 18000,
    "COMOLI": 20000, "コモリ": 20000, "Graphpaper": 12000,
    "DAIWA PIER39": 15000, "VISVIM": 30000, "visvim": 30000,
    "N.HOOLYWOOD": 8000, "UNUSED": 10000, "YOKE": 15000,
    "stein": 15000, "DAIRIKU": 15000, "SUNSEA": 12000, "URU": 10000,
    "JieDa": 8000, "doublet": 12000, "Midorikawa": 15000,
    "NICENESS": 20000, "MAATEE&SONS": 20000, "HERILL": 20000,
    "A.PRESSE": 20000, "Kaptain Sunshine": 12000, "TEATORA": 15000,
    "PORTER CLASSIC": 20000, "blurhms": 12000, "ANCELLM": 15000,
    "MASU": 12000, "SUGARHILL": 12000, "SOSHIOTSUKI": 12000,
    "YUKI HASHIMOTO": 12000, "MADARANINGEN": 12000, "マダラニンゲン": 12000,
    // =========================================================
    // 【ハイブランド・ラグジュアリー】
    // =========================================================
    "HERMES": 20000, "CHANEL": 20000, "LOUIS VUITTON": 20000,
    "GUCCI": 20000, "PRADA": 20000, "CELINE": 20000, "BALENCIAGA": 20000,
    "LOEWE": 20000, "DIOR": 20000, "FENDI": 20000,
    "SAINT LAURENT": 20000, "GIVENCHY": 20000, "VALENTINO": 20000,
    "BURBERRY": 20000, "バーバリー": 20000,
    "Maison Margiela": 20000, "Jil Sander": 20000, "MARNI": 15000,
    "OAMC": 20000, "Rick Owens": 20000, "Bottega Veneta": 20000,
    "Thom Browne": 20000, "CHROME HEARTS": 20000,
    "Dries Van Noten": 20000, "LEMAIRE": 20000,
    "Acne Studios": 12000, "AMI Paris": 10000,
    "Stone Island": 20000, "CP Company": 12000,
    "Moncler": 20000, "Canada Goose": 20000,
    "DOLCE&GABBANA": 15000, "ドルチェアンドガッバーナ": 15000,
    // =========================================================
    // 【レディース・ミセス・エレガンス】
    // =========================================================
    "Max Mara": 20000, "マックスマーラ": 20000, "マックスマーラー": 20000,
    "VIVIENNE TAM": 8000, "ヴィヴィアンタム": 8000,
    "Vivienne Westwood": 12000, "ヴィヴィアンウエストウッド": 12000,
    "Vivienne Westwood RED LABEL": 8000, "ヴィヴィアンウエストウッドレッドレーベル": 8000,
    "TOMORROWLAND collection": 6000, "トゥモローランドコレクション": 6000,
    "kay me": 10000, "ケイミー": 10000,
    "JUICY COUTURE": 5000, "ジューシークチュール": 5000,
    "SOEJU": 8000, "ソージュ": 8000,
    "THE SHINZONE": 8000, "The Shinzone": 8000, "シンゾーン": 8000,
    "MORABITO": 20000, "モラビト": 20000,
    "marimekko": 6000, "マリメッコ": 6000,
    "Diagram": 6000, "ダイアグラム": 6000,
    "GRACE CONTINENTAL": 8000, "グレースコンチネンタル": 8000,
    "MARIHA": 12000, "マリハ": 12000,
    "ALBEROBELLO": 10000, "アルベロベロ": 10000,
    "pas de calais": 6000, "PAS DE CALAIS": 6000,
    "ERMANNO SCERVINO": 15000, "エルマンノシェルヴィーノ": 15000,
    "LEONARD": 20000, "レオナール": 20000,
    "PASSIONE": 5000, "パシオーネ": 5000,
    "ENOF": 15000, "イナフ": 15000,
    "Sensounico": 8000, "センソユニコ": 8000,
    "COGTHEBIGSMOKE": 12000, "コグザビッグスモール": 12000,
    "Sov.": 5000, "ソブ": 5000,
    "Sybilla": 6000, "シビラ": 6000,
    "BORDERS at BALCONY": 15000, "ボーダーズアットバルコニー": 15000,
    "Jocomomola": 4000, "ホコモモラ": 4000,
    "LE GLAZIK": 6000, "ルグラジック": 6000,
    // =========================================================
    // 【アウトドア・スポーツ・テック】
    // =========================================================
    "THE NORTH FACE": 12000, "ノースフェイス": 12000,
    "THE NORTH FACE PURPLE LABEL": 12000, "ノースフェイスパープルレーベル": 12000,
    "Arc'teryx": 25000, "ARC'TERYX": 25000,
    "Patagonia": 10000, "パタゴニア": 10000,
    "Salomon": 10000, "Oakley": 8000, "Snow Peak": 10000,
    "NANGA": 12000, "Marmot": 6000, "Mammut": 6000,
    "Columbia": 7000, "コロンビア": 7000,
    "WILD THINGS": 6000, "Descente Pause": 8000, "Goldwin": 10000,
    "Tilak": 15000, "KLATTERMUSEN": 12000, "HOUDINI": 10000,
    "and wander": 12000,
    "NIKE": 6000, "Nike": 6000, "ナイキ": 6000,
    "adidas": 5000, "アディダス": 5000,
    "adidas Originals": 5000, "アディダス（オリジナルス）": 5000,
    "New Balance": 8000, "ニューバランス": 8000,
    "PUMA": 4000, "Reebok": 4000,
    "ASICS": 6000, "アシックス": 6000,
    "HOKA ONE ONE": 8000, "On": 8000,
    "VANS": 4000, "Converse": 4000,
    "mont-bell": 5000, "モンベル": 5000,
    // =========================================================
    // 【アメカジ・ヴィンテージ・ワーク・トラッド】
    // =========================================================
    "Levi's": 8000, "Lee": 4000, "Wrangler": 4000,
    "Carhartt": 6000, "Dickies": 3000,
    "Ralph Lauren": 6000, "ラルフローレン": 6000,
    "Polo Ralph Lauren": 8000, "polo RalphLoren": 8000,
    "RRL": 15000, "Brooks Brothers": 5000, "Champion": 5000,
    "L.L.Bean": 5000, "Eddie Bauer": 4000, "WOOLRICH": 8000,
    "Pendleton": 5000, "BUZZ RICKSON'S": 12000,
    "The Real McCoy's": 20000, "TOYS McCOY": 15000,
    "SUGAR CANE": 8000, "WAREHOUSE": 12000, "FULLCOUNT": 10000,
    "STUDIO D'ARTISAN": 10000, "SAMURAI JEANS": 10000,
    "MOMOTARO JEANS": 8000, "KAPITAL": 15000,
    "Schott": 12000, "vanson": 15000,
    "Harley-Davidson": 8000, "ハーレーダビッドソン": 8000,
    "BURBERRY BLACK LABEL": 6000, "バーバリーブラックレーベル": 6000,
    "BURBERRY BLUE LABEL": 6000, "バーバリーブルーレーベル": 6000,
    "BURBERRY LONDON": 12000, "バーバリーロンドン": 12000,
    "Burberrys": 10000, "バーバリーズ": 10000,
    "Paul Smith": 8000, "ポールスミス": 8000,
    "nanamica": 12000, "ナナミカ": 12000,
    "ANATOMICA": 15000, "アナトミカ": 15000,
    "IRON HEART": 15000, "アイアンハート": 15000,
    "EVISU": 12000, "エヴィス": 12000,
    "DANTON": 6000, "ダントン": 6000,
    "Traditional Weatherwear": 8000, "トラディショナルウェザーウェア": 8000,
    "ALPHA INDUSTRIES": 6000, "アルファインダストリーズ": 6000,
    "Lacoste": 6000, "Fred Perry": 6000,
    "Barbour": 12000, "Baracuta": 12000,
    "45R": 12000, "45RPM": 10000,
    "HYSTERIC GLAMOUR": 12000, "ヒステリックグラマー": 12000,
    "Pay money To my Pain": 15000, "pay money to my pain": 15000,
    "glancy": 5000, "グランシー": 5000,
    "DSQUARED2": 10000, "ディースクエアード": 10000,
    // =========================================================
    // 【革靴・ブーツ】
    // =========================================================
    "RED WING": 12000, "WESCO": 20000, "WHITE'S BOOTS": 20000,
    "Danner": 10000, "Dr.Martens": 6000, "Clarks": 6000,
    "Alden": 20000, "John Lobb": 20000, "Edward Green": 20000,
    "Crockett&Jones": 20000, "Church's": 15000,
    "Tricker's": 12000, "Paraboot": 20000, "J.M. WESTON": 20000,
    // =========================================================
    // 【時計・アクセサリー・アイウェア】
    // =========================================================
    "goro's": 20000, "TADY&KING": 12000, "ARIZONA FREEDOM": 8000,
    "FIRST ARROW's": 8000, "LARRY SMITH": 12000, "HOORSENBUHS": 20000,
    "TOM WOOD": 12000, "Bill Wall Leather": 12000, "Cody Sanderson": 15000,
    "EFFECTOR": 10000, "MOSCOT": 12000, "TART OPTICAL": 15000,
    "JULIUS TART OPTICAL": 15000, "ayame": 12000, "EYEVAN": 12000,
    "白山眼鏡店": 12000, "金子眼鏡": 12000,
    "Ray-Ban": 4000, "Oliver Peoples": 10000, "TOM FORD": 12000,
    
    // =========================================================
    // 【時計（国内3大ブランド＋派生）※高回転・上限解放版】
    // =========================================================
    "SEIKO": 15000, "セイコー": 15000, 
    "Grand Seiko": 50000, "グランドセイコー": 50000, 
    "ASTRON": 30000, "アストロン": 30000, 
    "PROSPEX": 25000, "プロスペックス": 25000,
    "CITIZEN": 12000, "シチズン": 12000, 
    "ATTESA": 20000, "アテッサ": 20000, 
    "PROMASTER": 20000, "プロマスター": 20000,
    "CASIO": 8000, "カシオ": 8000, 
    "G-SHOCK": 15000, "Gショック": 15000, 
    "OCEANUS": 30000, "オシアナス": 30000,
    "ORIENT": 12000, "オリエント": 12000,
  });

  // -------------------------------------------------------
  // PATCH: 時計型番プレフィックス辞書（Gemini不要・ハルシネーションゼロ）
  // 型番先頭4〜5文字でシリーズと上限価格を確定する
  // -------------------------------------------------------
  var WATCH_PREFIX_DICT = {
    // ===== SEIKO =====
    // GRAND SEIKO
    "SBGX": ["GRAND SEIKO", 80000], "SBGA": ["GRAND SEIKO", 80000],
    "SBGW": ["GRAND SEIKO", 80000], "SBGR": ["GRAND SEIKO", 80000],
    "SBGH": ["GRAND SEIKO", 80000], "SBGC": ["GRAND SEIKO", 80000],
    "SBGE": ["GRAND SEIKO", 80000], "SLGH": ["GRAND SEIKO", 80000],
    "SLGA": ["GRAND SEIKO", 80000], "SLGW": ["GRAND SEIKO", 80000],
    "STGF": ["GRAND SEIKO", 80000], "STGH": ["GRAND SEIKO", 80000],
    // KING SEIKO
    "SDKS": ["KING SEIKO", 30000], "SDKA": ["KING SEIKO", 30000],
    // ASTRON
    "SBXC": ["ASTRON_上位", 40000], "SBXB": ["ASTRON_上位", 40000],
    "SSH":  ["ASTRON_上位", 40000], "SBXD": ["ASTRON_上位", 40000],
    "SBOT": ["ASTRON_標準", 25000], "SBOU": ["ASTRON_標準", 25000],
    "SBOV": ["ASTRON_標準", 25000], "SBXH": ["ASTRON_標準", 25000],
    // PROSPEX
    "SBDC": ["PROSPEX_上位", 25000], "SBDL": ["PROSPEX_上位", 25000],
    "SBDY": ["PROSPEX_上位", 25000], "SBEJ": ["PROSPEX_上位", 25000],
    "SBEK": ["PROSPEX_上位", 25000], "SBEX": ["PROSPEX_上位", 25000],
    "SBEY": ["PROSPEX_上位", 25000], "SBEZ": ["PROSPEX_上位", 25000],
    "SBBN": ["PROSPEX_上位", 25000], "SBCM": ["PROSPEX_上位", 25000],
    "SBDA": ["PROSPEX_上位", 25000], "SBDB": ["PROSPEX_上位", 25000],
    "SRPC": ["PROSPEX_標準", 8000],  "SRPD": ["PROSPEX_標準", 8000],
    "SRPE": ["PROSPEX_標準", 8000],  "SRPF": ["PROSPEX_標準", 8000],
    // PRESAGE
    "SARA": ["PRESAGE_上位", 20000], "SARB": ["PRESAGE_上位", 20000],
    "SARW": ["PRESAGE_上位", 20000], "SARY": ["PRESAGE_上位", 20000],
    "SARZ": ["PRESAGE_上位", 20000], "SPB":  ["PRESAGE_上位", 20000],
    "SRRY": ["PRESAGE_標準", 8000],  "SRRZ": ["PRESAGE_標準", 8000],
    "SRRA": ["PRESAGE_標準", 8000],
    // BRIGHTZ
    "SAGA": ["BRIGHTZ_上位", 18000], "SAGB": ["BRIGHTZ_上位", 18000],
    "SAGD": ["BRIGHTZ_上位", 18000], "SAGE": ["BRIGHTZ_上位", 18000],
    "SAGZ": ["BRIGHTZ_上位", 18000],
    "SAGJ": ["BRIGHTZ_標準", 5000],  "SAGK": ["BRIGHTZ_標準", 5000],
    "SAGM": ["BRIGHTZ_標準", 5000],
    // SEIKO 5 SPORTS
    "SNXS": ["SEIKO 5 SPORTS", 8000], "SNXJ": ["SEIKO 5 SPORTS", 8000],
    "SRPG": ["SEIKO 5 SPORTS", 8000], "SRPH": ["SEIKO 5 SPORTS", 8000],
    "SRPI": ["SEIKO 5 SPORTS", 8000], "SRPJ": ["SEIKO 5 SPORTS", 8000],
    "SRPK": ["SEIKO 5 SPORTS", 8000],
    // LUKIA
    "SSQV": ["LUKIA_上位", 10000], "SSQW": ["LUKIA_上位", 10000],
    "SSVR": ["LUKIA_標準", 4000],  "SSVS": ["LUKIA_標準", 4000],

    // ===== CASIO =====
    // MR-G
    "MRG":  ["MR-G", 70000],
    // MT-G
    "MTG":  ["MT-G_上位", 35000],
    // OCEANUS
    "OCW":  ["OCEANUS_上位", 35000], "OCL":  ["OCEANUS_標準", 8000],
    // FROGMAN
    "GWF":  ["FROGMAN", 20000],
    // MUDMASTER
    "GWG":  ["MUDMASTER", 15000],
    // G-STEEL
    "GST":  ["G-STEEL", 6000],
    // PRO TREK
    "PRX":  ["PRO TREK_上位", 20000],
    "PRW":  ["PRO TREK_標準", 6000],
    // G-SHOCK汎用（上記で拾えなかったもの）
    "GW":   ["G-SHOCK_上位", 15000], "GA":   ["G-SHOCK_標準", 8000],
    "GD":   ["G-SHOCK_標準", 8000],  "DW":   ["G-SHOCK_標準", 8000],

    // ===== CITIZEN =====
    // THE CITIZEN
    "AQ40": ["THE CITIZEN", 70000], "AQ48": ["THE CITIZEN", 70000],
    // CAMPANOLA
    "CT":   ["CAMPANOLA", 50000],
    // ECO-DRIVE ONE
    "AQ":   ["ECO-DRIVE ONE", 50000],
    // SERIES 8
    "NA15": ["SERIES 8", 35000], "NB60": ["SERIES 8", 35000],
    // ATTESA
    "AT80": ["ATTESA_上位", 20000], "AT90": ["ATTESA_上位", 20000],
    "AT60": ["ATTESA_標準", 5000],  "AT70": ["ATTESA_標準", 5000],
    // PROMASTER
    "BJ":   ["PROMASTER_上位", 18000], "BN":  ["PROMASTER_上位", 18000],
    "JY":   ["PROMASTER_標準", 8000],
    // EXCEED
    "ES":   ["EXCEED", 8000],
    // XC
    "XC":   ["XC", 8000],

    // ===== 追加分 =====
    // SEIKO PROSPEX追加
    "SBDX": ["PROSPEX_上位", 25000],
    "SBEX": ["PROSPEX_上位", 25000],
    "SBEF": ["PROSPEX_上位", 25000],
    "SBED": ["PROSPEX_上位", 25000],
    // SEIKO PRESAGE追加
    "SARX": ["PRESAGE_上位", 20000],
    "SARF": ["PRESAGE_上位", 20000],
    // CITIZEN ECO-DRIVE ONE
    "AR50": ["ECO-DRIVE ONE", 50000],
    // CITIZEN ATTESA GPS
    "CC40": ["ATTESA_上位", 20000],
    "CC50": ["ATTESA_上位", 20000],
    "CC30": ["ATTESA_上位", 20000],
    // CITIZEN SERIES 8
    "NA10": ["SERIES 8", 35000],
    "NA15": ["SERIES 8", 35000],
  };

  // 型番プレフィックス照合関数
  function lookupWatchPrefix(modelCode) {
    if (!modelCode || modelCode.length < 3) return null;
    const upper = modelCode.toUpperCase();
    // 長い順に試す（5文字→4文字→3文字→2文字）
    for (const len of [5, 4, 3, 2]) {
      const prefix = upper.slice(0, len);
      if (WATCH_PREFIX_DICT[prefix]) return WATCH_PREFIX_DICT[prefix];
    }
    return null;
  }

  

  function lookupWatchPrefix(modelCode) {
    if (!modelCode || modelCode.length < 2) return null;
    const upper = modelCode.toUpperCase();
    for (const len of [5, 4, 3, 2]) {
      const prefix = upper.slice(0, len);
      if (WATCH_PREFIX_DICT[prefix]) return WATCH_PREFIX_DICT[prefix];
    }
    return null;
  }

  
  const HOT_MATERIALS_P = ["カシミヤ", "cashmere", "モヘア", "mohair", "シルク", "silk",
    "レザー", "leather", "スエード", "suede", "アルパカ", "alpaca", "アンゴラ", "angora"];
  const HOT_SIZES_P     = ["XL", "XXL", "2XL", "3XL", "44", "46", "48", "50", "52"];
  const HOT_CATEGORIES  = ["ジャケット", "コート", "ブルゾン", "ダウン", "ダウンジャケット",
    "ニット", "カーディガン", "パンツ", "スラックス"];
  const EXCLUDE_WORDS_P = [
    "ZARA", "ザラ", "H&M", "GU", "ジーユー", "UNIQLO", "ユニクロ",
    "フェイクレザー", "合皮", "PUレザー", "フェイク", "コピー", "偽物",
    "リメイク", "ハンドメイド", "ジャンク", "難あり", "訳あり"
  ];

  // -------------------------------------------------------
  // PATCH: フェーズ2 厳密4ステップ抽出
  // -------------------------------------------------------
  function patch_sanitizeTitle(raw) {
    let s = raw;
    // Step1: 装飾記号・除外ワードを完全消去
    s = s.replace(/【.*?】/g, "").replace(/[【】［］「」『』〔〕＜＞《》]/g, "");
    s = s.replace(/[★☆◆◇■□●○▲△▼▽※◎→←↑↓]/g, "");
    s = s.replace(/\(美品\)|美品|新品同様|未使用|送料込|即購入OK|値下げ|プロフ必読/gi, "");
    for (const w of EXCLUDE_WORDS_P) {
      s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
    }
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function patch_extractBrand(sanitized) {
    // Step2: HOT_BRANDS辞書照合のみ（推測フォールバック廃止）
    // ブランドは①DOMからの直接取得 または ②brands.jsonとの完全一致のみ
    const sorted = Object.keys(_getHotBrands()).sort((a, b) => b.length - a.length);
    for (const b of sorted) {
      const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (re.test(sanitized)) {
        const remaining = sanitized.replace(re, "").replace(/\s+/g, " ").trim();
        return { brand: b, remaining };
      }
    }
    // 辞書に一致しない場合はブランドなし（推測しない）
    return { brand: "", remaining: sanitized };
  }

  function patch_extractHighValues(remaining) {
    // Step3: 単語境界付きで高値要素スキャン
    const found = [];
    let s = remaining;
    const sizeRe = new RegExp("\\b(" + HOT_SIZES_P.join("|") + ")\\b", "i");
    const sm = s.match(sizeRe);
    if (sm) { found.push(sm[1].toUpperCase()); s = s.replace(sizeRe, ""); }
    for (const m of HOT_MATERIALS_P) {
      const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (re.test(s)) { found.push(m); s = s.replace(re, ""); }
    }
    s = s.replace(/\s+/g, " ").trim();
    return { highVals: [...new Set(found)], pureName: s };
  }

  /* ====== Patch領域 ====== */
 // 【Stable保護】これまでのコードは安全のためコメントアウトして残す
 /*
 function patch_extractModelCode2nd(blocks) {
   for (const b of blocks) {
     const t = b.trim();
     const candidates = (t.match(/[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]/g) || [])
       .filter(s => {
         if (s.length < 4) return false;
         const hasAlpha = /[A-Za-z]/.test(s);
         const hasNum   = /[0-9]/.test(s);
         const isHyphenCode = s.includes("-") && /[A-Za-z0-9]/.test(s);
         return (hasAlpha && hasNum) || (isHyphenCode && s.split("-").length >= 2);
       });
     if (candidates.length > 0) return candidates[0];
   }
   return "";
 }
 */

 // 【Patch】29cm等のサイズ誤認を防止する新エンジン
 function patch_extractModelCode2nd(blocks) {
   const SIZE_UNIT_RE = /^(XS|S|M|L|XL|XXL|2XL|3XL|FREE|\d+CM|\d+号|\d+インチ|\d+．\d+)$/i;
   
   for (const b of blocks) {
     const t = b.trim();
     const candidates = (t.match(/[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]/g) || [])
       .filter(s => {
         const upperS = s.toUpperCase();
         // 短すぎる単語、またはサイズ表記（29CM等）は型番から除外
         if (s.length < 4 || SIZE_UNIT_RE.test(upperS)) return false;
         
         const hasAlpha = /[A-Za-z]/.test(s);
         const hasNum   = /[0-9]/.test(s);
         const isHyphenCode = s.includes("-") && /[A-Za-z0-9]/.test(s);
         return (hasAlpha && hasNum) || (isHyphenCode && s.split("-").length >= 2);
       });
     if (candidates.length > 0) return candidates[0];
   }
   return "";
 }
/* ======================= */

  // 高値要素保護リスト（指定キーワードのみ・勝手な追加禁止）
  const KEEP_HIGH_VALUES = new Set([
    "L","XL","XXL","2XL","3XL","FREE",
    "リネン","linen","BLK","ブラック","NVY","ネイビー",
    "チェック","レザー","シルク","カシミヤ","ウール"
  ]);

  // ゴミリスト（指定のみ・勝手な追加禁止）
  const JUNK_LIST = new Set([
    "S","M","1","2","3","44","コットン","綿",
    "ポリエステル","ナイロン","アクリル","レーヨン",
    "GRY","KHK","BLU","WHT","BEI","ホワイト","グレー",
    "無地","総柄"
  ]);

  function patch_fullExtract(rawTitle) {
    const is2ndStreet = location.hostname.includes("2ndstreet.jp");

    if (is2ndStreet) {
      // ===== セカスト専用：スラッシュ分割エンジン =====
      // 各ブロックから価格・状態・サイズ等の混入ノイズを除去してからスラッシュ分割
      const cleanedTitle = rawTitle
        .replace(/\s*(商品の状態|サイズ)[^\s\/]*/g, "")  // 「商品の状態：〇」「サイズ〇」を除去
        .replace(/\s*[¥￥]\d[\d,]*/g, "")                // 価格テキストを除去
        .replace(/\s+/g, " ").trim();
      const blocks = cleanedTitle.split("/").map(s => s.trim()).filter(Boolean);

      // ブランド特定を先に行う（ブランドブロックを型番候補から除外するため）
      const _hb = _getHotBrands();
      const sortedBrands = Object.keys(_hb).sort((a, b) => b.length - a.length);
      let brand = "";
      let brandBlock = "";
      for (const bk of sortedBrands) {
        const found = blocks.find(b =>
          b.toLowerCase() === bk.toLowerCase() ||
          b.toLowerCase().startsWith(bk.toLowerCase())
        );
        if (found) { brand = bk; brandBlock = found; break; }
      }

      // ブランドブロックを除いたブロックのみ型番候補にする
      const nonBrandBlocks = blocks.filter(b => b !== brandBlock);
      const modelCode = patch_extractModelCode2nd(nonBrandBlocks);
      const nonModel  = nonBrandBlocks.filter(b => b.trim() !== modelCode);

      // ブランドブロックからカッコ書き（例: (ONLY.)）を除去してカテゴリ取得
      const brandBlockClean = brandBlock
        .replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, "").trim();
      // ブランド名自体を除去してカテゴリ部分だけ残す
      let categoryBlock = brandBlockClean;
      if (brand) {
        const re = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        categoryBlock = categoryBlock.replace(re, "").trim();
      }

      // 残ブロック（型番以外・ブランドブロック除外済み）
      const restBlocks = nonModel;

      // 高値要素保護 + ゴミ除去
      const highVals = [];
      const pureBlocks = [];
      for (const b of restBlocks) {
        const t = b.trim();
        if (KEEP_HIGH_VALUES.has(t)) {
          highVals.push(t);
        } else if (!JUNK_LIST.has(t)) {
          // 単語境界でゴミリスト完全一致チェック
          const isJunk = [...JUNK_LIST].some(jw => {
            const re = new RegExp("(?:^|\\s)" + jw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)");
            return re.test(t) && t === jw;
          });
          if (!isJunk) pureBlocks.push(t);
        }
      }

      // カテゴリ（brandBlock内の日本語部分 or 残ブロック先頭）
      const category = categoryBlock ||
        pureBlocks.find(b => /[぀-鿿]/.test(b)) || "";

      // pureName = カテゴリ（検索の中核）
      const pureName = category;

      return { brand, pureName, modelCode, highVals, sanitized: rawTitle };

    } else {
      // ===== 非セカスト：従来エンジン =====
      let s = rawTitle;
      const modelCode = extractModelCode(s);
      if (modelCode) s = s.replace(modelCode, "");
      s = cleanItemName(s);
      const sanitized = patch_sanitizeTitle(s);
      const { brand, remaining } = patch_extractBrand(sanitized);
      const { highVals, pureName } = patch_extractHighValues(remaining);
      const finalName = pureName
        .replace(/[/\\|_,、。・]+/g, " ")
        .replace(/\s+/g, " ").trim();
      return { brand, pureName: finalName, modelCode, highVals, sanitized };
    }
  }

  // -------------------------------------------------------
  // PATCH: フェーズ1 ゴミ箱フィルター＆ホットハイライト
  // -------------------------------------------------------
  /* ====== Patch領域 ====== */
  
  function patch_getItemText(linkEl) {
    let text = clean(linkEl.textContent || "");
    // 先頭の「NEW 」という文字を削ぎ落としてからブランド判定に回す
    return text.replace(/^NEW\s*/i, "");
  }

/* ======================= */

  function patch_getItemPrice(linkEl) {
    // セカスト専用：itemCard_priceクラスを優先（%OFFラベルより確実）
    const secaEl = linkEl.querySelector(".itemCard_price:not(.-off):not([class*='label'])");
    if (secaEl) {
      const m = secaEl.textContent.replace(/[,，￥¥\s]/g, "").match(/\d+/);
      if (m && parseInt(m[0], 10) > 100) return parseInt(m[0], 10);
    }
    // fallback：%OFFを除外して価格要素を探す
    const priceEls = linkEl.querySelectorAll("[class*='price'],[class*='Price']");
    for (const el of priceEls) {
      const t = el.textContent.trim();
      if (t.includes('%') || t.includes('OFF')) continue;
      const m = t.replace(/[,，￥¥\s]/g, "").match(/\d+/);
      if (m && parseInt(m[0], 10) > 100) return parseInt(m[0], 10);
    }
    // 最終fallback：¥+3桁以上の数字
    const m = linkEl.textContent.replace(/[,，]/g, "").match(/[¥￥](\d{3,})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function patch_isYahooAuction() {
    return location.hostname.includes("auctions.yahoo.co.jp");
  }

  function patch_getYahooEndTime(linkEl) {
    // 残り時間テキストを取得（「残り〇時間」「残り〇分」）
    const t = linkEl.textContent;
    const mH = t.match(/残り\s*(\d+)\s*時間/);
    const mD = t.match(/残り\s*(\d+)\s*日/);
    if (mD) return parseInt(mD[1], 10) * 24;
    if (mH) return parseInt(mH[1], 10);
    return null;
  }

  function patch_applyListFilter(siteKey) {
    // content_scriptsで自動注入済みのページでは既にDOMあり
    // MutationObserverで動的追加にも対応
    const applyOnce = () => {
      const links = document.querySelectorAll(
        'a[href*="/goods/detail/"], a[href*="/products/"], a[href*="/store/"], a[href*="/auction/"]'
      );
      links.forEach(link => {
        if (link.dataset.patchFiltered) return;
        link.dataset.patchFiltered = "true";

        const text  = patch_getItemText(link);
        // 価格直接取得（%OFFラベル除外）
        const _secaEl = link.querySelector(".itemCard_price:not(.-off):not([class*='label'])");
        const _priceM = _secaEl ? _secaEl.textContent.replace(/[,，￥¥\s]/g,"").match(/\d+/) : null;
        const price = (_priceM && parseInt(_priceM[0],10) > 100)
          ? parseInt(_priceM[0],10)
          : (() => { const m = link.textContent.replace(/[,，]/g,"").match(/[¥￥](\d{3,})/); return m ? parseInt(m[1],10) : null; })();
        const { brand, pureName, highVals } = patch_fullExtract(text);

        // ゴミ箱フィルター
        const isExcluded = EXCLUDE_WORDS_P.some(w =>
          text.toLowerCase().includes(w.toLowerCase())
        );
        if (isExcluded) {
          link.style.opacity = "0.15";
          link.style.pointerEvents = "none";
          return;
        }

        // ホットハイライト判定（辞書キーとの完全一致のみ・部分一致禁止）
        let isHot = false;
        const _hb = _getHotBrands();
        // brandはpatch_fullExtractで抽出済み（辞書完全一致のみ）
        // _hb[brand]が存在しない場合はundefined→判定不成立
        // brandが空の場合はテキスト直接照合にフォールバック
        let upperLimit = brand ? _hb[brand] : undefined;
        if (!upperLimit) {
          const sortedKeys = Object.keys(_hb).sort((a,b) => b.length - a.length);
          for (const k of sortedKeys) {
            const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            if (re.test(text)) { upperLimit = _hb[k]; break; }
          }
        }

        if (patch_isYahooAuction()) {
          // ヤフオク: 即決は上限以下でHOT、オークションは残り24h以内かつ上限以下
          const isBuyNow = /即決/.test(text);
          const remainH  = patch_getYahooEndTime(link);
          if (isBuyNow && upperLimit && price !== null && price <= upperLimit) isHot = true;
          if (!isBuyNow && upperLimit && price !== null && price <= upperLimit
              && remainH !== null && remainH <= 24) isHot = true;
        } else {
          // 辞書登録ブランド＋上限額以下の場合のみHOT（それ以外は絶対に光らない）
          if (upperLimit && price !== null && price <= upperLimit) {
            isHot = true;
          }
        }

        if (isHot) {
          // 時計は型番プレフィックス辞書でさらに絞り込み
          const { modelCode } = patch_fullExtract(text);
          const watchMatch = modelCode ? lookupWatchPrefix(modelCode) : null;

          if (watchMatch) {
            // 時計：型番で確定→黄色枠＋シリーズ名バッジ
            const [seriesName, watchLimit] = watchMatch;
            const priceNum = price !== null ? price : 0;
            if (priceNum <= watchLimit) {
              link.style.outline = "6px solid #fbbf24";
              link.style.borderRadius = "6px";
              link.style.position = "relative";
              if (!link.querySelector(".sniper-series-badge")) {
                const badge = document.createElement("span");
                badge.className = "sniper-series-badge";
                badge.textContent = `💎 ${seriesName}`;
                badge.style.cssText =
                  "position:absolute;left:4px;top:4px;z-index:2147483646;" +
                  "background:rgba(0,0,0,0.85);color:#fbbf24;padding:3px 7px;" +
                  "border-radius:6px;font-size:11px;font-weight:900;pointer-events:none";
                link.appendChild(badge);
              }
            }
          } else if (!modelCode) {
            // 時計ブランドは型番必須→赤枠どまり
            const WATCH_BRANDS = ["SEIKO","セイコー","CASIO","カシオ","CITIZEN","シチズン",
              "Grand Seiko","グランドセイコー","ASTRON","アストロン","PROSPEX","プロスペックス",
              "ORIENT","オリエント","G-SHOCK","Gショック","OCEANUS","オシアナス"];
            const isWatchBrand = WATCH_BRANDS.some(wb =>
              brand.toLowerCase() === wb.toLowerCase()
            );

            if (isWatchBrand) {
              // 時計ブランドで型番なし→赤枠（要確認）
              link.style.outline = "3px solid #ef4444";
              link.style.borderRadius = "6px";
              link.style.position = "relative";
              if (!link.querySelector(".sniper-badge")) {
                const badge = document.createElement("span");
                badge.className = "sniper-badge";
                badge.textContent = "🔥";
                badge.style.cssText =
                  "position:absolute;left:4px;top:4px;z-index:2147483646;" +
                  "font-size:16px;line-height:1;pointer-events:none";
                link.appendChild(badge);
              }
            } else {
              // 洋服等（型番なし）→黄色枠🔥
              link.style.outline = "6px solid #fbbf24";
              link.style.borderRadius = "6px";
              link.style.position = "relative";
              if (!link.querySelector(".sniper-badge")) {
                const badge = document.createElement("span");
                badge.className = "sniper-badge";
                badge.textContent = "🔥";
                badge.style.cssText =
                  "position:absolute;left:4px;top:4px;z-index:2147483646;" +
                  "font-size:16px;line-height:1;pointer-events:none";
                link.appendChild(badge);
              }
            }
          }
          // 時計だが型番辞書に未登録→固有名詞で判定
          else {
            // テキスト内の固有名詞（シリーズ名）を確認
            const SERIES_KEYWORDS = {
              "PROSPEX": 25000, "プロスペックス": 25000,
              "PRESAGE": 20000, "プレザージュ": 20000,
              "BRIGHTZ": 18000, "ブライツ": 18000,
              "ASTRON": 40000, "アストロン": 40000,
              "OCEANUS": 35000, "オシアナス": 35000,
              "GRAND SEIKO": 80000, "グランドセイコー": 80000,
              "KING SEIKO": 30000, "キングセイコー": 30000,
              "FROGMAN": 20000, "フロッグマン": 20000,
              "MUDMASTER": 15000, "マッドマスター": 15000,
              "CAMPANOLA": 50000, "カンパノラ": 50000,
              "ATTESA": 20000, "アテッサ": 20000,
            };
            let seriesLimit = null;
            let seriesName = "";
            for (const [kw, lim] of Object.entries(SERIES_KEYWORDS)) {
              if (text.toLowerCase().includes(kw.toLowerCase())) {
                seriesLimit = lim; seriesName = kw; break;
              }
            }

            if (seriesLimit !== null && price !== null && price <= seriesLimit) {
              // 固有名詞一致→黄色枠
              link.style.outline = "6px solid #fbbf24";
              link.style.borderRadius = "6px";
              link.style.position = "relative";
              if (!link.querySelector(".sniper-series-badge")) {
                const badge = document.createElement("span");
                badge.className = "sniper-series-badge";
                badge.textContent = `💎 ${seriesName}`;
                badge.style.cssText =
                  "position:absolute;left:4px;top:4px;z-index:2147483646;" +
                  "background:rgba(0,0,0,0.85);color:#fbbf24;padding:3px 7px;" +
                  "border-radius:6px;font-size:11px;font-weight:900;pointer-events:none";
                link.appendChild(badge);
              }
            } else {
              // 固有名詞なし→赤枠（要確認）
              link.style.outline = "3px solid #ef4444";
              link.style.borderRadius = "6px";
              link.style.position = "relative";
              if (!link.querySelector(".sniper-hot-badge")) {
                const badge = document.createElement("span");
                badge.className = "sniper-hot-badge";
                badge.textContent = "🔥";
                badge.style.cssText =
                  "position:absolute;left:4px;top:4px;z-index:2147483646;" +
                  "font-size:16px;line-height:1;pointer-events:none";
                link.appendChild(badge);
              }
            }
          }
        }
      });
    };

    applyOnce();

    // 動的追加対応
    if (!window.__patchFilterObserver__) {
      window.__patchFilterObserver__ = new MutationObserver(() => applyOnce());
      window.__patchFilterObserver__.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        if (window.__patchFilterObserver__) {
          window.__patchFilterObserver__.disconnect();
          delete window.__patchFilterObserver__;
        }
      }, 20000);
    }
  }

  // -------------------------------------------------------
  // PATCH: フェーズ4 利益計算ツール（別タブボタン）
  // -------------------------------------------------------
  const PATCH_CALC_ID = "__patch_profit_calc__";

  function patch_injectCalcButton() {
    if (document.getElementById(PATCH_CALC_ID)) return;

    const btn = document.createElement("div");
    btn.id = PATCH_CALC_ID;
    btn.textContent = "💹 利益計算";
    btn.style.cssText =
      "position:fixed;left:12px;bottom:20px;z-index:2147483640;" +
      "background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;" +
      "border-radius:12px;padding:10px 16px;font-size:13px;font-weight:800;" +
      "font-family:system-ui,sans-serif;cursor:pointer;" +
      "box-shadow:0 4px 16px rgba(37,99,235,0.5);letter-spacing:1px;";

    btn.onclick = () => {
      const url = chrome.runtime.getURL("calc.html");
      window.open(url, "_blank");
    };

    document.body.appendChild(btn);
  }

  // URL監視によるSPA遷移検知（setInterval方式・確実に動く）
  if (!window.__sniperUrlWatcher__) {
    window.__sniperUrlWatcher__ = true;
    let _lastUrl = location.href;

    setInterval(() => {
      const currentUrl = location.href;
      if (currentUrl === _lastUrl) return;
      _lastUrl = currentUrl;

      // メルカリShops商品ページへの遷移を検知
      if ((location.hostname.includes("mercari-shops.com") &&
           location.pathname.includes("/products/")) ||
          (location.hostname.includes("jp.mercari.com") &&
           location.pathname.startsWith("/shops/product/"))) {
        const old1 = document.getElementById("__sniper_days__");
        const old2 = document.getElementById("__sniper_datetime__");
        if (old1) old1.remove();
        if (old2) old2.remove();
        setTimeout(tryInjectShopsDays, 500);
      }

      // メルカリ商品ページへの遷移を検知
      if (location.hostname.includes("jp.mercari.com") &&
          location.pathname.startsWith("/item/")) {
        // キャッシュクリア・既存要素削除
        _mercariCacheId = null;
        _mercariCache   = null;
        const old1 = document.getElementById("__sniper_days__");
        const old2 = document.getElementById("__sniper_datetime__");
        if (old1) old1.remove();
        if (old2) old2.remove();

        // 描画完了を待って実行
        const start = Date.now();
        const check = () => {
          const el = document.querySelector("#shopComment") ||
                     document.querySelector("mer-item-details") ||
                     document.querySelector("section") ||
                     document.querySelector("main");
          if (el || Date.now() - start > 10000) {
            tryInjectMercariDays();
          } else {
            setTimeout(check, 300);
          }
        };
        setTimeout(check, 300);
      }
    }, 500);
  }

/* ====== Patch領域 ====== */
  /* ====== Patch領域 ====== */

  // -------------------------------------------------------
  // PATCH: ピンクボタン → 一括スプシ送信（位置を上に移動・Gemini廃止）
  // -------------------------------------------------------
  async function patch_autoAiAppraisal(cfg, siteKey) {
    // Gemini廃止。型番プレフィックス辞書で完結するため何もしない
    // ハイライトはpatch_applyListFilter()で処理済み
  }




// -------------------------------------------------------
  // PATCH: Shops管理ページ 価格改定ツール
  // -------------------------------------------------------
  const SHOPS_ADMIN_GAS_URL = "YOUR_API_KEY";
  const SHOPS_ADMIN_TOKEN = "bluestar2026";

  function isShopsAdminPage() {
    return location.hostname.includes("mercari-shops.com") &&
           location.pathname.includes("/seller/") &&
           location.pathname.includes("/products") &&
           !location.pathname.includes("/edit");
  }

  function extractManageId(title) {
    // 末尾のB/MxxxxのIDを取得（型番と区別するため）
    const matches = title.match(/[BM]\d{4}/g);
    return matches ? matches[matches.length - 1] : null;
  }

  function calcAction(likesCount, daysElapsed, firstFloor, secondFloor, currentPrice, statusText) {
    let dropAmount = 500;
    let gearText = "💧500円値下げ";

    const floor = daysElapsed >= 28 ? secondFloor : firstFloor;

    // 床を80円単位に切り上げ（高い方の80円）
    let floorAdjusted = floor;
    const floorRem = floor % 100;
    if (floorRem !== 80) {
      floorAdjusted = Math.floor(floor / 100) * 100 + 80;
      if (floorAdjusted < floor) floorAdjusted += 100;
    }

    // 損切の特別ロジック
    if (statusText === "損切") {
      const margin = currentPrice - floorAdjusted;
      if (margin < 100) {
        return {
          gearText: "✅ 床に到達済み",
          dropAmount: 0,
          newPrice: currentPrice,
          floor: floorAdjusted,
          blocked: true
        };
      } else if (margin < 500) {
        dropAmount = 100;
        gearText = "💧100円値下げ（損切モード）";
      } else {
        if (likesCount >= 10) {
          dropAmount = 100;
          gearText = "🔥100円値下げ";
        } else if (likesCount >= 6) {
          dropAmount = 300;
          gearText = "💡300円値下げ";
        }
      }
    } else {
      // 通常販売中ロジック
      if (likesCount >= 10) {
        dropAmount = 100;
        gearText = "🔥100円値下げ";
      } else if (likesCount >= 6) {
        dropAmount = 300;
        gearText = "💡300円値下げ";
      }
      if (daysElapsed >= 32) {
        gearText = "💀最終処分 " + gearText;
      }
    }

    // 値下げ後を近い方の80円に丸め
    let newPrice = currentPrice - dropAmount;
    const rem = newPrice % 100;
    if (rem !== 80) {
      const lower = Math.floor(newPrice / 100) * 100 + 80;
      const upper = lower + 100;
      newPrice = (newPrice - lower <= upper - newPrice) ? lower : upper;
    }

    // 床を下回らないように
    newPrice = Math.max(newPrice, floorAdjusted);
    const blocked = newPrice >= currentPrice;

    return { gearText, dropAmount, newPrice, floor: floorAdjusted, blocked };
  }

  async function fetchShopsProductInfo(productId) {
    const res = await fetch('https://mercari-shops.com/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: '{ product(id:"' + productId + '"){createdAt likesCount viewCount}}'
      })
    });
    const data = await res.json();
    return data?.data?.product || null;
  }

  async function fetchGasInfo(manageId) {
    const url = SHOPS_ADMIN_GAS_URL + "?token=" + SHOPS_ADMIN_TOKEN + "&id=" + manageId;
    const res = await fetch(url);
    return await res.json();
  }

  async function executePriceChange(editUrl, newPrice) {
    if (!confirm(`⏳ ¥${newPrice.toLocaleString()} に値下げします。よろしいですか？`)) return;
    const productIdMatch = editUrl.match(/\/products\/([^\/]+)\/edit/);
    if (!productIdMatch) {
      alert('商品IDが取得できませんでした');
      return;
    }
    const productId = productIdMatch[1];

    // 押したボタンを即座にローディング表示
    const allCards = document.querySelectorAll('a[href*="/products/"][href*="/edit"]');
    let pressedBtn = null;
    const targetCard = document.querySelector(`a[href*="${productId}"][href*="/edit"]`);
    if (targetCard) {
      const btns = targetCard.querySelectorAll('.shops-admin-btn-wrap button');
      btns.forEach(btn => {
        if (btn.textContent.includes('値下げ')) {
          pressedBtn = btn;
          btn.textContent = '⏳ 処理中...';
          btn.style.background = '#64748b';
          btn.disabled = true;
        }
      });
    }

    try {
      const productInfo = await fetchFullProductInfo(productId);
      if (!productInfo) throw new Error('商品情報取得失敗');
      await updateProductPrice(productInfo, newPrice);

      // 成功表示
      if (pressedBtn) {
        pressedBtn.textContent = `✅ ¥${newPrice.toLocaleString()} に変更済み`;
        pressedBtn.style.background = '#16a34a';
        pressedBtn.disabled = true;
      }
      alert(`✅ ¥${newPrice.toLocaleString()} に値下げしました`);


      // ボタン表示を更新
      const card = document.querySelector(`a[href*="${productId}"]`);
      if (card) {
        const execBtn = card.querySelector('.shops-admin-btn-wrap button');
        if (execBtn) {
          execBtn.textContent = `✅ ¥${newPrice.toLocaleString()} に変更済み`;
          execBtn.style.background = '#16a34a';
          execBtn.disabled = true;
        }
      }
    } catch(err) {
      alert(`❌ エラー: ${err.message}`);
    }
  }

  async function patch_injectShopsAdminButtons() {
    if (!isShopsAdminPage()) return;

    // 既に処理済みのカードはスキップ
    const cards = document.querySelectorAll('a[href*="/products/"][href*="/edit"]');
    if (!cards.length) return;

    let delay = 0;
  for (const card of cards) {
    if (card.querySelector(".shops-admin-btn-wrap")) continue;
      if (card.dataset.shopsProcessed) continue;
      card.dataset.shopsProcessed = "1";

    const editUrl = card.href.startsWith("http")
      ? card.href
      : "https://mercari-shops.com" + card.getAttribute("href");

    const productIdMatch = editUrl.match(/\/products\/([^\/]+)\/edit/);
    if (!productIdMatch) continue;
    const productId = productIdMatch[1];

    const titleEl = card.querySelector('[data-testid="product-name"]');
    if (!titleEl) continue;
    const title = titleEl.textContent.trim();

    const manageId = extractManageId(title);

    const priceEl = card.querySelector('.css-1wgdpkr');
    if (!priceEl) continue;
    const priceText = priceEl.textContent.replace(/[¥,￥]/g, "").trim();
    const currentPrice = parseInt(priceText, 10);
    if (isNaN(currentPrice)) continue;

    if (card.querySelector('[data-testid="soldout-label"]')) continue;

    const btnWrap = document.createElement("div");
    btnWrap.className = "shops-admin-btn-wrap";
    btnWrap.style.cssText =
      "margin-top:6px;padding:6px 8px;" +
      "background:rgba(15,23,42,0.85);border-radius:8px;" +
      "font-size:11px;color:#cbd5e1;font-family:system-ui,sans-serif;" +
      "cursor:default;";
    btnWrap.textContent = "⏳ 読み込み中...";
    btnWrap.onclick = (e) => { e.preventDefault(); e.stopPropagation(); };
    card.appendChild(btnWrap);

    // 200msずつ遅延させて順番に処理
    setTimeout((async (card, editUrl, productId, title, manageId, currentPrice, btnWrap) => {
      try {
        const graphInfo = await fetchShopsProductInfo(productId);
        if (!graphInfo) {
          btnWrap.remove();
          return;
        }

        const likesCount = graphInfo.likesCount || 0;
        const createdAt = graphInfo.createdAt * 1000;
        const now = new Date();
        const daysElapsed = Math.floor((now - new Date(createdAt)) / 86400000);

        let firstFloor = 0;
        let secondFloor = 0;
        let daysElapsedFinal = daysElapsed;
        let statusText = "";
        let statusColor = "#94a3b8";

        if (!manageId) {
          btnWrap.innerHTML = "";
          btnWrap.style.cssText =
            "margin-top:6px;padding:4px 8px;" +
            "background:rgba(15,23,42,0.9);border-radius:8px;" +
            "font-size:10px;color:#94a3b8;font-family:system-ui,sans-serif;";
          btnWrap.textContent = "⚠️ DB未登録";
          return;
        }

        const gasInfo = await fetchGasInfo(manageId);

        if (gasInfo.error) {
          btnWrap.innerHTML = "";
          btnWrap.style.cssText =
            "margin-top:6px;padding:4px 8px;" +
            "background:rgba(15,23,42,0.9);border-radius:8px;" +
            "font-size:10px;color:#94a3b8;font-family:system-ui,sans-serif;";
          btnWrap.textContent = "⚠️ DB未登録";
          return;
        }

        statusText = gasInfo.status || "";
        if (statusText === "販売中") statusColor = "#4ade80";
        else if (statusText === "損切") statusColor = "#fb923c";
        else statusColor = "#94a3b8";

        firstFloor = gasInfo.firstFloor || 0;
        secondFloor = gasInfo.secondFloor || 0;
        const sellPrice = gasInfo.sellPrice || 0;
        const lowPrice = gasInfo.lowPrice || 0;

        if (gasInfo.listDate) {
          const listDate = new Date(gasInfo.listDate);
          if (!isNaN(listDate.getTime())) {
            daysElapsedFinal = Math.floor((now - listDate) / 86400000);
          }
        }

        

        // 出品日を計算
        const listDateObj = gasInfo.listDate ? new Date(gasInfo.listDate) : null;
        const listDateStr = listDateObj && !isNaN(listDateObj)
          ? `${listDateObj.getMonth()+1}/${String(listDateObj.getDate()).padStart(2,'0')}`
          : '';

        // 出品日が未来かどうか
        const isFutureDate = listDateObj && !isNaN(listDateObj) && listDateObj > now;
        const isInvalidDate = !listDateObj || isNaN(listDateObj);

        const isActionable = statusText === "販売中" || statusText === "損切";
        const action = isActionable && !isFutureDate && !isInvalidDate
          ? calcAction(likesCount, daysElapsedFinal, firstFloor, secondFloor, currentPrice, statusText)
          : null;

        btnWrap.innerHTML = "";
        btnWrap.style.cssText =
          "margin-top:6px;padding:6px 8px;" +
          "background:rgba(15,23,42,0.9);border-radius:8px;" +
          "font-size:11px;color:#cbd5e1;font-family:system-ui,sans-serif;" +
          "display:flex;flex-direction:column;gap:4px;";

        // 1行目：ステータス・いいね・出品日・経過日数 + 価格情報
        const statusDiv = document.createElement("div");
        statusDiv.style.cssText = `color:${statusColor};font-size:10px;font-weight:700;display:flex;flex-wrap:wrap;gap:8px;`;
        const leftInfo = `● ${statusText} ♡${likesCount} 🗓${listDateStr} 📅${daysElapsedFinal}日`;
        const floorInfo = action ? (daysElapsedFinal >= 28 ? ` 💀限界床:¥${secondFloor.toLocaleString()}` : ` 第1床:¥${action.floor.toLocaleString()}`) : '';
        const rightInfo = isActionable
          ? `適正:¥${sellPrice.toLocaleString()} 安値:¥${lowPrice.toLocaleString()} 損益:¥${firstFloor.toLocaleString()}${floorInfo}`
          : '';
        statusDiv.innerHTML = `<span>${leftInfo}</span><span style="color:#94a3b8;font-weight:400;">${rightInfo}</span>`;
        btnWrap.appendChild(statusDiv);

        // 出品日エラー表示
        if (isInvalidDate && isActionable) {
          const errDiv = document.createElement("div");
          errDiv.style.cssText = "color:#f87171;font-size:10px;";
          errDiv.textContent = "⚠️ 出品日が未入力またはエラー";
          btnWrap.appendChild(errDiv);
        } else if (isFutureDate && isActionable) {
          const errDiv = document.createElement("div");
          errDiv.style.cssText = "color:#f87171;font-size:10px;";
          errDiv.textContent = "⚠️ 出品日が未来です";
          btnWrap.appendChild(errDiv);
        } else if (isActionable && action) {
          // フェーズ判定
          if (daysElapsedFinal === 14) {
            const relistDiv = document.createElement("div");
            relistDiv.style.cssText = "color:#f97316;font-weight:700;";
            relistDiv.textContent = `🚨 タイトル変更+再出品 → 適正相場:¥${sellPrice.toLocaleString()}`;
            btnWrap.appendChild(relistDiv);

          } else if (daysElapsedFinal === 28) {
            const relistDiv = document.createElement("div");
            relistDiv.style.cssText = "color:#f97316;font-weight:700;";
            relistDiv.textContent = `🚨 タイトル変更+再出品 → 安値相場:¥${lowPrice.toLocaleString()}`;
            btnWrap.appendChild(relistDiv);

          } else if (daysElapsedFinal >= 29 && daysElapsedFinal <= 31) {
            const stayDiv = document.createElement("div");
            stayDiv.style.cssText = "color:#94a3b8;font-weight:700;";
            stayDiv.textContent = "⏸ 再出品直後：価格ステイ（いいね待機）";
            btnWrap.appendChild(stayDiv);

          } else if (!action.blocked) {
            const actionDiv = document.createElement("div");
            actionDiv.style.cssText = "color:#fbbf24;font-weight:700;";
            actionDiv.textContent = `${action.gearText} → ¥${action.newPrice.toLocaleString()}`;
            btnWrap.appendChild(actionDiv);

            const execBtn = document.createElement("button");
            execBtn.textContent = `▼ ¥${action.newPrice.toLocaleString()} に値下げ`;
            execBtn.style.cssText =
              "background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;" +
              "border:none;border-radius:6px;padding:5px 10px;" +
              "font-size:11px;font-weight:700;cursor:pointer;flex:1;";
            execBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              executePriceChange(editUrl, action.newPrice);
            };
            btnWrap.appendChild(execBtn);

          } else {
            const blockedDiv = document.createElement("div");
            blockedDiv.style.cssText = "color:#4ade80;font-weight:700;";
            blockedDiv.textContent = "✅ 床に到達済み";
            btnWrap.appendChild(blockedDiv);
          }
        }

        

        

        if (isActionable) {
          // ボタン行（ライバル検索・手動）
          const btnRow = document.createElement("div");
          btnRow.style.cssText = "display:flex;gap:4px;";

          const rivalBtn = document.createElement("button");
          rivalBtn.textContent = "🔍 ライバル検索";
          rivalBtn.style.cssText =
            "background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;" +
            "border:none;border-radius:6px;padding:5px 10px;" +
            "font-size:11px;font-weight:700;cursor:pointer;flex:1;";
          rivalBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const keyword = encodeURIComponent(title.replace(/[BM]\d{4}.*$/, "").trim());
            window.open(`https://jp.mercari.com/search?keyword=${keyword}&status=on_sale&order=price_asc`, "_blank");
          };
          btnRow.appendChild(rivalBtn);

          // 手動値下げボタン
          const manualBtn = document.createElement("button");
          manualBtn.type = "button";
          manualBtn.textContent = "手動▼";
          manualBtn.style.cssText =
            "background:#475569;color:#fff;" +
            "border:none;border-radius:6px;padding:5px 10px;" +
            "font-size:11px;font-weight:700;cursor:pointer;";
          
          const manualWrap = document.createElement("div");
          manualWrap.style.cssText = "display:none;flex-wrap:wrap;gap:4px;margin-top:4px;";

          [100,200,300,400,500].forEach(v => {
            const manualAmtBtn = document.createElement("button");
            manualAmtBtn.type = "button";
            manualAmtBtn.textContent = `▼${v}円値下げ`;
            manualAmtBtn.style.cssText =
              "background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;" +
              "border:none;border-radius:6px;padding:5px 8px;" +
              "font-size:11px;font-weight:700;cursor:pointer;";
            manualAmtBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              const manualPrice = currentPrice - v;
              executePriceChange(editUrl, manualPrice);
            };
            manualWrap.appendChild(manualAmtBtn);
          });

          manualBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (manualWrap.style.display === 'none') {
              manualWrap.style.display = 'flex';
              manualBtn.textContent = '手動▲';
            } else {
              manualWrap.style.display = 'none';
              manualBtn.textContent = '手動▼';
            }
          };

          btnRow.appendChild(manualBtn);
          btnWrap.appendChild(btnRow);
          btnWrap.appendChild(manualWrap);
        }

      } catch(err) {
        btnWrap.textContent = "⚠️ エラー: " + err.message;
      }
    }).bind(null, card, editUrl, productId, title, manageId, currentPrice, btnWrap), delay);

    delay += 200; // 1商品ごとに200ms遅延
  }
  } // patch_injectShopsAdminButtons closing

  // Shops管理ページ監視



// Shops管理ページ監視
  if (!window.__shopsAdminWatcher__) {
    window.__shopsAdminWatcher__ = true;

    // 初回実行
    if (isShopsAdminPage()) {
      setTimeout(patch_injectShopsAdminButtons, 3000);
    }

    // DOM変化監視（ページング・フィルタ切替対応）
    const shopsObserver = new MutationObserver(() => {
      if (isShopsAdminPage()) {
        clearTimeout(window.__shopsAdminTimer__);
        window.__shopsAdminTimer__ = setTimeout(patch_injectShopsAdminButtons, 1000);
      }
    });
    shopsObserver.observe(document.body, { childList: true, subtree: true });
  }



// -------------------------------------------------------
  // PATCH: Shops管理ページ 一括価格変更機能
  // -------------------------------------------------------

  async function fetchFullProductInfo(productId) {
    const res = await fetch('https://mercari-shops.com/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `{ product(id:"${productId}"){
          id name description price snapshotId
          shop{id}
          assets{id}
          categories{category{id}}
          brands{id}
          condition{id}
          shippingFromState{id}
          shippingDurationType{id}
          shippingMethodType{id}
          shippingPayerType{id}
          variants{id name quantity stockSnapshotId janCode skuCode
            optionTypes{id options{id}}
          }
        }}`
      })
    });
    const data = await res.json();
    return data?.data?.product || null;
  }

  async function updateProductPrice(product, newPrice) {
    const cats = product.categories?.[0]?.category || [];
    const categoryIds = cats.length > 0 ? [cats[cats.length - 1].id] : [];
    const assetIds = product.assets.map(a => a.id);
    const brandIds = product.brands.map(b => b.id);

    const variants = product.variants.map(v => ({
      id: v.id,
      name: v.name,
      quantity: v.quantity,
      stockSnapshotId: v.stockSnapshotId,
      janCode: v.janCode || "",
      skuCode: v.skuCode || "",
      catalogSkuId: null,
      optionTypeId: v.optionTypes?.[0]?.id || "",
      optionId: v.optionTypes?.[0]?.options?.[0]?.id || "",
      attributes: []
    }));

    const input = {
      id: product.id,
      name: product.name,
      shopId: product.shop.id,
      status: "STATUS_OPENED",
      productSnapshotId: product.snapshotId,
      description: product.description,
      price: newPrice,
      assetIds: assetIds,
      categoryIds: categoryIds,
      brandIds: brandIds,
      condition: product.condition.id,
      shippingFromStateId: product.shippingFromState.id,
      shippingDurationType: product.shippingDurationType.id,
      shippingMethodType: product.shippingMethodType.id,
      shippingPayerType: product.shippingPayerType.id,
      countryRestrictionTemplateId: "",
      isRefurbished: false,
      variants: variants
    };

    const res = await fetch('https://mercari-shops.com/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationName: "UpdateProductV2",
        variables: {
          input: input,
          idempotencyKeySeed: Date.now()
        },
        query: `mutation UpdateProductV2($input: UpdateProductInput!, $idempotencyKeySeed: Float!) {
          updateProductV2(
            updateProductInput: $input
            idempotencyKeySeed: $idempotencyKeySeed
          ) {
            id price __typename
          }
        }`
      })
    });

    const data = await res.json();
    if (data?.errors) throw new Error(data.errors[0].message);
    return data?.data?.updateProductV2;
  }

  function randomDelay(min, max) {
    return new Promise(resolve =>
      setTimeout(resolve, min + Math.random() * (max - min))
    );
  }

  async function patch_bulkPriceUpdate() {
    // 実行対象を収集
    const targets = [];
    document.querySelectorAll('.shops-admin-btn-wrap').forEach(wrap => {
      const execBtn = wrap.querySelector('button');
      if (!execBtn || !execBtn.textContent.includes('値下げ')) return;

      const card = wrap.closest('a[href*="/products/"][href*="/edit"]');
      if (!card) return;

      const editUrl = card.href;
      const productIdMatch = editUrl.match(/\/products\/([^\/]+)\/edit/);
      if (!productIdMatch) return;

      const newPriceMatch = execBtn.textContent.match(/[\d,]+/);
      if (!newPriceMatch) return;

      const newPrice = parseInt(newPriceMatch[0].replace(/,/g, ''), 10);
      if (isNaN(newPrice)) return;

      targets.push({
        productId: productIdMatch[1],
        newPrice: newPrice,
        wrap: wrap,
        execBtn: execBtn
      });
    });

    if (targets.length === 0) {
      alert('値下げ対象の商品がありません');
      return;
    }

    const ok = confirm(`${targets.length}商品を一括値下げします。よろしいですか？`);
    if (!ok) return;

    // 一括実行ボタンを無効化
    const bulkBtn = document.getElementById('__shops_bulk_btn__');
    if (bulkBtn) {
      bulkBtn.textContent = `⏳ 実行中... 0/${targets.length}`;
      bulkBtn.style.background = '#64748b';
      bulkBtn.disabled = true;
    }

    let success = 0;
    let fail = 0;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];

      // 進捗表示
      t.execBtn.textContent = '⏳ 処理中...';
      t.execBtn.style.background = '#64748b';

      try {
        const productInfo = await fetchFullProductInfo(t.productId);
        if (!productInfo) throw new Error('商品情報取得失敗');

        await updateProductPrice(productInfo, t.newPrice);

        t.execBtn.textContent = `✅ ¥${t.newPrice.toLocaleString()} に変更済み`;
        t.execBtn.style.background = '#16a34a';
        success++;

      } catch(err) {
        t.execBtn.textContent = `❌ エラー: ${err.message}`;
        t.execBtn.style.background = '#dc2626';
        fail++;
      }

      // 進捗更新
      if (bulkBtn) {
        bulkBtn.textContent = `⏳ 実行中... ${i+1}/${targets.length}`;
      }

      // 揺らぎ待機（3〜8秒）
      if (i < targets.length - 1) {
        await randomDelay(3000, 8000);
      }
    }

    // 完了
    if (bulkBtn) {
      bulkBtn.textContent = `✅ 完了 成功:${success} 失敗:${fail}`;
      bulkBtn.style.background = '#16a34a';
      bulkBtn.disabled = false;
    }
    alert(`✅ 一括値下げ完了！成功:${success}件 失敗:${fail}件`);
  }

  function patch_injectBulkButton() {
    if (!isShopsAdminPage()) return;
    if (document.getElementById('__shops_bulk_btn__')) return;

    const loadingBanner = document.createElement('div');
    loadingBanner.id = '__shops_loading_banner__';
    loadingBanner.textContent = '⏳ BlueStar: 価格情報を読み込んでいます...';
    loadingBanner.style.cssText =
      'position:fixed;top:0;left:0;width:100%;z-index:2147483648;' +
      'background:#1e40af;color:#fff;text-align:center;' +
      'padding:6px;font-size:12px;font-weight:700;';
    document.body.appendChild(loadingBanner);
    setTimeout(() => {
      const banner = document.getElementById('__shops_loading_banner__');
      if (banner) banner.remove();
    }, 4000);

    const btn = document.createElement('button');
    btn.id = '__shops_bulk_btn__';
    btn.textContent = '🚀 一括値下げ実行';
    btn.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);' +
      'z-index:2147483647;background:#dc2626;color:#fff;' +
      'border:none;border-radius:8px;padding:10px 24px;' +
      'font-size:13px;font-weight:800;cursor:pointer;width:auto;' +
      'box-shadow:0 2px 8px rgba(220,38,38,0.5);white-space:nowrap;';

    btn.onclick = () => patch_bulkPriceUpdate();
    document.body.appendChild(btn);
  }

  // 一括ボタンの初期化
  if (isShopsAdminPage()) {
    setTimeout(patch_injectBulkButton, 3500);
  }
  })();


// ============================================================
// PATCH: メルカリ型番・価格 一括抽出機能
// ============================================================
(function() {
  if (!location.href.includes('jp.mercari.com/search')) return;
  if (document.getElementById('__bs_extract_toggle__')) return;

  let extractResults = [];
  let running = false;
  let stopRequested = false;

  function extractModel(text) {
    const results = [];
    let m;

    const re1 = /[\[【■▪◆●・]?[型品]番[号・シリアル]*[\]】]?[\s\u3000]*[：:=＝\.。…･・→は\/]?[\s\u3000]*[\（(]?([A-Za-z0-9][A-Za-z0-9\-\_\/\s\.]{1,}?)[\）)]?(?=\s*[\n,、]|$)/g;
    while ((m = re1.exec(text)) !== null) {
      const val = m[1].trim();
      if (val.length >= 3) results.push(val);
    }

    const re2 = /[\[【■▪◆●]?(?:[型品モデル・号シリアル]*)?[型番][^\n]*\n[\s\u3000]*([A-Za-z0-9][A-Za-z0-9\-\_\/\s\.]{2,}?)(?=\s*\n|$)/g;
    while ((m = re2.exec(text)) !== null) {
      const val = m[1].trim();
      if (val.length >= 3) results.push(val);
    }

    const re3 = /[\[【■▪◆●]?[型品]番[号]?[\]】]?[\s\u3000]*[：:=＝\.。…･・→は]?[\s\u3000]*(\d{6,})/g;
    while ((m = re3.exec(text)) !== null) results.push(m[1]);

    const re4 = /(\d{5,})[^\d]*型番/g;
    while ((m = re4.exec(text)) !== null) results.push(m[1]);

    const unique = [...new Set(results)];
    const filtered = unique.filter(v =>
      !unique.some(other => other !== v && other.startsWith(v) && other.length > v.length)
    );

    if (filtered.length > 0) return filtered.join(' / ');

    const codePatterns = [
      /\b([A-Z]{1,4}\d{2,}[A-Z]?-\d{2,}-\d{2,})\b/i,
      /\b([A-Z]{1,4}\d{3,}[A-Z]?-\d{2,}[A-Z0-9]*)\b/i,
      /\b(\d{2}-\d{4,}[A-Z]?)\b/,
      /\b([A-Z]{1,4}\d{4,}[A-Z]?)\b/i,
      /\b([A-Z]{1,5}-\d{3,}[A-Z0-9-]*)\b/i,
      /\b([A-Z]{2,}\d{3,}[A-Z0-9]*)\b/,
      /\b(\d{3,}[A-Z]{2,}[A-Z0-9-]*)\b/,
    ];
    for (const re of codePatterns) {
      const mc = text.match(re);
      if (mc) return mc[1];
    }
    return null;
  }

  function fetchItemDetail(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_ITEM_DETAIL', url },
        (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve({ price: null, model: null, title: url });
            return;
          }
          resolve({
            price: res.price,
            model: extractModel(res.description || ''),
            title: res.title || url
          });
        }
      );
    });
  }

  async function collectUrls() {
    let lastCount = 0, stableCount = 0;
    while (true) {
      const steps = 40 + Math.floor(Math.random() * 20);
      for (let s = 0; s < steps; s++) {
        window.scrollBy(0, 20 + Math.floor(Math.random() * 10));
        await new Promise(r => setTimeout(r, 18 + Math.floor(Math.random() * 12)));
      }
      await new Promise(r => setTimeout(r, 900 + Math.random() * 500));
      const items = document.querySelectorAll('a[href*="/item/m"]');
      const urls = [...new Set([...items]
        .map(a => a.href)
        .filter(h => /\/item\/m\w+/.test(h))
      )];
      if (urls.length > 0 && urls.length === lastCount) {
        stableCount++;
        if (stableCount >= 5) return urls;
      } else {
        stableCount = 0;
        lastCount = urls.length;
      }
    }
  }

  async function startExtract() {
    if (running) return;
    running = true;
    stopRequested = false;
    extractResults = [];

    const status = document.getElementById('__bs_extract_status__');
    const rows = document.getElementById('__bs_extract_rows__');
    const bar = document.getElementById('__bs_extract_bar__');
    const progress = document.getElementById('__bs_extract_progress__');
    const copyBtn = document.getElementById('__bs_extract_copy__');
    const stopBtn = document.getElementById('__bs_extract_stop__');

    rows.innerHTML = '';
    copyBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    progress.style.display = 'block';
    status.textContent = 'URL収集中（自動スクロール）...';

    const urls = await collectUrls();
    if (stopRequested) { running = false; stopBtn.style.display = 'none'; status.textContent = '停止'; return; }
    status.textContent = urls.length + '件検出、巡回開始...';

    for (let i = 0; i < urls.length; i++) {
      if (stopRequested) break;
      status.textContent = '処理中 ' + (i + 1) + ' / ' + urls.length;
      bar.style.width = ((i + 1) / urls.length * 100) + '%';
      const item = await fetchItemDetail(urls[i]);
      item.url = urls[i];
      extractResults.push(item);
      const row = document.createElement('div');
      row.style.cssText = 'border-bottom:1px solid #1e293b;padding:5px 0;';
      row.innerHTML =
        '<div style="color:#94a3b8;font-size:10px;">' + (item.title || '').slice(0, 30) + '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:2px;">' +
        '<span style="color:#fbbf24;">' + (item.model || '<span style="color:#475569">型番なし</span>') + '</span>' +
        '<span style="color:#34d399;">' + (item.price ? '\xA5' + Number(item.price).toLocaleString() : '-') + '</span>' +
        '</div>';
      rows.appendChild(row);
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 1000 + Math.random() * 800));
    }

    status.textContent = (stopRequested ? '停止：' : '完了：') + extractResults.length + '件';
    stopBtn.style.display = 'none';
    copyBtn.style.display = 'block';
    copyBtn.onclick = copyTSV;
    running = false;
    stopRequested = false;
  }

  function copyTSV() {
    const lines = ['\u4fa1\u683c\t\u578b\u756a\t\u5546\u54c1\u540d\tURL'];
    for (const r of extractResults) {
      lines.push([r.price || '', r.model || '', r.title || '', r.url || ''].join('\t'));
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      const btn = document.getElementById('__bs_extract_copy__');
      btn.textContent = '\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f';
      setTimeout(() => { btn.textContent = '\u30b3\u30d4\u30fc'; }, 2000);
    });
  }

  function buildPanel() {
    if (document.getElementById('__bs_extract_toggle__')) return;

    const toggle = document.createElement('button');
    toggle.id = '__bs_extract_toggle__';
    toggle.textContent = '\u578b\u756a\u62bd\u51fa';
    toggle.style.cssText =
      'position:fixed;bottom:24px;right:16px;z-index:2147483647;' +
      'background:#7c3aed;color:#fff;border:none;border-radius:8px;' +
      'padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(124,58,237,0.5);';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = '__bs_extract_panel__';
    panel.style.cssText =
      'position:fixed;bottom:80px;right:16px;z-index:2147483647;' +
      'background:#0f172a;color:#f1f5f9;border-radius:10px;' +
      'padding:12px;width:300px;font-size:12px;font-family:monospace;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.5);display:none;' +
      'max-height:60vh;overflow-y:auto;';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span style="font-weight:700;font-size:13px;">\u578b\u756a\u30fb\u4fa1\u683c \u62bd\u51fa</span>' +
        '<button id="__bs_extract_close__" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;">X</button>' +
      '</div>' +
      '<div id="__bs_extract_status__" style="color:#94a3b8;margin-bottom:8px;">\u5f85\u6a5f\u4e2d</div>' +
      '<div id="__bs_extract_progress__" style="background:#1e293b;border-radius:4px;height:4px;margin-bottom:10px;display:none;">' +
        '<div id="__bs_extract_bar__" style="height:4px;background:#3b82f6;border-radius:4px;width:0%;transition:width 0.3s;"></div>' +
      '</div>' +
      '<div id="__bs_extract_rows__"></div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;">' +
        '<button id="__bs_extract_run__" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:7px;cursor:pointer;font-size:12px;font-weight:700;">\u62bd\u51fa\u958b\u59cb</button>' +
        '<button id="__bs_extract_stop__" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:6px;padding:7px;cursor:pointer;font-size:12px;font-weight:700;display:none;">\u505c\u6b62</button>' +
        '<button id="__bs_extract_copy__" style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:6px;padding:7px;cursor:pointer;font-size:12px;font-weight:700;display:none;">\u30b3\u30d4\u30fc</button>' +
      '</div>';
    document.body.appendChild(panel);

    toggle.onclick = () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('__bs_extract_close__').onclick = () => {
      panel.style.display = 'none';
    };
    document.getElementById('__bs_extract_run__').onclick = startExtract;
    document.getElementById('__bs_extract_stop__').onclick = () => { stopRequested = true; };
  }

  buildPanel();

})();


// ============================================================
// PATCH: Google Lens結果ページ メルカリURL抽出 → GAS送信
// ============================================================
(function() {
  if (!location.href.includes('google.com/search') || !location.href.includes('lns')) return;
  if (document.getElementById('__bs_lens_btn__')) return;

  const GAS_URL = 'YOUR_API_KEY';

  // ===== FROZEN =====
  function getMercariUrls() {
    const anchors = document.querySelectorAll('a[href*="jp.mercari.com"]');
    const seen = new Set();
    const urls = [...anchors]
      .map(a => a.href.split('#')[0].split('?')[0].replace(/\/$/, ''))
      .filter(h => h.includes('jp.mercari.com/item/m'))
      .filter(h => !seen.has(h) && seen.add(h));
    return urls.slice(0, 10);
  }

  function setStatus(msg, color) {
    const el = document.getElementById('__bs_lens_status__');
    if (el) { el.textContent = msg; el.style.color = color || '#94a3b8'; }
  }

  async function sendToGas(urls) {
    const payload = {
      type: 'mercari_urls',
      urls: urls.map((url, i) => ({ no: i + 1, url }))
    };
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    return true;
  }
  // ===== /FROZEN =====

  // ===== PATCH: extract =====
  async function extract() {
    setStatus('メルカリURL検索中...', '#60a5fa');
    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'clear_all' })
    });
    await new Promise(r => setTimeout(r, 2000));

    let urls = [];
    for (let i = 0; i < 20; i++) {
      urls = getMercariUrls();
      if (urls.length > 0) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (urls.length === 0) {
      setStatus('メルカリURLが見つかりません', '#f87171');
      return;
    }

    setStatus(`${urls.length}件検出、送信中...`, '#fbbf24');
    await sendToGas(urls);
    setStatus(`✅ 送信完了、巡回開始...`, '#34d399');

    for (let i = 0; i < urls.length; i++) {
      setStatus(`巡回中 ${i + 1}/${urls.length}...`, '#fbbf24');
      chrome.runtime.sendMessage({ type: 'OPEN_TAB_BACKGROUND', url: urls[i] + '?bs_auto=1' });
      await new Promise(r => setTimeout(r, 12000));
    }

    setStatus(`✅ 巡回完了`, '#34d399');
  }
  // ===== /PATCH =====

  // ===== FROZEN =====
  function buildBtn() {
    const btn = document.createElement('button');
    btn.id = '__bs_lens_btn__';
    btn.textContent = 'メルカリURL抽出';
    btn.style.cssText =
      'position:fixed;bottom:24px;right:16px;z-index:2147483647;' +
      'background:#00e5ff;color:#000;border:none;border-radius:8px;' +
      'padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,229,255,0.4);font-family:monospace;';

    const status = document.createElement('div');
    status.id = '__bs_lens_status__';
    status.style.cssText =
      'position:fixed;bottom:70px;right:16px;z-index:2147483647;' +
      'background:#0f172a;color:#94a3b8;border-radius:6px;' +
      'padding:6px 12px;font-size:11px;font-family:monospace;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.5);';
    status.textContent = '待機中';

    btn.onclick = extract;
    document.body.appendChild(status);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildBtn);
  } else {
    buildBtn();
  }
  // ===== /FROZEN =====

})();

// ============================================================
// PATCH: メルカリ商品ページ 画像・タイトル取得 → GAS送信
// ============================================================
(function() {
  if (location.href.indexOf('jp.mercari.com/item/m') === -1) return;
  if (window.__bs_capture_done__) return;
  window.__bs_capture_done__ = true;

  const GAS_URL = 'YOUR_API_KEY';

  // ===== FROZEN =====
  function showBadge(msg) {
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#00e5ff;color:#000;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;font-family:monospace;';
    badge.textContent = msg;
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 3000);
  }
  function getTitle() {
    const el = document.querySelector('[data-testid="name"]') ||
               document.querySelector('h1');
    return el ? el.textContent.trim() : '';
  }
  function getImage() {
    const el = document.querySelector('img[src*="static.mercdn.net/item"]') ||
               document.querySelector('img[src*="static.mercdn"]');
    return el ? el.src : '';
  }
  // ===== /FROZEN =====

  // ===== PATCH: run =====
  async function run() {
    const isAuto = location.search.indexOf('bs_auto=1') !== -1;

    let title = '';
    for (let i = 0; i < 20; i++) {
      title = getTitle();
      if (title) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!title) {
      showBadge('❌ タイトル取得失敗');
      if (isAuto) setTimeout(() => window.close(), 1500);
      return;
    }

    const imageUrl = getImage();
    const payload = JSON.stringify({
      type: 'item_capture',
      url: location.href.split('?')[0],
      title: title,
      imageUrl: imageUrl
    });

    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: payload
    });

    showBadge('✅ 送信完了: ' + title.slice(0, 20));
    if (isAuto) setTimeout(() => window.close(), 1500);
  }
  // ===== /PATCH =====

  setTimeout(run, 500);
})();
