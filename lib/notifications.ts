import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendMail } from "@/lib/mail";

/**
 * 通知。
 *
 * 通知の正本はアプリ内通知(Notification テーブル)に置く。
 * メール送信は環境によって使えない(プロバイダ未設定・到達不能・受信拒否)ため、
 * メールだけに頼ると通知が失われる。メールはあくまで補助的な配信手段として扱い、
 * 送信に失敗しても本体の処理は止めない。
 */

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  REQUEST_RECEIVED: "リクエスト受信",
  REQUEST_REPLIED: "返信",
  REQUEST_STATUS_CHANGED: "状態の変更",
  MERGE_REFRESH_BLOCKED: "自動更新の停止",
};

export interface NotifyParams {
  /** 宛先ユーザー ID。重複と空は呼び出し側で気にしなくてよい。 */
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  /** アプリ内の相対パス(例: /dashboard/requests/xxx)。 */
  link: string;
}

/**
 * 通知を作成し、メール通知が有効なユーザーには併せてメールを送る。
 *
 * メール送信は best-effort。失敗しても例外を投げず、呼び出し元の処理
 * (リクエストの作成など)を巻き添えにしない。
 */
export async function notify(params: NotifyParams): Promise<void> {
  const userIds = [...new Set(params.userIds)].filter(Boolean);
  if (userIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, emailNotifications: true },
  });
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: params.type,
      title: params.title,
      body: params.body ?? "",
      link: params.link,
    })),
  });

  const url = `${appBaseUrl()}${params.link}`;
  await Promise.all(
    users
      .filter((user) => user.emailNotifications)
      .map((user) =>
        sendMail({
          to: user.email,
          subject: `[OpenData Bridge] ${params.title}`,
          text: [
            params.title,
            "",
            params.body ?? "",
            "",
            url,
            "",
            "※ 通知メールが不要な場合は、組織設定から受け取りを止められます。",
          ].join("\n"),
        }).catch((e) => {
          // 通知の正本はアプリ内通知なので、メールの失敗は記録するだけにする。
          console.error("[notify] メール送信に失敗しました", e);
        }),
      ),
  );
}

/** 組織に所属するユーザーの ID を返す(通知の宛先解決に使う)。 */
export async function memberIdsOf(organizationId: string): Promise<string[]> {
  const members = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** 未読をすべて既読にする。件数を返す。 */
export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
