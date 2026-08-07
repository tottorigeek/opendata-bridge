# OpenData Bridge

**官民共存型オープンデータ管理システム** — 行政と民間が双方向にデータを持ち寄り、
住所などの表記ゆれを自動で名寄せ・マージして、公開カタログと REST API で利活用するための基盤です。

既存の CKAN / Socrata / OpenDataSoft などが「行政が一方向に公開する」モデルであるのに対し、
OpenData Bridge は **官民双方向の持ち寄り + 表記ゆれ正規化つきマージエンジン** を差別化の核としています。

---

## 主な機能

| 機能 | 概要 |
| --- | --- |
| 組織・認証 | 組織(行政 / 民間)単位のアカウント。セッションは署名付き JWT(HttpOnly Cookie)。 |
| データセット管理 | CSV アップロード、メタデータ(タイトル・説明・ライセンス・タグ・更新頻度・公開範囲)管理。 |
| 承認フロー | `下書き → 承認待ち → 公開 / 差し戻し`。公開は組織の ADMIN のみ承認可能。 |
| 公開カタログ | 公開データセットをキーワード・組織種別・タグで横断検索。CSV ダウンロード対応。 |
| **マージエンジン** | 2 つのデータセットをキー列 + 正規化レベルで名寄せ結合(inner / left / full)。住所・カナ・電話・日付などの表記ゆれを吸収。マッチ率・アンマッチ例を提示し、結果を新データセットとして保存。 |
| REST API v1 | API キー(Bearer)認証で公開データセットの一覧・メタデータ・本体(JSON / CSV)を取得。呼び出し量を自動計測。 |

### 画面構成

- `/` — ランディングページ
- `/catalog` — 公開データカタログ(検索・フィルタ) / `/catalog/[id]` — データセット詳細・ダウンロード
- `/signup` `/login` — 組織登録 / ログイン
- `/dashboard` — ダッシュボード
  - `/dashboard/datasets` — 自組織のデータセット一覧 / `new`・`[id]`・`[id]/edit`
  - `/dashboard/merge` — マージウィザード
  - `/dashboard/api-keys` — API キー発行・失効・利用量
  - `/dashboard/settings` — 組織設定

---

## 技術スタック

- **Next.js 16**(App Router)/ **TypeScript** / **Tailwind CSS v4**
- **Prisma 6** + **PostgreSQL**(本番は **Supabase Postgres**。プーラー経由の `DATABASE_URL` と直接続の `DIRECT_URL` を使用)
- ファイルストレージ: ローカル(`storage/datasets/`)/ **Supabase Storage**(非公開バケット)を環境変数で自動切替(`lib/storage.ts`)
- 認証: `jose`(JWT)+ `bcryptjs`
- CSV: `csv-parse` / `csv-stringify`
- デプロイ: **Vercel**(GitHub 連携)

---

## セットアップ(ローカル開発)

