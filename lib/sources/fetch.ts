import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 外部データソース取得用の HTTP クライアント(SSRF 対策込み)。
 *
 * 取得先 URL は利用者が入力する。素の fetch をそのまま使うと、
 * `http://169.254.169.254/`(クラウドのメタデータ)や `http://127.0.0.1:5432/`、
 * 社内ネットワークのホストへサーバーから到達でき、SSRF になる。
 * そこで以下を強制する:
 *   1. スキームは http/https のみ、ポートは一般的な 4 つのみ
 *   2. 名前解決した「全ての」IP が公開アドレスであること
 *   3. リダイレクトは自動追従せず、1 ホップごとに 1〜2 を再検証
 *   4. タイムアウトとレスポンスサイズの上限
 *   5. ホストが変わるリダイレクトでは認証情報を引き継がない
 *
 * NOTE(残存リスク): 検証時と接続時で名前解決が変わる DNS リバインディングは
 *   完全には防げない(fetch に「解決済み IP へ繋ぐ」指定ができないため)。
 *   本機能はログイン済み組織ユーザーだけが設定でき、取得結果は自組織の
 *   データセットにしか入らないため、現状はこの残存リスクを受容している。
 */

/** 許可するポート(未指定時はスキーム既定)。 */
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/** リダイレクトの最大追従回数。 */
const MAX_REDIRECTS = 5;

/** 取得サイズの上限(20MB。CSV アップロードの上限と揃える)。 */
export const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** 1 リクエストのタイムアウト(ミリ秒)。 */
const REQUEST_TIMEOUT_MS = 30_000;

/** 外部取得が拒否・失敗したことを表すエラー(利用者向けメッセージを持つ)。 */
export class SourceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceFetchError";
  }
}

/** IPv4 が到達を許さない範囲かどうか。 */
function isBlockedIpv4(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // 解釈できないものは通さない
  }
  const [a, b] = p;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // プライベート
  if (a === 127) return true; // ループバック
  if (a === 169 && b === 254) return true; // リンクローカル(クラウドのメタデータ)
  if (a === 172 && b >= 16 && b <= 31) return true; // プライベート
  if (a === 192 && b === 168) return true; // プライベート
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 等の特殊用途
  if (a === 198 && (b === 18 || b === 19)) return true; // ベンチマーク用 198.18/15
  if (a >= 224) return true; // マルチキャスト 224/4・予約 240/4・255.255.255.255
  return false;
}

/** IPv6 が到達を許さない範囲かどうか。 */
function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().split("%")[0]; // ゾーン ID を除去

  if (lower === "::" || lower === "::1") return true; // 未指定・ループバック

  // IPv4 射影アドレス(::ffff:127.0.0.1 など)は埋め込み IPv4 で判定する
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isBlockedIpv4(mapped[1]);

  const head = lower.split(":")[0];
  const headNum = parseInt(head || "0", 16);
  if (Number.isNaN(headNum)) return true;

  if ((headNum & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((headNum & 0xffc0) === 0xfe80) return true; // リンクローカル fe80::/10
  if ((headNum & 0xff00) === 0xff00) return true; // マルチキャスト ff00::/8
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

/**
 * URL の形式・ポートを検証し、ホスト名を解決して全ての IP が公開アドレスか確認する。
 * 問題があれば SourceFetchError を投げる。
 */
async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SourceFetchError(
      "取得先は http:// または https:// で指定してください。",
    );
  }

  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new SourceFetchError(
      `ポート ${port} は許可されていません(80 / 443 / 8080 / 8443 のみ)。`,
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // IPv6 リテラルの括弧を外す

  // ホスト名が IP リテラルならそのまま判定、そうでなければ名前解決する。
  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const resolved = await lookup(hostname, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch {
      throw new SourceFetchError(
        `ホスト名 ${hostname} を解決できませんでした。`,
      );
    }
  }

  if (addresses.length === 0) {
    throw new SourceFetchError(`ホスト名 ${hostname} を解決できませんでした。`);
  }

  // 1 つでも内部アドレスに解決されるホストは拒否する。
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new SourceFetchError(
        `内部ネットワーク宛(${address})の取得先は指定できません。`,
      );
    }
  }
}

export interface SafeFetchOptions {
  /** 付与するヘッダ(認証ヘッダなど)。ホストが変わると引き継がない。 */
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  body: Buffer;
  contentType: string;
  finalUrl: string;
}

/**
 * 検証済みの外部 GET リクエストを実行し、本文を Buffer で返す。
 * リダイレクトは手動で追従し、各ホップで再検証する。
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new SourceFetchError("取得先 URL の形式が不正です。");
  }

  const originalHost = current.host;
  let headers = { ...(options.headers ?? {}) };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current);

    // ホストが変わったら認証情報を落とす(第三者へキーを渡さないため)。
    if (current.host !== originalHost) {
      headers = {};
    }

    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        headers: { ...headers, accept: "application/json, text/csv, */*" },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new SourceFetchError(
          `取得がタイムアウトしました(${REQUEST_TIMEOUT_MS / 1000} 秒)。`,
        );
      }
      throw new SourceFetchError(
        `取得先へ接続できませんでした: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 3xx は Location を検証したうえで次のホップへ。
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SourceFetchError(
          `リダイレクト応答(${response.status})に Location がありません。`,
        );
      }
      try {
        current = new URL(location, current);
      } catch {
        throw new SourceFetchError("リダイレクト先 URL が不正です。");
      }
      continue;
    }

    if (!response.ok) {
      throw new SourceFetchError(
        `取得先が ${response.status} ${response.statusText} を返しました。`,
      );
    }

    const body = await readCapped(response);
    return {
      body,
      contentType: response.headers.get("content-type") ?? "",
      finalUrl: current.toString(),
    };
  }

  throw new SourceFetchError(
    `リダイレクトが多すぎます(${MAX_REDIRECTS} 回を超過)。`,
  );
}

/**
 * 上限バイト数まで読み、超えたら打ち切って例外にする。
 * Content-Length を信用せず実データ量で判定する(詐称・チャンク応答対策)。
 */
async function readCapped(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SourceFetchError(
        `取得データが上限(${MAX_RESPONSE_BYTES / 1024 / 1024}MB)を超えました。`,
      );
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}
