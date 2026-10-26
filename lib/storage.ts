/**
 * データセット CSV のストレージ抽象化レイヤー。
 *
 * 2 つのドライバを環境変数で自動切り替えする:
 *   - ローカルドライバ       … `storage/datasets/{id}.csv`
 *                              (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が無いとき)
 *   - Supabase Storage ドライバ … 非公開バケット内の `datasets/{id}.csv`
 *                              (SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が両方あるとき)
 *
 * 版を持つデータの本文は `datasets/{id}/v{n}.csv` に置く(datasetVersionStorageKey)。
 * データセットを削除するときは deleteAllDatasetObjects で両方の形式をまとめて消す。
 *
 * すべての読み書きは「データセット id」をキーに行う。DB の Dataset.filePath は
 * このストレージキー(datasetStorageKey(id) === "datasets/{id}.csv")を保持する。
 * このキーはバケット内のオブジェクトパスとしてもそのまま使う。
 *
 * NOTE: 本モジュールは `server-only` を敢えて import しない。
 *   - 実際の呼び出し元(lib/csv.ts / lib/merge/datasets.ts / api ルート)は
 *     それぞれ `server-only` を付けており、サーバー限定であることは担保される。
 *   - さらに prisma/seed.ts(素の Node スクリプト)からも dynamic import で
 *     利用するため、ここで `server-only`(Client 判定用の throw マーカー)を
 *     入れると seed 実行時に落ちてしまう。
 *
 * Supabase Storage は「非公開(private)バケット」で運用する。service role キーで
 * 認証したサーバー SDK 経由でのみ本文を読み書きする。公開 URL・署名 URL は使わず、
 * CSV 配信はすべてアプリ側ルート(認可チェック済み)を通す。
 * SUPABASE_SERVICE_ROLE_KEY はサーバー専用シークレットであり、クライアントへ渡さない。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Supabase Storage のバケット名(未指定時は "datasets")。 */
function bucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "datasets";
}

/**
 * Supabase プロジェクト URL を解決する。
 * SUPABASE_URL(手動 / Integration 注入)を優先し、無ければ
 * NEXT_PUBLIC_SUPABASE_URL(Integration が公開側だけ注入するケースの保険)を見る。
 * プロジェクト URL 自体は秘匿情報ではないため、公開系 URL へのフォールバックは許容する。
 */
function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

/**
 * Supabase service role キーを解決する。
 * サーバー専用シークレットである SUPABASE_SERVICE_ROLE_KEY のみを見る。
 * 公開系キー(anon / publishable)へのフォールバックは絶対にしない
 * (非公開バケットへの読み書きには service role 権限が必須のため)。
 */
function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/**
 * データセット id からストレージキー(= DB の filePath / バケット内パス)を導出する。
 *
 * 版を持つ前に作られたデータはこのキーのままなので、移行時にファイルを
 * 移動しなくて済むよう、初版の filePath にはこの値をそのまま入れる。
 */
export function datasetStorageKey(id: string): string {
  return `datasets/${id}.csv`;
}

/** 版ごとのストレージキー。版を持つデータはすべてこの形式になる。 */
export function datasetVersionStorageKey(datasetId: string, version: number): string {
  return `datasets/${datasetId}/v${version}.csv`;
}

/**
 * リモート(Supabase Storage)ドライバを使うか。
 * SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が両方あるときのみ有効。
 * (歴史的経緯で名前は isBlobStorageEnabled のまま。呼び出し元互換のため維持。)
 */
export function isBlobStorageEnabled(): boolean {
  return !!(supabaseUrl() && supabaseServiceKey());
}

/**
 * ローカルドライバでの絶対パス。
 * キーは "datasets/..." 形式なので、storage/ 直下に同じ階層で配置する。
 */
function localPathForKey(key: string): string {
  return path.join(process.cwd(), "storage", key);
}

/**
 * Supabase クライアントを遅延生成する(モジュール読み込み時ではなく初回使用時)。
 * ローカルドライバ利用時は @supabase/supabase-js を import しない。
 */
let cachedClient: SupabaseClient | null = null;
async function getSupabase(): Promise<SupabaseClient> {
  if (cachedClient) return cachedClient;
  const { createClient } = await import("@supabase/supabase-js");
  cachedClient = createClient(
    supabaseUrl() as string,
    supabaseServiceKey() as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cachedClient;
}

/**
 * CSV 本文を保存する(存在すれば上書き)。
 * Buffer / 文字列いずれも受け付け、そのままのバイト列で保存する
 * (エンコーディング正規化は呼び出し側 lib/csv.ts の責務)。
 */
export async function saveCsvObject(
  key: string,
  content: Buffer | string,
): Promise<void> {
  const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    const { error } = await supabase.storage.from(bucketName()).upload(key, body, {
      upsert: true, // 同一キーへの再保存(差し替え)を許す
      contentType: "text/csv; charset=utf-8",
    });
    if (error) {
      throw new Error(`Supabase Storage への保存に失敗しました: ${error.message}`);
    }
    return;
  }

  const absolute = localPathForKey(key);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, body);
}

