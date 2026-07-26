/**
 * データセット CSV のストレージ抽象化レイヤー。
 *
 * 2 つのドライバを環境変数で自動切り替えする:
 *   - ローカルドライバ       … `storage/datasets/{id}.csv`
 *                              (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が無いとき)
 *   - Supabase Storage ドライバ … 非公開バケット内の `datasets/{id}.csv`
 *                              (SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が両方あるとき)
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

/** ローカルドライバの保存先ディレクトリ。 */
const LOCAL_DIR = path.join(process.cwd(), "storage", "datasets");

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

/** データセット id からストレージキー(= DB の filePath / バケット内パス)を導出する。 */
export function datasetStorageKey(id: string): string {
  return `datasets/${id}.csv`;
}

/**
 * リモート(Supabase Storage)ドライバを使うか。
 * SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が両方あるときのみ有効。
 * (歴史的経緯で名前は isBlobStorageEnabled のまま。呼び出し元互換のため維持。)
 */
export function isBlobStorageEnabled(): boolean {
  return !!(supabaseUrl() && supabaseServiceKey());
}

/** ローカルドライバでの絶対パス。 */
function localPath(id: string): string {
  return path.join(LOCAL_DIR, `${id}.csv`);
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
export async function saveDatasetCsv(
  id: string,
  content: Buffer | string,
): Promise<void> {
  const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    const { error } = await supabase.storage
      .from(bucketName())
      .upload(datasetStorageKey(id), body, {
        upsert: true, // CSV 差し替え時に同一キーへ上書き
        contentType: "text/csv; charset=utf-8",
      });
    if (error) {
      throw new Error(`Supabase Storage への保存に失敗しました: ${error.message}`);
    }
    return;
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(localPath(id), body);
}

/**
 * 保存済み CSV の生バイト列を返す。存在しなければ null。
 * (呼び出し側は従来どおり「未存在 = null」で分岐する。)
 */
export async function readDatasetCsv(id: string): Promise<Buffer | null> {
  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage
      .from(bucketName())
      .download(datasetStorageKey(id));
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  try {
    return await fs.readFile(localPath(id));
  } catch {
    return null;
  }
}

/** CSV を削除する(存在しなくてもエラーにしない)。 */
export async function deleteDatasetCsv(id: string): Promise<void> {
  if (isBlobStorageEnabled()) {
    const supabase = await getSupabase();
    // remove は対象が無くてもエラーにならない(空配列が返るのみ)。
    await supabase.storage.from(bucketName()).remove([datasetStorageKey(id)]);
    return;
  }

  try {
    await fs.unlink(localPath(id));
  } catch {
    // ファイルが無ければ何もしない
  }
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
    await fs.access(localPath(id));
    return true;
  } catch {
    return false;
  }
}
