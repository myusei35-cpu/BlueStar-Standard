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
