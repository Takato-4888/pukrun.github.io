# pukrun.github.io
PUKRUNの文化祭の店の管理をするサイト

## 共有データベースの設定

このサイトはSupabaseで販売記録・材料費・価格設定を端末間でリアルタイム同期します。`supabase-config.js` にはSupabaseのProject URLとpublishable keyを設定します。publishable keyはブラウザーに公開される値で、秘密鍵や `service_role` keyは使用しないでください。

SupabaseのSQL Editorで `supabase-setup.sql` の内容を実行してください。これは共有状態テーブル、更新用関数、読み取り権限、Realtime配信を設定します。更新関数は各変更をDB上で直列化するため、同時操作による記録の上書きを防ぎます。

このサイトはログインなしで誰でも記録の追加・変更・削除ができる設定です。データベースにアクセスできる人なら操作できるため、公開範囲に注意してください。

共有テーブルが空の場合、最初に接続した端末の `localStorage` データを初期値として登録します。既存記録を引き継ぐときは、データがある端末から先にサイトを開いてください。
