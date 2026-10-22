# Guild Keeper

React + TypeScript + Vite による倉庫ピッキングゲームです。v0.1 では、96個のアイテムから勇者ひとりの固定注文を探して納品し、タップで並べ替える最小 MVP を遊べます。PC・スマートフォンに対応しています。

Guild Keeper（仮）は、RPG 世界の倉庫番として大量の装備や消耗品を探し、整理し、アップグレードや自動化で作業を効率化していくブラウザゲームです。倉庫作業とその改善を中心とし、ギルド経営や戦闘を主目的にはしません。

## 仕様・実装計画

- [ゲーム仕様書](docs/GAME_DESIGN.md)：ゲームデザインの正本。コンセプト、基本ループ、確定事項と未決定事項
- [実装計画書](docs/IMPLEMENTATION_PLAN.md)：Phase 0〜6 の長期計画・完了条件・テスト方針
- [機能バックログ](docs/FEATURES.md)：選択できるゲーム機能、依存関係、進捗
- [開発ガイド](AGENTS.md)：開発時に守るルール

v0.1 は Phase 1 の基本操作と注文完了の確認（F-007）を実装しています。固定注文の連続表示は MVP の暫定挙動です。正式な日次サイクル（F-009）、入荷、保存、成長・自動化は未実装です。正式な機能完了は実装 PR の main マージ時となります。

ユーザーが次に追加したいゲーム機能を選び、Codex が依存関係と内部タスクを整理して実装します。「今、何が作れる？」と尋ねると、最新の `main` と進行中の PR に基づく候補を提示します。フェーズは厳密な着手順ではなく、個々の機能の依存関係で判断します。明示的に選択されるまで候補の実装は開始しません。

## v0.1 の遊び方

1. 注文書の品名と数量を確認し、倉庫をスクロールして品を探します。
2. 品をタップ・クリックして「納品する」を押すと、1個ずつ渡せます。納品した品は在庫からなくなり、空き枠になります。不要な品を渡そうとしても在庫は減りません。
3. 並べ替えるときは品を選び、「入れ替える」→ 移動先の枠をタップします。品同士の入れ替えと空き枠への移動ができます。選んだ元の枠を押すと移動をキャンセルでき、「選択を解除」でも取り消せます。
4. 注文完了後に「次の注文へ」で進みます。3件すべてを終えると「最初から遊ぶ」で在庫・配置・注文を初期状態に戻せます。

ドラッグや制限時間はありません。ページ移動はなく、主に倉庫一覧の中をスクロールします。極端に高さが低い画面ではページもスクロールできます。セーブはないため、再読み込みでも最初からになります。絵文字アイコンは端末によって見た目が変わります。

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
npm test         # Node.js 標準ランナーによるロジックテスト
```

ビルド成果物は `dist/` に生成されます。ブラウザでの受け入れテストは Playwright を使います。

```sh
npx playwright install chromium
npm run test:e2e
```

テストは本番ビルドを作成し、ポート 4175 のプレビューを自動起動します。PC とスマホの Chromium でタップ・クリック、全注文の納品、入れ替え、リセット、小画面レイアウトを検証します。既存 Chromium を利用するクラウド環境では次のコマンドで実行できます。

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

ロジックテストは CI でも実行します。E2E は上記コマンドで実行し、実機 Safari / iOS での確認は別途必要です。

## 構成

- `src/App.tsx`: 倉庫・注文・操作 UI
- `src/game/data.ts`: 初期在庫・固定注文・品目データ
- `src/game/game.ts`: UI に依存しないゲーム状態と操作判定
- `tests/`: ロジックとブラウザの受け入れテスト
- `src/App.css`, `src/index.css`: レスポンシブレイアウトと共通スタイル
- `vite.config.ts`: GitHub Pages のベースパス `/guild-keeper/`
- `.github/workflows/deploy.yml`: Lint・ビルド・Pages デプロイ

## GitHub Pages

1. GitHub リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。
2. 初回コミットを `main` に push します。
3. Actions の「Deploy to GitHub Pages」が成功すると https://70nanon.github.io/guild-keeper/ に公開されます。

`main` への push で自動デプロイします。Pull Request は Lint とビルドのみ実行します。Actions タブの `workflow_dispatch` からも `main` を選択して実行できます。Pages の利用可否や権限はリポジトリ設定に依存します。

アセットは import または `import.meta.env.BASE_URL` を使用し、サイトルートを前提としたパスを避けてください。ルーターは未導入です。将来導入する場合は Pages の直接アクセス時の挙動も検討してください。
