# 開発ガイド

- React + TypeScript + Vite を使用します。Node.js は 24.x、パッケージ管理は npm です。
- このクラウド環境はタスクごとに分離されています。既存のチェックアウトを使用し、ユーザーが明示的に依頼しない限り Git worktree を作成しないでください。
- 依存関係は `npm ci` で導入し、依存変更時は `package-lock.json` も更新してください。
- 変更後は `npm run lint` と `npm run build` を実行し、結果を報告してください。
- UI 変更時は PC・スマホの幅、見出し構造、読みやすさ、横スクロールの有無を確認してください。
- GitHub Pages のベースパス `/guild-keeper/` を維持してください。アセットは import または `import.meta.env.BASE_URL` を使って参照してください。
- 本初期化の範囲は開発基盤のみです。別途依頼されるまではゲームロジックやバックエンドを追加しないでください。
- シークレット、`node_modules/`、`dist/` をコミットしないでください。
- 公開は `main` への push 後に GitHub Actions が行います。ローカルビルドの成功だけで公開済みとは報告しないでください。
