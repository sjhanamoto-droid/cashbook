/* ============================================================
   _native-src.js — Capacitorプラグインのソース（ESM）
   esbuild でバンドルして www/js/capacitor-plugins.js を生成する。
     npm run build:native
   生成物(capacitor-plugins.js)は www/ に含めてあるので、
   通常はビルド不要。プラグインを足したときだけ再ビルドする。
   ============================================================ */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

window.CapPlugins = { Filesystem, Directory, Encoding, Share, StatusBar, Style };
