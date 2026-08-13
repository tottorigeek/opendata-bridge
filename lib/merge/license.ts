/**
 * マージ結果のライセンス継承。
 *
 * 判定できる組み合わせは安全側の候補を返し、判定できない組み合わせは
 * 未確定(null)を返す。未確定のデータセットは公開申請を通さないことで、
 * 誤ったライセンス表示のまま公開されるのを防ぐ
 * (docs/design/merge-design.md §3-2)。
 *
 * 完全自動決定にしないのは「独自ライセンス」など機械判定できない場合に
 * 破綻するため。一切推定しないのも、自明なケースまで手入力を強いることで
 * 面倒から適当な値を入れられるリスクがある。推定はするが、公開の関門で
 * 必ず人が確認する、という設計になっている。
 */

const CC0 = "CC0";
const CC_BY = "CC-BY-4.0";
const GOV_2_0 = "政府標準利用規約(第2.0版)";
const CC_BY_SA = "CC-BY-SA-4.0";

/**
 * 制約の強さ。強いほうに合わせるのが安全側になる。
 *   0: 権利放棄(CC0)
 *   1: 表示のみ(CC-BY / 政府標準利用規約 2.0。後者は CC BY 4.0 互換)
 *   2: 継承あり(CC-BY-SA。結果にも継承が伝播する)
 */
const STRENGTH: Record<string, number> = {
  [CC0]: 0,
  [CC_BY]: 1,
  [GOV_2_0]: 1,
  [CC_BY_SA]: 2,
};

export interface LicenseResolution {
  /** 判定できたライセンス。判定できない場合は null(未確定)。 */
  license: string | null;
  /** 利用者に見せる根拠・注意書き。 */
  reason: string;
}

/** 既知のライセンス表記か。 */
export function isKnownLicense(license: string): boolean {
  return license in STRENGTH;
}

/**
 * 2 つの入力ライセンスから、マージ結果のライセンス候補を求める。
 *
 * @param a 入力 A のライセンス
 * @param b 入力 B のライセンス
 */
export function resolveMergedLicense(a: string, b: string): LicenseResolution {
  const licenseA = a.trim();
  const licenseB = b.trim();

  if (!isKnownLicense(licenseA) || !isKnownLicense(licenseB)) {
    const unknown = [
      isKnownLicense(licenseA) ? null : licenseA || "(未設定)",
      isKnownLicense(licenseB) ? null : licenseB || "(未設定)",
    ].filter(Boolean);
    return {
      license: null,
      reason:
        `「${unknown.join("」「")}」は内容を機械的に判定できないため、` +
        `結果のライセンスを自動で決められませんでした。` +
        `両方の出典の条件を確認し、公開申請の前にライセンスを設定してください。`,
    };
  }

  if (licenseA === licenseB) {
    return {
      license: licenseA,
      reason: `両方の出典が ${licenseA} のため、そのまま引き継ぎます。`,
    };
  }

  const strength = Math.max(STRENGTH[licenseA], STRENGTH[licenseB]);

  if (strength === 2) {
    return {
      license: CC_BY_SA,
      reason:
        `出典に ${CC_BY_SA} が含まれるため、継承条件が結果にも及びます。` +
        `より緩いライセンスでは配布できません。`,
    };
  }

  if (strength === 1) {
    return {
      license: CC_BY,
      reason:
        `出典に表示義務のあるライセンス(${licenseA} / ${licenseB})が含まれるため、` +
        `双方の条件を満たす ${CC_BY} を候補としています。` +
        `出典の表示は両方について必要です。`,
    };
  }

  return {
    license: CC0,
    reason: `両方の出典が権利を放棄しているため、${CC0} を候補としています。`,
  };
}
