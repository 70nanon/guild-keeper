# Guild Keeper

React + TypeScript + Vite によるゲーム開発基盤です。現在は仮タイトルと準備中の画面のみで、ゲームロジックは実装していません。PC・スマートフォンに対応したレスポンシブ UI を用意しています。

## 開発

Node.js 24.x と npm を使用します（`.nvmrc` 参照）。外部サービスや環境変数は不要です。

```sh
npm ci
npm run dev
```

開発サーバーの `/guild-keeper/` を開いてください。

```sh
npm run lint     # Oxlint による静的解析
npm run build    # TypeScript の型チェックと本番ビルド
npm run preview  # dist のローカル確認
```

ビルド成果物は `dist/` に生成されます。ゲームのユニットテストはまだありません。

## 構成

- `src/App.tsx`: 初期画面
- `src/App.css`, `src/index.css`: レスポンシブレイアウトと共通スタイル
- `vite.config.ts`: GitHub Pages のベースパス `/guild-keeper/`
- `.github/workflows/deploy.yml`: Lint・ビルド・Pages デプロイ

## GitHub Pages

1. GitHub リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。
2. 初回コミットを `main` に push します。
3. Actions の「Deploy to GitHub Pages」が成功すると https://70nanon.github.io/guild-keeper/ に公開されます。

`main` への push で自動デプロイします。Pull Request は Lint とビルドのみ実行します。Actions タブの `workflow_dispatch` からも `main` を選択して実行できます。Pages の利用可否や権限はリポジトリ設定に依存します。

アセットは import または `import.meta.env.BASE_URL` を使用し、サイトルートを前提としたパスを避けてください。ルーターは未導入です。将来導入する場合は Pages の直接アクセス時の挙動も検討してください。
