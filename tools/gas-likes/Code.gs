// 国東界隈「いいね」カウンター (Google Apps Script)
//
// セットアップ手順:
// 1. Google Drive で新規スプレッドシートを作成（名前例: kunisakikaiwai-likes）
// 2. メニュー「拡張機能」→「Apps Script」を開く
// 3. このファイルの内容を Code.gs に貼り付けて保存
// 4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
//    - 実行ユーザー: 自分
//    - アクセスできるユーザー: 全員
// 5. 発行された「ウェブアプリのURL」(https://script.google.com/macros/s/…/exec) を
//    StoryFeedback.astro の LIKES_ENDPOINT に設定する
//
// API:
//   GET ?page=<ページ名>              → {"page":"…","count":N}
//   GET ?page=<ページ名>&action=like  → +1 して {"page":"…","count":N+1}

const SHEET_NAME = 'likes';

function doGet(e) {
  const page = String((e.parameter.page || '')).slice(0, 200);
  const action = e.parameter.action || 'get';
  if (!page) return json_({ error: 'no page' });

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = getSheet_();
    const row = findRow_(sheet, page);
    let count = row ? Number(sheet.getRange(row, 2).getValue()) : 0;
    if (action === 'like') {
      count += 1;
      if (row) {
        sheet.getRange(row, 2).setValue(count);
        sheet.getRange(row, 3).setValue(new Date());
      } else {
        sheet.appendRow([page, count, new Date()]);
      }
    }
    return json_({ page: page, count: count });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['page', 'count', 'updated']);
  }
  return sh;
}

function findRow_(sheet, page) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const vals = sheet.getRange(1, 1, last, 1).getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === page) return i + 1;
  }
  return null;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
