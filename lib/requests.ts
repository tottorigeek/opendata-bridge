import "server-only";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

/**
 * データリクエスト(組織への公開依頼・修正依頼)。
 *
 * 現時点では文章でのやり取りに限り、CSV の差分提案は扱わない。
 * 差分提案は版の概念に依存するため、バージョン機能の後に足す。
 */

export const REQUEST_KIND_LABEL: Record<string, string> = {
  CREATE: "公開依頼",
  FIX: "修正依頼",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  OPEN: "受付済み",
  IN_PROGRESS: "対応中",
  RESOLVED: "対応済み",
  DECLINED: "対応しない",
};

export const REQUEST_STATUS_CLASS: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-slate-100 text-slate-600",
};

export const REQUEST_POLICY_LABEL: Record<string, string> = {
  VERIFIED_USERS: "メール確認済みの利用者から受け付ける",
  VERIFIED_ORGS: "確認済み組織に所属する人からのみ受け付ける",
  CLOSED: "受け付けない",
};

export const REQUEST_KINDS = ["CREATE", "FIX"] as const;
export const REQUEST_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "DECLINED",
] as const;
export const REQUEST_POLICIES = [
  "VERIFIED_USERS",
  "VERIFIED_ORGS",
  "CLOSED",
] as const;

export type RequestEligibility =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * その利用者がこの組織へリクエストを送れるかを判定する。
 *
 * 受付範囲は組織ごとの設定に従う。自組織宛は用途がないため常に不可。
 * メール確認を必須にしているのは、なりすましで他組織へ依頼を送れると
 * 受け取る側が対応判断できなくなるため。
 */
export function canSendRequest(
  user: SessionUser | null,
  organization: Pick<Organization, "id" | "requestPolicy">,
): RequestEligibility {
  if (!user) {
    return { allowed: false, reason: "リクエストを送るにはログインが必要です。" };
  }
  if (user.organizationId === organization.id) {
    return {
      allowed: false,
      reason: "自組織へのリクエストは送れません。",
    };
  }
  if (organization.requestPolicy === "CLOSED") {
    return {
      allowed: false,
      reason: "この組織はデータリクエストを受け付けていません。",
    };
  }
  if (!user.emailVerifiedAt) {
    return {
      allowed: false,
      reason:
        "メールアドレスの確認が必要です。組織設定から確認メールを再送できます。",
    };
  }
  if (
    organization.requestPolicy === "VERIFIED_ORGS" &&
    !user.organization.verified
  ) {
    return {
      allowed: false,
      reason:
        "この組織は、確認済み組織に所属する人からのリクエストのみ受け付けています。",
    };
  }
  return { allowed: true };
}

/** 組織が受け取ったリクエスト一覧(新しい順)。 */
export async function listReceivedRequests(organizationId: string) {
  return prisma.dataRequest.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      dataset: { select: { id: true, title: true } },
      _count: { select: { replies: true } },
    },
  });
}

/** 自分が送ったリクエスト一覧(新しい順)。 */
export async function listSentRequests(userId: string) {
  return prisma.dataRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { id: true, name: true } },
      dataset: { select: { id: true, title: true } },
      _count: { select: { replies: true } },
    },
  });
}

/**
 * リクエスト 1 件を取得する。
 * 閲覧できるのは、送信者本人と受け取った組織のメンバーのみ。
 * リクエストには未公開データへの指摘が含まれうるため、公開はしない。
 */
export async function getVisibleRequest(id: string, user: SessionUser | null) {
  if (!user) return null;

  const request = await prisma.dataRequest.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      dataset: { select: { id: true, title: true } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!request) return null;

  const isRecipient = request.organizationId === user.organizationId;
  const isRequester = request.requesterId === user.id;
  if (!isRecipient && !isRequester) return null;

  return { request, isRecipient, isRequester };
}
