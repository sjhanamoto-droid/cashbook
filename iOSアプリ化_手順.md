# iOSアプリ化・登録ガイド

このフォルダは、Webアプリ（`www/`）を **Capacitor** で本物のiOSアプリに包んだものです。
Xcodeで開いて、自分のiPhoneにインストール → TestFlight → App Store公開、と段階的に進められます。

- アプリ名（ホーム画面表示）：**現金経費管理**
- Bundle ID（アプリの識別子）：**jp.sjdesign.cashbook**
- 対応OS：**iOS 15.0 以上（iPhone専用・縦向き固定）**
- バージョン：1.0

> **データ保管について（重要）**：記録・領収書写真はすべて **このアプリの中（端末内）だけ** に保存され、外部送信されません。
> そのため、**アプリを削除したり、iOSが容量逼迫で領域を回収したりすると消える**可能性があります。
> 大切な記録は、アプリの「設定 ⚙ → バックアップを保存」で **ときどき書き出して**おいてください（iCloud等への自動バックアップはありません）。

---

## 0. 必要なもの

| | 内容 |
|--|--|
| Mac | このプロジェクトがあるMac（Xcode 26 インストール済みを確認済み） |
| Xcode | App Store から無料。インストール済み |
| Apple ID | 普段のApple IDでOK（無料でも自分のiPhoneに入れられる） |
| Apple Developer Program（任意・有料 年¥12,800） | TestFlight配布・App Store公開に**必須**。自分のiPhoneに入れるだけなら不要 |

> 開発ツール（Node / CocoaPods不要 / Capacitor）はセットアップ済みです。

---

## 1. 自分のiPhoneにインストールする（まずここがゴール）

### 手順

1. ターミナルでこのフォルダを開き、Xcodeプロジェクトを開く：
   ```
   cd 現金経費管理アプリ
   npx cap open ios
   ```
   （Xcodeが起動して `App` プロジェクトが開きます）

2. Xcode左の **App** → **Signing & Capabilities** タブを開く
   - **Team**：自分のApple ID（チーム）を選ぶ
     - 初めてなら「Add an Account…」から自分のApple IDでサインイン
   - **Bundle Identifier**：`jp.sjdesign.cashbook` のまま
     - もし「使用できない」と出たら、末尾を自分用に変える（例：`jp.sjdesign.cashbook2`）
   - 「Automatically manage signing」に**チェック**

3. iPhoneをUSBでMacに接続
   - iPhone側で「このコンピュータを信頼」を許可
   - Xcode上部のデバイス選択（実行先）で、自分の **iPhone** を選ぶ

4. 左上の **▶︎（Run）** を押す
   - 初回はiPhone側で開発元の信頼が必要：
     iPhoneの **設定 → 一般 → VPNとデバイス管理** →
     自分のApple IDを **信頼**
   - もう一度 ▶︎ を押すと、ホーム画面にアプリが入ります

### 無料Apple IDの場合の注意
- 無料アカウントで入れたアプリは **7日で期限切れ**になり、再度 ▶︎ で入れ直しが必要です。
- 毎日使う業務アプリなので、続けるなら次の **Apple Developer Program（有料）** がおすすめ。
  有料なら署名が **1年間有効** になり、TestFlight / App Store にも進めます。

---

## 2. TestFlight で配る（有料Developer Program必要）

身内・関係者に配りたい場合に便利。審査は軽め、1ビルド90日有効。
※ **第1章のTeam署名設定が済んでいること**が前提です（未設定だと Archive が押せません）。

