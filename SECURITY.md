# セキュリティポリシー / Security Policy

## 脆弱性の報告 / Reporting a Vulnerability

脆弱性を発見された場合は、**公開 Issue には書かず**、GitHub の
**[Private Vulnerability Reporting](../../security/advisories/new)**(Security タブ → Report a vulnerability)
からご報告ください。

If you discover a security vulnerability, please **do not open a public issue**.
Use GitHub's Private Vulnerability Reporting (Security tab → "Report a vulnerability") instead.

## 対応方針 / Response

- 小規模チームで運営しているため、対応期限(SLA)はお約束できませんが、報告には可能な限り速やかに一次返信します。
- 修正がリリースされるまで、詳細の公開はお控えください(責任ある開示にご協力ください)。
- We are a small team and cannot guarantee a response SLA, but we will acknowledge reports as quickly as possible.
- Please practice responsible disclosure: do not publish details until a fix is released.

## 対象 / Scope

- 本リポジトリのコード(アプリケーション本体・API・マージエンジン)
- 依存パッケージ由来の既知脆弱性は、まず依存の更新で対応します

## 対象外 / Out of Scope

- セルフホストされた第三者インスタンスの設定不備(公開バケット化、`SESSION_SECRET` 未変更など)
- レート制限・ブルートフォース耐性など、運用側での緩和を前提とする項目(報告自体は歓迎します)
