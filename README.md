# Guild Keeper

React + TypeScript + Vite によるゲーム開発基盤です。現在は仮タイトルと準備中の画面のみで、ゲームロジックは実装していません。PC・スマートフォンに対応したレスポンシブ UI を用意しています。

Guild Keeper（仮）は、RPG 世界の倉庫番として大量の装備や消耗品を探し、整理し、アップグレードや自動化で作業を効率化していくブラウザゲームです。倉庫作業とその改善を中心とし、ギルド経営や戦闘を主目的にはしません。

## 仕様・実装計画

- [ゲーム仕様書](docs/GAME_DESIGN.md)：ゲームデザインの正本。コンセプト、基本ループ、確定事項と未決定事項
- [実装計画書](docs/IMPLEMENTATION_PLAN.md)：Phase 0〜6 の長期計画・完了条件・テスト方針
- [機能バックログ](docs/FEATURES.md)：選択できるゲーム機能、依存関係、進捗
- [開発ガイド](AGENTS.md)：開発時に守るルール

現在は Phase 0（開発基盤）が実装済みで、Phase 1 以降は未実装です。ドキュメント内の成長・アップグレード・自動化は今後の構想を含みます。

ユーザーが次に追加したいゲーム機能を選び、Codex が依存関係と内部タスクを整理して実装します。「今、何が作れる？」と尋ねると、最新の `main` と進行中の PR に基づく候補を提示します。フェーズは厳密な着手順ではなく、個々の機能の依存関係で判断します。明示的に選択されるまで候補の実装は開始しません。

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
