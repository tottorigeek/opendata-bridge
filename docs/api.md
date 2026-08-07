# OpenData Bridge 公開 REST API

官民のオープンデータを取得するための公開 REST API です。ダッシュボードの
「APIキー」画面で発行した API キーで認証します。

- ベース URL: `<デプロイ先オリジン>/api/v1`(開発時は `http://localhost:3000/api/v1`)
- レスポンスは原則 JSON(データ本体は `format=csv` で CSV も可)
- 認証は Bearer トークン方式

## 認証

すべてのエンドポイントで、`Authorization` ヘッダに API キーを付与します。

```
Authorization: Bearer odb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- API キーはダッシュボード `/dashboard/api-keys` で発行します。
- 発行直後のみ全文が表示されます。以降は先頭のみ表示され、全文は再表示できません。
  サーバー側は **SHA-256 ハッシュのみを保存**しており、平文は保持していないため、
  紛失した場合は再発行が必要です(運営側でも復元できません)。
- キーは失効(revoke)できます。失効後のキーでのアクセスは `401` になります。
- 呼び出しごとに、そのキーの呼び出し回数(callCount)が加算されます。

### レート制限

API キー単位で **60 秒あたり 600 リクエスト**までです。超過すると `429` を返し、
`Retry-After` ヘッダに次に試行できるまでの秒数が入ります。

### アクセスできるデータの範囲(認可)

キー保有者は以下のデータセットにアクセスできます。

1. **公開データ**: `status = PUBLISHED` かつ `visibility = PUBLIC`(全組織)
2. **自組織データ**: キー保有者が所属する組織のデータセット(`ORG_ONLY` / `PRIVATE` を含む全件)

上記に該当しないデータセット(他組織の非公開データなど)は、存在しても `404` を返します。

## エラー形式

エラーはすべて次の JSON 形式で統一されています。

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "API キーが無効か、失効しています。"
  }
}
```

| ステータス | code                | 説明                                       |
| ---------- | ------------------- | ------------------------------------------ |
| 401        | `unauthorized`      | Authorization ヘッダが無い / 形式が不正     |
| 401        | `invalid_api_key`   | キーが存在しない、または失効している        |
| 404        | `not_found`         | データセットが無い、またはアクセス権が無い  |
| 404        | `data_not_available`| データ本体(CSV)が未登録                   |
| 400        | `invalid_format`    | `format` が `json` / `csv` 以外            |
| 429        | `rate_limited`      | レート制限超過(`Retry-After` を参照)      |

> `format=csv` で取得した CSV は、表計算ソフトでの数式実行(CSV インジェクション)を
> 防ぐため、`=` `+` `-` `@` で始まるセルの先頭にシングルクォートを付与しています
> (`-1.5` のような数値はそのままです)。

---

## エンドポイント

### GET /api/v1/datasets

アクセス可能なデータセットの一覧を返します。

**クエリパラメータ**

| 名前       | 型     | 既定 | 説明                                         |
| ---------- | ------ | ---- | -------------------------------------------- |
| `q`        | string | -    | タイトル・説明の部分一致検索                 |
| `tag`      | string | -    | タグの部分一致(カンマ区切りタグに対して)   |
| `org_type` | string | -    | 組織種別で絞り込み(`GOVERNMENT` / `PRIVATE`)|
| `limit`    | number | 50   | 取得件数(最大 200)                         |
| `offset`   | number | 0    | 取得開始位置                                 |

**レスポンス例**

```json
{
  "data": [
    {
      "id": "clxxxx",
      "title": "町丁別人口",
      "description": "住民基本台帳に基づく町丁別人口",
      "license": "CC-BY-4.0",
      "tags": ["人口", "統計"],
      "rowCount": 1200,
      "columns": ["町丁名", "人口", "世帯数"],
      "visibility": "PUBLIC",
      "status": "PUBLISHED",
      "updateFrequency": "年次",
      "sourceType": "UPLOADED",
      "organization": { "name": "サンプル市", "type": "GOVERNMENT" },
      "createdAt": "2026-07-08T00:00:00.000Z",
      "updatedAt": "2026-07-08T00:00:00.000Z"
    }
  ],
  "pagination": { "total": 1, "limit": 50, "offset": 0, "count": 1 }
}
```

```bash
curl -H "Authorization: Bearer odb_あなたのキー" \
  "http://localhost:3000/api/v1/datasets?q=人口&org_type=GOVERNMENT&limit=20"
```

### GET /api/v1/datasets/{id}

データセットのメタデータ詳細を返します。フィールドは一覧の各要素と同じです。

```json
{ "data": { "id": "clxxxx", "title": "町丁別人口", "...": "..." } }
```

```bash
curl -H "Authorization: Bearer odb_あなたのキー" \
  "http://localhost:3000/api/v1/datasets/clxxxx"
```

アクセス権が無い / 存在しない場合は `404`(`not_found`)。

### GET /api/v1/datasets/{id}/data

データ本体を返します。

**クエリパラメータ**

| 名前     | 型     | 既定   | 説明                                   |
| -------- | ------ | ------ | -------------------------------------- |
| `format` | string | `json` | `json` または `csv`                    |
| `limit`  | number | 100    | 取得行数(最大 1000)                  |
| `offset` | number | 0      | 取得開始行                             |

**JSON レスポンス**(ヘッダー行をキーにしたオブジェクト配列)

```json
{
  "datasetId": "clxxxx",
  "columns": ["町丁名", "人口", "世帯数"],
  "data": [
    { "町丁名": "本町1丁目", "人口": "1234", "世帯数": "567" }
  ],
  "pagination": { "total": 1200, "limit": 100, "offset": 0, "count": 1 }
}
```

**CSV レスポンス**(`format=csv`)

`Content-Type: text/csv` でヘッダー行を含む CSV を返します。

```bash
# JSON
curl -H "Authorization: Bearer odb_あなたのキー" \
  "http://localhost:3000/api/v1/datasets/clxxxx/data?limit=100&offset=0"

# CSV
curl -H "Authorization: Bearer odb_あなたのキー" \
  "http://localhost:3000/api/v1/datasets/clxxxx/data?format=csv"
```

データ本体(CSV)が未登録の場合は `404`(`data_not_available`)。

---

## キー管理 API(ダッシュボード内部用・セッション認証)

ダッシュボード画面から利用する管理用エンドポイントです。ログインセッション
(Cookie)で認証され、公開 API とは別系統です。

| メソッド | パス             | 説明                                   |
| -------- | ---------------- | -------------------------------------- |
| GET      | `/api/keys`      | 自分のキー一覧(マスク済み)+ 利用量   |
| POST     | `/api/keys`      | キー発行(`{ "label": "..." }`)。全文は応答一度きり |
| DELETE   | `/api/keys/{id}` | キーを失効(revoke)                    |
