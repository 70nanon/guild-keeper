# プレイテストに基づくUI・UX改善の画面確認

[PR #14](https://github.com/70nanon/guild-keeper/pull/14)。main `ba4a4c2`（PR #13マージ済み）が変更前の基準です。通常画面から操作帯・説明・品名を外し、同寸法のセルへ統一。詳細内の代替操作、初回案内、短い出発演出、帰還専用の受領帳へ情報を移します。

| 比較 | PC | スマホ |
| --- | --- | --- |
| 変更前（PR #13） | [基本画面](../inventory-management/inventory-desktop.png) | [基本画面](../inventory-management/inventory-mobile.png) |
| 今回 | [基本画面](compact-desktop.png) | [基本画面](compact-mobile.png) |

- [初回案内](tutorial-mobile.png)
- [出発の演出](departure-mobile.png)
- [帰還リザルトと選別](overflow-mobile.png)

PC 1280×800、スマホ390×664、最小320×568をChromiumで確認しました。スマホ画像はdevice scale factor 3です。セルはPC64px角・スマホ48px角で倉庫と勇者を統一し、アイコンは共通の32px。通常セルに品名はありません。使用数は数字だけにし、倉庫の領域を広げています。

リザルトの閉じる操作と空き／選択数・確定はスクロール中も見つけられる配置とします。帰還時の品と使用済みの消耗品は記録から表示し、選択していない品は勇者・一時選別へ残します。初回案内と出発演出は通常の作業に常設しません。

人による発見性・長期の快適さ・実機iOS／Safariは未確認です。自動操作の成功だけでF-035を完了にしません。
