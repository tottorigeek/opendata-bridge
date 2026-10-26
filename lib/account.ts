import type { SessionUser } from "@/lib/auth";
import type { AccountSummary } from "@/components/AccountMenu";

const ORG_TYPE_LABEL: Record<string, string> = {
  GOVERNMENT: "行政",
  PRIVATE: "民間",
};

/** ヘッダーのアカウントメニューに渡す表示用の情報(必要な項目だけを渡す)。 */
export function toAccountSummary(user: SessionUser): AccountSummary {
  return {
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    organizationId: user.organization.id,
    organizationName: user.organization.name,
    organizationTypeLabel: ORG_TYPE_LABEL[user.organization.type] ?? user.organization.type,
  };
}
