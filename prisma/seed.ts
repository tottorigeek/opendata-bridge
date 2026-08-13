/**
 * OpenData Bridge シードスクリプト
 *
 * デモとして意味の通るデータを投入する:
 *   - 組織2つ(鳥取県庁 / 山陰データラボ株式会社)
 *   - 各組織の ADMIN ユーザー(パスワードは共通で demo1234)
 *   - 公開データセット4件(PUBLISHED / PUBLIC)。実 CSV を storage/datasets/ に配置。
 *
 * 元 CSV は prisma/seed-data/ にコミットされており、seed 実行時に
 * lib/storage.ts 経由で保存する(ローカルは storage/datasets/{id}.csv、
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY があれば Supabase Storage の
 * 非公開バケット内 datasets/{id}.csv)。
 * filePath には storage キー(datasets/{id}.csv)を保存する。
 *
 * `npx prisma migrate reset --force`(内部で db seed を呼ぶ)や
 * `npx prisma db seed` を複数回実行しても冪等になるよう、既存の
 * ApiKey / Dataset / User / Organization を一度全削除してから作り直す。
 */
// Node の TypeScript 型ストリップで直接実行するため CommonJS(require)で記述する。
// ESM の import にすると Prisma の CJS クライアント解決に失敗するため。
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { parse } = require("csv-parse/sync");
const fs = require("node:fs").promises;
const path = require("node:path");

const prisma = new PrismaClient();

const SEED_DATA_DIR = path.join(process.cwd(), "prisma", "seed-data");
const STORAGE_DIR = path.join(process.cwd(), "storage", "datasets");

const DEMO_PASSWORD = "demo1234";

type OrgType = "GOVERNMENT" | "PRIVATE";
type Visibility = "PUBLIC" | "ORG_ONLY" | "PRIVATE";

type SeedDataset = {
  orgKey: "gov" | "lab";
  file: string;
  title: string;
  description: string;
  license: string;
  tags: string;
  updateFrequency: string;
  visibility: Visibility;
  /**
   * データが対象とする地域。未指定なら発行組織の所在地が使われる。
   * 収録 4 件はいずれも鳥取県内の複数市町村にまたがるため、市区町村は指定しない。
   */
  prefecture?: string;
  municipality?: string;
};

const DATASETS: SeedDataset[] = [
  {
    orgKey: "gov",
    file: "tottori-shelters.csv",
    title: "鳥取県 避難所一覧",
    description:
      "鳥取県内の指定避難所の名称・住所・収容人数・緯度経度。住所は「一丁目2番3号」形式で登録。",
    license: "政府標準利用規約(第2.0版)",
    tags: "防災,避難所,鳥取県,位置情報",
    updateFrequency: "年次",
    visibility: "PUBLIC",
  },
  {
    orgKey: "gov",
    file: "tottori-tourism.csv",
    title: "鳥取県 観光施設一覧",
    description:
      "鳥取県内の主要観光施設の名称・住所・カテゴリ・緯度経度をまとめたオープンデータ。",
    license: "政府標準利用規約(第2.0版)",
    tags: "観光,施設,鳥取県,位置情報",
    updateFrequency: "四半期",
    visibility: "PUBLIC",
  },
  {
    orgKey: "lab",
    file: "sanin-store-points.csv",
    title: "山陰データラボ 店舗ポイントデータ",
    description:
      "山陰地域の店舗の名称・住所・カテゴリ。住所は「1-2-3」形式。避難所一覧と住所キーで名寄せ(マージ)できるサンプル。",
    license: "CC-BY-4.0",
    tags: "店舗,POI,山陰,位置情報",
    updateFrequency: "月次",
    visibility: "PUBLIC",
    // 発行元の所在地は米子市だが、データは鳥取県全域が対象。
    // 対象地域を明示して、米子市のデータとして分類されるのを防ぐ。
    prefecture: "鳥取県",
  },
  {
    orgKey: "lab",
    file: "sanin-foot-traffic.csv",
    title: "山陰データラボ 人流データサンプル",
    description:
      "山陰地域の主要地点における日別の人流(推計滞在人数)サンプルデータ。",
    license: "CC-BY-4.0",
    tags: "人流,統計,山陰,観光",
    updateFrequency: "日次",
    visibility: "PUBLIC",
    // 鳥取市・米子市・倉吉市の地点を含むため、県単位を対象地域とする。
    prefecture: "鳥取県",
  },
];