前提:
- Node.js 20 以上(型ストリップでシードを実行するため 22 以上を推奨)
- **PostgreSQL への接続**。[Supabase](https://supabase.com/) の無料プロジェクト(推奨)、ローカル PostgreSQL のいずれかの接続文字列を使います(Docker 不要)。

```bash
# 1. 取得
git clone <this-repo>
cd opendata-manage-system

# 2. 依存インストール(postinstall で prisma generate が走ります)
npm ci

# 3. 環境変数を用意
cp .env.example .env
#   .env を編集し、以下を設定してください。
#     - DATABASE_URL: PostgreSQL の接続文字列(Supabase のプーラー 6543 + ?pgbouncer=true、
#                     またはローカル PostgreSQL)
#     - DIRECT_URL:   マイグレーション用の直接続(Supabase の 5432。ローカル PostgreSQL の
#                     場合は DATABASE_URL と同じ値でも可)
#     - SESSION_SECRET: 十分長いランダム値(例: openssl rand -base64 32)
#   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は未設定でOK
#   (未設定時は CSV をローカルの storage/datasets/ に保存)

# 4. DB マイグレーション(PostgreSQL に接続してテーブル作成)
npx prisma migrate deploy      # prisma/migrations の初期マイグレーションを適用
#   （スキーマを変更して作り直す場合は: npx prisma migrate dev）

# 5. シードデータ投入(組織2・ユーザー2・公開データセット4件)
npx prisma db seed

# 6. 開発サーバー
npm run dev                    # http://localhost:3000
```

> ストレージについて: `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が両方設定されていれば
> CSV は Supabase Storage(非公開バケット)へ、未設定ならローカルの `storage/datasets/` へ
> 保存されます。どちらを使うかは `lib/storage.ts` が環境変数だけで自動判定します。

### デモアカウント

シード投入後、以下のアカウントでログインできます(パスワードは共通で `demo1234`)。

| メールアドレス | 組織 | 種別 | 権限 |
| --- | --- | --- | --- |
| `gov-admin@example.com` | 鳥取県庁 | 行政 | ADMIN |
| `private-admin@example.com` | 山陰データラボ株式会社 | 民間 | ADMIN |

投入される公開データセット(すべて PUBLISHED / 一般公開):

1. **鳥取県 避難所一覧**(20 行、住所は「一丁目2番3号」形式)
2. **鳥取県 観光施設一覧**(15 行)
3. **山陰データラボ 店舗ポイントデータ**(14 行、住所は「1-2-3」形式)
4. **山陰データラボ 人流データサンプル**(20 行)

> 1 と 3 は住所が一部同一地点を指しており、マージウィザードで
> キー列「住所」/ 正規化レベル「住所 (address)」で結合すると
> 表記ゆれを吸収して **約 40% のマッチ率** で名寄せできます(マージ機能のデモ)。

シードは冪等です。`npx prisma db seed` を何度実行しても、既存の組織・ユーザー・
データセットと CSV を作り直し、常に上記 4 件の状態になります。
元 CSV は `prisma/seed-data/` にコミットされており、実行時に `lib/storage.ts` 経由で
保存されます(ローカルは `storage/datasets/`、Supabase 設定時は Supabase Storage の非公開バケット)。

---

## REST API

API キーは `/dashboard/api-keys` で発行します。認証は Bearer 方式です。

```bash
curl -H "Authorization: Bearer odb_あなたのキー" \
  "http://localhost:3000/api/v1/datasets?q=避難所&org_type=GOVERNMENT"
```

エンドポイント・認可・エラー形式の詳細は **[docs/api.md](docs/api.md)** を参照してください。

---

## Vercel へのデプロイ

DB は **Supabase Postgres**、CSV ファイルは **Supabase Storage(非公開バケット)** を使います。
ホスティングは **Vercel** です。Vercel の **Marketplace Integration(Supabase)** で接続すると、
DB 接続用の環境変数が **自動注入** され、手動で設定するのは `SESSION_SECRET` だけで済みます。

> 従来どおり `DATABASE_URL` / `DIRECT_URL` などを手動設定する方法も引き続き使えます
> (「B. 手動で環境変数を設定する場合」を参照)。アプリは注入変数・手動変数のどちらでも動くよう
> `lib/db-env.ts` で接続 URL を解決します。

### 1. Vercel でプロジェクトを Import

Vercel ダッシュボードで **Add New… → Project** を開き、GitHub の
`tottorigeek/opendata-bridge` を **Import** します(Framework は Next.js が自動検出)。

### 2. Supabase を Marketplace Integration で接続

プロジェクトの **Storage**(または **Integrations**)タブ → **Marketplace** から **Supabase** を選び、
**新規 Supabase プロジェクトを作成**(リージョンは **Tokyo** 推奨)、または既存プロジェクトを接続します。
接続すると、以下の環境変数が Production / Preview に自動注入されます
(出典: [Supabase 公式ドキュメント](https://supabase.com/docs/guides/integrations/vercel-marketplace)):

- `POSTGRES_PRISMA_URL` … プーラー(Prisma 用)接続文字列 → 本アプリの通常クエリ用 `DATABASE_URL` として利用
- `POSTGRES_URL_NON_POOLING` … 直接続 → マイグレーション用 `DIRECT_URL` として利用
- `POSTGRES_URL` / `SUPABASE_URL` / `SUPABASE_JWT_SECRET` ほか

> **SQL を手で流す必要はありません。** テーブルはデプロイ時のビルドコマンドが
> `prisma/migrations` の初期マイグレーションから自動作成します。
>
> Marketplace 版のプーラー URL には `pgbouncer=true` が付かない
> [既知の問題](https://github.com/supabase/supabase/issues/27328)がありますが、
> 本アプリはプーラー URL(ポート 6543 / `pooler.supabase.com`)を検出して自動付与するため
> 追加設定は不要です。

### 3. Storage で非公開バケットを作成

Supabase ダッシュボード → **Storage** → **New bucket** で、名前 `datasets` のバケットを作成します。
**Public バケットにはしない**(非公開のまま)でください。CSV は必ずアプリのルート経由で配信します。
別名にする場合は、環境変数 `SUPABASE_STORAGE_BUCKET` にその名前を設定します。

> **Storage を使うには `SUPABASE_SERVICE_ROLE_KEY` が必要です。** Marketplace Integration は
> service_role キーを **この名前では注入しません**(公式には `SUPABASE_SECRET_KEY` 等を注入)。
> CSV を Supabase Storage に保存する場合は、Supabase の **Project Settings → API** の
> **service_role** キーを、Vercel の環境変数に **`SUPABASE_SERVICE_ROLE_KEY`** という名前で
> 手動追加してください(未設定ならローカル `storage/datasets/` 動作にフォールバックします)。

### 4. `SESSION_SECRET` を手動追加

Vercel の **Settings → Environment Variables**(Production / Preview 両方)に、
`SESSION_SECRET` を追加します(値は `openssl rand -base64 32` で生成)。
Integration を使う場合、手動追加が必須なのは基本これだけです
(Storage を使うなら上記 `SUPABASE_SERVICE_ROLE_KEY` も)。

### 5. デプロイ

**Deploy** を実行します。ビルドコマンド(`package.json` の `build` =
`node scripts/migrate-deploy.mjs && next build`)が、注入変数・手動変数のどちらからでも
接続 URL を解決し、ビルド時に `prisma/migrations` の初期マイグレーションを
直接続(`DIRECT_URL` / `POSTGRES_URL_NON_POOLING`)経由で適用します(`vercel.json` は不要)。
以降は GitHub への push で自動再デプロイされます。

### 6. 初期データ(シード)の投入

シードは Vercel 上では自動実行されません。**本番の環境変数をローカルに取得**して一度だけ実行します。
[Vercel CLI](https://vercel.com/docs/cli) の `vercel env pull` を使うと、Integration が注入した変数も
まとめて取得できます。

```bash
vercel link                      # 対象プロジェクトに紐付け(初回のみ)
vercel env pull .env.production  # 注入変数を含む環境変数を取得
# Storage にもシード CSV を入れる場合は、上記で service role キーが取得できていなければ
# .env.production に SUPABASE_SERVICE_ROLE_KEY を追記しておく
set -a; . ./.env.production; set +a
npx prisma db seed               # scripts/seed.mjs 経由で接続 URL を解決して実行
```

> `SUPABASE_URL`(または `NEXT_PUBLIC_SUPABASE_URL`)と `SUPABASE_SERVICE_ROLE_KEY` が
> 揃っているとシードの CSV も Supabase Storage の非公開バケットに保存されます。揃っていないと
> DB だけが投入され CSV 本文が Storage に入らない(=ダウンロードできない)ため注意してください。

### B. 手動で環境変数を設定する場合(Integration を使わない)

Integration を使わず、`Settings → Environment Variables`(Production / Preview 両方)に自分で設定する
従来の方法も使えます。この場合は次を設定します(Storage を使わないなら下 2 つは省略可)。

| 変数 | 取得場所 |
| --- | --- |
| `DATABASE_URL` | Supabase の **Connect**(画面上部)→ ORMs / Prisma の Transaction pooler(ポート **6543**)。末尾に **`?pgbouncer=true`** を付ける。 |
| `DIRECT_URL` | Supabase の **Connect** → **Session pooler**(`pooler.supabase.com` のポート **5432**)。※ Direct connection(`db.<ref>.supabase.co`)は **IPv6 専用**のため、Vercel のビルド環境からは到達できません。 |
| `SESSION_SECRET` | 手元で生成: `openssl rand -base64 32`。 |
| `SUPABASE_URL` | **Project Settings → API** の **Project URL**(`https://<project-ref>.supabase.co`)。Storage 利用時のみ。 |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API** の **service_role** キー(サーバー専用シークレット)。Storage 利用時のみ。 |

### 既存の Supabase プロジェクトと共存させる場合(専用スキーマ)

既にほかのアプリが使っている Supabase プロジェクトに相乗りする場合、`public` スキーマが空でないため
`prisma migrate deploy` が **P3005(The database schema is not empty)** で失敗します。
その場合は本アプリ専用の PostgreSQL スキーマに分離します(テーブル名の衝突も完全に回避できます)。

1. Supabase の **SQL Editor** で実行: `CREATE SCHEMA IF NOT EXISTS opendata;`
2. 接続 URL の末尾にスキーマ指定を追加:
   - `DATABASE_URL` … `...?pgbouncer=true&schema=opendata`
   - `DIRECT_URL` … `...?schema=opendata`
3. Redeploy

テーブル(`_prisma_migrations` 含む)はすべて `opendata` スキーマ内に作成され、`public` には触れません。
Supabase のテーブルエディタではスキーマ切替で `opendata` を選ぶと確認できます。

### セキュリティ対策

| 対策 | 内容 |
| --- | --- |
| API キー | DB には **SHA-256 ハッシュのみ**保存(`ApiKey.keyHash`)。全文は発行時レスポンスでしか返さず以降は復元不可。一覧表示は `keyPrefix`(先頭 8 文字)から組み立てる。 |
| セッション失効 | JWT に `jti` を持たせ `Session` テーブルで台帳管理。ログアウトで `revokedAt` を立てるため、トークンが漏れても即座に無効化できる(`revokeAllUserSessions()` で全端末失効)。 |
| レート制限 | `RateLimit` テーブルによる固定ウィンドウ方式(サーバーレスではインスタンス間でメモリを共有できないため DB を集計点にする)。ログイン 10回/5分(+ IP 30回/5分)、サインアップ 5回/時、公開 API 600回/分、マージ実行 20回/5分。 |
| ユーザー列挙対策 | ログイン失敗時、ユーザー不在でもダミーハッシュに対して bcrypt を実行し、応答時間の差から登録有無が漏れないようにする。 |
| CSV インジェクション | ダウンロード・API の CSV 出力で、`=` `+` `-` `@` 等で始まるセルにシングルクォートを前置(`-1.5` のような数値は除外)。他組織が Excel で開く前提のため必須。 |
| マージの DoS 対策 | 入力 20 万行 / 出力 50 万行の上限。多対多結合による行数爆発を結合ループ内で検知して `413` を返す。 |
| 組織種別の詐称対策 | 種別は登録時の自己申告のため、`Organization.verified` が `false` の間はカタログで「行政(未確認)」と中立表示する。 |
| セキュリティヘッダ | `next.config.ts` で CSP / `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy` / `Permissions-Policy` / HSTS(本番のみ)を全レスポンスに付与。`X-Powered-By` は無効化。 |

> **組織に verified を付与する方法**: 現状は管理 UI が無いため、Supabase の SQL Editor で
> `UPDATE "Organization" SET "verified" = true WHERE id = '<組織ID>';` を実行します。
> 公式ドメインのメールや公文書などで実在を確認してから付与してください。

> **マイグレーションの注意**: `0002_security_hardening` は既存の平文 API キーを
> PostgreSQL の `sha256()` でその場ハッシュ化するため、**発行済みキーは失効しません**。
> `sha256()` は PostgreSQL 11 以降が必要です(Supabase は対応済み)。

### セキュリティ / ストレージの補足

- **CSV の配信は必ずアプリのルート経由**です。バケットは **非公開(private)** で運用し、
  `lib/storage.ts` が **service_role** キーで認証したサーバー SDK 経由でのみ本文を読み書きします。
  公開 URL・署名 URL は使いません。ダウンロードは `/api/datasets/[id]/download` が
  組織 / 公開設定に応じて認可した上で本文をストリーム配信します。
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー専用シークレットです。クライアント側コードや
  `NEXT_PUBLIC_*` 変数には絶対に置かないでください。
- `SESSION_SECRET` は既定値のまま運用しないでください(Cookie 署名鍵)。
- Vercel は HTTPS・`NODE_ENV=production` で配信されるため、セッション Cookie の `secure` 属性が有効になります。

---

## ライセンス

**GNU Affero General Public License v3.0(AGPL-3.0)** で公開しています。全文は [LICENSE](LICENSE) を参照してください。

- セルフホスト・改変・再配布は AGPL-3.0 の条件の下で自由です。
- 改変版をネットワークサービスとして提供する場合、利用者に対して改変後のソースコードを提供する義務があります(AGPL §13)。
- 「OpenData Bridge」の名称およびロゴの使用(サービス名・製品名としての利用)は別途許諾が必要です。フォークして運用する場合は別の名称を使用してください。

脆弱性の報告は [SECURITY.md](SECURITY.md)、コントリビューションについては [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
