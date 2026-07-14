# 神山ものづくり保管計画

Supabase Auth・Postgres・Storage、Prisma ORM、Hono、Vercel Functionsで動作する学校向け作品アーカイブです。

## 構成

- Vercel: 静的ページとNode.js Functionsの配信
- Hono: 同一オリジンの`/api/*`
- Supabase Auth: メールアドレス＋パスワード認証
- Supabase Postgres: プロフィール、作品、タグ、イベント、通知の永続化
- Prisma ORM: スキーマ、マイグレーション、APIからのデータ操作
- Supabase Storage: アバター、作品画像、イベント画像

パスワードはPrismaのテーブルへ保存せず、Supabase Authだけが管理します。

## 環境変数

`.env.example`を参考に、ローカルでは`.env`、VercelではProject SettingsのEnvironment Variablesに設定します。

```env
# Vercel実行時: Transaction pooler (6543)
DATABASE_URL="postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# ローカルのPrisma migration: Session pooler (5432)
DIRECT_URL="postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@REGION.pooler.supabase.com:5432/postgres"

SUPABASE_URL="https://PROJECT_REF.supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
SUPABASE_STORAGE_BUCKET="archive-media"
SESSION_SECRET="32文字以上のランダム文字列"
```

`SUPABASE_SERVICE_ROLE_KEY`はブラウザへ公開しないでください。DBパスワードに記号が含まれる場合はURLエンコードを1回だけ行います。

## Supabase側の準備

1. Dashboardの`Connect`からSession poolerとTransaction poolerのURLを取得する。
2. Transaction poolerのURL（ポート`6543`）を`DATABASE_URL`に設定する。
3. Session poolerのURL（ポート`5432`）を`DIRECT_URL`に設定する。
4. Storageに`archive-media`というpublic bucketを作成する。
5. AuthのURL Configurationに`http://localhost:8000`とVercelの本番URLを追加する。

## ローカル開発

```bash
npm install
npm run migrate:deploy
npm run dev
```

- 画面: `http://localhost:8000/`
- API: `http://localhost:8000/api/health`

## Vercelへのデプロイ

1. GitHubなどへこのフォルダーをリポジトリとしてpushする。
2. Vercelで`Add New > Project`からリポジトリをImportする。
3. Framework Presetは`Other`のままにする。
4. 上記の環境変数をProductionとPreviewに登録する。
5. Deployを実行する。
6. 発行されたURLをSupabase AuthのSite URLとRedirect URLsに追加する。

Vercelへ`DIRECT_URL`を登録しない場合、Prisma Client生成は`DATABASE_URL`を使用します。マイグレーションはローカルから実行してください。

## 主なAPI

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/PATCH /api/profile`, `POST /api/profile/avatar`
- `GET/POST /api/works`, `GET/POST /api/works/draft`
- `GET/POST/PATCH/DELETE /api/events`
- `GET /api/notifications`