/** 元 CSV を読み、ヘッダー(カラム名)とデータ行数を返す。 */
async function readCsvMeta(
  file: string,
): Promise<{ content: string; columns: string[]; rowCount: number }> {
  const abs = path.join(SEED_DATA_DIR, file);
  const content = await fs.readFile(abs, "utf8");
  const rows = parse(content.replace(/^﻿/, ""), {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  const columns = rows.length > 0 ? rows[0].map((c) => c.trim()) : [];
  const rowCount = Math.max(0, rows.length - 1);
  return { content, columns, rowCount };
}

async function main() {
  console.log("シードを開始します…");

  // ストレージ抽象(ローカル or Vercel Blob)を dynamic import で読み込む。
  // seed は素の Node スクリプトのため、TS モジュールを実行時に取り込む。
  const { saveDatasetCsv, datasetStorageKey } = await import("../lib/storage.ts");

  // --- 既存データのクリーンアップ(冪等性のため) --------------------------
  // ローカルドライバ時は storage/datasets を空にしてから DB を作り直す。
  // (Blob ドライバ時はこのローカル掃除は no-op。同一キーは保存時に上書きされる。)
  try {
    const files = await fs.readdir(STORAGE_DIR);
    await Promise.all(
      files.map((f: string) => fs.unlink(path.join(STORAGE_DIR, f)).catch(() => {})),
    );
  } catch {
    // ディレクトリが無ければ後段の保存で作成する
  }

  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // --- 組織 ----------------------------------------------------------------
  // デモの 2 組織は運営が確認済みの体で verified: true にする
  // (通常のサインアップ経由で作られる組織は常に未確認から始まる)。
  // 所在地は、データセット側に対象地域が無いときのカタログ絞り込みに使われる。
  const govOrg = await prisma.organization.create({
    data: {
      name: "鳥取県庁",
      type: "GOVERNMENT" as OrgType,
      verified: true,
      prefecture: "鳥取県",
    },
  });
  const labOrg = await prisma.organization.create({
    data: {
      name: "山陰データラボ株式会社",
      type: "PRIVATE" as OrgType,
      verified: true,
      prefecture: "鳥取県",
      municipality: "米子市",
    },
  });
  const orgIdByKey: Record<"gov" | "lab", string> = {
    gov: govOrg.id,
    lab: labOrg.id,
  };
  console.log(`組織を作成: ${govOrg.name} / ${labOrg.name}`);

  // --- ユーザー(各組織の ADMIN) ------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: "gov-admin@example.com",
      passwordHash,
      name: "鳥取県 データ管理担当",
      role: "ADMIN",
      organizationId: govOrg.id,
    },
  });
  await prisma.user.create({
    data: {
      email: "private-admin@example.com",
      passwordHash,
      name: "山陰データラボ 管理者",
      role: "ADMIN",
      organizationId: labOrg.id,
    },
  });
  console.log(
    "ユーザーを作成: gov-admin@example.com / private-admin@example.com(パスワード: demo1234)",
  );

  // --- データセット + storage への CSV 配置 --------------------------------
  for (const spec of DATASETS) {
    const { content, columns, rowCount } = await readCsvMeta(spec.file);

    const created = await prisma.dataset.create({
      data: {
        title: spec.title,
        description: spec.description,
        license: spec.license,
        visibility: spec.visibility,
        status: "PUBLISHED",
        tags: spec.tags,
        updateFrequency: spec.updateFrequency,
        sourceType: "UPLOADED",
        columnsJson: JSON.stringify(columns),
        rowCount,
        filePath: null,
        prefecture: spec.prefecture ?? null,
        municipality: spec.municipality ?? null,
        organizationId: orgIdByKey[spec.orgKey],
      },
    });

    // storage(ローカル or Blob)へ実データを配置し、filePath を確定させる。
    await saveDatasetCsv(created.id, content);
    await prisma.dataset.update({
      where: { id: created.id },
      data: { filePath: datasetStorageKey(created.id) },
    });

    console.log(`データセットを作成: ${spec.title}(${rowCount} 行)`);
  }

  console.log("シードが完了しました。");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
