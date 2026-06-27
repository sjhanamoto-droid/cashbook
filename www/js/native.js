/* ============================================================
   native.js — iOS(Capacitor)ネイティブ用の橋渡し
   ・WKWebView では <a download> / window.open が効かないため、
     ファイル書き出しは Filesystem + Share（共有シート）で行う。
   ・プラグインは capacitor-plugins.js（esbuildバンドル）が
     window.CapPlugins として公開する。
   ・Web ブラウザで開いたときは何もしない（app.js が従来の
     ダウンロード処理にフォールバックする）。
   ============================================================ */
window.CashbookNative = (function () {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const P = window.CapPlugins || {};

  /* 文字列の中身をファイル化して共有シートを開く */
  async function deliverFile(filename, content, mimeType) {
    const { Filesystem, Directory, Encoding, Share } = P;
    if (!Filesystem || !Share) throw new Error('native plugins unavailable');
    const written = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const uri = (written && written.uri) ? written.uri : undefined;
    if (!uri) throw new Error('write failed');
    // iOSで生成ファイルを共有する正攻法は url ではなく files:[uri]
    await Share.share({ title: filename, files: [uri] });
  }

  /* 明るい背景に合わせ、ステータスバーを黒文字に固定（ダークモードでも読める） */
  async function initNativeUI() {
    const { StatusBar, Style } = P;
    if (StatusBar && Style) {
      try { await StatusBar.setStyle({ style: Style.Light }); } catch (e) { /* noop */ }
    }
  }

  if (isNative) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initNativeUI);
    } else {
      initNativeUI();
    }
  }

  return { isNative, deliverFile };
})();