1. [Apple Developer Program](https://developer.apple.com/programs/) に登録（年¥12,800）

2. **先にBundle IDを登録**する（アプリ作成より前）
   [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list) →
   Certificates, Identifiers & Profiles → **Identifiers** → ＋ →
   App IDs → App → Bundle ID に `jp.sjdesign.cashbook` を登録

3. [App Store Connect](https://appstoreconnect.apple.com/) で新規アプリを作成
   - プラットフォーム：iOS／名前：現金経費管理
   - Bundle ID：先ほど登録した `jp.sjdesign.cashbook` を選択
   - SKU：任意（例：cashbook-001）

4. Xcodeでアーカイブを作成
   - 上部の実行先を **「Any iOS Device」**（実機を繋いでいない状態で選べる）に変更
   - メニュー **Product → Archive**
   - 完了後 **Organizer** が開く → **Distribute App → App Store Connect → Upload**

5. アップロード時に **輸出コンプライアンス**を聞かれたら「**いいえ / No**（非適用の暗号化のみ）」を選ぶ
   - 本アプリは独自の暗号化を実装していないため。
   - ※ あらかじめ `Info.plist` に `ITSAppUsesNonExemptEncryption = NO` を設定済みなので、
     通常はこの質問自体が出ません（出た場合は No）。

6. App Store Connect の **TestFlight** タブで、テスターを招待（メール/リンク）。
   テスターは **TestFlight アプリ**（無料）からインストール。

---

## 3. App Store で公開する（有料Developer Program ＋ 審査）

一般公開する場合。手順は2とほぼ同じで、最後に審査提出が入ります。

1. App Store Connect の対象アプリ → **「Appの情報」「価格」「Appのプライバシー」** を入力
   - **Appのプライバシー**：このアプリはデータを端末内にのみ保存し、外部送信・トラッキングをしません
     → 「**データを収集しません（Data Not Collected）**」を選択
   - **スクリーンショット（必須）**：**6.7インチ または 6.9インチ iPhone**（例：iPhone 15 Pro Max / 16 Pro Max）の縦向き画像が最低1枚必要。
     シミュレータ（`Cmd+S`）でも撮影可。
   - 説明文・サポートURL・**カテゴリ：ファイナンス**
2. Xcodeで **Product → Archive → Distribute App → App Store Connect → Upload**
3. App Store Connect でビルドを選び、**「審査へ提出」**
4. 審査通過後に公開

> 単独利用（シゲさん本人のみ）であれば、無理に公開せず **1（自分のiPhone）** か **2（TestFlight）** で十分です。
> なお本アプリは **iPhone専用**（iPad非対応）で登録されます。

---

## 4. アプリを更新したいとき

`www/` の中（画面・ロジック）を直したら、必ず同期してからビルドします。

```
cd 現金経費管理アプリ
npx cap sync ios      # www/ の変更をiOSアプリへ反映
npx cap open ios      # Xcodeで開いて Run / Archive
```

バージョンを上げて再提出する場合は、Xcodeの **General → Version / Build** を増やします
（例：Version 1.0 → 1.1、Build 1 → 2）。

---

## 5. アイコン・起動画面を変えたいとき

1. `resources/icon.png`（1024×1024・余白なし・透過なし）と
   `resources/splash.png`（2732×2732）を差し替え
2. 次のどちらかで反映：
   - 付属の生成（PIL）を使う場合：`python3` で `resources/` を作り直し、
     `ios/App/App/Assets.xcassets/` の各PNGへコピー
   - もしくは公式ツール：`npm i -D @capacitor/assets && npx capacitor-assets generate --ios`
     （※ ネットワーク環境によっては sharp の取得に失敗します。その場合は手動コピーで対応）

---

## 6. トラブルシューティング

| 症状 | 対処 |
|--|--|
| 署名エラー（Signing for "App" requires a development team） | Signing & Capabilities で **Team** を選ぶ |
| Bundle IDが使えない | 末尾を変えて一意にする（例：`...cashbook2`） |
| 写真ボタンで落ちる | Info.plist にカメラ/写真の説明文を設定済み。手を加えていなければ問題なし |
| ビルドが古いまま | `npx cap sync ios` を実行してから再ビルド |
| 実機で「信頼されていないデベロッパ」 | 設定 → 一般 → VPNとデバイス管理 で信頼 |

---

## 補足：Webアプリ版も同じソースから使えます

`www/` フォルダはそのままWebサイト（PWA）としても公開できます。
iOSアプリ版とWeb版は **同じ `www/` を共有**しているので、二重管理は不要です。
（Web版の使い方は `README.md` を参照）