/** データセット id をキーにした保存(版を持たない経路の互換用)。 */
export async function saveDatasetCsv(
  id: string,
  content: Buffer | string,
): Promise<void> {
  return saveCsvObject(datasetStorageKey(id), content);
}

/**
 * 保存済み CSV の生バイト列を返す。存在しなければ null。
 * (呼び出し側は従来どおり「未存在 = null」で分岐する。)
 */
export async function readCsvObject(key: string): Promise<Buffer | null> {
  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage.from(bucketName()).download(key);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  try {
    return await fs.readFile(localPathForKey(key));
  } catch {
    return null;
  }
}

/** データセット id をキーにした読み出し(版を持たない経路の互換用)。 */
export async function readDatasetCsv(id: string): Promise<Buffer | null> {
  return readCsvObject(datasetStorageKey(id));
}

/** CSV を削除する(存在しなくてもエラーにしない)。 */
export async function deleteCsvObject(key: string): Promise<void> {
  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    // remove は対象が無くてもエラーにならない(空配列が返るのみ)。
    await supabase.storage.from(bucketName()).remove([key]);
    return;
  }

  try {
    await fs.unlink(localPathForKey(key));
  } catch {
    // ファイルが無ければ何もしない
  }
}

/** 版ファイルを置く、データセットごとのフォルダ(末尾スラッシュなし)。 */
function datasetVersionFolder(datasetId: string): string {
  return `datasets/${datasetId}`;
}

/** Supabase Storage の remove 1 回あたりに渡すキーの上限。 */
const REMOVE_BATCH_SIZE = 1000;

/**
 * データセットに属する保存物をすべて削除する(データセット削除時に使う)。
 *
 * 対象は次の和集合:
 *   - 旧形式のキー datasets/{id}.csv(版の導入前のデータ・初版)
 *   - datasets/{id}/ 以下の全オブジェクト(版ファイル)
 *   - 呼び出し側が渡したキー(DB の DatasetVersion.filePath)
 * DB の行だけを頼りにすると、保存後に行の作成が失敗した版などを取りこぼすため、
 * フォルダの列挙も併用する。
 *
 * deleteCsvObject と異なり、削除に失敗したら例外を投げる。
 * データセット削除は個人情報を含む版を取り下げる手段でもあり、
 * 実体が残ったまま「削除できた」と扱ってはならないため。
 */
export async function deleteAllDatasetObjects(
  datasetId: string,
  knownKeys: string[] = [],
): Promise<void> {
  // id が空や区切り文字を含むと、フォルダ削除が datasets/ 全体などに及ぶ。
  if (!/^[A-Za-z0-9_-]+$/.test(datasetId)) {
    throw new Error(`不正なデータセット id です: ${datasetId}`);
  }
  const folder = datasetVersionFolder(datasetId);
  const keys = new Set([datasetStorageKey(datasetId), ...knownKeys]);

  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    const bucket = supabase.storage.from(bucketName());

    // list はフォルダ直下しか返さないため、サブフォルダは辿って集める。
    // (版ファイルはすべて直下に置かれるが、ローカルドライバの再帰削除と揃える。)
    const folders = [folder];
    while (folders.length > 0) {
      const current = folders.pop() as string;
      for (let offset = 0; ; offset += REMOVE_BATCH_SIZE) {
        const { data, error } = await bucket.list(current, {
          limit: REMOVE_BATCH_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) {
          throw new Error(`Supabase Storage の一覧取得に失敗しました: ${error.message}`);
        }
        for (const entry of data ?? []) {
          // id が null のものはサブフォルダ(実体ではない)。
          if (entry.id) keys.add(`${current}/${entry.name}`);
          else folders.push(`${current}/${entry.name}`);
        }
        if (!data || data.length < REMOVE_BATCH_SIZE) break;
      }
    }

    const all = [...keys];
    for (let i = 0; i < all.length; i += REMOVE_BATCH_SIZE) {
      const { error } = await bucket.remove(all.slice(i, i + REMOVE_BATCH_SIZE));
      if (error) {
        throw new Error(`Supabase Storage からの削除に失敗しました: ${error.message}`);
      }
    }
    return;
  }

  // force: true で「存在しない」は無視し、それ以外の失敗は例外にする。
  for (const key of keys) {
    await fs.rm(localPathForKey(key), { force: true });
  }
  await fs.rm(localPathForKey(folder), { recursive: true, force: true });
}

/** CSV が存在するか。 */
export async function datasetCsvExists(id: string): Promise<boolean> {
  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    // バケット内 "datasets" フォルダを対象に、当該ファイル名で検索する。
    const fileName = `${id}.csv`;
    const { data, error } = await supabase.storage
      .from(bucketName())
      .list("datasets", { search: fileName, limit: 100 });
    if (error || !data) return false;
    return data.some((entry) => entry.name === fileName);
  }

  try {
    await fs.access(localPathForKey(datasetStorageKey(id)));
    return true;
  } catch {
    return false;
  }
}
