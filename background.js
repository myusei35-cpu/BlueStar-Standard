// ===== STABLE =====
// タブIDを返す＆Google検索タブを開く
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_ID") {
    sendResponse({ tabId: sender.tab ? sender.tab.id : 0 });
  }
  if (msg.type === "OPEN_TAB_BACKGROUND") {
    chrome.tabs.create({ url: msg.url, active: false });
    sendResponse({ ok: true });
  }
  if (msg.type === "OPEN_SERIES_SEARCH") {
    const tabId = sender.tab ? sender.tab.id : 0;
    const query = encodeURIComponent(msg.modelCode + " 腕時計 シリーズ");
    const url = `https://www.google.com/search?q=${query}&__sniper_series__=1&__sniper_origin_tab__=${tabId}`;
    chrome.tabs.create({ url, active: false });
  }
  return true;
});

// アイコンタップ時（仕入れ4サイト用）
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["list_extractor.js"]
    });
  } catch (e) {
    console.error("list_extractor 実行エラー:", e);
  }
});

// SPA遷移検知：メルカリ商品ページに遷移したら自動実行
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url) return;
  if (!tab.url.match(
    /https:\/\/jp\.mercari\.com\/item\/|https:\/\/jp\.mercari\.com\/shops\/product\/|https:\/\/mercari-shops\.com\/(.*\/)?products\//
  )) return;

  chrome.scripting.executeScript({
    target: { tabId },
    files: ["list_extractor.js"]
  }).catch(() => {});
});

// Google検索結果ページでシリーズ名を抽出して元タブに返す
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url) return;
  if (!tab.url.includes("google.com/search") || !tab.url.includes("__sniper_series__")) return;

  setTimeout(() => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const SERIES_KEYWORDS = [
          "GRAND SEIKO","グランドセイコー","KING SEIKO","キングセイコー",
          "PROSPEX","プロスペックス","PRESAGE","プレザージュ",
          "BRIGHTZ","ブライツ","ASTRON","アストロン",
          "LUKIA","ルキア","SEIKO 5 SPORT","セイコー5スポーツ",
          "OCEANUS","オシアナス","MR-G","MT-G",
          "FROGMAN","フロッグマン","MUDMASTER","マッドマスター",
          "G-STEEL","PRO TREK","プロトレック",
          "THE CITIZEN","CAMPANOLA","カンパノラ",
          "ATTESA","アテッサ","PROMASTER","プロマスター",
          "EXCEED","エクシード"
        ];
        const html = document.body.innerText;
        let found = "";
        for (const kw of SERIES_KEYWORDS) {
          if (html.includes(kw)) { found = kw; break; }
        }
        return found;
      }
    }).then(results => {
      const found = results?.[0]?.result || "";
      const url = new URL(tab.url);
      const originTabId = parseInt(url.searchParams.get("__sniper_origin_tab__") || "0");
      if (!originTabId) return;
      chrome.tabs.sendMessage(originTabId, {
        type: "SERIES_RESULT",
        series: found,
        tabId
      });
      setTimeout(() => chrome.tabs.remove(tabId), 3000);
    }).catch(() => {});
  }, 2000);
});
// ===== /STABLE =====

// ===== STABLE =====
// PATCH: 型番・価格抽出 タブ制御
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'FETCH_ITEM_DETAIL') return false;

  chrome.tabs.create({ url: msg.url, active: false }, (tab) => {
    const tabId = tab.id;
    const wait = 5000 + Math.floor(Math.random() * 1000);

    setTimeout(() => {
      let responded = false;
      const tryFetch = (retryCount) => {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const price = (() => {
              const el =
                document.querySelector('[data-testid="price"]') ||
                document.querySelector('.number__6b270') ||
                document.querySelector('span[class*="number"]');
              return el ? el.textContent.replace(/[^0-9]/g, '') : null;
            })();
            const description = (() => {
              const el = [...document.querySelectorAll('section')]
                .find(s => s.innerText.startsWith('商品の説明'));
              return el ? el.innerText : null;
            })();
            const title = document.title || '';
            return { price, description, title };
          }
        }).then(results => {
          if (responded) return;
          const data = results?.[0]?.result || {};
          if (!data.description && retryCount < 5) {
            setTimeout(() => tryFetch(retryCount + 1), 1500);
            return;
          }
          responded = true;
          sendResponse(data);
          setTimeout(() => chrome.tabs.remove(tabId), 800 + Math.floor(Math.random() * 400));
        }).catch(() => {
          if (responded) return;
          if (retryCount < 5) {
            setTimeout(() => tryFetch(retryCount + 1), 1500);
            return;
          }
          responded = true;
          sendResponse({ price: null, description: '', title: '' });
          chrome.tabs.remove(tabId);
        });
      };
      tryFetch(0);
    }, wait);
  });

  return true;
});
// ===== /STABLE =====
