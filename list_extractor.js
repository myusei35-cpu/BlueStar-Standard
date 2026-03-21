// マルチサイト対応スナイパー v5
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
      test: u => u.hostname.includes("trefac.jp") && u.pathname.includes("search"),
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
     ★ セカスト専用パーサー v5
     productName の /区切り構造を解析して
     ブランド・商品名・サイズ・高値要素を取得する
     ========================================================= */
  function parse2ndStreetProductName(doc) {
    const el = doc.querySelector('[itemprop="name"], .productName, h1[class*="productName"]');
    if (!el) return null;

    const raw = clean(el.textContent);
    const slots = raw.split("/").map(s => s.trim()).filter(s => s.length > 0);
    if (slots.length < 2) return null;

    // --- 型番：末尾から逆順に「英数字のみ・ハイフン許容」スロットを探す ---
    const EXCLUDE_MODEL = new Set([
      ...COMMON_MATERIALS.map(m => m.toLowerCase()),
      ...COMMON_COLORS.map(c => c.toLowerCase())
    ]);
    const isModelCandidate = s =>
      /^[A-Z0-9][A-Z0-9\-]{2,}$/i.test(s) &&   // 英数字・ハイフンのみ
      !EXCLUDE_MODEL.has(s.toLowerCase()) &&      // 一般色・素材でない
      !/^(XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(s) && // サイズでない
      !/^\d{2,4}[sS]$/.test(s);                  // 年代タグでない
    let modelCode = "";
    for (let i = slots.length - 1; i >= 0; i--) {
      if (isModelCandidate(slots[i])) { modelCode = slots[i]; break; }
    }

    // --- ブランド：英字を含む最初のスロット（日本語混在OK）---
    let brand = "";
    let brandIdx = -1;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (/[A-Za-z]/.test(s) && !isModelCandidate(s) && !/^\d{2,4}[sS]$/.test(s)) {
        // 英字部分のみ抽出（"HARVARD  パーカー" → "HARVARD"）
        const m = s.match(/^([A-Za-z][A-Za-z0-9 ]*)/);
        brand = m ? m[1].trim() : s;
        brandIdx = i;
        break;
      }
    }

    // --- カテゴリ：日本語を含む最初の意味のあるスロット ---
    // ブランドスロットに日本語が混在していればそれを使う
    // 例: "HARVARD  パーカー" → "パーカー"
    let category = "";
    if (brandIdx >= 0) {
      const brandSlot = slots[brandIdx];
      const jpMatch = brandSlot.match(/([\u3040-\u9FFF][\u3040-\u9FFF\s]*)/);
      if (jpMatch) category = jpMatch[1].trim();
    }
    // ブランドスロットに日本語がなければ他のスロットから探す
    if (!category) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (i === brandIdx || s === modelCode) continue;
        if (/[\u3040-\u9FFF]/.test(s) && !/^[0-9]+$/.test(s)) {
          // 最初の日本語カテゴリスロット
          const alias = CATEGORY_ALIAS[s];
          category = alias || s;
          break;
        }
      }
    }

    // --- 高値要素：XL以上・年代・高値素材・高値ワード ---
    const highFactors = [];
    const allText = slots.join(" ").toLowerCase();
    for (const s of slots) {
      if (/^(XL|XXL|2XL|3XL|44|46|48|50|52)$/i.test(s)) { highFactors.push(s.toUpperCase()); break; }
    }
    const eraMatch = slots.find(s => /^\d{2,4}[sS]$/.test(s));
    if (eraMatch) highFactors.push(eraMatch);
    for (const m of HIGH_MATERIALS) {
      if (allText.includes(m.toLowerCase())) highFactors.push(m);
    }
    for (const w of HIGH_WORDS) {
      if (allText.includes(w.toLowerCase())) highFactors.push(w);
    }

    // itemName = カテゴリ（kw2の中核）
    const itemName = category;

    return {
      brand,
      itemName,
      modelCode,
      highValueFactors: [...new Set(highFactors)]
    };
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
    // セカスト
    if (siteKey === "2ndstreet") {
      const result = parse2ndStreetProductName(doc);
      if (result) return result;
      // fallback: 汎用
    }
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
    const { brand, itemName, modelCode, highValueFactors, imageUrl } = info;

    // kw1: 型番
    const kw1 = modelCode || null;

    // kw2: ブランド + 商品名 + 高値要素（スペース結合）
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

    document.documentElement.appendChild(menu);

    setTimeout(() => {
      document.addEventListener("click", function handler(e) {
        if (!menu.contains(e.target)) {
          safeRemoveSub();
          document.removeEventListener("click", handler);
        }
      });
    }, 100);
  }

  /* =========================================================
     メルカリURL構築
     ========================================================= */
  function buildMercariUrl(keyword) {
    return "https://jp.mercari.com/search?keyword=" + encodeURIComponent(keyword) +
      "&item_condition_id=3&category_id=11%2C12%2C13%2C14%2C15%2C27%2C1488%2C163%2C30%2C31%2C32%2C35" +
      "&status=sold_out&seller_type=0&item_types=mercari&sort=created_time&order=desc";
  }

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
          btn.textContent = orig;
          showSubMenu(btn, info, detailUrl, siteKey);
        } catch (err) {
          console.error("分析エラー:", err);
          btn.textContent = orig;
        }
      };

      link.appendChild(btn);
      // PATCH: フェーズ3 究極の3ボタン注入
      patch_inject3Buttons(link, cfg, siteKey);
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
      btn.href = buildMercariIntent(keyword);
      btn.textContent = "📲 メルカリアプリで開く";
      btn.style.cssText =
        "display:block;margin:4px 0 2px;padding:6px 10px;" +
        "background:#FF0211;color:#fff;border-radius:6px;" +
        "font-size:12px;font-weight:700;text-decoration:none;" +
        "font-family:system-ui,sans-serif;line-height:1.4;text-align:center";

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
      // PATCH: フェーズ4 利益計算ツールUI注入
      patch_injectProfitCalc();

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
    document.querySelectorAll("button").forEach(b => {
      if (b.textContent === "🔍分析" || b.textContent === "⏳...") b.remove();
    });
    injectAnalysisButtons(site.cfg, site.key);
  }

  main().catch(e => console.error(e));

  /* =========================================================
     🔥 PATCH LAYER: フェーズ1〜4
     Frozen層（バッジ・日時表示）には一切干渉しない独立ブロック
     ========================================================= */

  // -------------------------------------------------------
  // PATCH: 辞書データ定義
  // -------------------------------------------------------
  const HOT_BRANDS = {
    "Supreme": 15000, "OAMC": 20000, "ARC'TERYX": 25000, "Stone Island": 20000,
    "Needles": 18000, "WTAPS": 15000, "NEIGHBORHOOD": 15000, "VISVIM": 30000,
    "Engineered Garments": 12000, "South2 West8": 12000, "KAPITAL": 15000,
    "Polo Ralph Lauren": 8000, "Lacoste": 6000, "Fred Perry": 6000,
    "adidas": 5000, "Nike": 5000, "New Balance": 6000, "ASICS": 5000,
    "Patagonia": 10000, "THE NORTH FACE": 10000, "Columbia": 7000,
    "Barbour": 12000, "Baracuta": 12000
  };
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
    // Step2: HOT_BRANDS辞書照合（長いブランド名を優先）
    const sorted = Object.keys(HOT_BRANDS).sort((a, b) => b.length - a.length);
    for (const b of sorted) {
      const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (re.test(sanitized)) {
        const remaining = sanitized.replace(re, "").replace(/\s+/g, " ").trim();
        return { brand: b, remaining };
      }
    }
    // フォールバック: 先頭の英字連続
    const m = sanitized.match(/^([A-Za-z][A-Za-z0-9'&\s]{1,24}?)(?=[\s　\u3000])/);
    if (m) {
      const b = m[1].trim();
      const remaining = sanitized.replace(m[0], "").trim();
      return { brand: b, remaining };
    }
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

  function patch_fullExtract(rawTitle) {
    const sanitized = patch_sanitizeTitle(rawTitle);
    const { brand, remaining } = patch_extractBrand(sanitized);
    const { highVals, pureName } = patch_extractHighValues(remaining);
    // Step4: pureName をさらにクリーニング
    const finalName = pureName
      .replace(/[/\\|_,、。・]+/g, " ")
      .replace(/\s+/g, " ").trim();
    return { brand, pureName: finalName, highVals, sanitized };
  }

  // -------------------------------------------------------
  // PATCH: フェーズ1 ゴミ箱フィルター＆ホットハイライト
  // -------------------------------------------------------
  function patch_getItemText(linkEl) {
    return clean(linkEl.textContent || "");
  }

  function patch_getItemPrice(linkEl) {
    const priceEl = linkEl.querySelector("[class*='price'],[class*='Price'],.c-listItem__price,.itemDetailBody__price,.Price");
    if (priceEl) {
      const m = priceEl.textContent.replace(/[,，￥¥\s]/g, "").match(/\d+/);
      if (m) return parseInt(m[0], 10);
    }
    const m = linkEl.textContent.replace(/[,，]/g, "").match(/[¥￥](\d+)/);
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
        const price = patch_getItemPrice(link);
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

        // ホットハイライト判定
        let isHot = false;
        const upperLimit = HOT_BRANDS[brand] || HOT_BRANDS[
          Object.keys(HOT_BRANDS).find(b => text.toLowerCase().includes(b.toLowerCase()))
        ];

        if (patch_isYahooAuction()) {
          // ヤフオク: 即決は上限以下でHOT、オークションは残り24h以内かつ上限以下
          const isBuyNow = /即決/.test(text);
          const remainH  = patch_getYahooEndTime(link);
          if (isBuyNow && upperLimit && price !== null && price <= upperLimit) isHot = true;
          if (!isBuyNow && upperLimit && price !== null && price <= upperLimit
              && remainH !== null && remainH <= 24) isHot = true;
        } else {
          if (upperLimit && price !== null && price <= upperLimit) isHot = true;
          if (!isHot && highVals.length > 0 && brand) isHot = true;
        }

        if (isHot) {
          link.style.outline = "3px solid #ef4444";
          link.style.borderRadius = "6px";
          // 🔥アイコン
          const badge = document.createElement("span");
          badge.textContent = "🔥";
          badge.style.cssText =
            "position:absolute;left:4px;top:4px;z-index:2147483646;" +
            "font-size:16px;line-height:1;pointer-events:none";
          link.style.position = "relative";
          link.appendChild(badge);
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
  // PATCH: フェーズ3 究極の3ボタン注入
  // -------------------------------------------------------
  function patch_inject3Buttons(link, cfg, siteKey) {
    if (link.dataset.patch3btn) return;
    link.dataset.patch3btn = "true";

    // 3ボタンコンテナ（分析ボタンの下に配置）
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:absolute;right:4px;top:36px;z-index:2147483647;" +
      "display:flex;flex-direction:column;gap:3px;pointer-events:auto";

    const mkBtn = (icon, title, onclick) => {
      const b = document.createElement("button");
      b.title = title;
      b.textContent = icon;
      b.style.cssText =
        "width:28px;height:28px;line-height:1;font-size:14px;" +
        "background:rgba(15,23,42,0.92);color:#fff;border:1px solid rgba(255,255,255,0.2);" +
        "border-radius:5px;cursor:pointer;padding:0;display:flex;" +
        "align-items:center;justify-content:center";
      b.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { await onclick(); } catch(err) { console.error(err); }
      };
      return b;
    };

    // 📷 Lensボタン（ヤフオクはnoop）
    const lensBtn = mkBtn("📷", "Lensで検索", async () => {
      const detailUrl = cfg.normalizeUrl(link.getAttribute("href"));
      if (!detailUrl) return;
      const info = await fetchDetailInfo(detailUrl, siteKey);
      const { brand, pureName } = patch_fullExtract(
        [info.brand, info.itemName].filter(Boolean).join(" ")
      );
      const lensQ = encodeURIComponent((info.brand || brand || "") + " メルカリ");
      if (siteKey !== "yahooauction" && info.imageUrl) {
        await openLensWithBlob(info.imageUrl, info.brand || brand);
      } else {
        window.open("https://lens.google.com/search?q=" + lensQ, "_blank");
      }
    });
    wrap.appendChild(lensBtn);

    // 🏷️ 型番ボタン
    const modelBtn = mkBtn("🏷️", "型番でメルカリ2タブ展開", async () => {
      const detailUrl = cfg.normalizeUrl(link.getAttribute("href"));
      if (!detailUrl) return;
      const info = await fetchDetailInfo(detailUrl, siteKey);
      const rawText = [info.brand, info.itemName, info.modelCode].filter(Boolean).join(" ");
      const { pureName } = patch_fullExtract(rawText);
      const kw = info.modelCode || pureName;
      if (!kw) { showToast("型番が取得できませんでした", 2000); return; }
      // ①絞り込みなし
      window.open("https://jp.mercari.com/search?keyword=" + encodeURIComponent(kw), "_blank");
      // ②売り切れ＆新しい順
      window.open(buildMercariUrl(kw), "_blank");
    });
    wrap.appendChild(modelBtn);

    // 🔥 高値ボタン
    const hotBtn = mkBtn("🔥", "高値キーワードでメルカリ2タブ展開", async () => {
      const detailUrl = cfg.normalizeUrl(link.getAttribute("href"));
      if (!detailUrl) return;
      const info = await fetchDetailInfo(detailUrl, siteKey);
      const rawText = [info.brand, info.itemName].filter(Boolean).join(" ");
      const { brand, pureName, highVals } = patch_fullExtract(rawText);
      const bName = info.brand || brand;
      // カテゴリ検出
      const cat = HOT_CATEGORIES.find(c => rawText.includes(c)) || "";
      const kw2parts = [bName, cat, ...highVals].filter(Boolean);
      const kw2 = kw2parts.join(" ") || (bName + " " + pureName).trim();
      // ①絞り込みなし
      window.open("https://jp.mercari.com/search?keyword=" + encodeURIComponent(kw2), "_blank");
      // ②売り切れ＆新しい順
      window.open(buildMercariUrl(kw2), "_blank");
    });
    wrap.appendChild(hotBtn);

    link.appendChild(wrap);
  }

  // -------------------------------------------------------
  // PATCH: フェーズ4 メルカリ相場画面での利益計算ツールUI
  // -------------------------------------------------------
  const PATCH_CALC_ID = "__patch_profit_calc__";

  function patch_injectProfitCalc() {
    if (document.getElementById(PATCH_CALC_ID)) return;

    const SHIPPING = 700; // デフォルト送料
    const FEE_RATE = 0.10; // メルカリ手数料10%

    const el = document.createElement("div");
    el.id = PATCH_CALC_ID;
    el.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483640;" +
      "background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;" +
      "border-top:2px solid #3b82f6;padding:10px 12px 12px;" +
      "transform:translateY(100%);transition:transform 280ms ease;" +
      "box-shadow:0 -8px 32px rgba(0,0,0,0.5)";

    el.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
  <span style="font-size:13px;font-weight:700;color:#60a5fa">📊 利益計算</span>
  <div style="display:flex;gap:6px;align-items:center">
    <span id="${PATCH_CALC_ID}_alert" style="font-size:12px;font-weight:700;color:#f87171"></span>
    <button id="${PATCH_CALC_ID}_close" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;padding:0 4px;line-height:1">✕</button>
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
  <label style="font-size:10px;color:#94a3b8">仕入れ値
    <input id="${PATCH_CALC_ID}_cost" type="number" placeholder="例:3000"
      style="width:100%;margin-top:2px;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:13px">
  </label>
  <label style="font-size:10px;color:#94a3b8">高値(安値で代替OK)
    <input id="${PATCH_CALC_ID}_high" type="number" placeholder="高値"
      style="width:100%;margin-top:2px;padding:6px;background:#1e293b;border:2px solid #f59e0b;border-radius:6px;color:#e2e8f0;font-size:13px">
  </label>
  <label style="font-size:10px;color:#94a3b8">安値
    <input id="${PATCH_CALC_ID}_low" type="number" placeholder="安値"
      style="width:100%;margin-top:2px;padding:6px;background:#1e293b;border:2px solid #38bdf8;border-radius:6px;color:#e2e8f0;font-size:13px">
  </label>
</div>
<div id="${PATCH_CALC_ID}_result" style="font-size:12px;line-height:1.7;min-height:40px;color:#cbd5e1"></div>
`;

    document.body.appendChild(el);

    // スライドイン
    requestAnimationFrame(() => {
      el.style.transform = "translateY(0)";
    });

    // 閉じるボタン
    document.getElementById(PATCH_CALC_ID + "_close").onclick = () => {
      el.style.transform = "translateY(100%)";
      setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
    };

    // 計算ロジック
    const recalc = () => {
      const cost    = parseInt(document.getElementById(PATCH_CALC_ID + "_cost").value) || 0;
      const high    = parseInt(document.getElementById(PATCH_CALC_ID + "_high").value) || 0;
      const low     = parseInt(document.getElementById(PATCH_CALC_ID + "_low").value) || 0;
      const alertEl = document.getElementById(PATCH_CALC_ID + "_alert");
      const result  = document.getElementById(PATCH_CALC_ID + "_result");

      if (!cost && !high && !low) { result.textContent = ""; alertEl.textContent = ""; return; }

      // 撤退ライン逆算: sell * (1 - 0.10) - shipping = cost => sell = (cost + shipping) / 0.90
      const breakeven = Math.ceil((cost + SHIPPING) / (1 - FEE_RATE));
      alertEl.textContent = cost ? "🚨 撤退ライン: ¥" + breakeven.toLocaleString() : "";

      if (high && low && cost) {
        const profitHigh = Math.floor(high * (1 - FEE_RATE)) - SHIPPING - cost;
        const profitLow  = Math.floor(low  * (1 - FEE_RATE)) - SHIPPING - cost;
        const judge =
          profitHigh > cost * 0.3 ? "✅ 推奨（高ROI）" :
          profitLow  > 0          ? "⚠️ 条件付き" :
                                    "❌ 撤退";
        // 日割り販売計画（高値から安値まで300円ずつ、末尾80円補正）
        const steps = [];
        let p = Math.ceil(high / 1000) * 1000;
        const lowestPrice = Math.max(breakeven, low);
        while (p >= lowestPrice) {
          const adjusted = p % 1000 === 0 ? p - 80 : p;
          steps.push("¥" + adjusted.toLocaleString());
          p -= 300;
          if (steps.length >= 6) break;
        }
        result.innerHTML =
          judge + "　高値益: <b style='color:#4ade80'>¥" + profitHigh.toLocaleString() + "</b>" +
          "　安値益: <b style='color:" + (profitLow >= 0 ? "#4ade80" : "#f87171") + "'>¥" + profitLow.toLocaleString() + "</b><br>" +
          "値下げ計画: " + steps.join(" → ");
      }
    };

    ["_cost","_high","_low"].forEach(id => {
      const input = document.getElementById(PATCH_CALC_ID + id);
      input.addEventListener("input", recalc);

      // 数字吸い上げ待機モード
      input.addEventListener("focus", () => {
        input.style.boxShadow = "0 0 0 2px #f59e0b";
        if (!window.__patchPriceCapture__) {
          window.__patchPriceCapture__ = (e) => {
            // ⚠️ e.preventDefault()は絶対に呼ばない
            const el2 = e.target;
            if (!el2 || el2.closest("#" + PATCH_CALC_ID)) return;
            const text = el2.textContent || "";
            const m = text.replace(/[,，\s]/g, "").match(/[¥￥]?(\d{3,6})/);
            if (m) {
              const focused = document.activeElement;
              if (focused && focused.closest && focused.closest("#" + PATCH_CALC_ID)) {
                focused.value = m[1];
                focused.dispatchEvent(new Event("input"));
                // グロー解除
                focused.style.boxShadow = "";
                document.removeEventListener("mousedown", window.__patchPriceCapture__);
                delete window.__patchPriceCapture__;
              }
            }
          };
          document.addEventListener("mousedown", window.__patchPriceCapture__);
        }
      });
      input.addEventListener("blur", () => {
        input.style.boxShadow = "";
      });
    });
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
})();
