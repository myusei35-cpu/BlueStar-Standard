/* このファイルは拡張機能の list_extractor.js の『メルカリそのまま』の枠を
   そのまま持ってきたもの。アプリはページを開くたびにこれを流し込む。
   ★直す時は拡張機能側を直してから、ここへ写すこと（二重に作らない）。
   ★写した日: 2026-08-08 */

/* =============================================================================
   メルカリそのまま（2026-08-07 新規・独立ブロック）
   -----------------------------------------------------------------------------
   ★これは他のどの機能とも共有しない完全に独立した枠。
     既存の関数を1つも呼ばず、既存の変数も1つも読まない。
     ここを消しても他は一切影響を受けない。逆も同じ。

   ねらい（ユーザー指示）
     「メルカリとまったく同じものを全部出せ。フィルターや照合なしで」
     一覧はメルカリ本物をそのまま使う。絞り込みも並び順もメルカリのUIで操作する。
     こちらが足すのは次だけ。
       ・上に細い帯（仕入元の写真／型番／仕入値／売・益の目安）
       ・タイル1枚ずつの ✕（消す・戻せる）
       ・画像を大きく（列数を減らす）
       ・画像の下にタイトル（メルカリのアプリと同じ見え方）

   動く条件: jp.mercari.com/search で __msqraw=1 が付いている時だけ。
   ========================================================================== */
(() => {
  'use strict';
  /* ★SP(URLの中身)は、この枠の全体から使う。
     try の中で宣言すると外から見えず、帯を作る所で「SPが無い」で落ちて
     握りつぶされる（2026-08-08 実機で帯も✕もタイトルも1つも出なかった原因）。 */
  /* ★ここから下の8つは、レンズの経路（すぐ下の lensStart）から使う定数。
     ★2026-08-14 実機で捕まえた不具合の直し: これらは元々1300行目以降にあり、
       31行目の lensStart() から呼ばれる lStateWrite の中で
       「Cannot access 'LRUN' before initialization」で毎回落ちていた。
       catch が握りつぶすため、症状は紫ボタンを押した時の
       「進行の記録が読めません」だけで、原因が見えなかった。
       ★同じ型を何度も踏んでいる。レンズから使う物はここより上に置くこと。 */
  const LENS_HOST = /(^|\.)lens\.google\.com$/.test(location.host)
    || (/(^|\.)google\.com$/.test(location.host)
        && /[?&](vsrid=|udm=44|tbs=sbi|source=lns\.web)/.test(location.search));
  const LFEE = { purchase: 770, shipping: 750, sellRate: 0.10, outsource: 500 };
  /* ★2026-09-12 PC側の MSQ_NERAU_SITA と同じ値。ユーザーの言葉:
       「電脳は2000円」「タイルの予測計算は2000円以下でもいいぞ。店舗では500円や330円もあり得る」
     ＝タイルの帯はこの線で消さない。色だけ分ける（ネットで買える／店舗だけ）。
     ★grep用の目印: 利益の基準は1か所 */
  const RAW_NERAU_SITA = 2000;
  const LCOND_RANK = ['new', 'likenew', 'good', 'fair', 'poor', 'bad', 'unknown'];
  const LCOND_LABEL = {
    new: '新品、未使用', likenew: '未使用に近い', good: '目立った傷や汚れなし',
    fair: 'やや傷や汚れあり', poor: '傷や汚れあり', bad: '状態が悪い', unknown: '状態不明'
  };
    const LRANK_TO_COND = {
    '新品': 'new', '未使用品': 'new',
    '中古A': 'likenew', '中古B': 'good', '中古C': 'fair', '中古D': 'poor',
    'ランクS': 'new', 'ランクA': 'likenew', 'ランクB': 'good', 'ランクC': 'fair', 'ランクD': 'poor',
    /* ブランディアのコンディション表示も同じ内部区分へ変換する。 */
    '未使用': 'new', '新品同様': 'likenew', '美品': 'likenew', 'きれいめ': 'good',
    'ふつうに使える': 'fair', '使用感あり': 'poor', '難あり': 'bad',
    /* トレファク詳細の「コンディション」表記も内部区分へ合わせる。 */
    '目立った傷や汚れなし': 'good', '使用感をあまり感じない': 'good',
    'やや傷や汚れがあり': 'fair', '傷や汚れあり': 'poor',
    '未使用に近い': 'likenew', '全体的に状態が悪い': 'bad'
  };
  const LRUN = 'MSQRUN:';
  const LMIN_RIEKI = 1000;      /* これ未満を「利益未達」とする（ユーザー指定） */
  const LTOMARU = 2;            /* この数だけたまったら止まる（ユーザー指定） */

  /* ★Lens結果ページは、このIIFEの先頭でルーティングして途中returnする。
     そのため通常ページ用の下側宣言（RAW_SHIIRE と高値要素・一般語の配列）は、
     そこから呼ぶ逆引き処理では初期化前になる。ここは同じ値を先に
     初期化して、Lens→逆引きの経路でも全商品共通で利用できるようにする。 */
  var RAW_SHIIRE = [
    ['セカスト', 'https://www.2ndstreet.jp/search?keyword=', 'https://www.2ndstreet.jp/'],
    ['トレファクONLINE', 'https://ec.treasure-f.com/search?word=', 'https://ec.treasure-f.com/'],
    ['トレファクファッション', 'https://www.trefac.jp/store/search_result.html?srchword=',
      'https://www.trefac.jp/', '&step=1'],
    ['ブランディア', 'https://sa.brandear.jp/search/list/?SearchFullText=', 'https://sa.brandear.jp/'],
    ['カインドオル', 'https://shop.kind.co.jp/search?q=', 'https://shop.kind.co.jp/'],
    ['ヤフオク', 'https://auctions.yahoo.co.jp/search/search?p=', 'https://auctions.yahoo.co.jp/']
  ];
  var HIGH_MATERIALS = [
    'カシミヤ','モヘア','シルク','ウール','リネン','レザー','スエード','アンゴラ','アルパカ',
    'インドコットン','オーガニックコットン','cashmere','mohair','silk','wool','linen','leather','suede'
  ];
  var HIGH_COLORS = ['ブラック','ネイビー','black','navy'];
  var HIGH_SIZES = ['XL','XXL','2XL','3XL','44','46','48','50','52'];
  var HIGH_WORDS = ['コラボ','限定','collab','limited','supreme','off-white','offwhite'];
  /* PC版の逆引き一括 MSQ_TAKANE.zenpan / katego から移した
     高値・特徴語。検索語の候補に使うだけで、仕入先カードを無条件通過させない。 */
  var RAW_GYAKU_TAKANE_ZENPAN = [
    'カシミヤ','カシミア','カシミア100','モヘア','モヘヤ','アルパカ','ベビーアルパカ','アンゴラ','ウール','ヒツジ',
    'レザー','牛革','山羊','山羊革','やぎ革','ワニ','シボ革','スエード','スウェード','エナメル',
    'ダウン','インナーダウン','ライトダウン','シルク','絹','リネン','麻','インドコットン','ナイロン','キャンバス','コーデュロイ',
    'ツイード','ヘリンボーン','ジャガード','ベロア','ベルベット','ダブルフェイス','キルティング','メルトン','シャギー','リブニット','チュール','シフォン','レース','ケミカルレース','総レース','部分レース',
    'ロロピアーナ','ムーンブルック','ジョシュアエリス','リアルファー','ファー','ムートン','毛皮','セーブル','チンチラ','ミンク','フォックス','ラクーン','ラビット','きつね','狐','タヌキ','たぬき','うさぎ','ウサギ',
    '花柄','フラワー','小花柄','バラ柄','薔薇柄','ドット','ボーダー','ストライプ','マルチストライプ','マルチボーダー','チェック柄','タータンチェック','グレンチェック','バッファローチェック','オンブレチェック','ぼんやりチェック','幾何学模様','透かし模様','パッチワーク','裏地総柄','総柄','インディゴ','藍染','手染め',
    'ロゴ','ビッグロゴ','ロゴ刺繍','プリント','ペイント','刺繍','インド刺繍','総刺繍','ワッペン','和柄',
    '金ボタン','銀ボタン','シェルボタン','ボタンフロント','ハーフボタン','フリル','ラッフル','袖フリル','ピコフリル','首元フリル','全体フリル','ツイードフリル',
    'ノーカラー','ハイネック','セーラーカラー','ケープ','ケープカラー','タートルネック','ボリュームネック','女優襟','Vネック','ティアード','ギャザー','斜めギャザー','変形','アシメ','アシンメトリー','左右非対称','切り替え','バックオープン','ラグラン','リンガー','カシュクール','ペプラム','パイピング','ボウタイ','ベルト','ベルト付き','レザーパッチ','ボックスタグ','クリーニングタグ',
    'グラデーションカラー','くすみカラー','奇抜色','パステルカラー','キャメル','エルメス色','黒と金','トラックジャケット','トラックスーツ','トラックパンツ','スリーライン','トレフォイル','プリーツ','ダウンジャケット','ダウンコート','フルジップ','ダメージ加工','スキニー','ロング','マキシ','マキシ丈','ミモレ丈','ショート丈','オーバーサイズ','ビッグサイズ','フレア','Aライン','ポンチョ',
    'セルヴィッジ','セルビッジ','セルビッチ','赤耳','GORE-TEX','ゴアテックス','USA製','Made in USA','タロンジップ','TALON','限定コラボ','廃盤','数量限定','完売品','Y2K','90S','80S','日本製','アメリカ製','イタリア製','フランス製','イギリス製','英国製','ドイツ製','スペイン製','ポルトガル製','スコットランド製'
  ];
  var RAW_GYAKU_TAKANE_KATEGO = {
    '靴': ['ブーツ','フラットシューズ','スニーカー','レザー','厚底','イタリア製','フランス製'],
    'ワンピース': ['ロング','マキシ','カシミヤ','モヘア','アルパカ','ニット','ハイネック','セットアップ','フリル','レース'],
    'コート': ['トレンチコート','ウールトレンチ','オーバーサイズ','ダブル','ベルト付き','リバーコート','メルトン','ノーカラー','ロング','ロングコート','カシミヤ','カシミヤ100','モヘア','アルパカ','ナポレオンコート','ポンチョ','ラビットファー','クリーニングタグ','ダッフル','ヘリンボーン','グレンチェック','オンブレチェック','チェスター','ダブルチェスター','ガウン','ラップ','フード','ムーンブルック','ジョシュアエリス','アマカ','ハイク'],
    'ニット': ['オーバーサイズ','カシミヤ','モヘア','アルパカ','ハイネック','シャギー','リブニット'],
    'カーディガン': ['オーバーサイズ','カシミヤ','モヘア','アルパカ','ハイネック','シャギー','リブニット'],
    'デニム': ['セルヴィッジ','セルビッジ','セルビッチ','赤耳','ヒゲ','ハチノス','スラッシュディテール','サイドカット','サイドカットデニム','ダブルウエスト','ボタンフライ','ジッパーフライ','ウエストゴム','ヘビーオンス','oz','フレアデニム','ハイウエスト','パウダーデニム','パウダースキニー','濃紺','インディゴ','インディゴブルー','Made in USA','USA製','日本製','ビッグサイズ','革パッチ','マウジー','ヤヌーク','オアスロウ','日本地図'],
    'パンツ': ['ポリウレタン','ストレッチ'],
    'Tシャツ': ['人物柄','イラスト','写真','プリント','ワッペン','ロゴ刺繍','ビッグロゴ'],
    'カットソー': ['人物柄','イラスト','写真','プリント'],
    'スーツ': ['ウール','ストライプ','セットアップ','ロロピアーナ','リバーシブル','和柄','総刺繍','タートルネック','ケミカルレース','ノーカラー','カシミヤ','シルク','モヘア','2ボタン','ラペルが細い','3ピース','生地のタグあり','リネン','ストレッチ','ハイストレッチ','ウォッシャブル','形状記憶','ポリウレタン','紺ブレ','ブレザー','金ボタン','銀ボタン','本切羽','2段返り3ボタン','アンコン','Vネック','エポカウオモ'],
    'セットアップ': ['セットアップ','ウール','ストライプ','リネン','3ピース']
  };
  var RAW_GYAKU_TAKANE_GARA = ['ノバチェック','メガチェック','シャドーホース','イントレチャート','ガンチーニ','ヴァラ','ココマーク','オーブ','アナグラム','トリオンフ','マカダム','トロッター','ズッカ柄','ズッキーノ柄','ズッキーノ','グッチシマ','シェリーライン','マイクロGG','GGスプリーム','GGキャンバス','ホースビット','アンプラント','ヴェルニ','ダミエ','イディール'];
  var RAW_GYAKU_TAKANE_LOW = ['コットン','ポリエステル','アクリル','レーヨン','綿','化繊','普通','cotton','polyester','acrylic','rayon','中国製','made in china','ラペルが太い','3ボタン','上着のみ','地味','ブラウン','ウール100'];
  /* PC版辞書の保留・記録欄も同じ辞書として保持する。
     horyu/memo はPC版と同じく現時点では検索語に使わない。 */
  var RAW_GYAKU_TAKANE_HORYU_IRO = ['ブラック','ネイビー','グレー','ベージュ','ブルー','シルバー','ライトブルー','オレンジ','黄色','白','黒','トレンドカラー'];
  var RAW_GYAKU_TAKANE_HORYU_SIZE = ['L','XL','2XL','3L','Lサイズ','XLサイズ','40サイズ','22.5cm','23cm','23.5cm','24cm','26cm','26.5cm','27cm','27.5cm','36','37','38','40','41','42','W31','W32','W33','W34','W35','W36','W37'];
  var RAW_GYAKU_TAKANE_MOTO16 = {
    zairyou: ['カシミヤ','モヘア','シルク','ウール','リネン','レザー','スエード','アンゴラ','アルパカ','cashmere','mohair','silk','wool','linen','leather','suede'],
    iro: ['ブラック','ネイビー','black','navy'],
    saizu: ['XL','XXL','2XL','3XL','44','46','48','50','52'],
    go: ['コラボ','限定','collab','limited','supreme','off-white','offwhite']
  };
  var RAW_GYAKU_TAKANE_BAIRITSU = {
    'ベロア':3.65,'トレンチコート':3.33,'ワッペン':3.09,'ロゴ刺繍':3.07,'トラックジャケット':2.50,'ボタンフライ':2.14,'スリーライン':2.13,
    'プリーツ':1.92,'セットアップ':1.87,'ノーカラー':1.85,'ダウンジャケット':1.85,'リバーシブル':1.83,'ロングコート':1.77,'フルジップ':1.73,'ナイロン':1.72,
    'ダメージ加工':1.66,'カシミヤ':1.59,'ベルト':1.57,'ロング':1.52,'キルティング':1.52,'マキシ丈':1.50,'Aライン':1.48,'スキニー':1.48,
    'ノバチェック':1.35,'ギャザー':1.35,'トレフォイル':1.37,'トラックパンツ':1.37,'花柄':1.30,'ウール':1.21,'ファー':1.17,'Vネック':1.17,
    'トラックスーツ':2.07,'ダウンコート':1.85
  };
  var RAW_GYAKU_TAKANE_MEMO = [
    'ダウンが多いほど高い','カシミア混とカシミア100は別','ブラウンのファーは落ち目','パステルカラーは人気',
    'ポケット下の布が長い（ダッフルの良ディテール）','下のボタンから長いもの（コート）','ダッフルのファー付きは年式が古いと安い',
    'ウール系のファー系はノーブランドでも5000円以上つくこと多い','ダブルチェスターコート ▶ シングルチェスターコート',
    'ビジネススーツのVネック系はグレーで-1000','ビジネススーツの通常はグレー・ベージュで-1000','デニムのレングスは短くても買われる',
    'レディースデニムはサイズによる単価・回転への影響なし','3L以上のアウターは1008円前後・1スタが狙い目','内側のブランドロゴの刺繍（デニム）',
    '後ろのパッチ（オアスロウ・日本地図・107はいける）','ボタン裏番号表記（リーバイス）','波打ってるキルティング','パジャマシャツ×セットアップ','ニット×ワンピース',
    'くすみカラーのダッフルはシップス・グリーンレーベルに多い','デニムは色が濃いほど高い（薄いのは安値）','デニムのウエストは31以上・大きいほど高い（メンズ）',
    'スーツで省くべき: ラペルが太い／3ボタン／上着のみ／黒・紺・グレー以外／地味な色','生産国 ⭕日本・アメリカ・ヨーロッパ ❌中国'
  ];
  var COMMON_MATERIALS = [
    'コットン','ポリエステル','ナイロン','アクリル','レーヨン','綿','化繊',
    'cotton','polyester','nylon','acrylic','rayon'
  ];
  var COMMON_COLORS = [
    'ホワイト','レッド','ピンク','イエロー','オレンジ','パープル','ベージュ',
    'グレー','ブラウン','white','red','pink','yellow','orange','purple',
    'beige','gray','grey','brown','GRY','BLK','WHT','NVY','BEI'
  ];
  /* 型番抽出もLens結果ページのreturn前に必要。後段の本体宣言は
     通常ページ用に同じ値を再代入する。 */
  var RAW_SIZE_LIKE = /^(XS|S|M|L|XL|XXL|F|FREE|フリー|[0-9]{1,3}(cm|号)?)$/i;
  var RAW_ERA_LIKE = /^(?:\d{2}s|(?:19|20)\d{2}|\d{2,4}年代?|[’']\d{2}s?|vintage|ヴィンテージ|ビンテージ|\d{2,4}(?:[-_/ ]?\d{2,4})?[-_ /]?(?:SS|AW|FW|HS|PF|PS))$/i;
  var RAW_COLOR_LIKE = /^(SLV|BLK|WHT|GLD|BLU|GRN|RED|PNK|BRN|GRY|GRAY|NVY|BEG|ORG|PPL|IVR|CML|KHK|YEL|TAN|WINE|BOR|MULTI|CLR|SMK|GRD|MIR|PLD|MOC|CHR|OFF|NAT|MEN|WOMEN|UNISEX|メンズ|レディース|ユニセックス|キッズ|ブラック|ホワイト|シルバー|ゴールド|ブルー|グリーン|レッド|ピンク|ブラウン|グレー|ネイビー|ベージュ|オレンジ|パープル|イエロー|カーキ|スモーク|ミラー|マルチ|クリア)$/i;
  var RAW_MODEL_LABEL_RE = new RegExp(
    '(?:型番|型式|品番|品\\s*番|商品型番|メーカー\\s*(?:品番|型番)|' +
    'モデル\\s*(?:番号|ナンバー|No\\.?)|model\\s*(?:no\\.?|number)|' +
    'reference|ref\\.?|リファレンス(?:ナンバー)?)' +
    '[\\s\\]\\}】》>\\)）]*[\\s]*[:\\-=/|・･>→#.,、。~ー‐–—―]{0,2}[\\s]*' +
    '([A-Za-z0-9][A-Za-z0-9\\-_/\\.]{2,23})', 'gi');
  /* Lens→逆引きは下側の通常メルカリ枠より先にreturnするため、
     ここで使う辞書・カテゴリはこの位置で初期化しておく。通常枠側の
     CATEGORY_TOKENSは後段で同じ内容を再代入する。 */
  var CATEGORY_TOKENS = ['ボトム','トップス','アウター','服飾雑貨','ストール','マフラー','キャップ','帽子',
    'タンクトップ','Tシャツ','ロンT','カットソー','ブラウス','シャツ','ポロシャツ','パーカー','パーカ',
    'スウェット','トレーナー','カーディガン','ニット','セーター','ベスト','リバースウィーブ',
    'フィールドジャケット','ミリタリージャケット','デニムジャケット','ライダースジャケット',
    'テーラードジャケット','ダウンジャケット','レザージャケット','ムートンジャケット',
    'ボンバージャケット','フライトジャケット','Gジャン','スカジャン','MA-1','ノーカラージャケット',
    'ノーカラーコート','トレンチコート','チェスターコート','モッズコート','ステンカラーコート',
    'ジャケット','ブルゾン','コート','ダウン','マウンテンパーカ','ナイロンジャケット','ショートパンツ',
    'デニムパンツ','ワイドパンツ','テーパードパンツ','カーゴパンツ','パンツ','ジーンズ','デニム',
    'スラックス','チノパン','スカート','ワンピース','ドレス','セットアップ','バッグ','リュック','トート',
    'クラッチ','ハンドバッグ','ボディバッグ','スニーカー','ブーツ','パンプス','サンダル','ローファー',
    'シューズ','長財布','二つ折り財布','2つ折り財布','折り財布','財布','キーケース','カードケース',
    '名刺入れ','ポーチ','ベルト','サングラス','メガネ','眼鏡','腕時計','時計','ネックレス','ブレスレット',
    'リング','指輪','ピアス','イヤリング'];
  var MSQ_GENERIC = ['腕時計','クォーツ腕時計','ソーラー腕時計','デジタル','アナログ','デジアナ','自動巻','手巻','時計',
    'ジャケット','ブルゾン','コート','パンツ','スカート','ワンピース','シャツ','Tシャツ','カットソー',
    'ニット','セーター','カーディガン','ベスト','パーカー','スウェット','トレーナー','ブーツ','スニーカー',
    'サンダル','バッグ','財布','レザー','ラバー','コットン','ナイロン','ポリエステル','ウール','デニム',
    'スウェード','ステンレス','シルバー','プラスチック','化学繊維'];
  var RAW_GYAKU_CAT_NAKAMA = [
    ['ジャケット','ブルゾン','ジャンパー','アウター','コート','ブレザー','ダウンジャケット','ダウン','MA-1','スタジャン','モッズコート'],
    ['ニット','セーター','カーディガン','ニットカーディガン'],
    ['パーカー','パーカ','スウェット','スエット','トレーナー','フーディ','フーディー','スウェットフーディー','スウェットフーディ','スウェットパーカー','hoodie','sweat hoodie','sweatshirt','pullover hoodie'],
    ['Tシャツ','カットソー','トップス','シャツ','ブラウス','ロンT','長袖Tシャツ','半袖Tシャツ','ノースリーブ','スリーブ','タンクトップ','キャミソール','スウェット','トレーナー','ジャージ'],
    ['パンツ','ズボン','スラックス','デニム','ジーンズ','チノパン','スキニー','ワイドパンツ'],
    ['ワンピース','ドレス','チュニック'], ['スカート','ミニスカート','ロングスカート'],
    ['バッグ','カバン','鞄','トートバッグ','ショルダーバッグ','ハンドバッグ','リュック','バックパック'],
    ['スニーカー','シューズ','靴','ブーツ','パンプス','サンダル','ローファー','革靴'],
    ['財布','長財布','二つ折り財布','折り財布','ウォレット'], ['腕時計','時計','ウォッチ'],
    ['帽子','キャップ','ハット','ニット帽','ニットキャップ'], ['ベルト','サッシュベルト'],
    ['マフラー','ストール','スカーフ'], ['ネックレス','ペンダント'], ['イヤリング','ピアス'],
    ['ショートパンツ','ハーフパンツ','ショーツ','短パン','ハーパン','バミューダパンツ'],
    ['レギンス','スパッツ','タイツ','トレンカ'], ['サロペット','オーバーオール','つなぎ','オールインワン','ジャンプスーツ','コンビネゾン'],
    ['ベスト','ジレ','ダウンベスト'], ['スーツ','セットアップ','アンサンブル'], ['ブレスレット','バングル'],
    ['手袋','グローブ','ミトン'], ['靴下','ソックス','レッグウェア'], ['水着','ビキニ','スイムウェア','スイムスーツ'],
    ['パジャマ','ルームウェア','部屋着','ナイトウェア'], ['名刺入れ','カードケース','パスケース','定期入れ'],
    ['ポーチ','化粧ポーチ','コスメポーチ'], ['ジャージ','トラックジャケット','トラックパンツ','セットアップ']
  ];
  var RAW_GYAKU_SOZAI = [
    ['レザー','革','牛革','山羊革','やぎ革','leather'], ['スエード','スウェード','ヌバック','suede'],
    ['カシミヤ','カシミア','cashmere'], ['シルク','絹','silk'], ['ウール','毛','wool'],
    ['モヘア','mohair'], ['アンゴラ','angora'], ['アルパカ','alpaca'], ['リネン','麻','linen'],
    ['ダウン','down'], ['ファー','fur'], ['ムートン','mouton','shearling'], ['デニム','denim'],
    ['ナイロン','nylon'], ['コットン','綿','cotton'], ['ポリエステル','polyester']
  ];
  var kataBrands = [];
  try {
    var brandCache = JSON.parse(localStorage.getItem('msq_shiire_brands') || 'null');
    if (brandCache && Array.isArray(brandCache.v) && brandCache.v.length >= 1000
      && (!brandCache.t || Date.now() - brandCache.t < 7 * 864e5)) kataBrands = brandCache.v;
  } catch (e) { kataBrands = []; }
  function rawGyakuTakaneYouso(allText, sizeText, category, brand) {
    var out = [], t = String(allText || '').normalize('NFKC').toLowerCase();
    var low = function (v) { return String(v || '').normalize('NFKC').toLowerCase().replace(/[-‐－—_\s　\/.]+/g, ''); };
    var hay = low(t);
    var lowWords = RAW_GYAKU_TAKANE_LOW.map(low);
    var add = function (w) {
      var x = String(w || '').trim();
      if (!x || lowWords.indexOf(low(x)) >= 0 || out.indexOf(x) >= 0) return;
      if (hay.indexOf(low(x)) >= 0) out.push(x);
    };
    RAW_GYAKU_TAKANE_ZENPAN.forEach(add);
    RAW_GYAKU_TAKANE_GARA.forEach(add);
    /* PC版の逆引きがMSQ_TAKANEへ合流させている旧16語も同じように残す。 */
    RAW_GYAKU_TAKANE_MOTO16.zairyou.concat(RAW_GYAKU_TAKANE_MOTO16.iro, RAW_GYAKU_TAKANE_MOTO16.go).forEach(add);
    var cat = String(category || '');
    Object.keys(RAW_GYAKU_TAKANE_KATEGO).forEach(function (k) {
      if (cat.indexOf(k) >= 0 || t.indexOf(k.toLowerCase()) >= 0) RAW_GYAKU_TAKANE_KATEGO[k].forEach(add);
    });
    /* PC版と同じく、保留中の普通の色・サイズは検索語に使わない。 */
    /* ブランド固有語は辞書が一致したブランドの時だけ使う。 */
    var bn = low(brand);
    if (bn) {
      var brandWords = {
        'ルイヴィトン': ['モノグラム','エピ'], 'louisvuitton': ['モノグラム','エピ'],
        'グッチ': ['GG','ジャッキー','スーキー','ソーホー','マーモント','バンブー'], 'gucci': ['GG','ジャッキー','スーキー','ソーホー','マーモント','バンブー'],
        'バーバリー': ['ホース'], 'burberry': ['ホース'], 'フェンディ': ['ズッカ','モンスター'], 'fendi': ['ズッカ','モンスター'],
        'コーチ': ['モノグラム'], 'coach': ['モノグラム']
      };
      Object.keys(brandWords).forEach(function (k) { if (bn === low(k) || bn.indexOf(low(k)) >= 0) brandWords[k].forEach(add); });
    }
    /* 長い語を優先し、同じ語の短い重複を落とす。PC版の並びと同じ考え方。 */
    return out.filter(function (w) {
      return !out.some(function (v) { return v !== w && low(v).indexOf(low(w)) >= 0 && v.length > w.length; });
    });
  }
  function rawGyakuKoyuuFromDai(dai, brand) {
    var s = String(dai || '').replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
      .replace(/(?:新品|未使用|美品|極美品|良品|中古|送料無料|売切|売り切れ|SOLD)/gi, ' ')
      .replace(/[\s　]+/g, ' ').trim();
    var bn = String(brand || '').normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '');
    var out = [];
    s.split(/[\s　/・×x&,，、]+/).forEach(function (x) {
      var n = String(x || '').normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '');
      if (!x || x.length < 3 || (bn && n === bn) || CATEGORY_TOKENS.some(function (c) { return n === String(c).toLowerCase(); })
        || MSQ_GENERIC.some(function (g) { return n === String(g).toLowerCase(); })
        || /^(?:\d{2}s|(?:19|20)\d{2}|\d{2,4}年代?|[’']\d{2}s?|vintage|ヴィンテージ|ビンテージ|\d{2,4}(?:[-_/ ]?\d{2,4})?[-_ /]?(?:SS|AW|FW|HS|PF|PS))$/i.test(x)) return;
      if (!/\d/.test(x) && !/[A-Za-z]/.test(x) && x.length < 4) return;
      if (out.indexOf(x) < 0) out.push(x);
    });
    return out.slice(0, 4).join(' ');
  }

  /* ★2026-08-15 検証で見つけた不具合の直し（3つ目の同じ型）。
     rawNum / rawEsc / RAW_BUILD は元々3450行あたりにあったが、
     レンズ結果ページでは31行目のルーティングで lensStart() を呼んで return するため、
     あの行は【一度も実行されない】。その状態で
       ・lensStart が rawNum(src.cost) を呼ぶ
       ・lensOwari が rawEsc(...) を呼ぶ
     ので「Cannot access 'rawNum' before initialization」で必ず落ちる。
     しかも try{ lensStart(); }catch(e2){} が握りつぶすので、症状は
     「仕入値が渡っていない」「結果ツールのボタンが出ない」としてしか見えない。
     ★レンズから使う物はここより上（＝ルーティングより前）に置くこと。 */
  const rawNum = (v) => Number(v) || 0;

  /* ===== 型番の共有（GAS mode=kata）================================
     ★2026-08-27 クエッタの拡張機能から【1行も書き換えずに】写した。
       取得先は _hotDictUrl()＝🗂に貼るGASと同じ。
       60日／3万件まで／keep が付いた物は期間でも容量でも消さない。
       30分に1回まで／失敗しても止まらない／手元が新しければ上書きしない。
     ★直す時は【あちらを直してから写し直す】。片方だけ直すと必ずずれる。 */
  function msqRecPushToSheet(url, rec) {
    const gas = _hotDictUrl();
    if (!gas || !url || !rec) return;
    const body = {
      mode: 'rec',
      rec: {
        url: msqRecKey(url),
        site: (function () { try { return new URL(url, location.href).hostname; } catch (e) { return ''; } })(),
        at: new Date(rec.at || Date.now()).toLocaleDateString('ja-JP'),
        cost: rec.cost || 0, cond: rec.cond || '',
        low: rec.low || 0, high: rec.high || 0, n: rec.n || 0,
        profit: rec.profit == null ? 0 : rec.profit,
        model: rec.model || '', keep: !!rec.keep,
      },
    };
    /* ★no-cors で投げる。GASは別ドメインで、返事を読む必要も無い。
       返事を読もうとすると CORS で弾かれて例外になる（セカスト〇✕メモが同じ形）。 */
    try {
      fetch(gas, {
        method: 'POST', mode: 'no-cors',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(body),
      }).catch(() => { });
    } catch (e) { }
  }
  var LAI_KATA_KIRU = /[\s\u3000\/,、・()（）\[\]【】｜|★☆■□●○◆◇▲△▼▽※＊*＞>＜<〜~]+/;
  var LAI_KATA_SIZE = /^(XS|S|M|L|XL|XXL|F|FREE|フリー|[0-9]{1,3}(cm|号)?)$/i;
  var LAI_KATA_ERA  = /^([0-9]{2}s|[0-9]{2,4}年代?|[0-9]{2}(AW|SS)|vintage|ヴィンテージ|ビンテージ)$/i;
  var LAI_KATA_IRO  = /^(SLV|BLK|WHT|GLD|BLU|GRN|RED|PNK|BRN|GRY|GRAY|NVY|BEG|ORG|PPL|IVR|CML|KHK|YEL|TAN|WINE|BOR|MULTI|CLR|SMK|GRD|MIR|PLD|MOC|CHR|OFF|NAT|MEN|WOMEN|UNISEX|メンズ|レディース|ユニセックス|キッズ|ブラック|ホワイト|シルバー|ゴールド|ブルー|グリーン|レッド|ピンク|ブラウン|グレー|ネイビー|ベージュ|オレンジ|パープル|イエロー|カーキ|スモーク|ミラー|マルチ|クリア)$/i;
  var LAI_KATA_ASCII = /^[A-Za-z0-9][A-Za-z0-9\-_\/\.]*$/;
  /* 題から型番を1つ選ぶ。
     ★選び方は【一番長いもの】。実測の理由:
       「25SS/AIR JORDAN PANT BLACK/30/デニム/BLK/無地/HF9291-010//」で
       出てきた順の先頭を採ると 25SS（春夏の札）になる。型番は枝番が付くほど
       長くなるので、長い方が具体的で管理番号や札より型番らしい。 */
  function laiKataFromDai(dai) {
    try {
      var deta = [], mita = {};
      String(dai == null ? '' : dai).split(LAI_KATA_KIRU).forEach(function (raw) {
        var t = String(raw || '').replace(/^[-–—]+/, '').replace(/[-–—]+$/, '').trim();
        if (!t || t.length < 4 || t.length > 24) return;
        if (!/[0-9]/.test(t)) return;                        /* 数字を含まない語は型番ではない */
        if (LAI_KATA_SIZE.test(t) || LAI_KATA_ERA.test(t) || LAI_KATA_IRO.test(t)) return;
        if (/^m[0-9]{10,13}$/i.test(t)) return;              /* メルカリの商品ID */
        if (/^(19|20)[0-9]{2}$/.test(t)) return;             /* 西暦らしき4桁 */
        if (/^[0-9]+(\.[0-9]+)?(円|cm|mm|g|kg|ml|inch|インチ)$/i.test(t)) return;  /* 値段・寸法 */
        if (!LAI_KATA_ASCII.test(t.normalize('NFKC'))) return;   /* 日本語混じりは型番ではない */
        if (mita[t]) return;
        mita[t] = 1;
        deta.push(t);
      });
      if (!deta.length) return '';
      deta.sort(function (a, b) { return b.length - a.length; });
      return deta[0];
    } catch (e) { return ''; }
  }
  /* ★2026-08-26 一括リサーチで確定した型番の入れ物（専用・自己完結）。
       既存の記録(msq_item_records)には触らない。鍵も別にする。
     ★大きさの実測（2026-08-26 セカストで測った）:
         localStorage の合計 388KB / 55鍵。うち367KBはセカスト自身のcookie同意。
         Chromeの1サイトの上限は約5MB → 空きは約4.6MB。
         型番1件は URL+型番+出どころ+日付 で約220バイト。
         → 約2万件入る。セカスト一覧は最大900件/回なので22回ぶん以上。
     ★期間はここ1か所の数字だけで変えられる。 */
  var LAI_KATA_KEY = 'msq_lai_kata_v1';
  /* ★2026-08-26 ユーザー判断『60日、残したいのは無限に残せるがよくないか？
       理由は売れたら自然に表示されなくなるから圧迫は少ないと思われるから』。
     ★そのとおり。売れた商品は一覧に出なくなるので、古い型番は引かれなくなる。
       だから期間より先に効くのは【件数の上限】の方。実測から:
         鍵は goodsId だけにしてあるので1件およそ150バイト。
         空きが約4.6MB → 約3万件。900件/回なら33回ぶん。
     ★keep が付いた物は期間でも容量でも消さない（既存の記録と同じ考え方）。 */
  var LAI_KATA_TTL = 60 * 24 * 60 * 60 * 1000;   /* 60日で消す（keep が付いた物は消さない） */
  var LAI_KATA_MAX = 30000;                      /* これを超えたら古い順に捨てる（keep は最後まで残す） */
  function laiKataYomu() {
    try { return JSON.parse(localStorage.getItem(LAI_KATA_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function laiKataKaku(all) {
    try {
      var ima = Date.now();
      var keys = Object.keys(all);
      /* 期限切れを捨てる。★keep が付いた物は消さない */
      keys.forEach(function (k) {
        var v = all[k];
        if (!v) { delete all[k]; return; }
        if (v.keep) return;
        if (!v.t || (ima - v.t) > LAI_KATA_TTL) delete all[k];
      });
      /* 多すぎる時は古い順に捨てる。★keep が付いた物は最後まで残す */
      keys = Object.keys(all).filter(function (k) { return !all[k].keep; });
      var keepKazu = Object.keys(all).length - keys.length;
      if (keys.length + keepKazu > LAI_KATA_MAX) {
        keys.sort(function (a, b) { return (all[a].t || 0) - (all[b].t || 0); });
        var kesu = keys.length + keepKazu - LAI_KATA_MAX;
        for (var i = 0; i < kesu && i < keys.length; i++) delete all[keys[i]];
      }
      localStorage.setItem(LAI_KATA_KEY, JSON.stringify(all));
    } catch (e) { }
  }
  /* URLの表記ゆれで別物にならないよう、鍵は goodsId で持つ（無ければURLそのまま） */
  function laiKataKagi(u) {
    var t = String(u || '');
    var p = t.indexOf('goodsId/');
    if (p < 0) return t;
    var a = t.slice(p + 8);
    var b = a.indexOf('/');
    return 'goodsId:' + (b > 0 ? a.slice(0, b) : a);
  }
  function laiKataHozon(detailUrl, kata, doko) {
    var all = laiKataYomu();
    var kagi = laiKataKagi(detailUrl);
    var mae = all[kagi];
    all[kagi] = {
      k: String(kata || ''), d: String(doko || ''), t: Date.now(),
      /* 前に「残す」を付けてあれば引き継ぐ */
      keep: (mae && mae.keep) ? 1 : 0,
    };
    if (!all[kagi].keep) delete all[kagi].keep;   /* 0 は書かない（容量を食わないため） */
    laiKataKaku(all);
    /* ★スマホ・アプリと共有するため、スプシにも送る（失敗しても止まらない） */
    try { laiKataPush(kagi, all[kagi]); } catch (e) { }
  }
  /* ★「残す」の付け外し。無期限で残したい商品に使う。
     いまは付ける口を画面に出していないので、必要になったらここを呼ぶ。 */
  function laiKataNokosu(detailUrl, nokosu) {
    var all = laiKataYomu();
    var kagi = laiKataKagi(detailUrl);
    if (!all[kagi]) return false;
    if (nokosu) all[kagi].keep = 1; else delete all[kagi].keep;
    laiKataKaku(all);
    try { laiKataPush(kagi, all[kagi]); } catch (e) { }
    return true;
  }
  try { window.__msqKataNokosu = laiKataNokosu; } catch (e) { }
  /* ===== 型番をスプレッドシートで共有する（PC / スマホ / アプリ）=========
     ★2026-08-26 ユーザー指示『これはスマホでもアプリでも共有しろ』『GASで』。
     ★localStorage は ブラウザ×サイト ごとに分かれるので、そのままでは共有できない。
       既にある調査記録の同期（msqRecPushToSheet / msqRecPullFromSheet）と
       【同じGASのURL】を通す。貼り直す物を増やさないため。
     ★守る規則は、記録の同期と同じ（検査 verify_rec_sync.js が見張っている4点）:
         ① 辞書と同じURLを使い、mode で使い分ける（辞書の動きを変えない）
         ② 手元の控えを主にする。間隔を空ける。手元が新しければ上書きしない
         ③ 失敗しても止まらない（黙って諦める）
         ④ ブロックをまたがない（この一帯は全部このブロックの中）
     ★書くのは1件ずつ。返事は読まない（no-cors）。読もうとするとCORSで弾かれる。 */
  var LAI_KATA_SYNC_KEY = 'msq_lai_kata_synced_at';
  var LAI_KATA_SYNC_MS = 30 * 60 * 1000;   /* 30分に1回まで */
  function laiKataPush(kagi, v) {
    var gas = '';
    try { gas = _hotDictUrl(); } catch (e) { gas = ''; }
    if (!gas || !kagi || !v) return;
    var body = {
      mode: 'kata',
      kata: {
        id: String(kagi),
        k: String(v.k || ''),
        d: String(v.d || ''),
        at: new Date(v.t || Date.now()).toLocaleDateString('ja-JP'),
        keep: !!v.keep,
      },
    };
    try {
      fetch(gas, {
        method: 'POST', mode: 'no-cors',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(body),
      }).catch(function () { });
    } catch (e) { }
  }
  async function laiKataPull(force) {
    var gas = '';
    try { gas = _hotDictUrl(); } catch (e) { gas = ''; }
    if (!gas) return false;
    try {
      var last = Number(localStorage.getItem(LAI_KATA_SYNC_KEY) || 0);
      if (!force && (Date.now() - last) < LAI_KATA_SYNC_MS) return false;
    } catch (e) { }
    try {
      var sep = gas.indexOf('?') >= 0 ? '&' : '?';
      var res = await fetch(gas + sep + 'mode=kata');
      var text = await res.text();
      if (/^\s*</.test(text)) throw new Error('応答がJSONではありません');
      var o = JSON.parse(text);
      var rows = (o && o.rows) || [];
      /* ★2026-08-26 安全弁。実測で分かったこと:
           いまのGASは mode を見ずに【何を聞かれても辞書を返す】。
           ?mode=kata を叩いたら {"rows":[{"kind":"リサーチ","brand":"ナイキ",…}]}
           が353件返ってきた（＝ホット辞書の行）。
         ★GASに mode=kata を足すまでは、辞書の行が型番として取り込まれてしまう。
           型番の行は id を必ず持つ。辞書の行は kind/brand を持ち id を持たない。
           【id を持たない行が混ざっていたら、それは型番タブの返事ではない】と見なして、
           1件も取り込まずに諦める。GASを直せば自然に本物が入る。 */
      if (rows.length && !rows.every(function (r) { return r && r.id; })) {
        try { msqDiary('型番の同期', 'GASがまだ mode=kata に対応していません（辞書の行が返りました）。取り込みは見送りました'); } catch (e2) { }
        return false;
      }
      var all = laiKataYomu();
      var added = 0;
      rows.forEach(function (r) {
        if (!r || !r.id) return;
        var mine = all[r.id];
        var muko = Date.parse(r.at || '') || 0;
        /* ★手元の方が新しければ触らない（自分で調べ直した直後を消さない） */
        if (mine && mine.t && mine.t >= muko) return;
        all[r.id] = { k: String(r.k || ''), d: String(r.d || ''), t: muko || Date.now() };
        if (r.keep) all[r.id].keep = 1;
        added++;
      });
      laiKataKaku(all);
      try { localStorage.setItem(LAI_KATA_SYNC_KEY, String(Date.now())); } catch (e) { }
      try { msqDiary('型番の同期', 'スプシから ' + rows.length + '件（新しく取り込んだのは ' + added + '件）'); } catch (e) { }
      return true;
    } catch (e) {
      try { msqDiary('型番の同期', '失敗: ' + e.message); } catch (er) { }
      return false;
    }
  }
  /* ===== 型番をスプレッドシートで共有する ここまで ===================== */

  /* 一括で確定した型番があれば、それを最優先で札に出す */
  function laiKataKakutei(detailUrl) {
    if (!detailUrl) return null;
    var all = laiKataYomu();
    var v = all[laiKataKagi(detailUrl)];
    if (!v) return null;
    if (v.t && (Date.now() - v.t) > LAI_KATA_TTL) return null;
    return v;
  }
  /* ===== ここまで型番の共有 ===== */


  /* ===== 調べた記録（GAS mode=rec）=================================
     ★2026-08-27 クエッタの拡張機能から【1行も書き換えずに】写した。
       取得先は _hotDictUrl()＝🗂に貼るGASと同じ。🗂を設定すれば記録も入る。
     ★30分に1回まで／失敗しても止まらない／手元が新しければ上書きしない。
     ★直す時は【あちらを直してから写し直す】。片方だけ直すと必ずずれる。 */
  const MSQ_REC_VERSION = 2;
  const MSQ_REC_KEY = 'msq_item_records';
  const MSQ_REC_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30日
  const MSQ_REC_MAX_BYTES = 3 * 1024 * 1024;   // 3MB（5MBの制限に対して余裕を持たせる）
  const MSQ_REC_SYNC_KEY = 'msq_rec_synced_at';
  const MSQ_REC_SYNC_MS = 30 * 60 * 1000;   // 30分に1回まで
  /* ★2026-08-27 これを写し落として ReferenceError になった。
     元(list_extractor.js 289行)では msqRecLoad の直前に宣言されている。 */
  let _msqRecCache = null;
  function msqRecLoad() {
    if (_msqRecCache) return _msqRecCache;
    try {
      const o = JSON.parse(localStorage.getItem(MSQ_REC_KEY) || '{}');
      _msqRecCache = (o && typeof o === 'object') ? o : {};
    } catch (e) { _msqRecCache = {}; }
    return _msqRecCache;
  }
  function msqRecSave(all) {
    _msqRecCache = all;
    try { localStorage.setItem(MSQ_REC_KEY, JSON.stringify(all)); } catch (e) { }
  }
  function msqRecKey(url) {
    try {
      const u = new URL(String(url), location.href);
      return u.origin + u.pathname;
    } catch (e) { return String(url || ''); }
  }
  function msqRecPrune(all) {
    const now = Date.now();
    Object.keys(all).forEach((k) => {
      const r = all[k];
      if (r && r.keep) return;                       // 残す指定は消さない
      if (!r || !r.at || (now - r.at) > MSQ_REC_TTL_MS) delete all[k];
    });
    /* 容量が収まっている間は1件も捨てない。
       溢れた時だけ、古い順に（＝30日で消えるのが一番近いものから）捨てる。
       ★大きさは1件ずつ測って引き算する。捨てるたびに全体を測り直すと、
         件数が増えるほど二乗で遅くなる。 */
    let total = JSON.stringify(all).length;
    if (total > MSQ_REC_MAX_BYTES) {
      /* 「残す」指定を後ろに回す。捨てるのは指定の無いものから。
         それでも足りない時だけ、指定のあるものにも手が届く（容量の限界なので）。 */
      const keys = Object.keys(all).sort((a, b) => {
        const ka = all[a].keep ? 1 : 0, kb = all[b].keep ? 1 : 0;
        if (ka !== kb) return ka - kb;
        return (all[a].at || 0) - (all[b].at || 0);
      });
      for (let i = 0; i < keys.length && total > MSQ_REC_MAX_BYTES; i++) {
        const k = keys[i];
        total -= JSON.stringify(all[k]).length + k.length + 4;   // "キー":値,
        delete all[k];
      }
    }
    return all;
  }
  function msqRecGet(url) {
    const r = msqRecLoad()[msqRecKey(url)];
    if (!r || !r.at) return null;
    // 判定を直す前に作られた記録は使わない（中身が古い規則のままなので）
    if (Number(r.v) !== MSQ_REC_VERSION) return null;
    // 「残す」指定が付いていれば、何日たっても出す
    if (!r.keep && (Date.now() - r.at) > MSQ_REC_TTL_MS) return null;
    return r;
  }
  async function msqRecPullFromSheet(force) {
    const gas = _hotDictUrl();
    if (!gas) return false;
    try {
      const last = Number(localStorage.getItem(MSQ_REC_SYNC_KEY) || 0);
      if (!force && (Date.now() - last) < MSQ_REC_SYNC_MS) return false;
    } catch (e) { }
    try {
      const sep = gas.indexOf('?') >= 0 ? '&' : '?';
      const res = await fetch(gas + sep + 'mode=rec');
      const text = await res.text();
      if (/^\s*</.test(text)) throw new Error('応答がJSONではありません');
      const o = JSON.parse(text);
      const rows = (o && o.rows) || [];
      const all = msqRecLoad();
      let added = 0;
      rows.forEach((r) => {
        if (!r || !r.url) return;
        const k = msqRecKey(r.url);
        const mine = all[k];
        // 手元にあるものが同じか新しければ触らない
        if (mine && mine.at && mine.at >= Date.parse(r.at || 0)) return;
        all[k] = {
          low: Number(r.low) || 0, high: Number(r.high) || 0, n: Number(r.n) || 0,
          cond: r.cond || '', profit: Number(r.profit) || 0,
          model: r.model || '', cost: Number(r.cost) || 0,
          keep: !!r.keep,
          at: Date.parse(r.at || '') || Date.now(),
          v: MSQ_REC_VERSION,
        };
        added++;
      });
      msqRecSave(msqRecPrune(all));
      try { localStorage.setItem(MSQ_REC_SYNC_KEY, String(Date.now())); } catch (e) { }
      try { msqDiary('記録の同期', 'スプシから ' + rows.length + '件（新しく取り込んだのは ' + added + '件）'); } catch (e) { }
      return true;
    } catch (e) {
      try { msqDiary('記録の同期', '失敗: ' + e.message); } catch (er) { }
      return false;
    }
  }

  /* 調べた利益の札を出す。
     ★ここだけは写しではない。クエッタ側の札は赤い分析ボタンの描画と
       絡み合っていて、そこはユーザーが「入れるな」と言った部分のため、
       【記録を読んで数字を出すだけ】の最小の物にした。
       出す中身は msqRecGet が返す物をそのまま使っている。 */
  function rawRecFuda() {
    try {
      document.querySelectorAll('a[href*="/goods/detail/"]').forEach(function (a) {
        if (a.querySelector('.msq-rec-fuda')) return;
        var r = null;
        try { r = msqRecGet(a.href); } catch (e) { return; }
        if (!r) return;
        var eki = Number(r.profit) || 0;
        var sp = document.createElement("span");
        sp.className = "msq-rec-fuda";
        sp.textContent = "調べ済 益" + String.fromCharCode(165) + eki.toLocaleString()
          + (r.n ? "（" + r.n + "件）" : "");
        sp.style.cssText = "position:absolute;left:4px;top:4px;z-index:9998;"
          + "padding:2px 6px;border-radius:6px;font:700 11px system-ui;"
          + "background:" + (eki > 0 ? "rgba(37,99,235,.92)" : "rgba(120,113,108,.92)") + ";color:#fff;";
        try { if (getComputedStyle(a).position === "static") a.style.position = "relative"; } catch (e) { }
        a.appendChild(sp);
      });
    } catch (e) { }
  }
  /* ===== ここまで調べた記録 ===== */


  /* 目標利益の段組み（2026-08-27 クエッタと揃えた）。
     ★元: スマホ同期用_62-3-5/list_extractor.js の MSQ_GOAL_TARGET。
       2026-08-23 にユーザーが3段へ変えたが、アプリだけ2段のまま残っていた。
     ★境目は「未満／以上」。5,000ちょうどは5,000円側、15,000ちょうどは10,000円側。
     ★ここに置く理由: 仕入元サイトの処理は下の定数がまだ無い段階で呼ばれるため(TDZ)。 */
  /* ★2026-09-12 利益計算ツール（calc.html）と同じ4段＋利益率に入れ替えた。
       それまでは3段（5,000未満→3,000／15,000未満→5,000／15,000以上→10,000）。
       ユーザー「この利益計算ツールがすべての基準だ　どのツールもこれを基準にするべき」
       逆引き → タイルの帯 → 一括 → アプリ の順で揃えると決めた、その最後。
     ★calc.html 507〜511行がそのまま正。読み方も書いておく。
         段を決めるのは   仕入値そのもの      （cost < 4000 …）
         利益率の分母は   仕入値 ＋ 仕入送料  （totalCost = cost + buyShip）
       ＝【段は仕入値、率は仕入総額】。取り違えると仕入送料770円ぶんの帯だけ
         段が1つ先に進む（2026-09-12にPC側で実際にやらかした）。
     ★合格は【金額と率の両方】を満たすこと。片方だけでは足りない（calc.html 519行）。
     ★同じ表が4か所にある。変える時は4つ全部:
         calc.html（正） / list_extractor.js の MSQ_KIJUN / msq_core.js の PROFIT_TARGET / ここ
     ★grep用の目印: 利益の基準は1か所 */
  const RAW_GOAL_TARGET = {
    tiers: [
      { costUnder: 4000, yen: 1500, roi: 50 },
      { costUnder: 8000, yen: 2000, roi: 35 },
      { costUnder: 15000, yen: 3000, roi: 30 }
    ],
    topYen: 5000, topRoi: 25
  };
  /* その仕入値で必要な利益を返す。
       shiireNe   段を決める値（仕入値そのもの）
       soukosuto  利益率の分母（仕入値＋仕入送料）。渡さなければ shiireNe で代用 */
  function rawKijunHitsuyou(shiireNe, soukosuto) {
    const c = Number(shiireNe) || 0;
    const sou = (soukosuto === undefined || soukosuto === null) ? c : (Number(soukosuto) || 0);
    const T = RAW_GOAL_TARGET;
    let yen = T.topYen, roi = T.topRoi;
    for (let i = 0; i < T.tiers.length; i++) {
      if (c < T.tiers[i].costUnder) { yen = T.tiers[i].yen; roi = T.tiers[i].roi; break; }
    }
    const ritsu = Math.ceil(sou * roi / 100);
    return { yen: yen, roi: roi, hitsuyou: Math.max(yen, ritsu), ritsuBun: ritsu };
  }
  /* ★2026-08-30 メルカリの売値から「いくらまでなら仕入れてよいか」を出す。
     目標利益は仕入値で段が変わるので、そのまま解くと堂々巡りになる。
     段ごとに上限を出し、その段の範囲に収まる中で【一番高い】所を採る。
       例) 売値17,000円（手数料と販売料を引くと13,280円）
          段1 13,280-3,000=10,280 → 5,000未満の段なので4,999で頭打ち → 成立
          段2 13,280-5,000= 8,280 → 5,000〜15,000未満に収まる      → 成立（一番高い）
          段3 13,280-10,000=3,280 → 15,000以上ではない            → 不成立
          答え「8,280円以下で仕入れれば益5,000」
     ★拡張機能の msqGoalKaeruLine と同じ決め方＝同じ数字が出る。
     ★手数料は LFEE(39行) を使う。RAW_FEE(6040行) はルーティングの return より下にあり、
       仕入元側から呼ぶと初期化前で落ちる（今日それで逆引きが止まった）。中身は同じ。
     返す形: { cost: 仕入れてよい上限, want: その時の目標利益 } / 無理なら null */
  /* ★2026-09-12 PC側（list_extractor.js の msqGoalKaeruLine）と同じ形に入れ替えた。
       段と率が絡むので、式から一発では出ない。1円ずつ試して一番高い所を採る
       （仕入は1万通り程度なので軽い）。
     ・売値は calc.html と同じく2%だけ安全側に見る
     ・仕入送料は仕入側に足す（＝利益率の分母は 仕入値＋仕入送料）
     ★手数料は LFEE(39行) を使う。RAW_FEE(6835行) はルーティングの return より下にあり、
       仕入元側から呼ぶと初期化前で落ちる（TDZ。中身は同じ）。
     ★grep用の目印: 利益の基準は1か所 */
  function rawGoalKaeruLine(uri) {
    try {
      const F = LFEE;
      const uriAnzen = Math.floor((Number(uri) || 0) * 0.98);
      const teMoto = uriAnzen - Math.floor(uriAnzen * F.sellRate) - F.shipping - F.outsource;
      let best = null;
      for (let cost = 1; cost <= 200000; cost++) {
        const sou = cost + F.purchase;               /* 仕入総額（仕入送料は仕入側） */
        const eki = teMoto - sou;
        if (eki <= 0) break;                          /* これ以上仕入を上げても赤字 */
        const k = rawKijunHitsuyou(cost, sou);        /* 段は仕入値・率は仕入総額 */
        if (eki >= k.hitsuyou) best = { cost: cost, want: k.hitsuyou, yen: k.yen, roi: k.roi, eki: eki };
      }
      return best;
    } catch (e) { return null; }
  }
  /* 仕入値から目標利益を出す。★クエッタの msqGoalSellPrice と同じ決め方。
     ★2026-09-12 4段＋利益率に入れ替えた。仕入送料は仕入側に足す（calc.html と同じ）。 */
  function rawGoalWant(cost) {
    const c = Number(cost) || 0;
    return rawKijunHitsuyou(c, c + LFEE.purchase).hitsuyou;
  }

  /* 画面の中に出す入力窓（2026-08-27）。
     ★AndroidのWebViewは、アプリ側に onJsPrompt が無いと prompt() を出さない。
       アプリの WebChromeClient は onShowFileChooser しか持っていないので、
       押しても何も出なかった（実機で再現）。native は触らず、ここで自前に出す。
     ★答えは Promise で返す（prompt と違って待てないため、呼ぶ側は await する）。 */
  function msqKiku(midashi, hajime) {
    return new Promise(function (kaesu) {
      try {
        var oya = document.createElement('div');
        oya.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.55);'
          + 'display:flex;align-items:center;justify-content:center;padding:16px;';
        var hako = document.createElement('div');
        hako.style.cssText = 'width:100%;max-width:560px;background:#111827;color:#e5e7eb;'
          + 'border-radius:12px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,.5);'
          + 'font:400 13px/1.6 system-ui;';
        var ti = document.createElement('div');
        ti.textContent = midashi;
        ti.style.cssText = 'font-weight:700;margin-bottom:8px;white-space:pre-wrap;';
        var input = document.createElement('input');
        input.type = 'text';
        input.value = hajime || '';
        input.placeholder = 'https://script.google.com/macros/s/…/exec';
        input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border-radius:8px;'
          + 'border:1px solid #374151;background:#0b1220;color:#e5e7eb;font:400 13px system-ui;';
        var gyo = document.createElement('div');
        gyo.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';
        var ck = document.createElement('button');
        ck.textContent = 'キャンセル';
        ck.style.cssText = 'padding:9px 14px;border:none;border-radius:8px;background:#374151;color:#e5e7eb;font:700 13px system-ui;';
        var ok = document.createElement('button');
        ok.textContent = '決定';
        ok.style.cssText = 'padding:9px 16px;border:none;border-radius:8px;background:#2563eb;color:#fff;font:700 13px system-ui;';
        var owaru = function (v) { try { oya.remove(); } catch (e) { } kaesu(v); };
        ck.addEventListener('click', function () { owaru(null); });
        ok.addEventListener('click', function () { owaru(input.value); });
        oya.addEventListener('click', function (ev) { if (ev.target === oya) owaru(null); });
        input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') owaru(input.value); });
        gyo.appendChild(ck); gyo.appendChild(ok);
        hako.appendChild(ti); hako.appendChild(input); hako.appendChild(gyo);
        oya.appendChild(hako);
        document.documentElement.appendChild(oya);
        setTimeout(function () { try { input.focus(); input.select(); } catch (e) { } }, 50);
      } catch (e) { kaesu(null); }
    });
  }

  /* ===== ホット辞書（GAS）=====================================
     ★2026-08-27 クエッタの拡張機能(list_extractor.js)で動いている物を
       【1行も書き換えずに】写した。新しく書いていない。
     ★置き場が localStorage なのは、クエッタで chrome.storage が使えないため。
       アプリも同じなので、そのまま動く。
     ★ここに置く理由: 仕入元サイトの処理(rawShiireUri)は「下の定数がまだ無い」
       段階で呼ばれる。const を初期化前に使うと落ちる(TDZ)ので、
       何よりも先に評価される先頭へ置く。動かすな。
     ★写した元: スマホ同期用_62-3-5/list_extractor.js
       直す時は【あちらを直してから写し直す】。片方だけ直すと必ずずれる。 */
  const HOT_DICT_URL_KEY = 'msqHotDictUrl';     // スプシを読むGASのURL（画面から設定）
  const HOT_DICT_CACHE_KEY = 'msqHotDictCache'; // 取得した中身の控え
  const HOT_DICT_TTL_MS = 24 * 60 * 60 * 1000;  // 1日
  let _hotDictLoaded = false;   // 一度でも読み込みを試したか
  let _hotDictNote = '';   // 画面に出す一言（読み込み状況）
  /* ★2026-08-30 localStorage は【サイトごとに別物】。メルカリで入れた値は
     セカストからもトレファクからも見えず、毎回「未設定」になっていた（ユーザー指摘）。
     アプリ全体で1つ持てる置き場（MsqApp）から取り直し、こちら側にも写す。 */
  function _hotDictUrl() {
    try {
      var v = localStorage.getItem(HOT_DICT_URL_KEY) || '';
      if (v) return v;
      var w = '';
      try { w = (window.MsqApp && MsqApp.msqLoad(HOT_DICT_URL_KEY)) || ''; } catch (e2) { }
      if (w) { try { localStorage.setItem(HOT_DICT_URL_KEY, w); } catch (e3) { } }
      return w;
    } catch (e) { return ''; }
  }
  function _hotNorm(s) {
    return String(s || '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase()
      .replace(/[\s　'’`´."·・\-–—_/\\()（）\[\]【】｜|,、]/g, '');
  }
  function _hotDictFromRows(rows) {
    const model = [];    // { term, prefix, limit }
    const term = [];     // { term, brandNames, limit }
    const pair = [];     // { brandNames, category, limit }
    (rows || []).forEach((r) => {
      if (!r) return;
      const kind = String(r.kind || r[0] || '').trim();
      const brand = String(r.brand || r[1] || '').trim();
      const cat = String(r.category || r[2] || '').trim();
      const en = String(r.en || r[3] || '').trim();
      const kana = String(r.kana || r[4] || '').trim();
      const word = String(r.term || r.word || '').trim();
      const lim = Number(String(r.limit == null ? '' : r.limit).replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(lim) || lim <= 0) return;   // 上限0＝光らせない
      // ブランドは入力した表記・英語・カタカナのどれで書かれていても拾えるようにする
      const brandNames = [brand, en, kana].map(_hotNorm).filter(Boolean);
      if (kind === '型番') {
        const t = word || brand;
        if (!t) return;
        const isPrefix = /\*$/.test(t);
        model.push({ term: _hotNorm(t.replace(/\*$/, '')), prefix: isPrefix, limit: lim });
      } else if (kind === '固有名詞') {
        if (!word) return;
        term.push({ term: word, key: _hotNorm(word), brandNames, limit: lim });
      } else if (kind === 'ブランド×カテゴリ') {
        if (!brandNames.length || !cat) return;
        pair.push({ brandNames, category: cat, limit: lim });
      }
      // 「ブランド」だけ・「カテゴリ」だけの行は、上の実測により採用しない
    });
    _hotRows = { model, term, pair };
    return _hotRows;
  }
  let _hotRows = { model: [], term: [], pair: [] };
  function _hotDictReady() {
    return !!(_hotRows.model.length || _hotRows.term.length || _hotRows.pair.length);
  }
  function _hotDictCount() {
    return _hotRows.model.length + _hotRows.term.length + _hotRows.pair.length;
  }
  function _hotDictEnsureButton() {
    try {
      /* STABLE: ショップスでは辞書を表示しない。
         一覧→詳細のSPA遷移時に後段の除去を待つと一瞬だけ見えるため、
         生成前に止め、既存の残留ボタンも同時に消す。 */
      if (/(^|\.)mercari-shops\.com$/i.test(location.hostname || '')) {
        const stale = document.getElementById('msq-hotdict-btn');
        if (stale) stale.remove();
        return;
      }
      let b = document.getElementById('msq-hotdict-btn');
      if (!b) {
        b = document.createElement('button');
        b.id = 'msq-hotdict-btn';
        b.type = 'button';
        b.style.cssText = 'position:fixed;left:6px;bottom:4px;height:32px;box-sizing:border-box;display:flex;align-items:center;z-index:2147483598;'
          + 'border:none;border-radius:14px;padding:5px 12px;font-size:10px;font-weight:700;'
          + 'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);';
        b.addEventListener('click', async () => {
          const cur = _hotDictUrl();
          /* ★2026-08-27 prompt はアプリのWebViewでは出ない（onJsPrompt が無い）。
             自前の窓で聞く。動きは prompt と同じ（キャンセルなら null）。 */
          const v = await msqKiku('ホット辞書を読むGASのURL\n（空にすると設定を消します）', cur);
          if (v === null) return;
          try { localStorage.setItem(HOT_DICT_URL_KEY, v.trim()); } catch (e) { }
          /* ★アプリ全体の置き場にも書く。こちらはサイトが変わっても消えない */
          try { if (window.MsqApp) MsqApp.msqSave(HOT_DICT_URL_KEY, v.trim()); } catch (e) { }
          b.textContent = '🗂 取得中…';
          const ok = await _loadHotDict(true);
          _hotDictEnsureButton();
          if (ok) { document.querySelectorAll('.sniper-badge').forEach((x) => x.remove()); location.reload(); }
        });
        document.documentElement.appendChild(b);
      }
      const ng = !_hotDictReady();
      b.textContent = '🗂 ' + (_hotDictNote || '辞書: 未読込');
      b.style.background = ng ? 'rgba(248,113,113,.92)' : 'rgba(74,222,128,.85)';
      b.style.color = ng ? '#fff' : '#053b1a';
    } catch (e) { }
  }
  async function _loadHotDict(force) {
    // まず控えを見る
    try {
      const raw = localStorage.getItem(HOT_DICT_CACHE_KEY);
      if (raw && !force) {
        const o = JSON.parse(raw);
        if (o && o.at && (Date.now() - o.at) < HOT_DICT_TTL_MS && Array.isArray(o.rows)) {
          _hotDictFromRows(o.rows);
          _hotDictNote = '辞書: 控えから ' + _hotDictCount() + '件';
          return true;
        }
      }
    } catch (e) { }

    const url = _hotDictUrl();
    if (!url) {
      _hotDictNote = '⚠ 辞書の取得先が未設定です（🗂ボタンから設定してください）';
      // 控えが期限切れでも、無いよりはまし
      try {
        const raw = localStorage.getItem(HOT_DICT_CACHE_KEY);
        if (raw) {
          const o = JSON.parse(raw);
          if (o && Array.isArray(o.rows)) {
            _hotDictFromRows(o.rows);
            _hotDictNote = '辞書: 古い控えを使用 ' + _hotDictCount() + '件';
            return true;
          }
        }
      } catch (e) { }
      return false;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data && data.rows) || [];
      if (!rows.length) throw new Error('中身が空');
      _hotDictFromRows(rows);
      _hotDictNote = '辞書: ' + _hotDictCount() + '件を取得';
      try {
        localStorage.setItem(HOT_DICT_CACHE_KEY, JSON.stringify({ at: Date.now(), rows: rows }));
      } catch (e) { }
      return true;
    } catch (e) {
      // 取れなかった時は控えで粘る。それも無ければ光らせない
      try {
        const raw = localStorage.getItem(HOT_DICT_CACHE_KEY);
        if (raw) {
          const o = JSON.parse(raw);
          if (o && Array.isArray(o.rows)) {
            _hotDictFromRows(o.rows);
            _hotDictNote = '辞書: 取得に失敗、古い控えを使用（' + e.message + '）';
            return true;
          }
        }
      } catch (e2) { }
      _hotDictNote = '⚠ 辞書を取得できません（' + e.message + '）。光らせません';
      return false;
    }
  }
  function _hotBrandHit(title, names) {
    if (!names || !names.length) return 0;
    const hay = _hotNorm(title);
    let best = 0;
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      if (!n) continue;
      if (n.length >= 4) { if (hay.indexOf(n) >= 0 && n.length > best) best = n.length; }
    }
    if (best) return best;
    const toks = String(title || '').split(_HOT_SPLIT).filter(Boolean).map(_hotNorm);
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      if (n && n.length < 4 && toks.some((tk) => tk.indexOf(n) === 0) && n.length > best) best = n.length;
    }
    return best;
  }
  function _hotLimitForItem(title, modelCode) {
    const t = String(title || '');
    // ① 型番
    const mc = _hotNorm(modelCode || '');
    if (mc) {
      let win = null;
      _hotRows.model.forEach((r) => {
        const hit = r.prefix ? (mc.indexOf(r.term) === 0) : (mc === r.term);
        if (hit && (!win || r.term.length > win.term.length)) win = r;
      });
      if (win) return { limit: win.limit, why: '型番 ' + win.term + (win.prefix ? '*' : '') };
    }
    // ② 固有名詞（ブランド欄があればブランドも一致していること）
    {
      let win = null, score = -1;
      _hotRows.term.forEach((r) => {
        if (t.indexOf(r.term) < 0) return;
        if (r.brandNames.length && !_hotBrandHit(t, r.brandNames)) return;
        const s = r.term.length + (r.brandNames.length ? 100 : 0);   // ブランド付きを優先
        if (s > score) { score = s; win = r; }
      });
      if (win) return { limit: win.limit, why: '固有名詞 ' + win.term };
    }
    // ③ ブランド×カテゴリ（両方そろった時だけ）
    {
      let win = null, score = -1;
      _hotRows.pair.forEach((r) => {
        const b = _hotBrandHit(t, r.brandNames);
        if (!b) return;
        if (t.indexOf(r.category) < 0) return;
        const s = b + r.category.length;
        if (s > score) { score = s; win = r; }
      });
      if (win) return { limit: win.limit, why: 'ブランド×カテゴリ ' + win.category };
    }
    return null;
  }

  /* ホットかどうかを見る（2026-08-27）。
     ★判定そのものは上の _hotLimitForItem（クエッタから写した物）。
     ★辞書が読めていない時は何もしない（誤った基準で光らせないため）。 */
  function rawHotMiru(dai, kata, ne) {
    try {
      if (!_hotDictReady()) return null;
      const hit = _hotLimitForItem(String(dai || ''), String(kata || ''));
      if (!hit) return null;
      const kagiri = Number(hit.limit) || 0;
      const kane = Number(ne) || 0;
      if (!kagiri || !kane) return null;
      return { hot: kane <= kagiri, limit: kagiri, why: hit.why || '' };
    } catch (e) { return null; }
  }

  /* 枠の色は【なぜ光ったか】で分ける。PC(list_extractor.js 3444-3456)と同じ。
       緑  型番が一致        … 一番確かな根拠
       青  固有名詞が一致    … 商品ラインや作りの名前
       黄  ブランド×カテゴリ … 一番ゆるい根拠 */
  var RAW_HOT_PAINT = {
    '型番': { color: '#4ade80', width: 6, mark: '\uD83D\uDFE2', label: '型番' },
    '固有名詞': { color: '#38bdf8', width: 6, mark: '\uD83D\uDD35', label: '固有名詞' },
    'default': { color: '#fbbf24', width: 6, mark: '\uD83D\uDD25', label: '' }
  };
  /* ★ブランディアだけ outline ではなく box-shadow（あちらは outline が他とぶつかる）。 */
  function rawHotWaku(target, color, width) {
    try {
      if (location.hostname.indexOf('brandear.jp') >= 0) {
        target.style.boxShadow = '0 0 0 ' + width + 'px ' + color;
      } else {
        target.style.outline = width + 'px solid ' + color;
      }
      target.style.borderRadius = '6px';
      target.style.position = 'relative';
    } catch (e) { }
  }
  /* 光らせる。target は枠を付ける物、oya は札を入れる物。 */
  function rawHotHikaru(target, h9) {
    try {
      if (!target || !h9 || !h9.hot) return;
      var kind = String(h9.why || '').split(' ')[0];
      var p = RAW_HOT_PAINT[kind] || RAW_HOT_PAINT['default'];
      rawHotWaku(target, p.color, p.width);
      if (target.querySelector('.sniper-hot-badge')) return;
      var badge = document.createElement('span');
      badge.className = 'sniper-hot-badge';
      badge.dataset.msqUri = '1';                 /* 値段拾いの対象にしない */
      badge.textContent = p.mark + (p.label ? ' ' + h9.why : '');
      badge.title = h9.why + '／上限' + String.fromCharCode(165) + Number(h9.limit).toLocaleString();
      /* ★top:4px だと○✕メモの行と重なる（PC側でユーザー指摘済み）。30px にする。 */
      badge.style.cssText = 'position:absolute;left:4px;top:30px;z-index:2147483646;'
        + 'background:rgba(0,0,0,0.85);color:' + p.color + ';padding:3px 7px;'
        + 'border-radius:6px;font-size:11px;font-weight:900;pointer-events:none;'
        + 'max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      target.appendChild(badge);
    } catch (e) { }
  }
  /* ===== ここまでホット辞書 ===== */

  const rawEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  /* ★どの版が端末に入っているかを見分ける札。帯の右端に小さく出る。
     これが無いと「直っていない」のか「古いのが入ったまま」なのか区別できない。
     中身を変えたら必ずここも進めること。
     ★ここに移した理由: レンズ結果ページでは後ろの行が実行されないため、
       あちらに置いたままだと window.__msqRawBuild が付かず、
       「新しい版が入っているか」をレンズ側で確かめられなかった。 */
  /* ★2026-08-26 ユーザー依頼『アプリのメルカリの検索一覧に長押しで、仕入と同じように
       結果タブで開けるようにして、戻るボタンで戻れるようにできるか？』→ できる。
     ★仕入元側の長押し(msqNagaosi)は HOSTS の内側にあり、メルカリでは定義すら走らない。
       そこを広げると仕入元側を壊す恐れがあるので、【メルカリ用に自己完結で】同じ物を置く。
     ★動きは仕入元と同じ: 600ms押す／10px動いたらやめる／黒い小窓／MsqApp.openKekkaUrl。
     ★戻るボタンは MainActivity の結果タブ(imaTab==2)の分岐で既に戻れる（2026-08-24に入れた）。 */
  (function msqMerNagaosi() {
    try {
      if (!/^https?:\/\/jp\.mercari\.com\//.test(location.href)) return;
      if (window.__msqMerNagaTuita) return;
      window.__msqMerNagaTuita = true;
      let taima = 0, x0 = 0, y0 = 0, url9 = '';
      const kesu = () => {
        const e = document.getElementById('msq-mer-naga');
        if (e) e.remove();
      };
      const linkNo = (el) => {
        try {
          if (!el || !el.closest) return '';
          if (el.closest('#msq-mer-naga')) return '';
          if (el.closest('[data-msq-uri]')) return '';
          const a1 = el.closest('a[href*="/item/"], a[href*="/shops/product/"]');
          if (a1 && a1.href) return a1.href;
          let oya = el;
          for (let k = 0; k < 6 && oya; k++) {
            oya = oya.parentElement;
            if (!oya || oya === document.body) break;
            const a2 = oya.querySelector('a[href*="/item/"], a[href*="/shops/product/"]');
            if (a2 && a2.href) return a2.href;
          }
          if (/\/item\/|\/shops\/product\//.test(location.href)) return location.href;
          return '';
        } catch (e) { return ''; }
      };
      const dasu = (mx, my, u) => {
        kesu();
        const d = document.createElement('div');
        d.id = 'msq-mer-naga';
        d.dataset.msqUri = '1';
        d.style.cssText = 'position:fixed;z-index:2147483600;background:#111;color:#fff;'
          + 'border:1px solid #444;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.6);padding:4px;';
        const b = document.createElement('button');
        b.textContent = '結果タブで開く';
        b.dataset.msqUri = '1';
        b.style.cssText = 'display:block;width:100%;padding:9px 16px;border:none;background:transparent;'
          + 'color:#fff;font:700 13px/1.3 system-ui;text-align:left;cursor:pointer;white-space:nowrap;';
        b.addEventListener('click', (e2) => {
          e2.preventDefault(); e2.stopPropagation();
          kesu();
          try {
            if (window.MsqApp && typeof window.MsqApp.openKekkaUrl === 'function') {
              window.MsqApp.openKekkaUrl(u);
              return;
            }
          } catch (e) { }
          try { window.open(u, '_blank'); } catch (e) { location.href = u; }
        });
        d.appendChild(b);
        (document.body || document.documentElement).appendChild(d);
        try {
          const w = d.getBoundingClientRect();
          let lx = mx, ly = my + 8;
          if (lx + w.width > window.innerWidth - 6) lx = window.innerWidth - w.width - 6;
          if (lx < 6) lx = 6;
          if (ly + w.height > window.innerHeight - 6) ly = my - w.height - 8;
          if (ly < 6) ly = 6;
          d.style.left = lx + 'px';
          d.style.top = ly + 'px';
        } catch (e) { }
        const soto = (e3) => {
          if (e3 && e3.target && d.contains(e3.target)) return;
          kesu();
          document.removeEventListener('touchstart', soto, true);
          document.removeEventListener('click', soto, true);
        };
        setTimeout(() => {
          document.addEventListener('touchstart', soto, true);
          document.addEventListener('click', soto, true);
        }, 0);
      };
      const yameru = () => { if (taima) { clearTimeout(taima); taima = 0; } };
      document.addEventListener('touchstart', (ev) => {
        try {
          if (ev.target && ev.target.closest && ev.target.closest('#msq-mer-naga')) return;
        } catch (e) { }
        url9 = linkNo(ev.target);
        if (!url9) return;
        const t = ev.touches && ev.touches[0];
        x0 = t ? t.clientX : 0;
        y0 = t ? t.clientY : 0;
        yameru();
        taima = setTimeout(() => { taima = 0; dasu(x0, y0, url9); }, 600);
      }, { passive: true, capture: true });
      /* ★2026-09-09 ユーザー報告「使う上でストレス」。実機(ZY22KF7NBD)で測った事実:
           入力の遅れ 597回 / 480フレーム。原因は touchstart/touchmove が
           passive でなかった事。passive でない指の監視が付いていると、
           Chromiumは「この関数がスクロールを止めるかもしれない」ので
           【関数が終わるまでスクロールを描けない】。
         ★この2つは preventDefault を1度も呼んでいない（確認済み）ので、
           passive にしても動きは1つも変わらない。長押しメニューはそのまま出る。
         ★grep用の目印: 指の監視を軽くする */
      document.addEventListener('touchmove', (ev) => {
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        if (Math.abs(t.clientX - x0) > 10 || Math.abs(t.clientY - y0) > 10) yameru();
      }, { passive: true, capture: true });
      document.addEventListener('touchend', yameru, true);
      document.addEventListener('touchcancel', yameru, true);
    } catch (e) { }
  })();

  const RAW_BUILD = 'R289';
  try { window.__msqRawBuild = RAW_BUILD; } catch (e) { }

  /* ==========================================================================
     ★2026-09-09 ユーザー指摘
       「アンバサダーを固定して出ないようにしないからこうなる」「ずれるんやろ」
       「最初の3枚タイルの黒い画面がずっと続く」「メルカリのアプリでは出ない」

     ■ 実機(ZY22KF7NBD)で確かめた事
       ・アンバサダーの帯（リンク生成／リンクのみ…）は
         HEADER.page-header（position:sticky・高さ56）の【直下】に後から差し込まれる
       ・その入れ物 DIV は普段 display:none だが、
         読み込み（chunks/affiliate-toolbar）が実測 6650ms かかる
       ・出た瞬間にヘッダの高さが変わり、【下の絞り込み行から全部ずれる】
     ■ どうするか
       最初から出さない（メルカリ自身も普段 display:none にしている物と同じ扱い）。
       アンバサダーのリンク生成は使わない（ユーザー明言 2026-09-09「使わない　いらない」）。
     ■ 絶対に守る事
       ・消すのは【ヘッダの直下の子で、リンク生成の帯だけ】
       ・入力欄(input)を含む物は絶対に消さない（検索窓を消さないため）
       ・ヘッダそのもの・絞り込み行・タグ行の位置と高さには【1行も触らない】（FROZEN）
     ★grep用の目印: アンバサダーを出さない
     ========================================================================== */
  (function () {
    try {
      if (String(location.hostname || '').indexOf('mercari.com') < 0) return;
      const kesu = () => {
        try {
          const h = document.querySelector('header.page-header') || document.querySelector('header');
          if (!h) return;
          const ko = h.children;
          for (let i = 0; i < ko.length; i++) {
            const c = ko[i];
            if (c.tagName !== 'DIV') continue;
            const t = (c.textContent || '');
            if (t.indexOf('リンク生成') < 0) continue;
            if (t.length > 120) continue;              /* 大きすぎる＝別物。触らない */
            if (c.querySelector('input')) continue;    /* 検索窓を含む物は絶対に消さない */
            if (c.style.display !== 'none' || c.style.getPropertyValue('display') !== 'none') {
              c.style.setProperty('display', 'none', 'important');
            }
          }
          const p = document.getElementById('affiliate-popover-portal');
          if (p && (p.style.display !== 'none' || p.style.getPropertyValue('display') !== 'none')) {
            p.style.setProperty('display', 'none', 'important');
          }
        } catch (e) { }
      };
      kesu();                                   /* まず今すぐ1回（タイマー待ちにしない） */
      [0, 400, 1200, 2500, 5000, 8000, 12000].forEach((ms) => setTimeout(kesu, ms));
      window.addEventListener('load', kesu);
      /* 遅れて追加されるアンバサダー帯を、タイマーの合間に一瞬見せない。 */
      let ambHeader = null, ambHeaderObserver = null;
      const watchAmbHeader = () => {
        try {
          const h = document.querySelector('header.page-header') || document.querySelector('header');
          if (!h || h === ambHeader) return;
          if (ambHeaderObserver) ambHeaderObserver.disconnect();
          ambHeader = h;
          ambHeaderObserver = new MutationObserver(() => kesu());
          /* Reactがアンバサダー帯を同じ要素のまま再描画し、
             style/classだけを戻す場合がある。子追加だけではその瞬間を拾えない。 */
          ambHeaderObserver.observe(h, {
            childList: true,
            attributes: true,
            attributeFilter: ['style', 'class']
          });
          kesu();
        } catch (e) { }
      };
      watchAmbHeader();
      const ambRootObserver = new MutationObserver(() => watchAmbHeader());
      ambRootObserver.observe(document.documentElement, { childList: true });
    } catch (e) { }
  })();

  /* ==========================================================================
     ★★★ 速い一覧（2026-09-09 ユーザー依頼「速度の件を最重要で」）★★★
     ★grep用の目印: 速い一覧

     ■ ユーザーの言葉
       「メルカリのアプリでは出ない」「黒いタイルが4秒」「メルカリを超えるのが理想」
       「なぜメルカリのアプリはそれを克服できてるかだよ」「進めろ　戻せるようにしてから」

     ■ 実機(ZY22KF7NBD)で確かめた事（もう調べ直すな）
       ・公式メルカリは WebView 0枚＝完全ネイティブ。Webページを読まず、
         同じAPI(api.mercari.jp/v2/entities:search・実測189ms)の返事を自分で描いている。
       ・検証アプリはWebページを読むので HTML→React→API→画像 の順になり、
         画像が9枚出そろうのが 1916〜2871ms。黒いタイル（メルカリ自身の読み込み中の枠）が続く。
       ・私たちのコードを丸ごと止めて測っても 2559ms（動かして2762ms）＝私たちは犯人ではない。
       ・ページが受け取るAPIの返事は【XHR】で来る。横取りできる（fetchでは来ない）。
         実測: 1746msの時点で 119件。名前・値段・状態・画像・サイズ・ブランドが全部入っている。
       ・時刻の関係（実測）:
             0ms 読み込み開始 → 693ms load(アプリが流し込む) → 1592ms 検索APIを投げた
         ＝【流し込みの900ms後にAPIが飛ぶ】ので、ここで仕掛けを入れれば間に合う。
         よって MainActivity.kt も build.gradle.kts も触らない。

     ■ 何をするか
       ① XHR を包んで、検索APIの返事を横取りする（読むだけ。書き換えない）
       ② 受け取ったら、その場で【速い一覧】を自分で描く（写真・値段・題・SOLD）
       ③ メルカリ本体のタイルが出たら、速い一覧は自動で引っ込む

     ■ 壊さないための決め事
       ・メルカリのDOMは書き換えない。自分の箱を1つ足すだけ（#msq-haya）
       ・検索の一覧ページ以外では何もしない
       ・例外は握りつぶさず、🐞に出す（黙って消えない）
       ・止めたい時は localStorage の msq_haya = '0'
     ========================================================================== */
  (function () {
    try {
      if (window.__msqHayaTuita) return;
      window.__msqHayaTuita = true;
      const KEY = 'msq_haya';
      const kiru = () => { try { return localStorage.getItem(KEY) === '0'; } catch (e) { return false; } };
      const HAKO = 'msq-haya';
      const HONBAN_HIDDEN = 'data-msq-haya-native-hidden';

      /* 先行表示と本体一覧を同時に見せない。
         同時に見えていたため、同じ商品にX・ハート・仕・型が二重に
         重なり、本体側の3列フレームも一瞬見えていた。 */
      const honban箱 = () => {
        try {
          const all = [];
          const direct = document.querySelector('#item-grid');
          if (direct) all.push(direct);
          document.querySelectorAll('ul.group,div.group').forEach((e) => all.push(e));
          return Array.from(new Set(all))
            .filter((e) => e.id !== HAKO && !e.closest('#' + HAKO));
        } catch (e) { return []; }
      };
      const honban隠す = () => {
        try {
          honban箱().forEach((g) => {
            if (g.hasAttribute(HONBAN_HIDDEN)) return;
            g.setAttribute(HONBAN_HIDDEN, '1');
            g.style.setProperty('visibility', 'hidden', 'important');
          });
        } catch (e) { }
      };
      const honban戻す = () => {
        try {
          document.querySelectorAll('[' + HONBAN_HIDDEN + ']').forEach((g) => {
            g.style.removeProperty('visibility');
            g.removeAttribute(HONBAN_HIDDEN);
          });
        } catch (e) { }
      };

      /* 一覧の検索ページか */
      const kensakuKa = () => {
        try {
          return location.hostname.indexOf('mercari.com') >= 0
            && location.pathname.indexOf('/search') === 0;
        } catch (e) { return false; }
      };

      /* メルカリ本体のタイルが【画像まで出ているか】
         ★2026-09-09 最初は「タイルの箱があるか」だけを見ていたが、それだと
           【まだ黒いタイルのうちに引っ込めてしまう】＝ユーザーの困り事が直らない。
           ユーザーの言葉「最初の3枚タイルの黒い画面がずっと続く」「これをでないようにしろ」
           ＝【本物の画像が実際に読み終わったか】で判定する。
         ★grep用の目印: 速い一覧 */
      const honbanDeta = () => {
        try {
          /* ★2026-09-09 実機で見つけた誤判定（1件の検索で覆いが0.9秒で消えた）
               ここで `|| document.body` に落ちていたため、#item-grid がまだ無い間は
               ページ全体の画像（ロゴ・アイコン等）を数えてしまい、
               6枚を超えた時点で「本物が出た」と誤判定して覆いを外していた。
             ＝【一覧の箱が無い間は「まだ」と答える】。
           ★grep用の目印: 速い一覧 */
          const g = document.querySelector('#item-grid');
          if (!g) return false;
          /* ★2026-09-09 実機で起きた不具合（ユーザー報告「一覧が崩れて表示される」）
               引き際を「画像6枚」で固定していた。商品が1件しかない検索
               （履歴の【名作】DURBAN…）では画像が4枚しか無く、条件を永久に満たさず
               【18秒間ずっと重なったまま】になっていた。実測: 出した2125ms→引っ込め20426ms。
             ＝【必要な枚数は商品の数に合わせる】。さらに本物のタイルが出そろっても終わり。
           ★grep用の目印: 速い一覧 */
          const kensu = window.__msqHayaKensu || 6;
          const iru = Math.min(6, Math.max(1, kensu));
          const tairu = g.querySelectorAll('a[href*="/item/"]').length;
          if (tairu >= kensu) return true;          /* 本物が出そろった */
          const im = g.querySelectorAll('img');
          let n = 0;
          for (let i = 0; i < im.length; i++) {
            if (im[i].complete && im[i].naturalWidth > 1) n++;
            if (n >= iru) return true;
          }
          return false;
        } catch (e) { return false; }
      };

      /* ★出た時刻・消えた時刻を必ず残す（効いているかを後から数字で言えるようにするため）
         ★grep用の目印: 速い一覧 */
      const kesu = () => {
        try {
          const e = document.getElementById(HAKO);
          if (e) { e.remove(); window.__msqHayaKesita = Math.round(performance.now()); }
          honban戻す();
        } catch (e) { }
      };

      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      /* ★なぜ出なかったかを必ず残す（黙って消えないため。🐞と window.__msqHayaRiyuu で見られる） */
      const riyuu = (s) => { try { window.__msqHayaRiyuu = s; } catch (e) { } };

      const kaku = (j, kai) => {
        try {
          kai = kai || 0;
          riyuu('描きに入った(' + kai + '回目)');
          if (kiru()) { riyuu('止められている(msq_haya=0)'); return; }
          if (!kensakuKa()) { riyuu('検索の一覧ページではない'); return; }
          if (honbanDeta()) { riyuu('もう本物のタイルが出ている'); return; }
          const items = (j && j.items) || [];
          if (!items.length) { riyuu('返事に商品が入っていない'); return; }
          /* ★2026-09-09 ユーザー指摘
               「当然枚数が違うときはあるだろ」「どの時も同じ挙動にするのが筋」
             一度は「6件未満は出さない」と件数で分けたが、それは筋が通らない。
             ＝【件数に関係なく必ず出す】。件数に合わせるのは【引き際】だけ
               （honbanDeta が商品の数を見て判定する）。
           ★grep用の目印: 速い一覧 */
          window.__msqHayaKensu = items.length;
          /* ★2026-09-09 覆いが先に出ているので「もう出している」で抜けてはいけない。
               中身が空の覆いなら、そこにタイルを描き込む。★grep用の目印: 速い一覧 */
          {
            const aru = document.getElementById(HAKO);
            if (aru && aru.children.length > 0) { riyuu('もう描いている'); return; }
          }
          /* ★2026-09-09 実機で判明: APIの返事(1565ms)の時点では #item-grid がまだ無く、
               ここで黙って抜けていた。＝【箱ができるまで待ち直す】。
             ★grep用の目印: 速い一覧 */
          const oya = document.querySelector('#item-grid') || document.querySelector('main');
          if (!oya) {
            if (kai < 25) { setTimeout(() => kaku(j, kai + 1), 150); riyuu('箱を待っている(' + kai + '回目)'); }
            else riyuu('箱が最後まで出てこなかった');
            return;
          }
          /* ★2026-09-09 実機で判明した副作用（絶対に戻すな）
               最初は oya.parentNode.insertBefore(box, oya) で一覧の【中】に差し込んだ。
               その結果、メルカリ本体のタイルが7.6秒たっても1枚も出なくなった
               （差し込まない時は2.6秒で36枚出ていた）。
               ＝Reactが管理しているDOMに他人の箱を入れると、組み直しが壊れる。
             ＝【Reactの木には触らない】。body の直下に置いて、一覧の上に重ねるだけにする。
             ★grep用の目印: 速い一覧 */
          /* 覆いが既にあればそれを使う。無ければ作る（作り方は tsukuru に1本化） */
          const box = tsukuru();
          if (!box) { riyuu('覆いを作れなかった'); return; }
          /* 本体の一覧箱が後から生成された場合も、先行表示を見せる直前に隠す。 */
          honban隠す();
          let h = '';
          const kazu = Math.min(items.length, 60);
          for (let i = 0; i < kazu; i++) {
            const it = items[i] || {};
            const gz = (it.thumbnails && it.thumbnails[0]) || it.thumbnail || '';
            const ne = Number(String(it.price || '').replace(/[^0-9]/g, '')) || 0;
            const sold = String(it.status || '').indexOf('SOLD') >= 0
              || String(it.status || '').indexOf('TRADING') >= 0;
            /* ★2026-09-09 覆いは指を通す（pointer-events:none）。タイルだけ押せるように戻す。
               ★grep用の目印: 覆いは指を通す */
            h += '<a href="/item/' + esc(it.id) + '" style="position:relative;display:block;'
              + 'pointer-events:auto;text-decoration:none;color:inherit;">'
              + (gz ? '<img src="' + esc(gz) + '" loading="eager" style="width:100%;aspect-ratio:1/1;'
                + 'object-fit:cover;display:block;background:' + (window.__msqHayaIro || '#333') + ';">'
                : '<div style="width:100%;'
                + 'aspect-ratio:1/1;background:' + (window.__msqHayaIro || '#333') + ';"></div>')
              + (sold ? '<span style="position:absolute;top:0;left:0;background:#e00;color:#fff;'
                + 'font-size:11px;font-weight:700;padding:2px 6px;">SOLD</span>' : '')
              + '<span style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,.65);'
              + 'color:#fff;font-size:13px;font-weight:700;padding:2px 6px;border-radius:3px;">¥'
              + ne.toLocaleString() + '</span></a>';
          }
          box.innerHTML = h;                       /* 覆いの中にタイルを描き込む */
          /* 中身が完成してから、既定2列で一度だけ表示する。 */
          const cols = rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2;
          box.style.setProperty('display', 'grid', 'important');
          box.style.setProperty('visibility', 'visible', 'important');
          box.style.setProperty('grid-template-columns', 'repeat(' + cols + ',1fr)', 'important');
          box.style.setProperty('gap', '8px', 'important');
          box.style.minHeight = '';                /* 中身が入ったので下限は要らない */
          window.__msqHayaDeta = Math.round(performance.now());
          riyuu('出した(' + kazu + '枚)');
          /* 本物が出たら引っ込める */
          let n = 0;
          const mihari = setInterval(() => {
            n++;
            /* ★2026-09-09 出している間は【本物の一覧の位置に合わせ続ける】。
                 実測: 出した時は上56pxだったが、本体が育つと本物は上173pxへ動く。
                 合わせないと絞り込みの行を隠してしまう。
               ★grep用の目印: 速い一覧 */
            try {
              const b2 = document.getElementById(HAKO);
              const g2 = document.querySelector('#item-grid') || document.querySelector('main');
              if (b2 && g2) {
                const r2 = g2.getBoundingClientRect();
                b2.style.top = Math.round(r2.top + (window.scrollY || 0)) + 'px';
              }
            } catch (e) { }
            /* ★2026-09-09 上限を60回(18秒)→16回(約5秒)に縮めた。
                 引き際の条件を満たせない検索で長く重なり続けたため（上の説明を参照）。
               ★grep用の目印: 速い一覧 */
            if (honbanDeta() || n > 16) { clearInterval(mihari); kesu(); }
          }, 300);
          try { msqDiary('速い一覧', kazu + '件を先に出した ' + Math.round(performance.now()) + 'ms'); } catch (e) { }
        } catch (e) {
          /* ★例外の理由も必ず残す（黙って消えないため） */
          riyuu('例外: ' + String(e && e.message || e));
          try { msqDiary('速い一覧の失敗', String(e && e.message || e)); } catch (e2) { }
        }
      };

      /* ==========================================================================
         ★2026-09-09 ユーザー指摘
           「メルカリが出す黒いタイルを上書きして描画されたら戻すって言ってたよな」
           「アンバサダーと黒い画面をいちいち出さないようにできないのか」
         ■ それまでの弱点
           上書きが始まるのは【APIの返事が来た2.2秒後】からで、
           0〜2.2秒の黒いタイルは出たままだった。
         ■ どうしたか
           流し込まれた時点（実測693ms）で【無地の覆い】を先に置く。
           データが来たらその中にタイルを描く。本物が描き終わったら覆いごと外す。
           ＝黒いタイルは最初から見えない。
         ★覆いも body 直下（Reactの木には触らない）。位置は一覧に合わせ続ける。
         ★grep用の目印: 速い一覧 */
      const tsukuru = () => {
        try {
          let box = document.getElementById(HAKO);
          if (box) return box;
          const oya = document.querySelector('#item-grid') || document.querySelector('main');
          if (!oya) return null;
          const r = oya.getBoundingClientRect();
          box = document.createElement('div');
          box.id = HAKO;
          /* ★2026-09-09 ユーザー指摘「そもそもの黒い画面が何種類か出てるのが気になる」
               覆いの色を body から拾っていたため、一覧の背景と微妙に違う黒になり
               「別の黒」に見えていた。＝【一覧そのものの背景色に合わせる】。
               一覧が透明なら親をたどり、最後まで無ければ body を使う。
             ★grep用の目印: 速い一覧 */
          let iro = '';
          try {
            for (let n2 = oya, i = 0; n2 && i < 6; n2 = n2.parentElement, i++) {
              const c = getComputedStyle(n2).backgroundColor;
              if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { iro = c; break; }
            }
          } catch (e) { }
          if (!iro) iro = getComputedStyle(document.body).backgroundColor || '#fff';
          window.__msqHayaIro = iro;               /* タイルの中の色もこれに合わせる */
          /* ★2026-09-09 ユーザー報告「虫眼鏡を商品一覧が出てる時に押すとフリーズする／
               何も操作が効かなくなることがある。なったりならなかったり」
             真因（実機で再現・測定）: 虫眼鏡を押すと検索画面が上に出るが、
               この覆いは pointer-events が既定(auto)で高さ725・y=0まで広がるため、
               検索画面の上に乗って【指を全部吸い込む】。実測:
                 押して1秒後 … 画面中央にある物 = DIV#msq-haya ／ 上から200px も同じ
                 押して4秒後 … 覆いが消えてやっと操作できた
               覆いが出ているかはタイミング次第なので「なったりならなかったり」になる。
             直し: 覆い自体は【指を通す】。中のタイル(<a>)だけ pointer-events:auto で押せる。
                   さらに、他所を触ったらその場で覆いを外す（下を参照）。
           ★grep用の目印: 覆いは指を通す */
          /* ★2026-09-21 実機で確認: 固定3列の覆いが先に見え、後から本体2列へ
               切り替わっていた。データが揃う前は覆い自体を表示しない。表示時も
               一覧の列設定（既定2列）だけを使い、3列の中間フレームを作らない。 */
          const cols = rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2;
          box.style.cssText = 'position:absolute;left:0;right:0;z-index:5;pointer-events:none;'
            + 'display:none;visibility:hidden;grid-template-columns:repeat(' + cols + ',1fr);gap:8px;'
            + 'background:' + iro + ';'
            + 'top:' + Math.round(r.top + (window.scrollY || 0)) + 'px;'
            + 'min-height:' + Math.max(200, Math.round(innerHeight - r.top)) + 'px;';
          /* ★2026-09-09 ユーザー報告
               「黒い画面が出る⇒タイルが一瞬出る⇒黒い画面が出る⇒描画　こうなってるぞ」
             真因: body の直下に置くと、Reactの組み直しで消される。
                   置き直すまでの0.3秒が【黒に戻る瞬間】として見えていた。
             ＝【<html> の直下に置く】。Reactが触るのは body の中だけなので消されない。
           ★grep用の目印: 速い一覧 */
          (document.documentElement || document.body).appendChild(box);
          return box;
        } catch (e) { return null; }
      };

      /* 黒いタイルを最初から隠す（無地の覆い）。データが来たら中身が入る。 */
      const kabuseru = (kai) => {
        try {
          kai = kai || 0;
          if (kiru() || !kensakuKa()) return;
          if (honbanDeta()) return;                   /* もう本物が出ているなら要らない */
          if (!tsukuru()) { if (kai < 25) setTimeout(() => kabuseru(kai + 1), 150); return; }
          honban隠す();
          riyuu('黒いタイルを覆った');
          window.__msqHayaOoi = Math.round(performance.now());
          /* 覆いだけの時も、本物が出たら必ず外す */
          if (!window.__msqHayaMihari) {
            window.__msqHayaMihari = true;
            /* ★2026-09-09 ユーザー報告「黒→タイルが一瞬→黒→描画」
                 0.3秒ごとの見張りでは、消されてから置き直すまでの隙間が
                 【黒に戻る瞬間】として見えてしまう。
               ＝【消された瞬間に置き直す】。childListだけ見るので軽い。
             ★grep用の目印: 速い一覧 */
            try {
              const kanshi = new MutationObserver(() => {
                try {
                  if (document.getElementById(HAKO)) return;
                  if (honbanDeta()) return;
                  if (window.__msqApiKekka) kaku(window.__msqApiKekka);
                  else if (tsukuru()) riyuu('消された瞬間に置き直した');
                } catch (e) { }
              });
              kanshi.observe(document.documentElement, { childList: true });
              if (document.body) kanshi.observe(document.body, { childList: true });
              window.__msqHayaKanshi = kanshi;
            } catch (e) { }
            let n = 0;
            const t = setInterval(() => {
              n++;
              try {
                /* Reactが一覧箱を差し替えた直後にも本体側を隠し直す。 */
                honban隠す();
                let b2 = document.getElementById(HAKO);
                /* ★2026-09-09 実機で判明（絶対に消すな）
                     覆いが【私たちが外していないのに】消えていた（外した時刻=null なのに無い）。
                     ページ側(Reactの組み直し)が body の子を作り直す時に一緒に消される。
                   ＝【消されたら置き直す】。データが既に有ればタイルごと描き直す。
                 ★grep用の目印: 速い一覧 */
                if (!b2 && !honbanDeta()) {
                  if (window.__msqApiKekka) kaku(window.__msqApiKekka);
                  else if (tsukuru()) riyuu('覆いを置き直した');
                  b2 = document.getElementById(HAKO);
                }
                const g2 = document.querySelector('#item-grid') || document.querySelector('main');
                if (b2 && g2) {
                  const r2 = g2.getBoundingClientRect();
                  b2.style.top = Math.round(r2.top + (window.scrollY || 0)) + 'px';
                }
              } catch (e) { }
              if (honbanDeta() || n > 16) {
                clearInterval(t);
                window.__msqHayaMihari = false;
                try { if (window.__msqHayaKanshi) { window.__msqHayaKanshi.disconnect(); window.__msqHayaKanshi = null; } } catch (e) { }
                kesu();
              }
            }, 300);
          }
        } catch (e) { riyuu('覆いの例外: ' + String(e && e.message || e)); }
      };
      kabuseru();

      /* ★2026-09-09 覆いが出ている間に画面のどこかを触ったら、その場で覆いを外す。
           ユーザー報告「虫眼鏡を押すとフリーズする／何も操作が効かなくなる」の再発防止。
           pointer-events:none で指は通るようにしたが、【見た目も】検索画面に被るので退かす。
           自分のタイル(<a>)を押した時だけは残す（そのまま商品へ飛ぶため）。
         ★grep用の目印: 覆いは指を通す */
      try {
        document.addEventListener('pointerdown', (ev) => {
          try {
            const b = document.getElementById(HAKO);
            if (!b) return;
            if (ev.target && ev.target.closest && ev.target.closest('#' + HAKO)) return;
            try { if (window.__msqHayaKanshi) { window.__msqHayaKanshi.disconnect(); window.__msqHayaKanshi = null; } } catch (e) { }
            window.__msqHayaMihari = false;
            riyuu('他所を触ったので覆いを外した');
            kesu();
          } catch (e) { }
        }, true);
      } catch (e) { }

      /* ① XHR を包んで返事を横取りする（読むだけ） */
      const O = XMLHttpRequest.prototype.open;
      const S = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, u) {
        try { this.__msqU = String(u || ''); } catch (e) { }
        return O.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        try {
          const jibun = this;
          if (String(jibun.__msqU || '').indexOf('entities:search') >= 0) {
            jibun.addEventListener('load', function () {
              try {
                const j = JSON.parse(jibun.responseText);
                window.__msqApiKekka = j;
                window.__msqApiT = Math.round(performance.now());
                kaku(j);
              } catch (e) {
                try { msqDiary('速い一覧の失敗', '返事を読めない ' + String(e && e.message || e)); } catch (e2) { }
              }
            });
          }
        } catch (e) { }
        return S.apply(this, arguments);
      };

      /* ② fetch で来る場合の保険（今の実機ではXHRだったが、変わる事があるため） */
      try {
        const moto = window.fetch;
        window.fetch = function () {
          let u = '';
          try { u = (typeof arguments[0] === 'string') ? arguments[0] : (arguments[0] && arguments[0].url) || ''; } catch (e) { }
          const p = moto.apply(this, arguments);
          if (String(u).indexOf('entities:search') >= 0) {
            try {
              p.then(function (res) {
                try {
                  res.clone().json().then(function (j) {
                    window.__msqApiKekka = j;
                    window.__msqApiT = Math.round(performance.now());
                    kaku(j);
                  }).catch(function () { });
                } catch (e) { }
                return res;
              });
            } catch (e) { }
          }
          return p;
        };
      } catch (e) { }

      /* ==========================================================================
         ★2026-09-09 【自分で先にAPIを投げる】（ユーザー承認「入れる。2回叩くのは許容」）
         ■ なぜ要るか（実機で測った数字。もう調べ直すな）
             HTML 326ms → DOM 482 → load 1650 → 【メルカリのJSがAPIを投げる 2544】
             → 返事 3090。つまり①〜③の横取りは「本体が投げるまで2.5秒待つ」作りだった。
             同じ要求を自分で作って投げたら 456ms に出て 995ms に返事(200・件数も題も一致)。
             ＝ 約2.1秒 先回りできる。
         ■ 材料は全部ページの中にある（実機で確認済み）
             DPoP署名   IndexedDB auth-sdk / keyPairs / dpop
                        ★秘密鍵は「取り出せない」が【署名には使える】。公開鍵はJWKに出せる
             Authorization  localStorage authTokenData.accessToken（expiration で期限が分かる）
             uuid       cookie mercari-shd-uuid-lb
             検索条件   今のURLのパラメータ
         ■ 壊さないための決め事
             ・メルカリのDOMもXHRも【書き換えない】。自分で1本投げて、自分の箱に描くだけ
             ・期限切れ・401・例外は【何もせず】今までどおりに落ちる（見た目は変わらない）
             ・描くのは既存の kaku()。本体のタイルが出たら kaku 側の歯止めで二重に描かない
             ・叩く回数は検索1回につき2回になる（ユーザー承認済み）
             ・URLに【こちらが写せない絞り込み】が入っている時は先回りしない
               （間違った一覧を一瞬でも出さないため）
             ・止めたい時は localStorage の msq_jibun = '0'（msq_haya='0' でも止まる）
         ★grep用の目印: 先回り
         ========================================================================== */
      (function () {
        try {
          if (kiru()) { riyuu('先回り: 止められている(msq_haya=0)'); return; }
          try { if (localStorage.getItem('msq_jibun') === '0') { riyuu('先回り: 止められている(msq_jibun=0)'); return; } } catch (e) { }
          if (!kensakuKa()) return;

          const S = { 開始: Math.round(performance.now()) };
          window.__msqSaki = S;
          const owari = (s) => { S.結果 = s; riyuu('先回り: ' + s); };

          const q = new URL(location.href).searchParams;
          /* ★写せない絞り込みが入っていたら手を出さない（間違った一覧を出さないため） */
          const dame = ['color_id', 'shipping_payer_id', 'shipping_method', 'shipping_from_area',
            'has_coupon', 'seller_id', 'page_token', 'shop_ids', 'sku_ids'];
          for (let i = 0; i < dame.length; i++) {
            if (q.get(dame[i])) { owari('写せない絞り込みがある(' + dame[i] + ')'); return; }
          }

          const b64u = (buf) => {
            let s = ''; const a = new Uint8Array(buf);
            for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
            return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          };
          const moji2b64u = (str) => b64u(new TextEncoder().encode(str));
          const cookie = (n) => {
            const m = document.cookie.split(';').map((s) => s.trim()).find((s) => s.indexOf(n + '=') === 0);
            return m ? m.slice(n.length + 1) : '';
          };
          const kazuHairetsu = (s) => String(s || '').split(',').filter((x) => x !== '').map(Number).filter((x) => !isNaN(x));

          const sakiJikkou = async function () {
            try {
              /* ページ起動直後は authTokenData がまだ localStorage に入って
                 いないことがある。ここで一度終了すると本体のAPI待ちになり、
                 ２列のスケルトンが長く残るため、認証情報が後から入った時
                 だけ短時間・回数限定で再試行する。検索APIを二重に投げ続け
                 ないため、成功後は再試行しない。 */
              if (window.__msqApiKekka) return;
              const at = JSON.parse(localStorage.getItem('authTokenData') || 'null');
              if (!at || !at.accessToken) {
                const n = Number(window.__msqSakiRetryCount || 0);
                if (n < 8 && !window.__msqApiKekka) {
                  window.__msqSakiRetryCount = n + 1;
                  setTimeout(sakiJikkou, 150);
                }
                owari('accessTokenが無い(再試行' + n + ')');
                return;
              }
              if (Date.now() > Number(at.expiration || 0) - 5000) { owari('期限切れ'); return; }
              const uuid = cookie('mercari-shd-uuid-lb');
              if (!uuid) { owari('uuidが無い'); return; }

              const db = await new Promise((res, rej) => {
                const r = indexedDB.open('auth-sdk');
                r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
              });
              const pair = await new Promise((res, rej) => {
                const t = db.transaction('keyPairs', 'readonly').objectStore('keyPairs').get('dpop');
                t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
              });
              try { db.close(); } catch (e) { }
              if (!pair || !pair.privateKey || !pair.publicKey) { owari('dpopの鍵が無い'); return; }
              S.鍵を読んだ = Math.round(performance.now());

              const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
              const atama = { typ: 'dpop+jwt', alg: 'ES256', jwk: { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y } };
              const nakami = {
                iat: Math.floor(Date.now() / 1000),
                jti: (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())),
                htu: 'https://api.mercari.jp/v2/entities:search', htm: 'POST', uuid: uuid
              };
              const moto = moji2b64u(JSON.stringify(atama)) + '.' + moji2b64u(JSON.stringify(nakami));
              const sain = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
                pair.privateKey, new TextEncoder().encode(moto));
              const dpop = moto + '.' + b64u(sain);
              S.署名できた = Math.round(performance.now());

              /* 並び順・状態はURLの言葉をメルカリのAPIの言葉に置き換える */
              const narabi = { created_time: 'SORT_CREATED_TIME', price: 'SORT_PRICE', like: 'SORT_NUM_LIKES', score: 'SORT_SCORE' };
              const jotai = q.get('status') === 'sold_out' ? ['STATUS_SOLD_OUT', 'STATUS_TRADING']
                : (q.get('status') === 'on_sale' ? ['STATUS_ON_SALE'] : []);
              const jouken = {
                keyword: q.get('keyword') || '', excludeKeyword: q.get('exclude_keyword') || '',
                sort: narabi[q.get('sort')] || 'SORT_SCORE',
                order: q.get('order') === 'asc' ? 'ORDER_ASC' : 'ORDER_DESC',
                status: jotai,
                sizeId: kazuHairetsu(q.get('size_id')), categoryId: kazuHairetsu(q.get('category_id')),
                brandId: kazuHairetsu(q.get('brand_id')), sellerId: [],
                priceMin: Number(q.get('price_min') || 0), priceMax: Number(q.get('price_max') || 0),
                itemConditionId: kazuHairetsu(q.get('item_condition_id')),
                shippingPayerId: [], shippingFromArea: [], shippingMethod: [], colorId: [],
                hasCoupon: false, attributes: [],
                itemTypes: (q.get('item_types') === 'mercari') ? ['ITEM_TYPE_MERCARI'] : [],
                skuIds: [], shopIds: [], excludeShippingMethodIds: []
              };
              const honbun = {
                userId: String(((at.idToken || {}).sub) || '').replace(/\D/g, ''),
                config: { responseToggles: ['QUERY_SUGGESTION_WEB_1'] },
                pageSize: 120, pageToken: '',
                searchSessionId: b64u(crypto.getRandomValues(new Uint8Array(16))).replace(/[^a-z0-9]/gi, '').toLowerCase(),
                source: 'BaseSerp', indexRouting: 'INDEX_ROUTING_UNSPECIFIED', thumbnailTypes: [],
                searchCondition: jouken, serviceFrom: 'suruga', withItemBrand: true, withItemSize: false
              };

              S.投げた = Math.round(performance.now());
              const r = await fetch('https://api.mercari.jp/v2/entities:search', {
                method: 'POST',
                headers: {
                  'Accept-Language': 'ja', 'Accept': 'application/json, text/plain, */*',
                  'Content-Type': 'application/json', 'X-Platform': 'web', 'X-Country-Code': 'JP',
                  'DPoP': dpop, 'Authorization': at.accessToken
                },
                body: JSON.stringify(honbun)
              });
              S.返事 = r.status; S.返った = Math.round(performance.now());
              if (r.status !== 200) { owari('返事が' + r.status); return; }
              const j = await r.json();
              const kazu = ((j || {}).items || []).length;
              S.件数 = kazu;
              if (!kazu) { owari('商品0件だったので何もしない'); return; }
              /* 本体の横取りと同じ入れ物に入れる（覆いの置き直し等が使う） */
              if (!window.__msqApiKekka) { window.__msqApiKekka = j; window.__msqApiT = Math.round(performance.now()); }
              S.描きに回した = Math.round(performance.now());
              kaku(j);
            } catch (e) { owari('例外 ' + String(e && e.message || e)); }
          };
          sakiJikkou();
        } catch (e) { riyuu('先回りの例外: ' + String(e && e.message || e)); }
      })();
    } catch (e) { }
  })();

  /* ==========================================================================
     ★2026-09-09 タップした時に震わせる（ユーザー依頼「アプリ全体のタップ動作に」）
     ■ 実機で確かめた事実
       端末の触覚フィードバック設定 haptic_feedback_enabled = 1（ON）
       アプリの権限は INTERNET だけで【VIBRATE が無かった】
       → WebViewの navigator.vibrate は関数としては在るが、呼ぶと false（鳴らない）
       ＝「前は鳴っていた」のは端末側（キーボードやナビゲーションバー）の震えで、
         このアプリの中のボタンは一度も鳴っていない（gitの全履歴に vibrate は0件）。
       AndroidManifest.xml に VIBRATE を足したので、焼けば鳴るようになる。
     ■ どこで鳴らすか
       click（＝タップが成立した時）で1回。押した瞬間(pointerdown)にはしない。
       pointerdown にすると【スクロールを始めるたびに震える】ので使い物にならない。
     ■ 決め事
       ・鳴らすだけ。preventDefault も stopPropagation もしない（動作は一切変えない）
       ・15ミリ秒の短い1回。連打しても 60ms より短い間隔では鳴らさない
       ・止めたい時は localStorage の msq_vib = '0'
     ★grep用の目印: タップで震わせる
     ========================================================================== */
  (function () {
    try {
      if (window.__msqVibTuita) return;
      window.__msqVibTuita = true;
      let mae = 0;
      document.addEventListener('click', () => {
        try {
          if (localStorage.getItem('msq_vib') === '0') return;
        } catch (e) { }
        try {
          const ima = Date.now();
          if (ima - mae < 60) return;
          mae = ima;
          if (navigator.vibrate) navigator.vibrate(15);
        } catch (e) { }
      }, true);
    } catch (e) { }
  })();

  /* ==========================================================================
     ★2026-09-09 ユーザー依頼（案2を選んだ）
       「メルカリの文字を選択したときの文字でメルカリを開く機能を検証アプリにも入れたい」
       「2でやれ　かぶらないように」

     ■ なぜ画面側に出すのか（アプリ側で足す案1は実機で駄目だった）
       新しい MainActivity は【APKに入っている】ことを実機で確認した
       （窓口一覧に getKokokuBlock / setKokokuBlock / getKokokuKazu が出る）。
       それでも onActionModeStarted で足した「商品検索」がメニューに出ない。
       WebViewの選択メニューは Chromium 側で作り直されるため、後から足した項目は消される。
       「＋」（開閉）の中にも無かった＝隠れているのではなく消えている。

     ■ かぶらない置き方（ユーザー指示「かぶらないように」）
       ・端末の選択メニューは【選択の上】に出る（実機の写真で確認）→ こちらは【下】に出す
       ・下に入りきらない時だけ上に出す
       ・画面の下120pxには絶対に置かない（🐞・更新・型番検索・レンズのボタンがあるため）
       ・横も画面からはみ出さないように寄せる

     ■ 押した時
       選んだ文字でメルカリを開く。アプリなら MsqApp.openMercari でメルカリタブへ。
       絞り込みは付けない（今までどおり rawDefaults が既定を付ける）。
     ★grep用の目印: 選んだ文字で商品検索
     ========================================================================== */
  (function () {
    try {
      if (window.__msqSentakuTuita) return;
      /* ★2026-09-09 焼かずに止められるスイッチ（msq_sentaku='0' で出さない）
         ★grep用の目印: 選んだ文字で商品検索 */
      try { if (localStorage.getItem('msq_sentaku') === '0') return; } catch (e) { }
      window.__msqSentakuTuita = true;
      const ID = 'msq-sentaku-kensaku';
      let moji = '';
      const kesu = () => {
        try { const e = document.getElementById(ID); if (e) e.remove(); } catch (e) { }
      };
      const dasu = () => {
        let s = null;
        try { s = window.getSelection(); } catch (e) { return; }
        if (!s || s.isCollapsed || !s.rangeCount) { kesu(); return; }
        let t = String(s.toString() || '').replace(/\s+/g, ' ').trim();
        if (t.length < 2) { kesu(); return; }
        if (t.length > 60) t = t.slice(0, 60);      /* 長すぎる選択は切る */
        let r = null;
        try { r = s.getRangeAt(0).getBoundingClientRect(); } catch (e) { return; }
        if (!r || (!r.width && !r.height)) { kesu(); return; }
        moji = t;
        let b = document.getElementById(ID);
        if (!b) {
          b = document.createElement('button');
          b.id = ID;
          b.textContent = '商品検索';
          b.style.cssText = 'position:fixed;z-index:2147483600;padding:8px 14px;'
            + 'border:none;border-radius:18px;background:#ff2d55;color:#fff;'
            + 'font-size:14px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.45);'
            + 'line-height:1;white-space:nowrap;';
          b.addEventListener('click', (ev) => {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (e) { }
            const u = 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(moji);
            kesu();
            try {
              if (window.MsqApp && window.MsqApp.openMercari) { window.MsqApp.openMercari(u); return; }
            } catch (e2) { }
            location.href = u;
          }, true);
          document.body.appendChild(b);
        }
        const H = b.offsetHeight || 36;
        const W = b.offsetWidth || 90;
        const SHITA = 120;                          /* 下のボタン群を避ける高さ */
        let y = r.bottom + 10;                      /* まず選択の下 */
        if (y + H > innerHeight - SHITA) y = r.top - H - 10;   /* 入らなければ上 */
        if (y < 4) y = 4;
        if (y > innerHeight - SHITA - H) y = Math.max(4, innerHeight - SHITA - H);
        let x = r.left;
        if (x + W > innerWidth - 8) x = innerWidth - W - 8;
        if (x < 8) x = 8;
        b.style.left = Math.round(x) + 'px';
        b.style.top = Math.round(y) + 'px';
      };
      let taima = null;
      document.addEventListener('selectionchange', () => {
        if (taima) clearTimeout(taima);
        taima = setTimeout(dasu, 250);
      });
      window.addEventListener('scroll', kesu, { passive: true });
    } catch (e) { }
  })();
  /* ★この商品ページを もう読んだか の印（下の lensItemHook の説明を参照）。
     ★ルーティングより前に置くこと（後ろだと「初期化前に使った」で落ちる）。 */
  let lYonda = '';

  /* ===== 固有名詞の置き場（2026-08-17 新規） =====
     ★型番 → その商品がメルカリで共通して呼ばれている語。
       測るのはメルカリの一覧（下の rawKoyuuMeishi）。使うのは仕入元の一覧（コピー）。
     ★サイトをまたぐので localStorage だけでは足りない。アプリの置き場にも預ける。
       MainActivity.kt の msqSave / msqLoad は web / shiire / kekka の3画面すべてに
       同じ物が渡してあるので（372〜374行）、こちらで預けてあちらで読める。
     ★★ルーティングより前に置くこと。仕入元サイトは1500行あたりで return するため、
       それより後ろに置くと仕入元側から呼んだ時に「初期化前に使った」で落ちる。
       この型は何度も踏んでいる（RAW_BUILD / rawNum / LRUN と同じ理由）。 */
  const RAW_KOYUU_KEY = 'msq_koyuu:';
  function rawKoyuuKagi(kata) {
    return RAW_KOYUU_KEY + String(kata || '').toUpperCase().replace(/[\s　]/g, '');
  }
  function rawKoyuuSave(kata, moji) {
    if (!kata || !moji) return;
    const k = rawKoyuuKagi(kata);
    try { localStorage.setItem(k, moji); } catch (e) { }
    try {
      if (window.MsqApp && typeof window.MsqApp.msqSave === 'function') window.MsqApp.msqSave(k, moji);
    } catch (e) { }
  }
  function rawKoyuuLoad(kata) {
    if (!kata) return '';
    const k = rawKoyuuKagi(kata);
    let v = '';
    try { v = localStorage.getItem(k) || ''; } catch (e) { }
    if (!v) {
      try {
        if (window.MsqApp && typeof window.MsqApp.msqLoad === 'function') v = String(window.MsqApp.msqLoad(k) || '');
      } catch (e) { }
    }
    return v;
  }

  /* ★本家の結果ツールが使う入れ物（list_extractor.js の 6348〜6457 と同じ）。
     ★必ずルーティングより前に置くこと。後ろだと初期化されないまま使われる。 */
  let currentCostPrice = 0;
  let currentBrand = '';
  let currentCategory = '';
  let currentBrandFilter = '';
  let currentSizeFilter = '';
  let currentModelFilter = '';
  let currentSrcModel = '';
  let currentSrcRank = '';
  let msqExcludedUrls = new Set();
  let msqExcludedOrder = [];
  let msqConfirmedModelCodes = new Set();
  let currentCond = 'good';
  let currentExcludeBadge = false;
  let msqFiltersOpen = false;

  /* ★本家の結果ツールが使う定数。本家 list_extractor.js からそのまま持ってきた分（2026-08-15）。
     ★ここも必ずルーティングより前。MSQ_CORE は他が読むので一番先に置く。 */
  const MSQ_CORE = (typeof MSQCore !== 'undefined' && MSQCore) ? MSQCore : {
    FEE: { purchase: 770, shipping: 750, sellRate: 0.10, outsource: 500 },
    calcProfit: function (sellPrice, costPrice) {
      const sellFee = sellPrice * 0.10;
      return { profit: sellPrice - costPrice - 770 - 750 - sellFee - 500, sellFee: sellFee };
    },
    condKeyLoose: function (c) {
      if (!c) return 'unknown';
      if (/新品[、,・\s]?\s*未使用/.test(c)) return 'new';
      if (/未使用に近い/.test(c)) return 'likenew';
      if (/目立った傷や汚れなし/.test(c)) return 'good';
      if (/やや傷や汚れあり/.test(c)) return 'fair';
      if (/傷や汚れあり/.test(c)) return 'poor';
      if (/全体的に状態が悪い/.test(c)) return 'bad';
      return 'unknown';
    },
    parseCsv: function (text) {
      const rows = []; let row = []; let field = ''; let inQ = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
          if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; } }
          else field += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\r') { /* 無視 */ }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
      if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
      return rows;
    },
    // ★2026-08-01修正(ユーザー指摘「ブランド辞書の突き合わせができなくなったのか、
    //   それは後退じゃないか」): まったくその通りだった。
    //   ここは以前「辞書が無ければ推定しないだけなので正常に動く」と書いて空にして
    //   いたが、それは「落ちない」というだけの話で、ブランド照合が丸ごと効かなくなる。
    //   実際には msq_core.js が読めていない実機で、ブランド候補も絞り込みも
    //   効かない状態になっていた。機能が減るなら代替とは呼べない。
    //   → msq_core.js の実装をそのまま持つ。判定規則は1文字も変えていないので、
    //     msq_core.js の有無で答えが変わることはない(検査で全件突き合わせている)。
    normalizeKey: function (v) {
      return String(v || '')
        .normalize('NFKC')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s\u3000]/g, '')
        .replace(/＆/g, '&');
    },
    /* ★2026-08-05追加。型番が同じかどうかの判定。
       msq_core.js はページ側に注入されないので、ここに同じものを置かないと
       スマホでは完全一致しか通らず、PCと結果が変わる（実際にそうなっていた）。
       規則は msq_core.js の srcModelHit と同一:
         完全一致、またはハイフン等の区切りまで一致していれば同じ型番とみなす。
       ★2026-08-07 完全一致だけの srcModelHitExact を別に用意した。
         使ってよいのは【型番のみ】の経路だけ。こちら(srcModelHit)は
         レンズ結果用で、緩いまま変えない（服が1件も残らなくなるため）。 */
    MODEL_PREFIX_MIN: 6,
    _modelKey: function (s) {
      return String(s || '').normalize('NFKC').toLowerCase()
        .replace(/[-‐－—_\s　/.]+/g, '');
    },
    _modelSegPrefixes: function (model) {
      const segs = String(model || '').split(/[-‐－—_\s　/]+/).filter(Boolean);
      const out = [];
      for (let k = 2; k <= segs.length - 1; k++) {
        const p = this._modelKey(segs.slice(0, k).join(''));
        if (p.length >= this.MODEL_PREFIX_MIN) out.push(p);
      }
      return out;
    },
    /* ★2026-09-12 ユーザー「そもそも型番は完全一致じゃないといかんぞ」
         「ちなみにこの完全一致は一括ツールやA、スマホ、PCの拡張機能、アプリでも
           使ってるか？　またここがずれるとややこしいぞ」
       ＝PCと同じ【完全一致だけ】にそろえた。断片一致をやめる。
       ★実害（2026-09-12 実機・PC側）:
           検索元 PP04-JG613 に対し、断片 PP04 だけを持つ別商品に ★同型番 が付いていた。
           PP04 はプリーツプリーズの品番の頭で、何十種類もの別商品が共有している。
       ★2026-08-07 に本人が既に決めていた判断（「完全一致や　型番の意味がない！！
         1文字違うだけで相場違うからな」）。実装が追いついていなかった。
       ★同じ判定が3か所にある。片方だけ直すと必ずずれる。
           msq_core.js ／ list_extractor.js の写し ／ ここ（アプリ）
       ★記号・大文字小文字・全角の違いは今までどおり吸収する（_modelKey）。
       ★_modelSegPrefixes は他から呼ばれているので残す。ここで使わないだけ。
       ★grep用の目印: 型番は完全一致 */
    srcModelHit: function (codes, srcModel) {
      const src = srcModel ? this._modelKey(srcModel) : '';
      if (!src) return false;
      const self = this;
      return (codes || []).some(function (c) {
        const n = self._modelKey(c);
        return !!n && n === src;
      });
    },
    /* 【厳しい判定】完全一致だけ。★2026-08-07 ユーザー判断
       「型番のみモードの時だけ完全一致にする（レンズ結果は今までどおり緩い判定）。
         理由　そうすると服がヒットしなくなる」
       ★使ってよいのは【型番のみ】の経路だけ。 */
    /* その型番の「本体」ではなく「部品・付属品」か（PCの msq_core.js と同じ規則）。
       「用/対応/互換/交換」と部品の語が両方そろった時だけ部品とみなす。
       片方だけで落とすと「◯◯ 本体のみ ベルト無し」まで消える。 */
    PART_WORDS: /(パッキン|Оリング|Oリング|オーリング|ベルト|バンド|ストラップ|ガラス|風防|裏蓋|裏フタ|裏ぶた|ベゼル|カバー|ボタン|バネ棒|ばね棒|尾錠|コマ|電池|工具|フィルム|保護|ケース|箱|取扱説明書|説明書|ピン|ネジ|ねじ)/,
    PART_CONTEXT: /(用|対応|互換|交換)/,
    PART_ALONE: /(部品取り|ジャンク部品|パーツ取り)/,
    looksLikePart: function (title, description) {
      const t = String(title || '');
      if (!t) return false;
      if (this.PART_ALONE.test(t)) return true;
      if (this.PART_WORDS.test(t) && this.PART_CONTEXT.test(t)) return true;
      const d = String(description || '').slice(0, 300);
      if (d && this.PART_ALONE.test(d)) return true;
      return false;
    },
    /* 文章の中に「仕入元の型番そのもの」が書かれているかを直接見る。
       ★2026-08-07 PC(msq_core.js の textHasModel)と同じもの。
       抽出条件に引っかかって本文の型番が見えなくなるのを防ぐ。部分一致にはしない。 */
    textHasModel: function (text, srcModel) {
      const src = srcModel ? this._modelKey(srcModel) : '';
      if (!src || !text) return false;
      const parts = String(text)
        .split(/[\s　\/,、。・()（）\[\]【】｜|★☆■□●○◆◇▲△▼▽※＊*＞>＜<〜~:：=＝#＃"'`]+/);
      for (let i = 0; i < parts.length; i++) {
        const t = String(parts[i]).replace(/^[-–—]+|[-–—、。]+$/g, '');
        if (!t) continue;
        if (this._modelKey(t) === src) return true;
        const t2 = t.normalize('NFKC')
          .replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, '');
        if (t2 && t2 !== t && this._modelKey(t2) === src) return true;
      }
      return false;
    },
    srcModelHitExact: function (codes, srcModel) {
      const src = srcModel ? this._modelKey(srcModel) : '';
      if (!src) return false;
      const self = this;
      return (codes || []).some(function (c) {
        const n = self._modelKey(c);
        return !!n && n === src;
      });
    },
    buildBrandNamePairs: function (dict, noiseRe) {
      const norm = MSQ_CORE.normalizeKey;
      const noise = noiseRe || /^$/;
      const nameToPair = new Map();
      Object.entries((dict && dict.katakanaToEnglish) || {}).forEach(function (e) {
        const kana = e[0], en = e[1];
        const pair = { english: en, katakana: kana };
        [kana, en].forEach(function (raw) {
          if (!raw || noise.test(raw)) return;
          const key = norm(raw);
          if (key.length < 2) return;
          // 4文字未満の英数字のみの名前は、別の単語の内側に一致する事故が多いので外す。
          if (/^[a-z0-9&.-]+$/.test(key) && key.length < 4) return;
          if (!nameToPair.has(key)) nameToPair.set(key, pair);
        });
      });
      // 長い(具体的な)名前を優先。「ポロラルフローレン」と「ラルフローレン」の取り違え防止。
      const sortedNames = Array.from(nameToPair.keys()).sort(function (a, b) { return b.length - a.length; });
      return { nameToPair: nameToPair, sortedNames: sortedNames };
    },
    findBrandPairInTitle: function (title, pairs) {
      const norm = MSQ_CORE.normalizeKey;
      if (!pairs || !pairs.sortedNames) return null;
      const hay = norm(title);
      if (!hay) return null;
      // ①4文字以上は部分一致(長い順に見るので具体的なブランドが優先される)
      for (let i = 0; i < pairs.sortedNames.length; i++) {
        const n = pairs.sortedNames[i];
        if (n.length >= 4 && hay.indexOf(n) >= 0) return { name: n, pair: pairs.nameToPair.get(n) };
      }
      // ②4文字未満は「区切りで割った断片の先頭に来ている時」だけ拾う
      //   (「リルのワンピース」は拾い、「フリルのブラウス」は拾わない)
      const toks = String(title || '').split(/[\s\u3000\/,、・()（）\[\]【】｜|]+/)
        .filter(Boolean).map(norm);
      for (let i = 0; i < pairs.sortedNames.length; i++) {
        const n = pairs.sortedNames[i];
        if (n.length < 4 && toks.some(function (tk) { return tk.indexOf(n) === 0; })) {
          return { name: n, pair: pairs.nameToPair.get(n) };
        }
      }
      return null;
    },
    BUILD: '(msq_core.js 未読込)',
  };
  const MSQ_MODEL_CONFIRM_MIN = 3; // 何件以上で「本物の型番」とみなすか
  const MSQ_BRAND_NOISE_LIKE =
    /^(SLV|BLK|WHT|GLD|BLU|GRN|RED|PNK|BRN|GRY|GRAY|NVY|BEG|ORG|PPL|IVR|CML|KHK|YEL|TAN|WINE|BOR|MULTI|CLR|SMK|GRD|MIR|PLD|MOC|CHR|OFF|NAT|MEN|WOMEN|UNISEX|メンズ|レディース|ユニセックス|キッズ|ブラック|ホワイト|シルバー|ゴールド|ブルー|グリーン|レッド|ピンク|ブラウン|グレー|ネイビー|ベージュ|オレンジ|パープル|イエロー|カーキ|スモーク|ミラー|マルチ|クリア|サイズ|コットン|ポリエステル|ナイロン|ウール|シルク|リネン|レザー|デニム|ジャージー?|ニット|レース|フリル|ボリューム|ヴィンテージ|ビンテージ|新品|未使用|美品|中古)$/i;
  const MSQ_SHOP_RANK_TO_COND = {
    // セカスト(絞り込みパネルの列挙で5段・Sランク無しを確認済み)
    '新品': 'new', '未使用品': 'new',
    '中古A': 'likenew',
    '中古B': 'good',
    '中古C': 'fair',
    '中古D': 'poor',
    // カインドオル(商品ページの「ランクB」表記。定義表で5段を確認済み)
    'ランクS': 'new',
    'ランクA': 'likenew',
    'ランクB': 'good',
    'ランクC': 'fair',
    'ランクD': 'poor',
    // ブランディアのコンディションレベル（実ページの表示順に対応）
    '未使用': 'new',
    '新品同様': 'likenew',
    '美品': 'likenew',
    'きれいめ': 'good',
    'ふつうに使える': 'fair',
    '使用感あり': 'poor',
    '難あり': 'bad'
  };
  const MSQ_DIARY = [];
  const SIZE_LIKE = /^(XS|S|M|L|XL|XXL|F|FREE|フリー|[0-9]{1,3}(cm|号)?)$/i;
  const ERA_LIKE = /^(\d{2}s|\d{2,4}年代?|[’']\d{2}s?|vintage|ヴィンテージ|ビンテージ)$/i;
  CATEGORY_TOKENS = ['ボトム','トップス','アウター','服飾雑貨','ストール','マフラー','キャップ','帽子','タンクトップ','Tシャツ','ロンT','カットソー','ブラウス','シャツ','ポロシャツ','パーカー','パーカ','スウェット','トレーナー','カーディガン','ニット','セーター','ベスト','リバースウィーブ','フィールドジャケット','ミリタリージャケット','デニムジャケット','ライダースジャケット','テーラードジャケット','ダウンジャケット','レザージャケット','ムートンジャケット','ボンバージャケット','フライトジャケット','Gジャン','スカジャン','MA-1','ノーカラージャケット','ノーカラーコート','トレンチコート','チェスターコート','モッズコート','ステンカラーコート','ジャケット','ブルゾン','コート','ダウン','マウンテンパーカ','ナイロンジャケット','ショートパンツ','デニムパンツ','ワイドパンツ','テーパードパンツ','カーゴパンツ','パンツ','ジーンズ','デニム','スラックス','チノパン','スカート','ワンピース','ドレス','セットアップ','バッグ','リュック','トート','クラッチ','ハンドバッグ','ボディバッグ','スニーカー','ブーツ','パンプス','サンダル','ローファー','シューズ','長財布','二つ折り財布','2つ折り財布','折り財布','財布','キーケース','カードケース','名刺入れ','ポーチ','ベルト','サングラス','メガネ','眼鏡','腕時計','時計','ネックレス','ブレスレット','リング','指輪','ピアス','イヤリング'];
  const COLOR_OR_ATTR_LIKE = /^(SLV|BLK|WHT|GLD|BLU|GRN|RED|PNK|BRN|GRY|GRAY|NVY|BEG|ORG|PPL|IVR|CML|KHK|YEL|TAN|WINE|BOR|MULTI|CLR|SMK|GRD|MIR|PLD|MOC|CHR|OFF|NAT|MEN|WOMEN|UNISEX|メンズ|レディース|ユニセックス|キッズ|ブラック|ホワイト|シルバー|ゴールド|ブルー|グリーン|レッド|ピンク|ブラウン|グレー|ネイビー|ベージュ|オレンジ|パープル|イエロー|カーキ|スモーク|ミラー|マルチ|クリア)$/i;
  const MSQ_FEE_PURCHASE = MSQ_CORE.FEE.purchase;
  const MSQ_FEE_SHIPPING = MSQ_CORE.FEE.shipping;
  const MSQ_FEE_OUTSOURCE = MSQ_CORE.FEE.outsource;
  let msqBrandDictPairs = null;
  const MSQ_BRAND_VALUE_SEP = '|||';
  const MSQ_BRAND_UNMATCHED_VALUE = '##MSQ_UNMATCHED##';

  /* ==========================================================================
     ★本家（メルカリサーチ list_extractor.js）の結果ツールを、セクションごと持ってきた分
     2026-08-15 ユーザー指示「丸々移して修正していったほうがいい。セクションとしては区切られてる」
     切り出したのは 11411〜12246（オーバーレイUI ＋ そのCSS）と、
     そこが外に頼っている補助21個。依存が閉じるまで機械的に追って集めたもの。
     ★中身は本家のまま。直す時は本家を直してから写すこと（二重に作らない）。
     ★元のファイル: メルカリアプリ_Android\_本家結果ツール_切り出し済み.txt
     ========================================================================== */
  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function isNewish(c) { if (!c) return false; return /新品[、,・\s]?\s*未使用|未使用に近い/.test(c); }

  /* ★本家 list_extractor.js:7386 と同じ。状態の記号 → メルカリの言い方 */
  function revCond(c) {
    const M = { new: '新品、未使用', likenew: '未使用に近い', good: '目立った傷や汚れなし',
                fair: 'やや傷や汚れあり', poor: '傷や汚れあり', bad: '全体的に状態が悪い', unknown: '' };
    return M[c] || '';
  }
  function condClass(c) {
    return MSQ_CORE.condKeyLoose(c);
  }

  const MSQ_COND_SHORT = {
    new: '新品', likenew: '未使用近', good: '傷なし',
    fair: 'やや傷', poor: '傷あり', bad: '状態悪',
  };

  let currentItems = null;

  function msqCodesOfItem(item) {
    const out = [];
    const seen = new Set();
    const add = (c) => {
      const k = msqNormalizeBrandKey(c);
      if (!k || seen.has(k)) return;
      seen.add(k); out.push(c);
    };
    if (item && item.modelCode) add(item.modelCode);
    msqExtractModelCodes(item && item.name).forEach(add);
    return out;
  }

  function msqPrimaryCodeOfItem(item) {
    if (item && item.modelCode) return item.modelCode;
    const codes = msqExtractModelCodes(item && item.name);
    if (!codes.length) return '';
    const src = currentSrcModel ? msqNormalizeBrandKey(currentSrcModel) : '';
    if (src) {
      const hit = codes.find((c) => msqNormalizeBrandKey(c) === src);
      if (hit) return hit;
    }
    if (msqConfirmedModelCodes && msqConfirmedModelCodes.size) {
      const hit = codes.find((c) => msqConfirmedModelCodes.has(msqNormalizeBrandKey(c)));
      if (hit) return hit;
    }
    return codes.slice().sort((a, b) => b.length - a.length)[0] || '';
  }

  function msqPickDisplayModel(payload) {
    // ★2026-07-29: 仕様表/説明文の「型番」欄から読めた値が最優先(全仕入れサイト共通)。
    if (payload && payload._modelSpec) return { text: String(payload._modelSpec), guess: false };
    const raw = (payload && payload._modelNumber) ? String(payload._modelNumber) : '';
    if (raw && msqExtractModelCodes(raw).length) return { text: raw, guess: false };
    if (msqConfirmedModelCodes && msqConfirmedModelCodes.size) {
      for (const it of (currentItems || [])) {
        for (const c of msqExtractModelCodes(it && it.name)) {
          if (msqConfirmedModelCodes.has(msqNormalizeBrandKey(c))) return { text: c, guess: true };
        }
      }
    }
    return { text: '', guess: false };
  }

  function msqBuildConfirmedModelCodes(items, srcModel) {
    const count = {};
    (items || []).forEach((it) => {
      msqCodesOfItem(it).forEach((c) => {
        const k = msqNormalizeBrandKey(c);
        count[k] = (count[k] || 0) + 1;
      });
    });
    const set = new Set(Object.keys(count).filter((k) => count[k] >= MSQ_MODEL_CONFIRM_MIN));
    // ★2026-07-29修正: 仕入れ元の型番を検査せず無条件に信用していた。
    //   buildKeywordは「数字を含むトークンが1つも無い場合、最も長いトークン」を
    //   _modelNumberに入れる(区切りに_を含まないため「ソーラー腕時計_GSHOCK」のような
    //   語がそのまま型番になる)。それがこの集合に入ると、型番でない語で
    //   「同一商品と断定」してしまう。実機で確認された不具合の原因。
    //   msqExtractModelCodesを通して「型番の形をしているか」を検査してから採用する
    //   (数字を含む/長さ4〜24/サイズ・年代・色でない、という既存の判定をそのまま使う)。
    if (srcModel) {
      const k = msqNormalizeBrandKey(srcModel);
      if (k && msqExtractModelCodes(srcModel).length) set.add(k);
    }
    return set;
  }

  function msqItemHasConfirmedModel(item) {
    if (!msqConfirmedModelCodes.size) return false;
    return msqCodesOfItem(item)
      .some((c) => msqConfirmedModelCodes.has(msqNormalizeBrandKey(c)));
  }

  let msqTopStatsHtml = '';

  function msqRenderExcludedInfo() {
    const n = msqExcludedOrder.length;
    if (!n) return '';
    return `<span class="msq-excluded">除外 ${n}件`
      + ` <button type="button" class="msq-undo-btn" id="msq-undo-one">↩ 1件戻す</button>`
      + (n > 1 ? ` <button type="button" class="msq-undo-btn" id="msq-undo-all">全部戻す</button>` : '')
      + `</span>`;
  }

  function msqRenderProfitHtml(visibleItems, costPrice) {
    // ★2026-07-28修正: 以前はここで空文字を返していたため、仕入れ値が運ばれて
    // こなかった時に利益計算パネルが「何のメッセージも無く丸ごと消える」状態になり、
    // 実装漏れなのか値が無いだけなのか画面から切り分けられなかった。原因が分かる
    // 表示に変える(仕入れ値の運搬経路はonSecaButtonClick→initLens→__msqprice)。
    if (!costPrice) {
      return `<div class="msq-profit-wrap"><div class="msq-profit msq-profit-empty">利益計算: 下の「元のページに戻る」から戻ると表示されます(仕入れ値は元ページでしか読めないため)</div></div>`;
    }
    // ★2026-07-28(ユーザー指示): 対象は必ず「仕入れ元と同じ状態」に限定する。
    //   違う状態の値段で相場を出しても判断材料にならないため、他の状態へ広げる処理は
    //   全廃した(以前は隣の状態→全状態と段階的に広げていた)。
    const condLabel = MSQ_CONDITION_LABELS[currentCond] || currentCond;
    const same = visibleItems.filter(it => it.price > 0 && condClass(it.condition) === currentCond);
    const sold = same.filter(it => it.isSold === true);
    const onSale = same.filter(it => it.isSold === false);
    // ★ランクが取れていない場合、currentCondは既定値でしかない。その状態で計算しても
    //   「仕入れ元と同じ状態で比較した」ことにならないので、必ず断り書きを付ける。
    const rankNote = currentSrcRank
      ? ''
      : '　⚠ 仕入れ元の商品ランクを取得できていないため、この状態は仮のものです';
    const wrap = (inner, warn) =>
      `<div class="msq-profit-wrap">${inner}</div>`;

    // ★2026-07-29修正(ユーザー指示): 販売中の最安値は、売り切れがあっても必ず出す。
    //   理由もそのまま記録しておく:「ライバルが安く出してれば判断しないといけない。
    //   売り切れてる価格が高いとしても影響があるかどうかを」。
    //   つまりこれは相場そのものではなく「今この瞬間の競合の下限」であり、
    //   売れた値段が高くても、その値段で今売れるかどうかの判断材料になる。
    //   以前は「売り切れが0件のときだけ」出す実装だった(それも当初のユーザー指示だが、
    //   本人の判断で変更された)。売り切れの高値/安値/平均とは別枠で並べる。
    /* ★2026-08-17 ユーザー指示『販売中は同じ状態の安値から3つだけの表示でいい』。
       それまでは最安1件だけだった。安い順に3件まで並べる。 */
    const onSaleLowHtml = onSale.length > 0
      ? onSale.slice().sort((x, y) => x.price - y.price).slice(0, 3)
          .map((x, i) => msqBuildProfitHtml('販売中の安値' + (i + 1), x.price, costPrice)).join('')
      : '';
    // ★2026-07-29(ユーザー指示「この説明文もいらん。行が長くなると画像などの結果情報が減る」):
    //   説明は出さない。ラベルの「販売中の最安値」だけで意味は通る。
    const onSaleNote = '';

    // 【1】売り切れがある → 実際に売れた値段なので、高値/安値/平均×0.98 を出す
    if (sold.length > 0) {
      const sorted = [...sold].sort((a, b) => b.price - a.price);
      const high = sorted[0], low = sorted[sorted.length - 1];
      const avgSell = Math.round(((high.price + low.price) / 2) * 0.98);
      // ★2026-07-29(ユーザー指示「長い説明文を短く。平均の利益欄にこの説明は不要」):
      //   通常時は説明を1行も出さない。注意が要る時だけ短く出す。
      //   以前の「売り切れN件から算出」は、平均が(高値+安値)/2×0.98で2つしか使わないのに
      //   母数のNだけ書いていて意味が伝わらなかった(ユーザーから「3件ってなんだ」と指摘)。
      const warn = !currentSrcRank ? '⚠ 仕入れ元のランク未取得のため状態は仮です'
                 : (sold.length === 1 ? '⚠ 売り切れ1件のみ' : '');
      return wrap(
        msqBuildProfitHtml('高値', high.price, costPrice)
        + msqBuildProfitHtml('安値', low.price, costPrice)
        + msqBuildProfitHtml('平均×0.98', avgSell, costPrice)
        + (warn ? `<div class="msq-profit-note msq-profit-note-warn">${esc(warn)}</div>` : '')
        + onSaleLowHtml + onSaleNote);
    }

    // 【2】売り切れは無いが販売中がある → 最安値だけを参考値として出す(ユーザー指示)。
    //   販売中は「売れた値段」ではなく「売り手の希望価格」なので、高値や平均を出すと
    //   相場を誤認させる。最安値だけは「今この状態の競合の下限」として参考になる。
    if (onSale.length > 0) {
      const low = onSale.reduce((a, b) => (a.price <= b.price ? a : b));
      // ★2026-07-29: 説明は短くする(行が増えると結果の画像が減るため)。
      //   ここは「売れた値段が1件も無い」という重要な但し書きなので、一言だけ残す。
      const note = '⚠ 売り切れ0件のため参考値' + (currentSrcRank ? '' : '／ランク未取得');
      return wrap(
        msqBuildProfitHtml('販売中の最安値', low.price, costPrice)
        + `<div class="msq-profit-note msq-profit-note-warn">${esc(note)}</div>`);
    }

    // 【3】売り切れも販売中も無い → 何も出さない(ユーザー指示)
    return wrap(`<div class="msq-profit msq-profit-empty">`
      + `利益計算: 仕入れ元と同じ状態「${esc(condLabel)}」の候補が売り切れ・販売中とも0件のため算出できません`
      + `（違う状態の値段で計算しても相場の意味が無いので、あえて出していません）`
      + esc(rankNote) + `</div>`);
  }

  function msqCondFromShopRank(rank) {
    const r = (rank || '').replace(/[\s　]/g, '');
    if (!r) return '';
    if (MSQ_SHOP_RANK_TO_COND[r]) return MSQ_SHOP_RANK_TO_COND[r];
    // 「商品の状態 : 中古B」のように前置きが付いた文字列でも拾えるようにする
    for (const key of Object.keys(MSQ_SHOP_RANK_TO_COND)) {
      if (r.includes(key)) return MSQ_SHOP_RANK_TO_COND[key];
    }
    // ヤフオクはメルカリと一字一句同じ語彙なので、そのまま解釈できる。
    const c = condClass(r);
    if (c !== 'unknown') return c;
    // ヤフオクの「未使用」だけはメルカリの「新品、未使用」と表記が違うため個別に対応。
    // (condClassの正規表現は「新品」+「未使用」の並びを見ているので単独の「未使用」は拾えない)
    if (r === '未使用') return 'new';
    return '';
  }

  function msqInferBrandCategoryFromTitles(candidateIds) {
    const titleMap = {};
    document.querySelectorAll('a[href*="/item/m"]').forEach(a => {
      const mm = (a.href.match(/m\d{10,13}/) || [])[0];
      if (mm) titleMap[mm] = (titleMap[mm] || '') + ' ' + (a.textContent || '');
    });
    const allTitles = candidateIds.map(id => titleMap[id] || '').filter(Boolean);
    if (!allTitles.length) return { brand: '', category: '' };

    // カテゴリ推定: 単一の最頻出語だけを採用すると、「デニム」と「パンツ/スキニー」の
    // ような表記ゆれで一致しない実在商品まで弾いてしまう(1カテゴリに限らず起こりうる
    // 汎用的な問題)。決め打ちの同義語グループを都度追加し続けるのは限界があるため、
    // 一定割合(20%)以上のタイトルに出現した候補語は全部許容する(実質、タイトル群から
    // 動的に同義語グループを作るのと同じ効果になり、他のカテゴリにも自動で効く)。
    const catCount = {};
    allTitles.forEach(t => {
      CATEGORY_TOKENS.forEach(tok => {
        if (t.includes(tok)) catCount[tok] = (catCount[tok] || 0) + 1;
      });
    });
    const catThreshold = Math.max(1, Math.ceil(allTitles.length * 0.2));
    const acceptedCategories = Object.keys(catCount).filter(k => catCount[k] >= catThreshold);
    msqDiag('[MSQ診断:カテゴリ推定]集計 ' + JSON.stringify(catCount) + ' / 閾値 ' + catThreshold + ' / 採用 ' + JSON.stringify(acceptedCategories));

    // ブランド推定: 各タイトルの先頭の単語だけを候補にする(ブランド名は先頭に来る
    // 慣習に合わせる。先頭から3語まで見ていた旧版は、「〜 - メルカリ」のように
    // Google検索結果の末尾に付く「メルカリ」という語をブランドと誤認する不具合があった)。
    // 「新品」「未使用」等のノイズ語・サイト名・数字だけの単語は候補から除外する。
    const NOISE_WORDS = /^(新品|未使用|中古|美品|激安|送料込み?|限定|正規品?|良品|タグ付き?|メルカリ|mercari|ラクマ|yahoo|ヤフオク|楽天)$/i;
    // ★重要なバグ修正: 大文字小文字を区別せずに数えないと、同じブランドでも
    // "mnml"/"MNML"/"Mnml"のような表記ゆれで別々の単語として分散カウントされ、
    // 本来9割を占めるブランドが過半数に届かず、1件しかない別ブランドの方が
    // (誤って)勝ってしまう不具合があった。正規化したキーで数え、ログ表示用に
    // 最初に見た元の表記を別途記録する。
    const wordCount = {};
    const wordDisplay = {};
    allTitles.forEach(t => {
      // 実際のデータで確認: 全タイトルの先頭に「メルカリ - Mercari」のような
      // Google検索結果のサイト名表記が、実タイトルと隙間なく連結されて付いてくる
      // (例:「メルカリ - Mercarimnml x201 ...」)。これを剥がしてから単語分割する。
      const cleaned = t.replace(/^[\s　]*メルカリ\s*-\s*Mercari/i, '').trim();
      const words = cleaned.split(/[\s　\/,、・()（）\-]+/).filter(Boolean);
      // 先頭1語だけに固定すると、上記の剥がし残し等でノイズ語が来た場合に
      // 諦めてしまい何も拾えなくなる。先頭から数語のうち、ノイズ語でない
      // 最初の1語を採用する(全部ノイズなら何も拾わない)。
      for (const w of words.slice(0, 3)) {
        if (w.length < 2) continue;
        if (NOISE_WORDS.test(w)) continue;
        if (/^\d+$/.test(w)) continue;
        const key = w.toLowerCase();
        wordCount[key] = (wordCount[key] || 0) + 1;
        if (!wordDisplay[key]) wordDisplay[key] = w;
        break;
      }
    });
    let bestBrandKey = '', bestBrandCount = 0;
    Object.keys(wordCount).forEach(k => {
      if (wordCount[k] > bestBrandCount) { bestBrandKey = k; bestBrandCount = wordCount[k]; }
    });
    const bestBrand = bestBrandKey ? (wordDisplay[bestBrandKey] || bestBrandKey) : '';

    const threshold = Math.ceil(allTitles.length / 2);
    // ★診断用: 何が起きてるか正確に把握するため、実際のタイトル一覧と単語集計を
    // まるごとconsole.logに出す(推測での修正を繰り返すのをやめるため)。
    // JSON.stringifyで文字列化しておく(console.logにオブジェクトをそのまま渡すと
    // "Array(10)"/"Object"としか表示されず、コピペしても中身が見えないため)。
    msqDiag('[MSQ診断:ブランド推定]対象タイトル一覧 ' + JSON.stringify(allTitles));
    msqDiag('[MSQ診断:ブランド推定]単語集計 ' + JSON.stringify(wordCount) + ' / 表示用 ' + JSON.stringify(wordDisplay));
    msqDiag('[MSQ診断:ブランド推定]採用 [' + bestBrand + '] ' + bestBrandCount + ' / 閾値 ' + threshold + ' / 全 ' + allTitles.length + ' 件');
    return {
      brand: bestBrandCount >= threshold ? bestBrand : '',
      categories: acceptedCategories
    };
  }

  const MSQ_CONDITION_RANK = ['new', 'likenew', 'good', 'fair', 'poor', 'bad', 'unknown'];

  const MSQ_CONDITION_LABELS = { new:'新品、未使用', likenew:'未使用に近い', good:'目立った傷や汚れなし', fair:'やや傷や汚れあり', poor:'傷や汚れあり', bad:'状態が悪い', unknown:'状態不明' };

  function calculateSummary(items) {
    const allP = items.map(i => i.price).filter(p => p > 0).sort((a,b)=>a-b);
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    const median = a => a.length ? a[Math.floor(a.length/2)] : 0;
    return {
      total: items.length,
      onSale: 0, soldOut: 0,
      avgPrice: avg(allP), avgSoldPrice: 0,
      medianPrice: median(allP),
      minPrice: allP.length ? allP[0] : 0,
      maxPrice: allP.length ? allP[allP.length-1] : 0
    };
  }

  function msqBuildProfitHtml(label, sellPrice, costPrice) {
    const { profit, sellFee } = msqCalcProfit(sellPrice, costPrice);
    const cls = profit >= 0 ? 'msq-profit-positive' : 'msq-profit-negative';
    const detail = `仕入 ¥${costPrice.toLocaleString()} / 仕入手数料 ¥${MSQ_FEE_PURCHASE.toLocaleString()} / 送料 ¥${MSQ_FEE_SHIPPING.toLocaleString()} / 販売手数料 ¥${Math.round(sellFee).toLocaleString()} / 外注費 ¥${MSQ_FEE_OUTSOURCE.toLocaleString()}`;
    return `<div class="msq-profit ${cls}" title="${esc(detail)}">${esc(label)}: 売値見込み ¥${sellPrice.toLocaleString()} → 利益 ¥${Math.round(profit).toLocaleString()}</div>`;
  }

  function msqExtractModelCodes(title) {
    const out = [];
    /* ★2026-08-07 装飾記号を区切りに追加（msq_core.js の extractModelCodes と同じ）。
       『稼働品』グッチ★5500L★デイト★… が1語になり型番を読めなかった実例あり。 */
    for (const raw of (title || '')
      .split(/[\s　\/,、・()（）\[\]【】｜|★☆■□●○◆◇▲△▼▽※＊*＞＞>＜<〜~]+/)) {
      const t = raw.replace(/^[-–—]+|[-–—]+$/g, '').trim();
      if (!t || t.length < 4 || t.length > 24) continue;
      if (!/\d/.test(t)) continue;                       // 数字を含まないものは型番とみなさない
      if (SIZE_LIKE.test(t) || ERA_LIKE.test(t) || COLOR_OR_ATTR_LIKE.test(t)) continue;
      if (/^m\d{10,13}$/i.test(t)) continue;             // メルカリの商品ID
      if (/^(19|20)\d{2}$/.test(t)) continue;            // 西暦らしき4桁(2024年等)
      /* ★2026-08-13 小数点付きの寸法が素通りしていた（実機で確認・ユーザー指摘）。
         セカストの題から 2.6cm を型番として拾い「SEIKO 2.6cm」で検索していた。
         msq_core.js の extractModelCodes と同じ直しを入れる（片方だけ直すと食い違う）。 */
      if (/^\d+(\.\d+)?(円|cm|mm|g|kg|ml|inch|インチ)$/i.test(t)) continue; // 価格・寸法
      // ★2026-07-29追加(実機の画面で「型番: 1個限定値引」と表示された不具合):
      //   型番は英数字と記号だけで構成される。日本語を含む語は型番ではない。
      //   全角英数字は型番の正しい表記ゆれなのでNFKCで正規化してから判定する
      //   (実機に「GM-B2100AＤ-2AJF」のように全角Ｄ混じりの出品が実在したため、
      //    正規化せずにASCII判定すると本物の型番まで落ちる)。
      //   ★数字だけの語(5107等の出品者の管理番号)はここでは落としていない。
      //     数字だけの本物の型番があるジャンルで取りこぼすため、安全側に倒す。
      if (!/^[A-Za-z0-9][A-Za-z0-9\-_\/\.]*$/.test(t.normalize('NFKC'))) continue;
      out.push(t);
    }
    return [...new Set(out)];
  }

  function msqDiary(kind, text) {
    try {
      const t = new Date().toLocaleTimeString('ja-JP');
      MSQ_DIARY.push('[' + t + '] ' + kind + ' ' + String(text).slice(0, 300));
      if (MSQ_DIARY.length > 300) MSQ_DIARY.shift();
      const box = document.getElementById('msq-diary-body');
      if (box) box.textContent = MSQ_DIARY.join('\n');
    } catch (e) { }
  }

  function msqCalcProfit(sellPrice, costPrice) {
    return MSQ_CORE.calcProfit(sellPrice, costPrice);
  }

  // ============================================================
  // オーバーレイ UI (メルカリページ上に表示)
  // ============================================================
  // (MSQ_CONDITION_RANK / MSQ_CONDITION_LABELS はTDZ対策でルーティングより前に移動した。
  //  showOverlayとmsqRenderProfitHtmlの両方から参照するようになったため。上の
  //  MSQ_SHOP_RANK_TO_COND の近くを参照)

  function showOverlay(payload, results) {
    const ex = document.getElementById('msq-overlay'); if (ex) ex.remove();
    const ov = document.createElement('div');
    ov.id = 'msq-overlay';
    currentCostPrice = payload.price || 0;
    currentBrand = payload.brand || '';
    // ★Opusレビューで指摘: 同一タブで複数回検索できるようになったため(新規タブ+
    // postMessage方式)、前回検索時の絞り込み状態が残ったまま次の検索結果に適用され、
    // 新しい結果に存在しない値(例: 前回のサイズ'M')で全件除外され0件表示になる
    // 不具合があった。検索のたびに絞り込み状態を初期化する。
    currentCategory = '';
    currentSizeFilter = '';
    currentBrandFilter = '';
    currentModelFilter = '';
    // ★2026-07-29: 仕様表/説明文から読めた型番(_modelSpec)を優先する。
    //   タイトルからの推測(_modelNumber)は「数字を含むトークンが無ければ最も長い語」という
    //   当て推量が混じるが、_modelSpecは「型番」と明示された欄・ラベルから取った値なので確実。
    currentSrcModel = (payload && payload._modelSpec) ? String(payload._modelSpec)
      : ((payload && payload._modelNumber) ? String(payload._modelNumber) : '');
    currentSrcRank = (payload && payload.rank) ? String(payload.rank) : '';
    msqExcludedUrls = new Set(); msqExcludedOrder = []; // 検索のたびに除外もリセットする
    // ★2026-07-28修正(ユーザー指摘): 以前は常に'good'固定だった。仕入れ元の商品ランク
    //   (セカストの「中古B」等)が分かる場合は、それに対応する状態を初期値にする。
    //   利益計算はこの状態の売り切れ品だけを対象にするため、ここが合っていないと
    //   中古品の仕入れに対して新品の売値で相場を出すことになり、利益を過大評価する。
    //   ランクが取れない場合(カインドオル等、まだランク抽出が無いサイト)は従来通り'good'。
    const condFromRank = msqCondFromShopRank(payload.rank);
    currentCond = condFromRank || 'good';
    if (condFromRank) {
      msqLog('[診断]仕入れ元の商品ランク "' + payload.rank + '" から、優先する状態を「'
        + (MSQ_CONDITION_LABELS[condFromRank] || condFromRank) + '」に設定しました。');
    }
    const isLoading = results === null;
    const imgs = (payload.images || []).slice(0, 10);
    // ★本文を先に組み立てる。renderResultsが msqTopStatsHtml(合計/ブランド/型番/利益計算)を
    //   ここで設定し、それを下の .msq-info に差し込むため。
    //   テンプレートリテラルは左から順に評価されるので、先に呼んでおかないと
    //   .msq-info の位置では前回の内容(または空)が入ってしまう。
    msqTopStatsHtml = '';
    const bodyHtml = isLoading ? renderLoading() : renderResults(results);
    ov.innerHTML = `
      <div class="msq-panel">
        <div class="msq-header">
          <div class="msq-title"><span>🔍</span><span>レンズ検索AI</span><span style="font-size:10px;opacity:.6;font-weight:400;">${"メルカリサーチ / build:"+MSQ_CORE.BUILD}</span></div>
          <button class="msq-close" id="msq-close">✕</button>
        </div>
        <!-- 検索窓（PCのピンクと同じ）。中身は仕入元の型番。
             ★結果が出そろってからだけ出す。検索中は場所を取るだけなので出さない。 -->
        ${isLoading ? '' : `
        <div class="msq-mer-row">
          <input id="msq-mer-q" type="text" spellcheck="false"
                 value="${esc((msqPickDisplayModel(payload).text) || (payload && payload.brand) || '')}">
          <button id="msq-mer-go">🔗 メルカリで見る</button>
        </div>`}
        <div class="msq-info">
          ${imgs.length > 1 ? `<div class="msq-thumbs">${imgs.map((im,i)=>`<div class="msq-thumb ${i===0?'msq-thumb-active':''}" data-src="${esc(im)}"><img src="${esc(im)}"></div>`).join('')}</div>` : ''}
          <div id="msq-top-stats">${msqTopStatsHtml}</div>
          ${imgs.length ? `
          <div class="msq-src-row">
            <div class="msq-src-main"><img id="msq-src-main-img" src="${esc(imgs[0])}"></div>
            <div class="msq-src-meta">${msqRenderSourceMeta(payload)}</div>
          </div>` : ''}
        </div>
        <div class="msq-body">${bodyHtml}</div>
      </div>`;
    document.body.appendChild(ov);
    setupOverlayEvents(ov, payload);
  }

  // ★2026-07-28追加(ユーザー指摘「状態のランクやタイトル、価格が一切出ていない」):
  //   仕入れ元の情報を画像の横に出す。実際これまで画面には出しておらず、指摘は正しい。
  //   特にランクは「どのメルカリの状態に対応させたか」まで出す。利益計算はその状態の
  //   売り切れ品だけを対象にするため、対応が合っているかを画面で確認できる必要がある。
  function msqRenderSourceMeta(payload) {
    const p = payload || {};
    const rows = [];
    if (p.name) rows.push('<div class="msq-src-name" title="' + esc(p.name) + '">' + esc(p.name) + '</div>');
    if (p.brand) rows.push('<div>ブランド: <b>' + esc(p.brand) + '</b></div>');
    if (p.price > 0) rows.push('<div>仕入れ値: <b>¥' + Number(p.price).toLocaleString() + '</b></div>');
    if (p.rank) {
      const c = msqCondFromShopRank(p.rank);
      /* ★2026-08-02(ユーザー報告「たまにランクが間違う」): どうやって取ったかも出す。
         「おすすめ枠を除いた先頭」で取れた時は、この商品自身の枠から取れなかった
         ＝他人の商品を拾っている可能性が残るので、注意を出して気づけるようにする。 */
      // 「商品自身の親から」以外で取れた場合は、他人の商品を拾っている可能性が残る
      const weak = !!p.rankHow && p.rankHow.indexOf('商品自身') < 0;
      rows.push('<div>商品ランク: <b>' + esc(p.rank) + '</b>'
        + (c ? '' : ' <span class="msq-src-warn">(対応表に無いため既定の状態で比較)</span>')
        + (weak ? '<br><span class="msq-src-warn">⚠ この商品自身の欄からは読めず、'
            + 'ページ内の先頭から拾いました。実物と違う場合は手で状態を選び直してください</span>' : '')
        + '</div>');
    } else {
      rows.push('<div class="msq-src-warn">商品ランクを取得できませんでした'
        + '(状態を揃えた比較ができないため、既定の「' + esc(MSQ_CONDITION_LABELS[currentCond] || currentCond) + '」で計算します)</div>');
    }
    // ★2026-07-29修正: これまでは_modelNumberをそのまま出していたため、型番でない語
    //   (「ソーラー腕時計_GSHOCK」等)が型番として表示されていた。精査を通す。
    //   ★_modelNumber自体は書き換えない: この値は5744-5755行で検索クエリの
    //     組み立て(usingModelOnlyQuery)にも使われており、変えると拾える件数が変わる。
    const dm = msqPickDisplayModel(p);
    if (dm.text) {
      rows.push('<div>型番: <b>' + esc(dm.text) + '</b>'
        
        + '</div>');
    }
    return rows.join('');
  }

  function renderLoading() {
    return `<div class="msq-loading"><div class="msq-spinner"></div><p>💎 メルカリで類似品をハント中...</p><p class="msq-loading-hint">あと少しでお値段が判明します ✨</p><div class="msq-log" id="msq-log"></div></div>`;
  }
  function msqLog(t){try{msqDiary('記録',t);}catch(e){}const b=document.getElementById('msq-log');const l='[' + new Date().toLocaleTimeString('ja-JP') + '] ' + t;if(b){const p=document.createElement('div');p.textContent=l;b.appendChild(p);b.scrollTop=b.scrollHeight;}try{console.log('[MSQ]',t);}catch(e){}}

  // 診断ログは、メルカリ検索結果ページ(処理後にタブが自動で閉じる/移動する)の
  // コンソールにしか出ず、確認する前に消えてしまう不具合があった。そのページの
  // console.logに加えて、常駐しているサービスワーカー(background.js)のコンソールにも
  // 転送する。chrome://extensions のサービスワーカーのインスペクトで、タブが閉じた後も
  // 確認できる。
  function msqDiag(t){
    try{console.log(t);}catch(e){}
    try{chrome.runtime.sendMessage({ type: 'MSQ_DIAG_LOG', text: t });}catch(e){}
  }
  // Lensページ用の画面バッジ(オーバーレイが無い遷移先で進捗表示)
  function msqBadge(t){let el=document.getElementById('msq-badge');if(!el){el=document.createElement('div');el.id='msq-badge';el.style.cssText='position:fixed;left:10px;bottom:10px;z-index:2147483647;background:#2563eb;color:#fff;padding:10px 14px;border-radius:10px;font:13px -apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;';document.documentElement.appendChild(el);}el.textContent='🔍 レンズ検索AI: '+t;try{console.log('[MSQ]',t);}catch(e){}}
  // ★msqBadgeは一度出すと自動では消えず、z-index最大で常に最前面に居座るため、
  // 精査完了後に表示される「戻る」ボタン等と重なって隠れてしまう不具合があった
  // (ユーザー実機で確認)。結果を表示する直前に必ずこれを呼んで消す。
  function msqBadgeRemove(){ const el = document.getElementById('msq-badge'); if (el) el.remove(); }

  // ★Opusレビュー指摘対応: msqInferBrandCategoryFromTitles(Lens候補タイトルから
  // 「最有力の1件」だけを推定する処理)とは別に、結果一覧の絞り込みメニュー用に
  // 「候補群に実際に混ざっている複数のブランド」を頻度順に列挙する。
  const MSQ_BRAND_NOISE_WORDS = /^(新品|未使用|中古|美品|激安|送料込み?|限定|正規品?|良品|タグ付き?|メルカリ|mercari|ラクマ|yahoo|ヤフオク|楽天)$/i;
  // (MSQ_BRAND_NOISE_LIKE / MSQ_BRAND_VALUE_SEP は、initMercariから同期的に到達しうるため
  //  TDZ対策としてルーティングより前で宣言している。上の msqBrandDictPairs の近くを参照)
  // ★2026-07-28追加(実機で誤爆を確認): ブランド名とタイトルを突き合わせる前の正規化。
  //   実機のプルダウンに「OMM(オリジナルマウンテンマラソン) 8件」「STUDS(スタッズ) 1件」
  //   という誤爆が出た。原因は「長い名前優先」が効かなかったこと:
  //     ・辞書は "COMME des GARCONS"、実際のタイトルは "COMME des GARÇONS"(セディーユ付き)。
  //       includesは1文字違えば不一致なので、本来勝つはずの長い名前が外れる。
  //     ・"ＰＬＡＹ"(全角)、"プレイ コムデギャルソン"(スペース入り)も同じ理由で外れる。
  //   その結果、残った短い "OMM" が "COMME" の内側に一致して拾われていた。
  //   NFKCで全角→半角、小文字化、NFD+結合文字除去でÇ→c、空白除去まで揃える。
  function msqNormalizeBrandKey(s) {
    try {
      return (s || '')
        .normalize('NFKC')                              // ＰＬＡＹ → PLAY、半角カナ → 全角カナ
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Ç → c 等、結合文字(ダイアクリティカルマーク)を除去
        .replace(/[\s　]+/g, '')                    // "プレイ コムデギャルソン" → "プレイコムデギャルソン"
        .replace(/＆/g, '&');
    } catch (e) {
      return (s || '').toLowerCase().replace(/\s+/g, '');
    }
  }
  // brand.csvの英語⇔カタカナ対応から、照合用の「1ブランド=英語+カタカナの1ペア」を作る。
  function msqBuildBrandNamePairs(dict) {
    // ★2026-07-29: 共通コア(msq_core.js)に一本化。作り方は従来と完全に同じなので、
    //   メルカリサーチ側の挙動は変わらない。
    return MSQ_CORE.buildBrandNamePairs(dict, MSQ_BRAND_NOISE_LIKE);
  }
  // ★2026-07-28修正(ブランド候補に無関係な語が混ざる不具合): 以前はタイトルの先頭3語の
  // うち最初の1語を無条件にブランド扱いしていたため、「専用」「即購入OK」「Lサイズ」
  // 「ゆうパケット」等の出品者独自の前置きがそのままブランド候補として並んでいた
  // (ユーザー報告: 「辞書から引っ張ってるからほかは混じらないはずが混じる」)。
  // ブランド辞書に実在する名前だけを、タイトル全体への部分一致(最長一致優先)で
  // 拾う方式に変更する。英語/カタカナのどちらの表記で出ても同じ1ブランドとして合算する。
  // タイトル1件を辞書と突き合わせ、該当したブランドのペアを返す(無ければnull)。
  // 候補セレクトの生成と「未分類」絞り込みの両方から呼ぶので関数に切り出してある
  // (二重実装すると、片方だけ直して集計と絞り込みがズレる事故になる)。
  function msqFindBrandPairForTitle(name) {
    // ★2026-07-29: 共通コア(msq_core.js)に一本化。あわせて2段構えに改善した。
    //   従来はどんなに短い名前でも部分一致で拾っていたため、辞書に短いカタカナ名が
    //   あると語の内側に誤爆した(実測:「フリルのブラウス」が辞書の「リル」に一致)。
    //   4文字未満はトークン完全一致だけにして、独立して書かれている時だけ拾う。
    if (!msqBrandDictPairs || !msqBrandDictPairs.sortedNames.length) return null;
    const hit = MSQ_CORE.findBrandPairInTitle(name, msqBrandDictPairs);
    return hit ? hit.pair : null;
  }
  // 戻り値: { list, matched, unmatched, dictionaryUsed }
  //   list … セレクトの選択肢
  //   matched/unmatched … 辞書に一致した/しなかった件数(集計欄の表示に使う)
  function msqExtractBrandCandidates(items) {
    if (msqBrandDictPairs && msqBrandDictPairs.sortedNames.length) {
      const counts = new Map(), pairs = new Map();
      let matched = 0, unmatched = 0;
      items.forEach((it) => {
        const pair = msqFindBrandPairForTitle(it.name);
        if (!pair) { unmatched++; return; }
        matched++;
        const key = pair.english + MSQ_BRAND_VALUE_SEP + pair.katakana;
        counts.set(key, (counts.get(key) || 0) + 1);
        pairs.set(key, pair);
      });
      const out = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([key, c]) => {
          const p = pairs.get(key);
          return { value: key, label: p.english + '(' + p.katakana + ') ' + c + '件' };
        });
      // 辞書照合で1件も取れないことは通常無いが、万一0件なら選択肢が「すべて」だけに
      // なって絞り込めなくなるので、その時だけ従来の簡易方式に落とす。
      if (out.length) {
        // ★2026-07-28追加(ユーザー要望): 辞書に無いブランドは、今までどのブランド項目にも
        //   計上されず静かに消えていた。「ブランドの種類が少ない=結果の純度が高い」という
        //   判断をしているため、未分類が多いほど綺麗に見えてしまうという逆転が起きる。
        //   未分類だけを絞り込める選択肢を出し、実際にどの商品が漏れているかを
        //   その場で確認して辞書に追加できるようにする。
        if (unmatched > 0) {
          out.push({
            value: MSQ_BRAND_UNMATCHED_VALUE,
            label: '⚠ 未分類(辞書に無いブランド) ' + unmatched + '件'
          });
        }
        return { list: out, matched, unmatched, dictionaryUsed: true };
      }
    }
    // フォールバック(辞書が取得できなかった/照合0件): 従来のタイトル先頭語方式。
    const count = {}, display = {};
    items.forEach((it) => {
      const words = (it.name || '').split(/[\s　\/,、・()（）\-]+/).filter(Boolean);
      for (const w of words.slice(0, 3)) {
        if (w.length < 2 || MSQ_BRAND_NOISE_WORDS.test(w) || /^\d+$/.test(w)) continue;
        const key = w.toLowerCase();
        count[key] = (count[key] || 0) + 1;
        if (!display[key]) display[key] = w;
        break;
      }
    });
    const list = Object.keys(count)
      .sort((a, b) => count[b] - count[a])
      .map((k) => ({ value: display[k], label: display[k] + '(' + count[k] + ')' }));
    return { list, matched: 0, unmatched: 0, dictionaryUsed: false };
  }

  function renderResults(data) {
    if (data.error && (!data.items || !data.items.length)) {
      return `<div class="msq-no-results"><p>⚠️ ${esc(data.error)}</p></div>`;
    }
    if (!data.items || !data.items.length) {
      return `<div class="msq-no-results"><p>🔍 メルカリの商品が見つかりませんでした</p></div>`;
    }
    currentItems = data.items;
    // ★2026-07-28追加: 並べ替えより先に「確からしい型番」を確定させる
    //   (applyFilterSortがこの集合を見て、該当する候補を先頭に出すため)。
    msqConfirmedModelCodes = msqBuildConfirmedModelCodes(currentItems, currentSrcModel);
    // ★2026-07-29追加: 型番一致が何件あったかを記録する。0件の時に「機能していないのか、
    //   一致が0件なだけなのか」が画面から判別できず、ユーザーが「先頭に並ぶ機能は健在か」と
    //   疑う原因になっていた。メルカリの出品者が品番をタイトルに書かないことは普通にあるので、
    //   0件は異常ではない。それを明示する。
    const modelHitCount = currentItems.filter(msqItemHasConfirmedModel).length;
    if (msqConfirmedModelCodes.size) {
      msqLog('[診断]同一商品と判断できる型番: ' + JSON.stringify([...msqConfirmedModelCodes])
        + ' → タイトルに含む候補 ' + modelHitCount + '件'
        + (modelHitCount ? '(先頭に並べます)' : '(出品者がタイトルに書いていないため並べ替えなし)'));
    }
    const filtered = applyFilterSort(currentItems);
    // レンズ検索AI自身のresults.js(無改変)と同じ集計形式(合計/売り切れ/在庫あり件数)。
    const soldCount = currentItems.filter(i => i.isSold === true).length;
    const onSaleCount = currentItems.filter(i => i.isSold === false).length;
    const categories = Array.from(new Set(currentItems.map(i => i.category).filter(Boolean))).sort();
    // ★2026-07-27追加: サイズ絞り込みメニューが無く、S/M/L等だけでなくデニムの
    // 30/W30等も含め実際に検出できたサイズで絞れなかった不具合を解消。
    // カテゴリと同じ「実際に検出できた値だけを選択肢にする」方式。
    const sizes = Array.from(new Set(currentItems.map(i => i.size).filter(Boolean))).sort();
    // ★Opusレビュー指摘: ブランド候補が検索に使った1件だけ固定で、実際に候補群に
    // 混ざっている別ブランドを選んで絞り込めなかった不具合を解消。各候補タイトルの
    // 先頭語(レンズ検索AI自身のmsqInferBrandCategoryFromTitlesと同じノイズ語除去の
    // 考え方)からブランド候補を複数抽出し、頻度順に選択肢を出す。
    const brandInfo = msqExtractBrandCandidates(currentItems);
    const brandCandidates = brandInfo.list;
    // ★2026-07-28追加: 型番の選択肢。同じ型番が複数件に出るということは、それらが
    //   同一商品である可能性が非常に高い(見た目の類似ではなく文字列の一致なので)。
    //   件数の多い順に並べるので、上に出るものほど「同じ商品が何件も売れている」ことを示す。
    const modelCount = {};
    // ★2026-07-29: 選択肢は「その候補の代表型番」1つだけで数える(msqPrimaryCodeOfItem)。
    //   照合は従来どおりタイトル＋説明文の両方を見る(msqCodesOfItem)が、
    //   選択肢にまで両方入れると出品者の管理番号(5107/5572等)が並んで選びづらくなる。
    currentItems.forEach((it) => {
      const code = msqPrimaryCodeOfItem(it);
      if (!code) return;
      const k = msqNormalizeBrandKey(code);
      if (!modelCount[k]) modelCount[k] = { display: code, n: 0 };
      modelCount[k].n++;
    });
    const modelCandidates = Object.keys(modelCount)
      .sort((a, b) => modelCount[b].n - modelCount[a].n || b.length - a.length)
      .map((k) => ({ value: k, label: modelCount[k].display + ' ' + modelCount[k].n + '件' }));
    // 仕入れ元自身の型番はshowOverlayでcurrentSrcModelに退避してある
    // (renderResultsにはpayloadが渡らないため。currentBrand等と同じ方式)。
    const srcModel = currentSrcModel;
    // ★2026-07-28追加(ユーザー要望): ブランドの種類数は結果の純度を測る指標として
    //   使われている(種類が少ない=同じ商品ばかり=精度が高い)。ただし辞書に無い
    //   ブランドはどの項目にも計上されず消えるため、未分類が多いほど綺麗に見えて
    //   しまうという逆転が起きる。種類数と未分類件数を並べて出し、指標が信用できる
    //   状態かどうかを一目で分かるようにする。未分類はセレクトで絞り込んで中身を
    //   確認でき、辞書に何を足すべきかその場で判断できる。
    const brandKinds = brandInfo.dictionaryUsed
      ? brandInfo.list.filter(b => b.value !== MSQ_BRAND_UNMATCHED_VALUE).length
      : brandInfo.list.length;
    // ★2026-07-29: ブランドの種類数は固定エリアから外した(ユーザー指示)。
    //   ブランド候補セレクトに種類も件数も未分類も出ているため重複していた。
    //   ここは合計件数だけにして、空いた縦を結果画像との比較に使う。
    //   ただし「種類が少ないほど純度が高い」という指標としての価値は残るのでログには出す。
    msqLog('[診断]ブランド ' + brandKinds + '種類'
      + (brandInfo.dictionaryUsed
          ? '(辞書一致 ' + brandInfo.matched + '件 / 未分類 ' + brandInfo.unmatched + '件)'
          : '(辞書を読み込めず簡易判定)'));
    // ★2026-07-28修正(ユーザー指摘「独立したものを4つも5つも固定してるからいけないのでは。
    //   なんで元画像と同じエリアにしてない。情報はすべて1つのエリアにまとめて」):
    //   合計件数・ブランド・型番・利益計算は、スクロールする一覧側ではなく
    //   仕入れ元の画像と同じ固定エリア(.msq-info)に置く。
    //   そちらは元々スクロールしない領域なので、Excelのウィンドウ枠固定と同じ形になり、
    //   一覧をどれだけスクロールしても画像と情報を見ながら比較できる。
    //   (以前ここでposition:stickyを使ったが、独立した塊を5つ積み上げる形になり
    //    結果の画像が全て隠れた。撤回済み)
    //   ★型番の説明文(「同じ型番の候補があれば〜同一商品です」)は削除した。
    //     2行使うわりに毎回同じ内容で、固定エリアの縦を圧迫していたため(ユーザー指摘)。
    //   ★2026-07-29(ユーザー指示): この行は合計件数だけにする。
    //     ブランドの種類数はブランド候補セレクトに件数付きで出ており、
    //     型番は元画像の横(msqRenderSourceMeta)に出ているので重複していた。
    //     固定エリアの縦は結果画像との比較に使いたいので、重複は載せない。
    msqTopStatsHtml = `
      <div class="msq-summary" id="msq-summary"><span>合計 ${currentItems.length}件`
      + `　売切 <b>${soldCount}</b> / 在庫 <b>${onSaleCount}</b></span></div>
      <div id="msq-profit-area">${msqRenderProfitHtml(filtered, currentCostPrice)}</div>`;
    return `
      <div class="msq-results-header">
        <div class="msq-controls">
          <span class="msq-ctl"><span class="msq-ctl-label">優先する状態</span><select class="msq-sort-select" id="msq-cond">
            ${MSQ_CONDITION_RANK.filter(c => c !== 'unknown').map(c => `<option value="${c}" ${currentCond===c?'selected':''}>${MSQ_CONDITION_LABELS[c]}</option>`).join('')}
          </select></span>
        </div>
        <!-- ★2026-07-29(ユーザー指示): 優先する状態だけ常時表示し、残りの絞り込みは
             既定で閉じておく。開くと出る。行数を減らして結果の画像を1枚でも多く見せるため。
             ★<details>を使うのはJSを増やさないため(開閉のイベント処理が不要)。
             開いた状態は msqFiltersOpen に覚えておく。覚えないと、ブランド辞書の
             読み込み後の描画し直しで勝手に閉じてしまう。 -->
        <details class="msq-more" id="msq-more-filters" ${msqFiltersOpen ? 'open' : ''}>
          <summary class="msq-more-summary">絞り込み（カテゴリ・サイズ・ブランド・型番）</summary>
          <div class="msq-controls">
          <span class="msq-ctl"><span class="msq-ctl-label">カテゴリ</span><select class="msq-sort-select" id="msq-category">
            <option value="">すべて</option>
            ${categories.map(c => `<option value="${esc(c)}" ${currentCategory===c?'selected':''}>${esc(c)}</option>`).join('')}
          </select></span>
          <span class="msq-ctl"><span class="msq-ctl-label">サイズ</span><select class="msq-sort-select" id="msq-size">
            <option value="">すべて</option>
            ${sizes.map(s => `<option value="${esc(s)}" ${currentSizeFilter===s?'selected':''}>${esc(s)}</option>`).join('')}
          </select></span>
          <span class="msq-ctl"><span class="msq-ctl-label">ブランド候補</span><select class="msq-sort-select" id="msq-brand">
            <option value="">すべて</option>
            ${brandCandidates.map(b => `<option value="${esc(b.value)}" ${currentBrandFilter===b.value?'selected':''}>${esc(b.label)}</option>`).join('')}
          </select></span>
          ${modelCandidates.length ? `<span class="msq-ctl"><span class="msq-ctl-label">型番</span><select class="msq-sort-select" id="msq-model">
            <option value="">すべて</option>
            ${modelCandidates.map(m => `<option value="${esc(m.value)}" ${currentModelFilter===m.value?'selected':''}>${esc(m.label)}</option>`).join('')}
          </select></span>` : ''}
          <label class="msq-ctl msq-ctl-check"><input type="checkbox" id="msq-exclude-badge" ${currentExcludeBadge?'checked':''} /> 在庫ありバッジ付きを隠す</label>
          </div>
        </details>
        <span id="msq-results-count">表示 ${filtered.length}件 / 全${currentItems.length}件</span>
        <span id="msq-excluded-info">${msqRenderExcludedInfo()}</span>
      </div>
      <div class="msq-items" id="msq-items">${filtered.map(renderCard).join('')}</div>`;
  }

  function applyFilterSort(items) {
    // ★✕で除外した候補は、絞り込みを操作しても二度と戻らないよう常に先に取り除く。
    //   利益計算もこの結果を受け取るので、除外した瞬間に次点で計算し直される。
    let f = msqExcludedUrls.size ? items.filter(i => !msqExcludedUrls.has(i.url)) : items;
    if (currentCategory) f = f.filter(i => i.category === currentCategory);
    if (currentSizeFilter) f = f.filter(i => i.size === currentSizeFilter);
    // ★2026-07-28追加: 型番一致での絞り込み。同じ型番＝同一商品なので最も強い条件。
    //   セレクトのvalueは正規化済みなので、候補側も同じ正規化をかけて突き合わせる。
    if (currentModelFilter) {
      f = f.filter(i => msqCodesOfItem(i)
        .some(c => msqNormalizeBrandKey(c) === currentModelFilter));
    }
    if (currentExcludeBadge) f = f.filter(i => i.hasStockBadge !== true);
    if (currentBrandFilter === MSQ_BRAND_UNMATCHED_VALUE) {
      // ★2026-07-28追加: 「未分類(辞書に無いブランド)」だけを表示する。
      //   集計と同じmsqFindBrandPairForTitleを使うので、件数と中身が必ず一致する。
      //   ここに出た商品のタイトルを見れば、辞書に足すべきブランドが分かる。
      f = f.filter(i => !msqFindBrandPairForTitle(i.name));
    } else if (currentBrandFilter) {
      // ★2026-07-28修正: 辞書照合方式のvalueは「英語表記|||カタカナ表記」なので分解し、
      // どちらの表記のタイトルにも当たるようにする(「MOUSSY」でも「マウジー」でも一致)。
      // フォールバックの簡易方式(区切りが無い単なる語)もそのまま同じ処理で通る。
      // ★正規化をかけて比較する。かけないと Ç/全角/スペースの違いで、
      //   候補セレクトには出ているのに選ぶと0件、という食い違いが起きる。
      const hayKey = (i) => msqNormalizeBrandKey((i.name || '') + (i.description || ''));
      const terms = currentBrandFilter.split(MSQ_BRAND_VALUE_SEP)
        .map(t => msqNormalizeBrandKey(t)).filter(Boolean);
      if (terms.length) {
        f = f.filter(i => { const hay = hayKey(i); return terms.some(t => hay.includes(t)); });
      }
    }
    // 選択した状態を先頭に、残りは状態の良い順(レンズ検索AI自身のresults.js無改変と
    // 同じ並び方針)。各状態の中はさらに売り切れ確定分を先に、それぞれ価格が高い順。
    const orderedConds = [currentCond, ...MSQ_CONDITION_RANK.filter(c => c !== currentCond)];
    const ordered = [];
    // ★2026-07-29再修正(ユーザー指摘「まだ高い順に並んでいない」): 型番による並べ替えを
    //   完全に廃止した。ブロック内に限定してもなお価格順が壊れることが実機で判明したため。
    //   実例(CITIZENの腕時計、実機の画面で確認):
    //     仕入れ元の型番は H416-S045347 だが、メルカリのタイトルには「H416」だけが
    //     書かれていることが多い。H416はシチズンのムーブメント型番で、多数の別モデルが
    //     共有する。3件以上に出るため「同一商品の型番」と誤認され、H416を含む候補が
    //     まとめて前に出て、型番の書かれていない ¥26,500 の売り切れが後ろへ落ちていた。
    //   そもそも「型番が一致=同一商品」という前提が、ムーブメント型番や品番の一部だけを
    //   書く出品では成り立たない。価格の高い順という確実な情報を、当てにならない
    //   推定のために犠牲にすべきではない。
    //   ★型番の情報自体は失っていない: カードの「★型番一致」表示と
    //     「型番」セレクトでの絞り込みは残してある。並び順に干渉させないだけ。
    const byPriceDesc = (a, b) => (b.price || 0) - (a.price || 0);
    orderedConds.forEach((cond) => {
      const group = f.filter((i) => condClass(i.condition) === cond);
      if (!group.length) return;
      // 売り切れ(実際に売れた値段)を先に、それぞれ価格の高い順。
      const sold = group.filter((i) => i.isSold === true).sort(byPriceDesc);
      const rest = group.filter((i) => i.isSold !== true).sort(byPriceDesc);
      ordered.push(...sold, ...rest);
    });
    return ordered;
  }

  function rerenderItems() {
    const el = document.getElementById('msq-items'), c = document.getElementById('msq-results-count');
    if (!el || !currentItems) return;
    const f = applyFilterSort(currentItems);
    el.innerHTML = f.map(renderCard).join('');
    if (c) c.textContent = `表示 ${f.length}件 / 全${currentItems.length}件`;
    // 除外の件数と「戻す」ボタンも作り直す(ボタン自体はイベント委譲で拾うので再登録不要)
    const ex = document.getElementById('msq-excluded-info');
    if (ex) ex.innerHTML = msqRenderExcludedInfo();
    attachItemHandlers();
    const profitArea = document.getElementById('msq-profit-area');
    if (profitArea) profitArea.innerHTML = msqRenderProfitHtml(f, currentCostPrice);
  }

  // ★2026-07-29追加: 売り切れ品だけ「出品から売れるまで」を価格の横に出す。
  //   created/updatedはメルカリ検索結果ページのReact内部データ(fiber)から取得したもので、
  //   実機で created=出品日時 / updated=最終更新日時 が入っていることを確認済み。
  //   同ファイルの既存の販売日数表示(1033行付近)は同じ2つの値を非公開APIから取っていたが、
  //   ページ側に同じものがあるためAPIは使わない(追加の通信ゼロ)。
  //   ※updatedは厳密には「最終更新日時」。売り切れ品では取引成立時刻にあたるのが通常だが、
  //     売れた後に出品者が編集すればその時刻になる。そのため断定的な文言は使わない。
  function msqRenderSoldPeriod(item) {
    if (!item || item.isSold !== true) return '';
    const cr = Number(item.created) || 0;
    const up = Number(item.updated) || 0;
    if (!cr || !up || up < cr) return '';
    const md = (sec) => { const d = new Date(sec * 1000); return (d.getMonth() + 1) + '/' + d.getDate(); };
    const days = Math.max(0, Math.round((up - cr) / 86400));
    return '<span class="msq-item-sold-period" title="出品 ' + md(cr) + ' → 販売 ' + md(up) + '">'
      + md(cr) + '〜' + md(up) + ' <b>' + (days === 0 ? '即日' : days + '日間') + '</b></span>';
  }

  function renderCard(item) {
    const newish = isNewish(item.condition);
    return `
      <div class="msq-item-card" data-url="${esc(item.url)}" data-price="${item.price}">
        <button class="msq-exclude-btn">✕</button>
        <div class="msq-item-image">
          ${item.thumbnail?`<img src="${esc(item.thumbnail)}" loading="lazy" onerror="this.style.display='none'">`:'<div class="msq-no-image">No Image</div>'}
          ${item.isSold===true?`<div class="msq-sold-badge">SOLD</div>`:''}
        </div>
        <div class="msq-item-info">
          <p class="msq-item-name" title="${esc(item.name)}">${esc(item.name||'')}</p>
          <div class="msq-item-priceline">
            <p class="msq-item-price">¥${item.price.toLocaleString()}</p>
            ${msqRenderSoldPeriod(item)}
          </div>
          ${item.likes?`<p class="msq-item-likes">♥ ${item.likes}</p>`:''}
          ${item.condition?`<p class="msq-item-condition ${newish?'msq-item-condition-new':''}">${esc(item.condition)}</p>`:''}
          ${item.size?`<p class="msq-item-size">サイズ: ${esc(item.size)}</p>`:''}
          ${(() => {
            // ★2026-07-28追加: タイトルから拾えた型番をカードに出す。仕入れ元の型番と
            //   同じものが付いていれば、見た目の類似ではなく同一商品だと断定できる。
            //   一致したものは色を変えて目立たせる。
            // ★2026-07-29: 判定(srcHit/confirmed)は照合用の全型番で行い、
            //   画面に出す文字列は代表の1つだけにする。以前は照合用をそのまま並べていたため
            //   「★同型番あり: 5107 / GM-B2100PC-1AJF」のように出品者の管理番号まで
            //   表示されていた(実機の画面で確認)。判定の強さは落とさず表示だけ整える。
            const codes = msqCodesOfItem(item);
            const shown = msqPrimaryCodeOfItem(item);
            if (!shown) return '';
            const src = currentSrcModel ? msqNormalizeBrandKey(currentSrcModel) : '';
            const srcHit = src && codes.some(c => {
              const n = msqNormalizeBrandKey(c);
              return n === src || n.includes(src) || src.includes(n);
            });
            // 仕入れ元と一致していなくても、候補群の中で複数件に出ている型番なら
            // 同一商品の可能性が高いので同じく強調する(msqConfirmedModelCodes参照)。
            const confirmed = srcHit || msqItemHasConfirmedModel(item);
            return `<p class="msq-item-model${confirmed ? ' msq-item-model-hit' : ''}">`
              + (srcHit ? '★型番一致: ' : (confirmed ? '★同型番あり: ' : '型番: '))
              + esc(shown) + '</p>';
          })()}
        </div>
      </div>`;
  }

  function attachItemHandlers() {
    document.querySelectorAll('#msq-items .msq-item-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.msq-exclude-btn')) return;
        if (card.dataset.url) window.open(card.dataset.url, '_blank');
      });
    });
    document.querySelectorAll('#msq-items .msq-exclude-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.msq-item-card');
        card.style.opacity = '0'; card.style.transform = 'scale(0.95)';
        // ★2026-07-28修正: 以前はDOMからカードを消すだけで、どれを除外したかを
        //   記録していなかった。そのため絞り込みを操作するとrerenderItemsが
        //   currentItems(全件)から作り直し、除外したはずの商品が復活して利益計算にも
        //   再び混ざっていた。除外を状態として持ち、以後ずっと取り除く。
        //   ★利益計算はrerenderItems経由で必ず作り直されるので、最安値を除外すれば
        //     その場で次点の最安値で計算し直される(売り切れの高値/安値も同様)。
        if (card.dataset.url && !msqExcludedUrls.has(card.dataset.url)) {
          msqExcludedUrls.add(card.dataset.url);
          msqExcludedOrder.push(card.dataset.url); // 戻すボタン用に順番も残す
        }
        setTimeout(() => { rerenderItems(); }, 200);
      });
    });
  }

  function setupOverlayEvents(ov, payload) {
    document.getElementById('msq-close')?.addEventListener('click', () => ov.remove());
    /* ★2026-08-07 戻した検索窓（PCのピンクと同じ）。
       中身は仕入元の型番。手で書き換えてから押すこともできる。
       絞り込みはPCの型番検索と同じ（個人・メルカリのみ・新しい順）。 */
    {
      const go = () => {
        try {
          const el = document.getElementById('msq-mer-q');
          const kw = (el && el.value || '').trim();
          if (!kw) return;
          /* 絞り込みはPCのピンクと同じ:
             新しい順 / 売り切れ / 個人のみ / 目立った傷や汚れなし */
          const url = 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(kw)
            + '&status=sold_out'
            + '&item_condition_id=3'
            + '&seller_type=0'
            + '&item_types=mercari'
            + '&sort=created_time&order=desc';
          window.open(url, '_blank');
        } catch (e) { }
      };
      document.getElementById('msq-mer-go')?.addEventListener('click', go);
      document.getElementById('msq-mer-q')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); go(); }
      });
    }
    attachItemHandlers();
    // ★2026-07-28追加: 仕入れ元のサムネイルをタップしたら、大きい方の画像を入れ替える。
    //   商品によっては1枚目より2枚目以降の方が候補と見比べやすいため。
    ov.querySelectorAll('.msq-thumb').forEach((th) => {
      th.addEventListener('click', () => {
        const s = th.getAttribute('data-src');
        if (!s) return;
        const main = ov.querySelector('#msq-src-main-img');
        if (main) main.src = s;
        ov.querySelectorAll('.msq-thumb').forEach(x => x.classList.remove('msq-thumb-active'));
        th.classList.add('msq-thumb-active');
      });
    });
    /* 結果ページの仕入元画像も元の商品ページへ戻れるようにする。 */
    {
      const srcBox = ov.querySelector('.msq-src-main');
      const back = String((payload && payload.backUrl) || '').trim();
      if (srcBox && back) {
        srcBox.style.cursor = 'pointer';
        srcBox.setAttribute('aria-label', '仕入元ページを開く');
        srcBox.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          try {
            if (window.MsqApp && typeof window.MsqApp.openShiire === 'function') {
              window.MsqApp.openShiire(back); return;
            }
          } catch (e2) { }
          try { location.href = back; } catch (e2) { }
        });
      }
    }
    document.getElementById('msq-cond')?.addEventListener('change', e => { currentCond = e.target.value; rerenderItems(); });
    document.getElementById('msq-category')?.addEventListener('change', e => { currentCategory = e.target.value; rerenderItems(); });
    document.getElementById('msq-size')?.addEventListener('change', e => { currentSizeFilter = e.target.value; rerenderItems(); });
    document.getElementById('msq-brand')?.addEventListener('change', e => { currentBrandFilter = e.target.value; rerenderItems(); });
    document.getElementById('msq-model')?.addEventListener('change', e => { currentModelFilter = e.target.value; rerenderItems(); });
    // ★2026-07-28追加(ユーザー提案「間違えて消したとき用に戻すボタン」):
    //   ✕は誤操作でも取り消せない片道の操作だったため、除外を戻せるようにした。
    //   ボタンはrerenderItemsで作り直されるため、個別にaddEventListenerすると
    //   作り直すたびに再登録が必要になる。オーバーレイ側で1回だけ受けるイベント委譲にして、
    //   登録漏れが起きないようにする。
    ov.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'msq-undo-one') {
        const url = msqExcludedOrder.pop();     // 直前に消したものから戻す
        if (url) msqExcludedUrls.delete(url);
        rerenderItems();
      } else if (t.id === 'msq-undo-all') {
        msqExcludedOrder = [];
        msqExcludedUrls = new Set();
        rerenderItems();
      }
    });
    document.getElementById('msq-exclude-badge')?.addEventListener('change', e => {
      currentExcludeBadge = e.target.checked; rerenderItems();
    });
    // ★開閉状態を覚える。描画し直しても閉じないようにするため。
    document.getElementById('msq-more-filters')?.addEventListener('toggle', e => {
      msqFiltersOpen = !!e.target.open;
    });
  }

  // ============================================================
  // CSS (オレンジ全廃 → 青 #2563eb / 紫 #7c3aed)
  // ============================================================
  function injectStyle() {
    if (document.getElementById('msq-style')) return;
    const st = document.createElement('style');
    st.id = 'msq-style';
    st.textContent = `
      /* ★2026-08-01(ユーザー指摘「メルカリ相場のボタンがでかすぎ」):
         下にビルドの札を足したぶん2行になって大きくなっていた。
         余白と文字を詰め、札は9px→8pxにして行間も詰める。押しやすさは保つ
         (高さは指の当たる40px前後を確保している)。 */
      /* ★2026-08-05 ユーザー指摘「紫長すぎだろ。あちこちで長さが違うぞ」。
         文言を短くするだけでは、また誰かが長いものを入れれば伸びる。
         幅の上限をここで決めて、はみ出したら切る。構造的に伸びなくする。 */
      #msq-fab { position: fixed; left: 16px; bottom: 80px; z-index: 2147483600;
        max-width: 46vw; overflow: hidden; text-overflow: ellipsis;
        background: #7c3aed; color: #fff; border: none; border-radius: 18px;
        padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
        line-height: 1.25; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
      #msq-overlay { position: fixed; right: 0; top: 0; bottom: 0; z-index: 2147483601;
        width: min(420px,100vw); display: flex; color-scheme: light; }
      /* ★2026-07-29: パネル自体には背景を敷かない。ここに不透明な面があると、
         その上に乗っている最上部の帯が何も透かせなくなる(色をrgbaにしても、
         この面と混ざるだけで「ただの水色」になる。実機で確認済み)。
         背景は中身側(.msq-info / .msq-body)が持つ。パネルの子はこの2つと帯だけなので
         隙間はできない。結果として帯の後ろには実際のページだけが残り、
         下の「元のページに戻る」帯とまったく同じ条件で透ける。 */
      #msq-overlay .msq-panel { background: transparent; width: 100%; height: 100%;
        display: flex; flex-direction: column; box-shadow: -4px 0 16px rgba(0,0,0,.2);
        font-family: -apple-system, sans-serif; font-size: 13px; color: #111; }
      /* ★2026-07-29(ユーザー指示): 下の「元のページに戻る」帯と同じように半透明にする。
         ★最初に色だけrgbaにしたが、見た目は「ただの水色」にしかならなかった。原因は
           帯の後ろにあるのが不透明な白パネル(.msq-panel background:#fff)だけで、
           透ける材料が何も無かったこと。帯とスクロール領域(.msq-info/.msq-body)は
           横並びの兄弟なので、帯の下を中身が通らない。
         ★対策: 帯を position:absolute で中身の上に浮かせ、直下の .msq-info に
           帯の高さぶんの余白を持たせる。これで中身が帯の下を流れるようになり、
           スクロールすると帯越しに中身が透けて見える(下の紫の帯と同じ見え方)。
           余白は帯の高さと必ず揃えること。ずれると先頭のサムネイルが帯に隠れる。
         backdrop-filterは非対応環境では効かないだけで、背景色のrgbaは効くため
         表示が壊れることはない。 */
      /* ★帯は通常の位置に戻す(浮かせない)。浮かせると直下の.msq-infoの背景が
         帯の裏まで広がってしまい、結局そこで塞がれて透けない。
         通常の位置なら帯の後ろに残るのは透明なパネルだけになる。 */
      .msq-header { display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px; background: rgba(56,189,248,0.72); color: #fff;
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        text-shadow: 0 1px 2px rgba(2,60,90,.5); }
      .msq-title { font-weight: 800; font-size: 15px; display: flex; gap: 6px; align-items: center; }
      .msq-close { background: rgba(255,255,255,.25); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 14px; cursor: pointer; font-size: 14px; }
      /* ★2026-08-07 戻した検索窓（PCのピンクと同じ役割）。仕入元の型番が入っている。 */
      .msq-mer-row { display: flex; gap: 6px; align-items: center;
        padding: 6px 10px; background: rgba(15,23,42,.06); }
      .msq-mer-row input { flex: 1 1 auto; min-width: 0; padding: 7px 10px;
        border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; background: #fff; }
      .msq-mer-row button { flex: 0 0 auto; padding: 7px 12px; border: none;
        border-radius: 8px; background: #ec4899; color: #fff; font-weight: 800;
        font-size: 12px; cursor: pointer; white-space: nowrap; }
      /* ★2026-07-28: 仕入れ元の画像・情報・合計件数・利益計算をすべてこの1つの枠に入れる。
         .msq-body(一覧)だけがスクロールするので、ここは常に見えたまま残り、
         一覧をどれだけスクロールしても画像と数字を並べて比較できる
         (Excelのウィンドウ枠固定と同じ形。ユーザー要望)。
         ただしここが縦に伸びすぎると一覧が潰れるため、画面の半分までに制限し、
         超える場合はこの枠自身がスクロールするようにして一覧の領域を守る。 */
      /* ★背景はここが持つ(パネル側は透明にしてある)。色は元のパネルと同じ#fff。
         Androidの強制ダークでは従来どおり暗く反転して描かれるので、見た目は変わらない。 */
      .msq-info { padding: 8px 14px; max-height: 50vh; overflow-y: auto;
        background: #fff; border-bottom: 1px solid #e5e7eb; }
      /* ★2026-07-28: 仕入れ元の画像は48pxのサムネイルしか出ておらず、売り切れ候補と
         見比べられなかった(ユーザー要望)。1枚目を候補カードと同じ幅・同じ正方形で出す。
         .msq-items は2列grid・gap 8px なので、カード1枚の幅は calc(50% - 4px) と一致する。
         2枚目以降は切替用のサムネイルとして残し、タップで大きい方が入れ替わる。 */
      /* ★2026-07-28(ユーザー指摘): 固定エリアの並びは
         「サムネイル(小) → 合計/ブランド/型番/利益 → 大きい画像+情報」の順。
         大きい画像を一番下に置くことで、その真下にある結果カードの画像と隣り合い、
         一覧をスクロールしながら画像同士を見比べられる。 */
      .msq-src-row { display: flex; gap: 8px; align-items: flex-start; margin-top: 4px; }
      .msq-src-main { flex: 0 0 calc(50% - 4px); aspect-ratio: 1; border-radius: 8px;
        overflow: hidden; border: 1px solid #e5e7eb; background: #f3f4f6; }
      .msq-src-main img { width: 100%; height: 100%; object-fit: cover; }
      /* 仕入れ元の情報(タイトル/ブランド/仕入れ値/ランク/型番)。画像の横に置く。 */
      .msq-src-meta { flex: 1 1 auto; min-width: 0; font-size: 11px; color: #374151; line-height: 1.5; }
      .msq-src-meta b { color: #111827; }
      .msq-src-name { font-weight: 700; margin-bottom: 2px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .msq-src-warn { color: #b45309; font-weight: 700; }
      /* ★2026-07-28: 折り返して2段3段になると固定エリアの縦を食うので、1行に収めて
         横スクロールにする(枚数が多い商品でも高さが一定に保たれる)。 */
      .msq-thumbs { display: flex; flex-wrap: nowrap; gap: 5px; overflow-x: auto; padding: 0 0 4px; }
      .msq-thumb { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 5px;
        overflow: hidden; border: 2px solid transparent; cursor: pointer; }
      .msq-thumb-active { border-color: #7c3aed; }
      .msq-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .msq-mode { font-size: 12px; color: #374151; margin: 6px 0; }
      .msq-back-row { display: flex; gap: 6px; flex-wrap: wrap; }
      .msq-kw { flex: 1 1 100%; padding: 8px; border: 1px solid #d1d5db;
        border-radius: 6px; font-size: 13px; }
      .msq-back-btn { flex: 1; background: #2563eb; color: #fff; border: none;
        border-radius: 6px; padding: 8px; font-weight: 700; cursor: pointer; }
      .msq-open-btn { flex: 1; background: #fff; color: #2563eb; border: 1px solid #2563eb;
        border-radius: 6px; padding: 8px; font-weight: 700; cursor: pointer; }
      /* ★背景はここが持つ(パネル側は透明)。flex:1 なので帯と.msq-infoの下を
         最後まで埋める。よってパネルを透明にしても隙間からページが覗くことはない。 */
      .msq-body { flex: 1; overflow-y: auto; padding: 8px 14px 24px; background: #fff; }
      .msq-loading { text-align: center; padding: 40px 0 20px; color: #6b7280; }
      .msq-log{margin:16px 10px 0;padding:8px 10px;background:#f3f4f6;border-radius:8px;text-align:left;font-size:11px;line-height:1.5;color:#374151;max-height:240px;overflow-y:auto;font-family:monospace;}
      .msq-log div{padding:1px 0;border-bottom:1px solid #e5e7eb;}
      .msq-spinner { width: 36px; height: 36px; border: 4px solid #bfdbfe;
        border-top-color: #2563eb; border-radius: 50%; margin: 0 auto 12px;
        animation: msq-spin .8s linear infinite; }
      @keyframes msq-spin { to { transform: rotate(360deg); } }
      .msq-no-results { text-align: center; padding: 30px 10px; color: #6b7280; }
      .msq-error-hint { font-size: 12px; color: #9ca3af; margin-top: 6px; }
      /* ★2026-07-28撤回: 合計件数と利益計算を position:sticky で上部に固定したところ、
         その塊(合計/ブランド/型番/利益3行/注記)が縦に長く、結果の画像が後ろに隠れて
         全く見えなくなった(実機で確認)。元の「件数が消えた」報告はスクロールしていた
         だけで不具合ではなかったのに、余計な変更でより悪い状態にしてしまった。
         固定はやめ、素直に上から順に流れる元の形に戻す。 */
      /* 合計/ブランド/型番を1つの枠に横並びで詰める(以前は3行使っていた)。
         区切りが分かるよう、2つ目以降の前に縦線を入れる。 */
      .msq-summary { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 6px 8px;
        background: #f9fafb; border-radius: 8px; margin-bottom: 6px; font-size: 12px; }
      .msq-summary > span + span { border-left: 1px solid #d1d5db; padding-left: 10px; }
      .msq-summary b { color: #111827; }
      .msq-stat { flex: 1 1 45%; display: flex; flex-direction: column; }
      .msq-stat-wide { flex-basis: 100%; }
      .msq-stat-label { font-size: 11px; color: #6b7280; }
      .msq-stat-value { font-size: 14px; font-weight: 700; }
      .msq-sold-color { color: #7c3aed; }
      .msq-on-sale { color: #059669; }
      .msq-sold-out { color: #7c3aed; }
      .msq-profit-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .msq-profit { font-size: 12px; font-weight: 700; padding: 5px 8px; border-radius: 6px; cursor: help; }
      .msq-profit-empty { color: #6b7280; font-weight: 500; background: #f3f4f6; }
      .msq-profit-positive { color: #15803d; background: #ecfdf3; }
      .msq-profit-negative { color: #b91c1c; background: #fef2f2; }
      /* 何を根拠に計算したか(状態・件数)。黙って基準が変わることが無いよう必ず出す。 */
      .msq-profit-note { flex-basis: 100%; font-size: 11px; color: #6b7280; margin-top: -2px; }
      .msq-profit-note-warn { color: #b45309; font-weight: 700; }
      .msq-results-header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
      #msq-results-count { font-size: 12px; color: #6b7280; }
      /* 除外の件数と「戻す」ボタン。誤って✕した時に取り消せるようにするためのもの。 */
      .msq-excluded { font-size: 12px; color: #b45309; font-weight: 700;
        display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .msq-undo-btn { font-size: 11px; font-weight: 700; padding: 3px 8px; cursor: pointer;
        border: 1px solid #b45309; background: #fff; color: #b45309; border-radius: 6px; }
      /* ★2026-07-28: 以前はラベルが素のテキストノードのままflexの直下にあったため、
         匿名フレックスアイテムとして独立に折り返され、「カテゴリ:」だけが前の行末に
         取り残されてプルダウンが次の行、という分断が起きていた(実機で確認)。
         ラベルとプルダウンを.msq-ctlで1つの塊にし、その中では折り返さないようにする。 */
      .msq-controls { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
      /* ★2026-07-29追加: 「優先する状態」以外の絞り込みを折りたたむ。
         閉じている間は1行しか使わないので、その分だけ結果の画像を多く表示できる。 */
      .msq-more { margin: 4px 0 0; }
      .msq-more-summary { cursor: pointer; font-size: 11px; font-weight: 700; color: #6b21a8;
        background: #f3e8ff; border-radius: 999px; padding: 3px 10px; display: inline-block;
        list-style: none; user-select: none; }
      .msq-more-summary::-webkit-details-marker { display: none; }
      .msq-more-summary::before { content: '▸ '; }
      .msq-more[open] > .msq-more-summary::before { content: '▾ '; }
      .msq-more > .msq-controls { margin-top: 6px; }
      /* Androidの強制ダークで既定のチェックボックスが見えなくなることがあるため、
         大きさと色を明示する(実機で枠だけになり見えない状態を確認済み)。 */
      .msq-ctl-check input[type="checkbox"] { width: 16px; height: 16px; accent-color: #7c3aed;
        vertical-align: middle; margin-right: 4px; }
      .msq-ctl { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
      .msq-ctl-label { font-size: 12px; color: #6b7280; }
      /* プルダウンの中身(ブランド名)は長くなり得るので、塊ごと画面幅を超えないよう
         セレクト側だけは縮んで省略表示になることを許す。 */
      .msq-ctl .msq-sort-select { max-width: 58vw; }
      .msq-ctl-check { font-size: 12px; color: #374151; }
      /* 集計欄の2行目(ブランドの種類数・未分類件数)。1行目より控えめにする。 */
      .msq-summary-sub { font-size: 12px; font-weight: 500; opacity: .85; margin-top: -4px; }
      /* カードに出す型番。仕入れ元と一致したものは色を変えて目立たせる。 */
      .msq-item-model { font-size: 10px; color: #6b7280; margin-top: 2px; word-break: break-all; }
      .msq-item-model-hit { color: #b91c1c; font-weight: 800; }
      .msq-filter-group { display: flex; gap: 4px; }
      .msq-filter-btn { padding: 4px 10px; border: 1px solid #d1d5db; background: #fff;
        border-radius: 6px; font-size: 12px; cursor: pointer; }
      .msq-filter-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }
      .msq-toggle-btn { padding: 4px 10px; border: 1px solid #d1d5db; background: #fff;
        border-radius: 6px; font-size: 12px; cursor: pointer; }
      .msq-toggle-btn.active { background: #7c3aed; color: #fff; border-color: #7c3aed; }
      .msq-sort-select { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; }
      .msq-items { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .msq-item-card { position: relative; border: 1px solid #e5e7eb; border-radius: 8px;
        overflow: hidden; cursor: pointer; transition: opacity .2s, transform .2s; background: #fff; }
      .msq-exclude-btn { position: absolute; top: 4px; right: 4px; z-index: 2;
        width: 20px; height: 20px; border-radius: 10px; border: none;
        background: rgba(0,0,0,.5); color: #fff; cursor: pointer; font-size: 11px; line-height: 1; }
      .msq-item-image { position: relative; width: 100%; aspect-ratio: 1; background: #f3f4f6; overflow: hidden; }
      .msq-item-image img { width: 100%; height: 100%; object-fit: cover; }
      .msq-no-image { display: flex; align-items: center; justify-content: center;
        height: 100%; color: #9ca3af; font-size: 12px; }
      .msq-status { position: absolute; bottom: 4px; left: 4px; font-size: 10px;
        font-weight: 700; padding: 2px 6px; border-radius: 4px; color: #fff; }
      .msq-status-sold { background: #7c3aed; }
      .msq-status-onsale { background: #059669; }
      .msq-status-unknown { background: #9ca3af; }
      /* レンズ検索AI自身のresults.html(無改変)の.sold-badgeと同じ見た目(斜めリボン)。
         こちらはisSoldがまだ未使用だった(renderCardが参照していなかった)ため追加。 */
      .msq-sold-badge {
        position: absolute; top: 12px; left: -42px; width: 150px;
        background: #d32f2f; color: #fff; text-align: center;
        font-size: 12px; font-weight: 900; letter-spacing: 1px;
        transform: rotate(-45deg); transform-origin: center;
        padding: 3px 0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        pointer-events: none;
      }
      .msq-item-info { padding: 6px; }
      .msq-item-name { font-size: 11px; line-height: 1.3; margin: 0 0 4px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .msq-item-price { font-size: 14px; font-weight: 800; margin: 0; color: #111; }
      /* ★2026-07-29追加: 価格の横の空きに「出品〜販売 / 日数」を出す(売り切れ品のみ)。
         行を増やさず既存の余白に収めるため、価格と同じ行にflexで並べる。 */
      .msq-item-priceline { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
      .msq-item-sold-period { font-size: 10px; color: #666; white-space: nowrap; flex-shrink: 0; }
      .msq-item-sold-period b { color: #c0392b; font-weight: 700; }
      .msq-item-likes { font-size: 10px; color: #6b7280; margin: 2px 0 0; }
      .msq-item-condition { font-size: 10px; color: #6b7280; margin: 2px 0 0; }
      .msq-item-condition-new { color: #7c3aed; font-weight: 700; }
      .msq-item-size { font-size: 10px; color: #6b7280; margin: 2px 0 0; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ショップス管理画面はメルカリ本体とは別ホストのため、
     本体用の処理を流用せず、この画面全体だけをダーク表示にする。
     一部のカードだけを塗るのではなく、ページの土台・文字・枠・入力欄・
     ボタンまで同じCSSスコープで扱う。検索一覧など他ホストには適用しない。 */
  /* STABLE: ショップス全体の黒背景・枠・文字色。別の配色へ戻さない。 */
  function rawApplyShopsDarkTheme() {
    try {
      if (!/(^|\.)mercari-shops\.com$/i.test(location.hostname)) return;
      const id = 'msq-shops-dark-theme';
      if (document.getElementById(id)) return;
      const st = document.createElement('style');
      st.id = id;
      st.textContent = `
        :root { color-scheme: dark !important; background: #242424 !important; }
        html, body, #__next {
          background: #242424 !important;
          background-color: #242424 !important;
          color: #f3f3f3 !important;
        }
        body {
          background-image: none !important;
          color: #f3f3f3 !important;
        }
        /* 詳細画面は土台を黒にし、グレーは商品詳細面と画像選択面だけに残す。 */
        body:has([data-testid="image_box"]),
        body:has([data-testid="image_box"]) #__next {
          background-color: #121212 !important;
        }
        body div, body main, body section, body article, body header, body nav,
        body footer, body aside, body form, body ul, body ol, body li,
        body table, body thead, body tbody, body tr, body td, body th,
        body [class*="bg-white"], body [class*="bg-gray"] {
          background-color: transparent !important;
        }
        /* 商品一覧の元の白い角丸カードは、暗色のカード枠として残す。 */
        body li,
        body li[data-msq-shops-surface] {
          background-color: #121212 !important;
          border: 1px solid #5b5b5b !important;
          border-radius: 8px !important;
        }
        /* トップのカードは商品一覧のliとは別構造なので、元のDOMが持つ
           背景色付き・角丸の面を初回表示後に拾い、暗色の面と輪郭を残す。
           常時監視はせず、Reactの初期描画に合わせて数回だけ実行する。 */
        body [data-msq-shops-surface] {
          background-color: #121212 !important;
        }
        /* トップ画面の面を一括で灰色枠にしない。クエッタ基準では
           灰色枠は商品カード・画像選択・商品詳細など実際に輪郭が
           必要な箇所だけに残す。 */
        body [data-msq-shops-rounded] {
          box-shadow: 0 0 0 1px #3f3f3f !important;
        }
        /* 下書き詳細の画像追加欄・画像枠は、公式CSSにborderが無く、
           背景を透明化すると黒地に埋もれる。ショップス詳細だけ輪郭を戻す。 */
        body [data-testid="image_box"],
        body [data-testid="sortable-item-draggable-item"] {
          background-color: #242424 !important;
          border: 1px solid #5b5b5b !important;
          border-radius: 4px !important;
          box-sizing: border-box !important;
        }
        body [data-msq-shops-detail-section] {
          background-color: #121212 !important;
          border: 1px solid #5b5b5b !important;
          border-radius: 8px !important;
          box-sizing: border-box !important;
          padding: 12px !important;
        }
        /* 一覧の検索欄は右端の検索ボタンが暗色の面で枠線を隠すため、
           検索欄に属する右要素だけ背景を透過して輪郭を残す。 */
        body .chakra-input__group:has(> input[data-testid="search-input"]) .chakra-input__right-element,
        body .chakra-input__group:has(> input[data-testid="search-input"]) .chakra-input__right-element button {
          background-color: transparent !important;
        }
        /* ショップス共通ヘッダーの「Shops」はSVGのpathで描かれているため、
           本体の暗色塗りを上書きしてロゴ文字を読めるようにする。 */
        body header a svg g, body header a svg g path {
          fill: #f3f3f3 !important;
        }
        /* 商品〜設定の左側アイコンはSVGの黒い固定fill/strokeを持つ。
           暗色面では黒のまま埋もれるため、アイコンだけ明色へ戻す。
           ロゴの赤・青は上のヘッダー指定を優先して保持する。 */
        body svg { color: #f3f3f3 !important; }
        body svg [fill="#000"], body svg [fill="#000000"],
        body svg [fill="black"] { fill: #a8a8a8 !important; }
        body svg [stroke="#000"], body svg [stroke="#000000"],
        body svg [stroke="black"] { stroke: #a8a8a8 !important; }
        body * {
          color: #f3f3f3 !important;
          border-color: #3f3f3f !important;
        }
        body a { color: #f3f3f3 !important; }
        body button, body input, body select, body textarea,
        body [role="button"] {
          background-color: #121212 !important;
          color: #f3f3f3 !important;
          border-color: #5b5b5b !important;
        }
        body button[class*="brand"], body a[class*="brand"],
        body [class*="brand"] button, body [class*="brand"] a {
          color: #FF0211 !important;
          border-color: #FF0211 !important;
        }
        /* 純正の選択中タブと商品登録ボタンはブランド赤を残す。 */
        body button[role="tab"][aria-selected="true"],
        body button.chakra-tabs__tab[aria-selected="true"] {
          color: #FF0211 !important;
          border-bottom-color: #FF0211 !important;
        }
        body button[data-testid="sp-product-create-button"] {
          background-color: #FF0211 !important;
          color: #ffffff !important;
          border-color: #FF0211 !important;
        }
        body [data-msq-shops-red-button] {
          background-color: #FF0211 !important;
          color: #ffffff !important;
          border: 2px solid #FF0211 !important;
          border-color: #FF0211 !important;
        }
        body [data-msq-shops-shop-page-button] {
          background-color: #121212 !important;
          color: #FF0211 !important;
          border-color: #FF0211 !important;
        }
        body [data-msq-shops-account-button] {
          color: #FF0211 !important;
          border: none !important;
          box-shadow: none !important;
        }
        body [data-msq-shops-account-label] { color: #FF0211 !important; }
        body [data-msq-shops-account-button] svg {
          color: #FF0211 !important;
          stroke: #FF0211 !important;
          fill: #FF0211 !important;
        }
        body [data-msq-shops-account-button] svg * {
          stroke: #FF0211 !important;
          fill: #FF0211 !important;
        }
        body img, body video, body canvas { background-color: transparent !important; }
        body ::placeholder { color: #a8a8a8 !important; opacity: 1 !important; }
        /* Android WebViewのショップス属性画面では、公式Chakraが
           100vh/100dvhを0pxとして計算することがある。モーダル全体が
           0pxになり、画像編集と色選択が押せなくなるため、公式モーダル
           の2要素だけを実表示領域へ戻す。ショップス以外には適用しない。 */
        body .chakra-modal__content-container { height: 100% !important; }
        body .chakra-modal__content {
          max-height: 100% !important;
          overflow: hidden !important;
          background-color: #121212 !important;
          color: #f3f3f3 !important;
          border: 1px solid #5b5b5b !important;
        }
        /* Android WebViewのショップス画像編集モーダルだけ、公式の
           内側レイアウトが高さ2pxに潰れることがある。canvasを含む
           画像モーダルに限って内容領域を実表示高へ戻す。 */
        body .chakra-modal__content:has(canvas) {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }
        body .chakra-modal__content:has(canvas) > div {
          height: 100% !important;
          min-height: 0 !important;
        }
        body .chakra-modal__body {
          background-color: #121212 !important;
          color: #f3f3f3 !important;
          overflow-y: auto !important;
        }
        body .chakra-modal__overlay { background-color: rgba(0, 0, 0, .72) !important; }
        /* モーダル中に固定操作ボタンが選択肢・決定ボタンを覆わないようにする。 */
        body:has(.chakra-modal__content) #msq-sonomama,
        body:has(.chakra-modal__content) #msq-lens,
        body:has(.chakra-modal__content) #lh-launcher { display: none !important; }
        /* 「任意」は元の薄い背景のまま文字だけを白にすると読めない。
           exact-text markerを付けた要素だけ暗色のバッジにする。 */
        body span[data-msq-shops-optional] {
          background-color: #121212 !important;
          color: #f3f3f3 !important;
          border: 1px solid #5b5b5b !important;
          border-radius: 4px !important;
        }
        body [data-msq-shops-gray-label] { color: #a8a8a8 !important; }
        body [data-msq-shops-muted-label] { color: #d0d0d0 !important; }
        body [data-msq-shops-blue-label] { color: #18252B !important; }
        body [data-msq-shops-red-label] { color: #FF0211 !important; }
        body [data-msq-shops-white-label] { color: #ffffff !important; }
        body button[data-msq-shops-gray-button] {
          background-color: #242424 !important;
          color: #f3f3f3 !important;
          border-color: #5b5b5b !important;
        }
        body [role="switch"], body input[type="checkbox"] {
          background-color: #121212 !important;
          accent-color: #121212 !important;
        }
      `;
      (document.head || document.documentElement).appendChild(st);
      const markShopsSurfaces = () => {
        const markShopsText = () => {
          const mark = (text, attr) => {
            document.querySelectorAll('p,span,button,label,h1,h2,h3,div').forEach((e) => {
              if (e.children.length === 0 && (e.textContent || '').trim() === text) {
                e.setAttribute(attr, '1');
                if (text === '複数の種類を登録する') {
                  const button = e.closest('button');
                  if (button) button.setAttribute('data-msq-shops-gray-button', '1');
                }
                if (text === '詳細を確認する') {
                  const button = e.closest('button,[role="button"],a') || e.parentElement;
                  if (button) button.setAttribute('data-msq-shops-red-button', '1');
                }
                if (text === 'ショップページを確認する') {
                  const button = e.closest('button,[role="button"],a') || e.parentElement;
                  if (button) button.setAttribute('data-msq-shops-shop-page-button', '1');
                }
                if (text === 'アカウント') {
                  e.setAttribute('data-msq-shops-account-label', '1');
                  const button = e.closest('button,[role="button"],a');
                  if (button) button.setAttribute('data-msq-shops-account-button', '1');
                }
              }
            });
          };
          const markContains = (text, attr) => {
            document.querySelectorAll('p,span,button,label,h1,h2,h3,div').forEach((e) => {
              if (e.children.length === 0 && (e.textContent || '').trim().includes(text)) {
                e.setAttribute(attr, '1');
              }
            });
          };
          mark('カテゴリー', 'data-msq-shops-gray-label');
          mark('予約販売', 'data-msq-shops-gray-label');
          mark('在庫の登録', 'data-msq-shops-gray-label');
          mark('より売れるポイント', 'data-msq-shops-blue-label');
          markContains('こだわり条件を設定すると', 'data-msq-shops-blue-label');
          mark('メルカリShopsサポートからのお知らせ', 'data-msq-shops-muted-label');
          mark('予約販売とは', 'data-msq-shops-red-label');
          mark('複数の種類を登録する', 'data-msq-shops-gray-label');
          mark('詳細を確認する', 'data-msq-shops-white-label');
          mark('ショップページを確認する', 'data-msq-shops-red-label');
          mark('アカウント', 'data-msq-shops-account-label');
          document.querySelectorAll('button,[role="button"],a').forEach((e) => {
            if ((e.textContent || '').trim() === 'アカウント') {
              e.setAttribute('data-msq-shops-account-button', '1');
            }
            const text = (e.textContent || '').trim();
            if (text.includes('詳細を確認する')) {
              e.setAttribute('data-msq-shops-red-button', '1');
            }
            if (text.includes('ショップページを確認する')) {
              e.setAttribute('data-msq-shops-shop-page-button', '1');
            }
          });
        };
        try {
          st.disabled = true;
          document.querySelectorAll('body *').forEach((e) => {
            if (e === document.body || e.id === '__next') return;
            const r = e.getBoundingClientRect();
            if (r.width < 80 || r.height < 24) return;
            /* ページ土台・共通ヘッダーの全幅面は内側の黒面にしない。
               クエッタ同様、土台を灰色に残し、内側の面だけを黒くする。 */
            if (window.innerWidth > 0 && r.width >= window.innerWidth * 0.98) return;
            const c = getComputedStyle(e);
            const bg = c.backgroundColor;
            if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return;
            e.setAttribute('data-msq-shops-surface', '1');
            if (parseFloat(c.borderTopLeftRadius) > 0 || parseFloat(c.borderTopRightRadius) > 0) {
              e.setAttribute('data-msq-shops-rounded', '1');
            }
          });
        } catch (e) { }
        try {
          /* 「商品詳細」は見出し文字だけでは枠を持たないため、
             見出しと入力欄を含む最初のまとまりにだけ印を付ける。 */
          const title = [...document.querySelectorAll('p,h1,h2,h3,div')]
            .find((e) => (e.textContent || '').trim() === '商品詳細');
          let node = title && title.parentElement;
          for (let i = 0; node && i < 8; i++, node = node.parentElement) {
            const r = node.getBoundingClientRect();
            if (r.height >= 300 && node.querySelector('input,textarea,select')) {
              node.setAttribute('data-msq-shops-detail-section', '1');
              break;
            }
          }
        } catch (e) { }
        try {
          document.querySelectorAll('span[data-msq-shops-optional="1"]').forEach((e) => {
            if ((e.textContent || '').trim() !== '任意') e.removeAttribute('data-msq-shops-optional');
          });
          document.querySelectorAll('span').forEach((e) => {
            if ((e.textContent || '').trim() === '任意') {
              e.setAttribute('data-msq-shops-optional', '1');
            }
          });
        } catch (e) { }
        try { markShopsText(); } catch (e) { }
        try { st.disabled = false; } catch (e) { }
      };
      /* ReactのSPA遷移後に増える任意バッジだけを再マーキングする窓口。
         全DOM監視は追加せず、既存ショップス処理の2秒周期から呼ぶ。 */
      window.__msqMarkShopsOptionalBadges = () => {
        try {
          document.querySelectorAll('span').forEach((e) => {
            if ((e.textContent || '').trim() === '任意') {
              e.setAttribute('data-msq-shops-optional', '1');
            }
          });
        } catch (e) { }
        try { markShopsSurfaces(); } catch (e) { }
      };
      /* 暗色CSSは即時に適用する。面のマーキングだけはReact初期描画後に
         1回だけ行う。全DOM走査を4回繰り返すと、画像変換のcanvas処理と
         同じWebViewメインスレッドを奪い合うため、ここで速度を落とさない。 */
      setTimeout(markShopsSurfaces, 800);
    } catch (e) { }
  }

  /* ★2026-08-30 逆引きの鍵は【ここ】に置く。
     仕入元サイトでは下の 2367行あたりの return で枠組みを抜けるため、
     それより下の const は永久に作られない（この案件で何度も踏んだ型）。
     const ではなく var なのは、巻き上げでどこからでも読めるようにするため。
     ★逆引きで仕入元側から使う物は、必ずこの行より上か、関数の中で完結させること。 */
  var RAW_GYAKU_KEY = "msq_gyaku";

  var SP;
  try {
    /* ★レンズの結果ページ（google/lens）はここで受け持つ（2026-08-14）。
       メルカリでも仕入元でもないので、上の枠組みの外に置く。
       ★その場で判定する。LENS_HOST は下で const 宣言しているため、
         ここで参照すると『初期化前に使った』で落ちる（この案件で何度も踏んだ型）。 */
    if (/(^|\.)lens\.google\.com$/.test(location.host)
        || (/(^|\.)google\.com$/.test(location.host)
            && /[?&](vsrid=|udm=44|tbs=sbi|source=lns\.web)/.test(location.search))) {
      /* ★2026-08-15 検証で見つけた不具合の直し。
         画像をGoogleへ送るための「送信中…」の空ページは、
         loadDataWithBaseURL("https://lens.google.com/") で作っているため
         location.host が lens.google.com になり、ここの判定に当たっていた。
         その結果、まだ送信すらしていない段階で lensStart() が動き、
           ・lSrcRead() が window.name の MSQSTATE を読んで【空にする】
           ・MsqApp の置き場も読んで【消す】
         ため、本当のレンズ結果ページに着いた時には仕入元の情報が
         どこにも残っていなかった。「POSTを通ると window.name が消える」と
         見えていたのは、実際にはこちらが自分で消していたということ。
         送信ページには目印(meta[name=msq-send])を入れてあるので、
         それがある間は何もしない。 */
      try { if (document.querySelector('meta[name="msq-send"]')) return; } catch (e3) { }
      /* ★2026-08-30 逆引きの結果画面もここに来る（土台URLが lens.google.com のため）。
         レンズの処理が走って勝手にスクロールし「候補0件」と出ていた（実機で確認）。
         こちらの画面では何もしない。 */
      try { if (document.querySelector('meta[name="msq-gyaku"]')) return; } catch (e3) { }
      try { lensStart(); } catch (e2) { }
      return;
    }
    if (location.host !== 'jp.mercari.com') {
      try { rawApplyShopsDarkTheme(); } catch (e2) { }
      /* ★2026-08-12 仕入元サイトでは【売値予想だけ】を出す（ユーザー依頼）。
         左下の「仕入」で開いた各サイトの一覧に、商品ごとの価格から計算した
         売値を出す。商品ごとに価格が違うので、1つだけ出しても意味がない。
         ★ここから下のメルカリ用の処理は一切動かさない（別サイトを壊さないため）。 */
      try { rawShiireUri(); } catch (e2) { }
      return;
    }
    SP = new URLSearchParams(location.search);
    /* ★アプリ版はここで打ち切らない。メルカリは画面を切り替えても
       『読み込み完了』が起きないため、トップで1回流し込まれたきりになる。
       検索ページかどうかは、動かすたびに見る（下の rawOnSearch）。
       目印(__msqraw)もアプリ版では要求しない。 */
  } catch (e) { return; }

  /* ===== 仕入元サイトの一覧に【商品ごとの】売値予想を出す（2026-08-12 ユーザー依頼） =====
     左下の「仕入」で開いた各サイトの一覧に、その商品の価格から計算した売値を出す。
     商品ごとに価格が違うので、1つだけ出しても意味がない（1回そう作って指摘された）。
     ★ここは【メルカリ以外】で動く唯一の処理。上の return より手前で呼ばれるため、
       この下にある定数（RAW_FEE など）はまだ作られていない。よって
       【この関数の中だけで完結させる】。外の物を使うと「初期化前に使った」で落ちる。
     ★7サイトは作りがそれぞれ違うので、HTMLの構造には頼らない。
       画面に出ている【値段の文字】を探して、その隣に出す。
     ★式は拡張機能の MSQCore.FEE / calcProfit と突き合わせ済み（10例すべて一致）。 */
  function rawShiireUri() {
    /* ★2026-08-14 trefac.jp を追加。ユーザー指摘「トレファクが一切ボタン類がない」の元。 トレファクは2つある: ONLINE=ec.treasure-f.com ／ ファッション=www.trefac.jp。 後者はここに無かったため、そのサイトでは何も出ていなかった。 */
    const HOSTS = ['2ndstreet.jp', 'treasure-f.com', 'trefac.jp', 'brandear.jp', 'kind.co.jp',
      'auctions.yahoo.co.jp', 'mercari-shops.com'];
    const h = location.host;
    if (!HOSTS.some((x) => h === x || h.endsWith('.' + x))) return;
    const isShopsHost = /(^|\.)mercari-shops\.com$/i.test(h);

    /* ★メルカリShops下書き専用の取得元（2026-09-27）。
       Shopsの「そのまま」と「相場」は、仕入れサイトの題や型番欄を
       推測してはいけない。出品ページの説明文にある固定項目を読む。
       ・型番検索: 「〇品番」の直下行
       ・相場のブランド: 「〇ブランド」の直下行
       textarea[name="description"] を最優先し、他の画面文字は混ぜない。 */
    const shopsDraftDescription = () => {
      try {
        const direct = document.querySelector('textarea[name="description"]');
        if (direct && String(direct.value || '').trim()) return String(direct.value || '');
        /* DOMの版が変わってnameが無い場合だけ、項目名を含むtextareaへ限定する。 */
        const alt = Array.from(document.querySelectorAll('textarea')).find((el) =>
          /(?:〇|○|◯)\s*(?:品番|ブランド)/.test(String(el.value || '')));
        return alt ? String(alt.value || '') : '';
      } catch (e) { return ''; }
    };
    const shopsDraftField = (label) => {
      try {
        const text = shopsDraftDescription();
        if (!text) return '';
        const key = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?:^|\\r?\\n)\\s*(?:〇|○|◯)\\s*' + key
          + '\\s*\\r?\\n\\s*([^\\r\\n]*)', 'i');
        const m = text.match(re);
        let value = m ? String(m[1] || '').trim() : '';
        if (!value || /^\[.*\]$/.test(value)) return '';
        /* 品番欄の「記載なし」等を型番として検索語へ渡さない。 */
        if (label === '品番' && /^(?:記載なし|未記載|なし|不明|[-ー—–ｰ－_\s]+)$/i.test(value)) return '';
        return value;
      } catch (e) { return ''; }
    };
    const shopsDraftModel = () => shopsDraftField('品番');
    const shopsDraftBrand = () => shopsDraftField('ブランド');

    /* ★2026-08-27 ホット辞書（GAS）。クエッタと同じ物を出す。
       左下の🗂ボタンから取得先(GASのURL)を貼れる。クエッタにはコンソールが無く
       localStorage を手で書けないので、画面から設定できないと入れる手段が無い。
       ★取得は非同期。読めたら🗂の文字だけ書き替える。ここで画面は作り直さない。 */
    try {
      _hotDictEnsureButton();
      if (!_hotDictLoaded) {
        _hotDictLoaded = true;
        _loadHotDict(false).then(function () { _hotDictEnsureButton(); }).catch(function () { });
      }
    } catch (e9) { }

    /* ★2026-08-27 調べた記録（PC・クエッタで調べた分）を取り込んで札を出す。
       30分に1回までしか通信しない。失敗しても手元の控えで札は出る。 */
    /* ★2026-08-30 逆引きの続き（7サイト巡回）。仕事が無ければ何もしない。 */
    try { setTimeout(rawGyakuTick, 1200); } catch (e9) { }
    try {
      rawRecFuda();
      msqRecPullFromSheet(false).then(function () { rawRecFuda(); }).catch(function () { });
      /* ★2026-08-27 型番も取り込む（PC・クエッタで確定した分をアプリでも使う）。
         送り(push)はまだ呼んでいない。アプリのどの時点で型番が確定するかを
         決めてから足すこと。勝手に決めない。 */
      laiKataPull(false).catch(function () { });
      setTimeout(rawRecFuda, 2500);
      setTimeout(rawRecFuda, 6000);
    } catch (e8) { }

    /* ★商品の詳細ページかどうかはURLで判定する（2026-08-12 ユーザー指定）。
       画像の大きさでは判別できなかった（実測）:
         一覧 /buy         … 一番大きい画像 389×389・1番と2番の面積比 1.00
         詳細 /goods/detail… 一番大きい画像 346×461・1番と2番の面積比 1.00
       H1でも駄目だった。トレファクの詳細は【H1が空】（実機で確認）。
       ★下の形は5サイトとも実際に商品を開いて記録したもの。推測は入れていない。
       ★エコリングだけ未確認（要ログインで商品が1件も描かれなかった）。
         形が分かったらここに足すこと。 */
    const SHOSAI = [
      /\/goods\/detail\//,              // セカスト
      /\/item\/\d{6,}/,                 // トレファクONLINE
      /* ★2026-08-14 追加。トレファクファッション（www.trefac.jp）。
         実機で見た形: /smartphone/store/3081000730453452/c3208549/
         一覧は /store/search_result.html なので数字を求めれば当たらない。 */
      /\/store\/\d{6,}\//,               // トレファクファッション
      /\/products\/\d{6,}/,             // カインドオル
      /\/jp\/auction\//,                // ヤフオク
      /\/search\/detail\/AuctionID\//,  // ブランディア
      /\/products\/(?:create|[^/]+\/edit)/ // メルカリShops下書き・編集
    ];
    const shosaiPage = () => {
      const p = location.pathname || '';
      for (let i = 0; i < SHOSAI.length; i++) { if (SHOSAI[i].test(p)) return true; }
      return false;
    };

    const FEE = { purchase: 770, shipping: 750, sellRate: 0.10, outsource: 500 };
    const goal = (cost) => {
      const c = Number(cost) || 0;
      if (c <= 0) return null;
      const want = rawGoalWant(c);   /* ★2026-08-27 3段。クエッタと同じ */
      const raw = (want + c + FEE.purchase + FEE.shipping + FEE.outsource) / (1 - FEE.sellRate);
      return { sell: Math.ceil((raw - 80) / 100) * 100 + 80, want: want };
    };

    /* ===== 仕入元の商品から型番を取る（2026-08-12 ユーザー依頼・Aの分） =====
       ★ここは仕入元サイト。上の return より手前で呼ばれるので、下にある
         rawModelFromDesc なども【まだ作られていない】。中で完結させる。
       ★規則は msq_core.js の MODEL_LABEL_RE / modelFromDescription を写したもの。
         本家と19例で一致することを確認済み（書き換えないこと）。
       ★押した時だけ1件。押さなければ通信ゼロ。取った型番は保存して二度と取らない。 */
    const KATA_KEY = 'msq_shiire_model';
    const LABEL_RE = new RegExp(
      '(?:型番|型式|品番|品\\s*番|商品型番|メーカー\\s*(?:品番|型番)|' +
      'モデル\\s*(?:番号|ナンバー|No\\.?)|model\\s*(?:no\\.?|number)|' +
      'reference|ref\\.?|リファレンス(?:ナンバー)?)' +
      '[\\s\\]\\}】》>\\)）]*[\\s]*[:\\-=/|・･>→#.,、。~ー‐–—―]{0,2}[\\s]*' +
      '([A-Za-z0-9][A-Za-z0-9\\-_/\\.]{2,23})', 'gi');
    const kataFromText = (t0) => {
      const t = String(t0 || '').normalize('NFKC');
      LABEL_RE.lastIndex = 0;
      let m2;
      while ((m2 = LABEL_RE.exec(t))) {
        const v = m2[1].replace(/[\.\-_/,]+$/, '');
        if (!/\d/.test(v) || v.length < 4) continue;
        if (/[A-Za-z]/.test(v) || v.length <= 8) return v;
      }
      return '';
    };
    /* ★型番の取り所は【型番欄・タイトル・本文】の3つ（2026-08-12 ユーザー指摘）。
       型番欄しか見ておらず取りこぼしていた。実機の例:
         セカストの詳細は「型番 / ー」＝記載なし。だがタイトルに
         「SEIKO ソーラー腕時計/アナログ/ステンレス/PNK/SLV/SS/v137-0cd0」と入っていた。
       ★型番欄が「ー」の時は空として扱う（LABEL_RE が英数字しか採らないので自然にそうなる）。
       ★語を拾う規則は msq_core.js の extractModelCodes を写したもの。書き換えないこと。 */
    const SIZE_LIKE = /^(XS|S|M|L|XL|XXL|F|FREE|フリー|[0-9]{1,3}(cm|号)?)$/i;
    const ERA_LIKE = /^(\d{2}s|\d{2,4}年代?|[’']\d{2}s?|vintage|ヴィンテージ|ビンテージ)$/i;
    const COLOR_LIKE = /^(SLV|BLK|WHT|GLD|BLU|GRN|RED|PNK|BRN|GRY|GRAY|NVY|BEG|ORG|PPL|IVR|CML|KHK|YEL|TAN|WINE|BOR|MULTI|CLR|SMK|GRD|MIR|PLD|MOC|CHR|OFF|NAT|MEN|WOMEN|UNISEX|メンズ|レディース|ユニセックス|キッズ|ブラック|ホワイト|シルバー|ゴールド|ブルー|グリーン|レッド|ピンク|ブラウン|グレー|ネイビー|ベージュ|オレンジ|パープル|イエロー|カーキ|スモーク|ミラー|マルチ|クリア)$/i;
    /* ★2026-08-24【PCと同じ取り方に合わせた】ユーザー指示『PCの精度に合わせろ』。
       PC側(background.js)で実機の題23件が 21/23 → 23/23 になった規則を、そのまま持ってくる。
         ① 語はかたまりの中から [A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9] で抜く（4〜24文字）
         ② (英字と数字の両方) または (ハイフンがある) なら型番の候補
            → DABI-S（数字なし）も 921948-401（英字なし）も拾える。
              前の規則は「数字が無い語は捨てる」だったので DABI-S を丸ごと落としていた。
         ③ サイズ・年代・色・寸法・メルカリの商品IDは捨てる（アプリに元からある分も残す）
         ④ ブランド辞書に載っている語は型番にしない（Ray-Ban / G-SHOCK 対策）
            ★安全弁: 英字と数字が両方ある語（HR9164 等の本物の型番）は辞書にかけない
         ⑤ 型番らしい順に並べて返す。呼ぶ側は今までどおり [0] を使えばよい
       ★『パーカーはペンのブランド』(ユーザー・2026-08-24)。brand.csv 13094行に PARKER がある。
         辞書は汚れていないので、型番の判定に使ってよい。 */
    let kataBrandSet = null;
    const kataBrandHit = (s) => {
      try {
        if (!kataBrands || !kataBrands.length) return false;
        if (!kataBrandSet) {
          kataBrandSet = new Set();
          for (let i = 0; i < kataBrands.length; i++) {
            const n = String(kataBrands[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (n.length >= 3) kataBrandSet.add(n);
          }
        }
        return kataBrandSet.has(String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
      } catch (e) { return false; }   /* 辞書がまだ作られていない時に落とさない */
    };
    /* 型番らしい順。1=英数字と区切り 2=英数字 3=数字と区切り 4=英字と区切りだけ */
    const kataKurai = (s) => {
      const a = /[A-Za-z]/.test(s), b = /[0-9]/.test(s), h = s.indexOf('-') >= 0;
      return (a && b) ? (h ? 1 : 2) : (b ? 3 : 4);
    };
    const kataCodes = (title, brandHint) => {
      const out = [];
      const seen = {};
      const brandKey = String(brandHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const blocks = String(title || '')
        .split(/[\s　\/,、・()（）\[\]【】｜|★☆■□●○◆◇▲△▼▽※＊*＞＞>＜<〜~]+/);
      for (let i = 0; i < blocks.length; i++) {
        const block = String(blocks[i] || '');
        const kouho = block.match(/[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]/g) || [];
        for (let j = 0; j < kouho.length; j++) {
          const t = kouho[j];
          if (t.length < 4 || t.length > 24) continue;
          if (SIZE_LIKE.test(t) || ERA_LIKE.test(t) || COLOR_LIKE.test(t)) continue;
          if (/^m\d{10,13}$/i.test(t)) continue;
          if (/^(19|20)\d{2}$/.test(t)) continue;
          if (/^\d{2}(AW|SS)$/i.test(t)) continue;              /* 24AW / 25SS */
          if (/^\d{2}s(-\d{2}s)?$/i.test(t)) continue;           /* 70s / 70s-80s */
          if (/^\d+(\.\d+)?(円|cm|mm|g|kg|ml|inch|インチ)$/i.test(t)) continue;
          const eiji = /[A-Za-z]/.test(t), suuji = /[0-9]/.test(t);
          /* カインドオル等は「商品名5013924」のように数字型番が日本語へ直結する。
             数字だけを全面除外すると、型番欄にもある正しい型番を落とすため、
             日本語との境界から取れた数字列だけは弱い型番として残す。 */
          const gluedToJapanese = /[ぁ-んァ-ヶ一-龠ー][A-Za-z0-9]/.test(block);
          if (!(eiji && suuji) && t.indexOf('-') < 0 && !gluedToJapanese) continue;
          /* 題の先頭にブランド＋数字が連結するサイトがある。ブランド欄と完全一致する
             候補は型番ではないので、カード側のブランドを渡せた時だけ除外する。 */
          if (brandKey && t.toLowerCase().replace(/[^a-z0-9]/g, '') === brandKey) continue;
          if (!(eiji && suuji) && kataBrandHit(t)) continue;     /* Ray-Ban / G-SHOCK */
          if (seen[t]) continue;
          seen[t] = 1;
          out.push(t);
        }
      }
      return out.sort((a, b) => kataKurai(a) - kataKurai(b));
    };

    /* ★本家（list_extractor.js 1229・1255）にある規則を【そのまま写した】。
       書き直さないこと。自分で作り直して2回外している。
       ① 型番欄が「ー」など棒線だけの時は空として扱う（記載なしの意味）
       ② 強い型番＝英字と数字が両方あり、記号を除いて4文字以上。
          弱い型番（数字だけ・数字とハイフンだけ）は単独で引くと別物ばかり出る。
          実例: ZEPPELIN の 7580-2 → 7580-2 だけで引くと17件全部別物だった。
          弱い時はブランドを足して引く（この判定は次のB＝検索で使う）。 */
    const msqOkModel = (v) => {
      const t = String(v == null ? '' : v).trim();
      if (!t) return '';
      if (/^[ー\-—–ｰ－_\s]+$/.test(t)) return '';
      return t;
    };
    const msqStrongModel = (m) => {
      const t = String(m == null ? '' : m);
      return /[A-Za-z]/.test(t) && /[0-9]/.test(t)
        && t.replace(/[^A-Za-z0-9]/g, '').length >= 4;
    };

    let kataMap = null;
    const kataLoad = () => {
      if (kataMap) return kataMap;
      try { kataMap = JSON.parse(localStorage.getItem(KATA_KEY) || '{}') || {}; }
      catch (e) { kataMap = {}; }
      return kataMap;
    };
    const kataSave = (u, v, doko) => {
      const m2 = kataLoad(); m2[u] = v;
      try { localStorage.setItem(KATA_KEY, JSON.stringify(m2)); } catch (e) { }
      /* ★2026-08-27 共有の箱にも入れる。laiKataHozon が中で laiKataPush を
         呼ぶので、そのままGASへ送られ、PC・クエッタでも同じ型番が出る。
         失敗しても手元の保存は済んでいるので、ここで止めない。 */
      try { if (v) laiKataHozon(u, v, doko || 'アプリ'); } catch (e) { }
    };
    /* 型番を探す。手元に無ければ【GASで共有された分】を見る。
       ★手元を先に見る理由: 自分で調べ直した直後を、古い共有で上書きしないため。
       ★これがあると、PC・クエッタで調べ済みの商品は
         商品ページを開かずに型番が出る（通信も減る）。 */
    /* 出どころ（'欄'/'題'/'本文'）。分からなければ空。 */
    const kataDokoSagasu = (u) => {
      try {
        const all = laiKataYomu();
        const v = all[laiKataKagi(u)];
        const d = (v && v.d) ? String(v.d) : '';
        return (d === '欄' || d === '題' || d === '本文') ? d : '';
      } catch (e) { return ''; }
    };
    const kataSagasu = (u) => {
      try {
        const te = kataLoad();
        if (Object.prototype.hasOwnProperty.call(te, u)) return te[u] || '';
        const all = laiKataYomu();
        const v = all[laiKataKagi(u)];
        return (v && v.k) ? String(v.k) : '';
      } catch (e) { return ''; }
    };
    /* ★「そのまま」のURLを作る。本家 list_extractor.js 7918-7935 と同じ形。
         ・keyword は「ブランド 型番」
         ・付ける条件は seller_type=0 と item_types=mercari。並び順・販売状況・状態は付けない
         ・__msqsrcmodel は【型番だけ】。ブランドを混ぜると型番照合が一致しなくなる
       ★詳細ページ用と一覧のタイル用で同じ関数を使う（規則を2か所に書かない）。 */
    /* ★題から検索語を作る規則。本家 list_extractor.js の msqTrimName を写した。
       仕入元の題は「名前/属性/色//」の形で、後ろは色や素材。全部入れると0件になる。
         ・「/」で切って最初の1つだけ使う
         ・「・」「_」は空白にする */
    const msqTrimName = (s) => String(s == null ? '' : s)
      .split('/')[0].replace(/[・_]+/g, ' ').replace(/\s+/g, ' ').trim();

    /* ★題からブランドを取る（2026-08-12 実機で本物の題14件を測って決めた）。
       先頭1語だけにしていたため、2語以上のブランドが全部壊れていた:
         EMPORIO ARMANI → 「EMPORIO」／MICHAEL KORS → 「MICHAEL」
       その検索語でメルカリを引くと結果がほぼ0件になっていた（実機で1件）。
       ★規則: 日本語が出るまでの語をつなげる（最大3語）。
         仕入元の題は「ブランド 名前/属性…」の形で、名前は日本語で始まるため。
       ★「23%OFF」のような割引の札は飛ばす（タイルの1行目がこれになる商品がある）。 */
    /* ===== ブランドは辞書で照合する（2026-08-12 ユーザー指摘「ブランド辞書を確認してない」）=====
       拡張機能は brand.csv（21,838件）で照合している。こちらも同じ辞書を使う。
       ★仕入元サイトでは手前で return するため、メルカリ側の rawBrandLoad は使えない。
         同じCSVを、この中だけで読み込む（あちらの保存には触らない）。
       ★辞書が読めるまで／読めない時だけ、下の当てずっぽうを保険として使う。 */
    const KATA_BRAND_CSV = 'https://raw.githubusercontent.com/myusei35-cpu/BlueStar-Standard/refs/heads/main/brand.csv';
    const KATA_BRAND_CACHE = 'msq_shiire_brands';
    let kataBrands = null;
    (function kataBrandLoad() {
      try {
        const c = JSON.parse(localStorage.getItem(KATA_BRAND_CACHE) || 'null');
        /* ★2026-08-17 件数も見る。429の文章から作られた偽の辞書が既に端末に
           保存されている（最長7日残る）ので、それを使い続けないため。
           本物は21,838件。1000件に満たない物は捨てて取り直す。 */
        if (c && c.t && (Date.now() - c.t) < 7 * 864e5 && c.v && c.v.length >= 1000) { kataBrands = c.v; return; }
        if (c) { try { localStorage.removeItem(KATA_BRAND_CACHE); } catch (e2) { } }
      } catch (e) { }
      try {
        /* ★2026-08-17 ここが『villance』事件の大本だった。
           ★見つけ方: 私が同じURLを叩いたら GitHub から【429 Too Many Requests】が返った。
             その中身は普通の文章:
               「429: Too Many Requests / For more on scraping GitHub, ... 」
           ★直す前のコードは r.ok を見ずに、返ってきた文章をそのままCSVとして読んでいた。
             行をカンマで割るので、この文章から【ブランド名でも何でもない語】が
             辞書として作られ、しかも【7日間キャッシュ】されていた。
             その結果 brandFromDict はどのブランドも見つけられず、
             題の中の英字語（villance）をブランドとして採ってしまう。
           ★メルカリ側の rawBrandLoad は r.ok を見ている（あちらは正しい）。
             こちらへ写す時に、その1行だけ落としていた。
           ★直し: ①HTTPの status を見る ②中身がCSVらしいかを確かめる
                   ③おかしければ【保存しない】（次に開いた時にまた取りに行く）。 */
        fetch(KATA_BRAND_CSV)
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then((t) => {
            const out = [];
            const lines = String(t).split(/\r?\n/);
            for (let i = 1; i < lines.length; i++) {
              if (!lines[i]) continue;
              /* 列は 空,英語,日本語,空,カナ（メルカリ側 rawParseBrandCsv と同じ） */
              const c2 = lines[i].split(',');
              const en = String(c2[1] || '').replace(/^"|"$/g, '').trim();
              if (en) out.push(en);
            }
            /* 本物の brand.csv は21,838件ある。桁違いに少ない時は中身が別物。 */
            if (out.length < 1000) throw new Error('中身がCSVでない（' + out.length + '件）');
            kataBrands = out;
            try { localStorage.setItem(KATA_BRAND_CACHE, JSON.stringify({ t: Date.now(), v: out })); } catch (e) { }
          }).catch((e) => {
            try { console.warn('[MSQ/ブランド辞書] 読めず: ' + e.message); } catch (e2) { }
          });
      } catch (e) { }
    })();

    /* 題の先頭にある一番長いブランド名を辞書から探す。 */
    const brandFromDict = (s) => {
      if (!kataBrands || !kataBrands.length) return '';
      /* 先頭のカード操作記号や状態札はブランドの一部ではない。
         これを残すと先頭一致が失敗し、後段の含有検索が LIFE など商品名の一語を
         ブランドとして返してしまう。 */
      const t = String(s || '')
        .replace(/^\s*[＋+]+\s*/, '')
        .replace(/^\s*(?:NEW|SALE|PriceDown|OFF|USED|SOLD)\s+/i, '')
        .toUpperCase();
      /* ★2026-08-17 アポストロフィ等を落とした形でも見る。
         ARC'TERYX / ARC’TERYX / ARCTERYX のように書き方が割れるため、
         そのまま比べると辞書にあっても見つからない。 */
      const tN = t.replace(/[\s　'’`．.\-]/g, '');
      let best = '';
      for (let i = 0; i < kataBrands.length; i++) {
        const b = kataBrands[i];
        if (!b || b.length < 2) continue;
        const B = b.toUpperCase();
        const BN = B.replace(/[\s　'’`．.\-]/g, '');
        if (t.indexOf(B) !== 0 && !(BN.length >= 4 && tN.indexOf(BN) === 0)) continue;  /* 題の先頭に一致する物だけ */
        if (B.length > best.length) best = b;      /* 一番長いものを採る */
      }
      /* ★2026-08-17 ヤフオクは題が『鑑定付き ウォッチ SEIKO セイコー PRESAGE …』のように
         札や語が先に来るため、先頭一致では1つも見つからなかった（実機で確認）。
         先頭に無い時は、語として含まれている物を探す。
         ★短い語がたまたま混ざるのを避けるため3文字以上に限り、語まるごと一致だけを見る。 */
      if (!best) {
        const go = new Set(String(s || '').split(/[\s\u3000\/,、・()（）\[\]【】｜|]+/)
          .map((x) => String(x || '').toUpperCase()).filter((x) => x.length >= 3));
        if (go.size) {
          for (let i = 0; i < kataBrands.length; i++) {
            const b2 = kataBrands[i];
            if (!b2 || b2.length < 3) continue;
            const B2 = b2.toUpperCase();
            if (go.has(B2) && B2.length > best.length) best = b2;
          }
        }
      }
      return best;
    };

    const RAW_NIHONGO = /[ぁ-んァ-ヶ一-龥]/;
    const brandFromDai = (s) => {
      const dict = brandFromDict(s);
      if (dict) return dict;
      /* 辞書が未読の便でも、先頭の状態札を捨ててから英字ブランドを拾う。
         「【美品】TEN × Ron Herman …」を札ごと見ると日本語を先に検出して
         空文字になり、後段のサイト照合がブランドなしになっていた。 */
      const clean = String(s == null ? '' : s)
        .replace(/^\s*(?:【[^】]*】|\[[^\]]*\])+\s*/g, '')
        .replace(/^\s*(?:新品|未使用|美品|極美品|良品|タグ付き|送料無料)\s+/i, '')
        .trim();
      const parts = clean.split(/[\s　\/]+/);
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        const t = parts[i];
        if (!t) continue;
        if (/^\d+%/.test(t)) continue;            // 23%OFF などの札
        if (/^[×xX&,・]+$/.test(t)) continue;      // コラボの区切り記号
        if (RAW_NIHONGO.test(t)) break;           // 日本語＝商品名に入った
        out.push(t);
        if (out.length >= 3) break;
      }
      return out.join(' ');
    };
    /* タイルの題。1行目が割引の札のことがあるので、そうでない最初の行を使う。 */
    const daiFromTile = (el) => {
      const gyo = String((el && el.innerText) || '').split('\n');
      for (let i = 0; i < gyo.length; i++) {
        const t = gyo[i].trim();
        if (!t) continue;
        if (/^\d+%/.test(t)) continue;
        if (/^[¥￥]/.test(t)) continue;
        return t;
      }
      return '';
    };


    /* ★ワンコピ専用の題取り（2026-08-14 実機でタイルの行を測って決めた）。
       セカストのタイルは 1行目=ブランド、2行目=属性列（例 腕時計/アナログ/BLK/BLK/vbp040017）、
       3行目=商品の状態、4行目=値段、以降=こちらが付けたボタン、という並び。
       daiFromTile は1行目しか返さないため（「そのまま」「型番」で使うので触らない）、
       それを渡すとブランドしか写らなかった（実機で6件すべてブランドのみを確認）。
       ここは値段・状態・自分が付けたボタンの行を捨て、残った先頭2行をつなぐ。 */
    /* ★2026-08-26「コピー」を「タイトル」に改名したので、捨てる印にも足す。
       足さないと、自分で付けたボタンの文字が題に混ざる。 */
    const COPY_SUTERU = /^(商品の状態|売値|型番を調べる|型番検索|タイトル|コピー|そのまま|調べています|もう一度|取れず|写した|写せず|1件ずつ|弾かれました|中断|お気に入り|カートに入れる|SOLD)/;
    /* ★写真の説明から題を取る（2026-08-14 実機で測った）。
       トレファクファッション（www.trefac.jp）はタイルの文字が
         SALE ／ メンズ ／ ブランド ／ サイズ： ／ 値段 ／ 店名
       だけで【商品名も型番も出ていない】。写真の説明にだけ入っている:
         CASIO×CHANNELISLANDSカシオ×）の古着「G-LIDE デジタルウォッチ/G-ライド/腕時計/GLX-150CI」｜ブラック
       ・かぎ括弧の中＝題（型番まで入っている）
       ・かぎ括弧の前＝ブランド（英字のうしろにカナが続けて書かれている）
       ・縦棒のうしろ＝色（要らないので取らない）
       他のサイトはこの形ではないので、当たらなければ空を返して行から取る方に落ちる。 */
    const copyAltDai = (el) => {
      const im = el && el.querySelector && el.querySelector('img');
      const alt = String((im && im.getAttribute('alt')) || '');
      const naka = alt.match(/「([^」]+)」/);
      if (!naka) return '';
      const mae = alt.slice(0, alt.indexOf('「'));
      /* ブランドは英字の並びだけ拾う（カナが続けて書かれているため） */
      const eiji = (mae.match(/[A-Za-z0-9&×.\- ]{2,}/g) || [])
        .map((x) => x.trim()).filter((x) => x.length >= 2)[0] || '';
      return (eiji ? eiji + ' ' : '') + naka[1];
    };
    const copyDaiFromTile = (el) => {
      const alt = copyAltDai(el);
      if (alt) return alt;
      /* 商品カードがブランド欄と商品名欄を持つサイトは innerText を使わない。
         画像上の「＋」やお気に入り等の操作文字が先頭へ混ざると、
         ブランド辞書が商品名の一語だけ（例: LIFE）をブランドとして拾い、
         タイトル検索がブランド名だけになるため。セカストの
         .itemCard_brand/.itemCard_name を起点に、同じ構造のカードにも使う。 */
      try {
        const brandEl = el && el.querySelector && el.querySelector(
          '.itemCard_brand,.productCard_brand,.product-card__brand,[class*="itemCard_brand"],[class*="productBrand"]');
        const nameEl = el && el.querySelector && el.querySelector(
          '.itemCard_name,.productCard_name,.product-card__name,[class*="itemCard_name"],[class*="productName"]');
        const brandText = String((brandEl && brandEl.textContent) || '').replace(/\s+/g, ' ').trim();
        const nameText = String((nameEl && nameEl.textContent) || '').replace(/\s+/g, ' ').trim();
        if (brandText || nameText) {
          const cleanPart = (v) => String(v || '')
            .replace(/^[＋+]+\s*/, '')
            .replace(/^(?:NEW|SALE|PriceDown|OFF|USED|SOLD)\s+/i, '')
            .trim();
          const joined = [cleanPart(brandText), cleanPart(nameText)].filter(Boolean).join(' ');
          if (joined) return joined;
        }
      } catch (e) { }
      const gyo = String((el && el.innerText) || '').split(/\r?\n/);
      const out = [];
      /* ★2026-08-17 カインドオルは「ブランド／品名／型番／値段」の順で、
         型番が3行目にある。2行までだと型番に届かない（実機の絵で確認）。
         値段の行より前を4行まで取る。値段・状態・こちらのボタンの行は下で捨てる。 */
      for (let i = 0; i < gyo.length && out.length < 4; i++) {
        const t = gyo[i].trim();
        if (!t) continue;
        if (/^\d+%/.test(t)) continue;
        if (/^[＋+]+$/.test(t)) continue;             /* 画像上の追加ボタン */
        if (/^[¥￥]/.test(t)) continue;
        if (COPY_SUTERU.test(t)) continue;
        /* ★2026-08-26 セカストのタイルは1行目が札「NEW」。これを題に混ぜていたため
           ・題が「NEW HELLY HANSEN ジャケット…」になる
           ・brandFromDai が辞書で外した時、ブランドが「NEW HELLY HANSEN」になり、
             copyMoji のブランド重なり判定（N9で丸ごと比べる）が外れて
             「NEW HELLY HANSEN HELLY HANSEN ジャケット」と二重に出ていた（実測）。
           ★FUDA_RE は前後を留めた形（^…$）なので、
             「NEW BALANCE」のような本物のブランド名は落ちない。
             COPY_SUTERU（先頭一致）に NEW を足すのは駄目。NEW BALANCE が丸ごと消える。 */
        if (FUDA_RE.test(t)) continue;
        out.push(t);
      }
      return out.join(' ');
    };
    /* カード自身にブランド欄がある場合は、題の辞書推測を使わない。
       「WONDER FULL LIFE」のような複数語ブランドで辞書が未読／部分一致になると、
       商品名の一語だけをブランドとして返すため。 */
    const brandFromTile = (el) => {
      try {
        const brandEl = el && el.querySelector && el.querySelector(
          '.itemCard_brand,.productCard_brand,.product-card__brand,[class*="itemCard_brand"],[class*="productBrand"]');
        const v = String((brandEl && brandEl.textContent) || '')
          .replace(/^[＋+]+\s*/, '')
          .replace(/\s+/g, ' ').trim();
        if (v) return v;
      } catch (e) { }
      return brandFromDai(copyDaiFromTile(el));
    };

    /* ===== ワンコピ（ブランド＋題）2026-08-14 ユーザー依頼 =====
       「明らかに不要な色とかサイズとかは抜いたもの。高値要素以外も抜け。高値要素だけが望ましい」
       ★本家 list_extractor.js の規則をそのまま写した:
           msqTrimName   … 「/」で切って最初だけ。「・」「_」は空白
           msqOnlyProper … 不要語(MSQ_JUNK/MSQ_GENERIC)、色記号(大文字2〜4字)、
                           種類で終わる語(MSQ_TAIL)を落とす
           高値要素      … HIGH_MATERIALS / HIGH_COLORS / HIGH_SIZES / HIGH_WORDS に
                           当たるものだけを足す
         組み立ても本家と同じ: ブランド ＋ 整えた題 ＋ 高値要素 */
    const MSQ_JUNK = ['＋', '+', '売', '益', '≒', '→'];
    const MSQ_TAIL = ['シャツ', 'ジャケット', 'パンツ', 'コート', 'ニット', 'スカート',
      'ブーツ', 'スニーカー', 'バッグ', '時計', 'ワンピース', 'ブルゾン', 'カーディガン',
      /* ★2026-08-14 追加。トレファクの題に「デジタルウォッチ」が出る。種類語なので落とす。 */
      'ウォッチ'];
    const MSQ_GENERIC = [
      '腕時計', 'クォーツ腕時計', 'ソーラー腕時計', 'デジタル', 'アナログ', 'デジアナ',
      '自動巻', '手巻', '時計',
      'ジャケット', 'ブルゾン', 'コート', 'パンツ', 'スカート', 'ワンピース', 'シャツ',
      'Tシャツ', 'カットソー', 'ニット', 'セーター', 'カーディガン', 'ベスト', 'パーカー',
      'スウェット', 'トレーナー', 'ブーツ', 'スニーカー', 'サンダル', 'バッグ', '財布',
      'レザー', 'ラバー', 'コットン', 'ナイロン', 'ポリエステル', 'ウール', 'デニム',
      'スウェード', 'ステンレス', 'シルバー', 'プラスチック', '化学繊維'
    ];
    /* ★2026-08-17 ユーザー指示『コットンなど安い素材は要らないが、インドコットンは高値要素』。
       ただのコットンは MSQ_GENERIC で落ちるので、ここには【高い方のコットン】だけを足す。 */
    const HIGH_MATERIALS = ['カシミヤ', 'モヘア', 'シルク', 'ウール', 'リネン', 'レザー',
      'スエード', 'アンゴラ', 'アルパカ', 'インドコットン', 'オーガニックコットン',
      'cashmere', 'mohair', 'silk', 'wool', 'linen', 'leather', 'suede'];
    const HIGH_COLORS = ['ブラック', 'ネイビー', 'black', 'navy'];
    const HIGH_SIZES = ['XL', 'XXL', '2XL', '3XL', '44', '46', '48', '50', '52'];
    const HIGH_WORDS = ['コラボ', '限定', 'collab', 'limited', 'supreme', 'off-white', 'offwhite'];

    const msqOnlyProper = (s) => String(s == null ? '' : s)
      .split(/[\s　]+/)
      .filter((t) => {
        if (!t) return false;
        if (MSQ_JUNK.indexOf(t) >= 0) return false;
        if (MSQ_GENERIC.indexOf(t) >= 0) return false;
        if (/^[A-Z]{2,4}$/.test(t)) return false;        // BLK GRY などの色記号
        for (let i = 0; i < MSQ_TAIL.length; i++) {
          if (t.length > MSQ_TAIL[i].length && t.endsWith(MSQ_TAIL[i])) return false;
        }
        return true;
      })
      .join(' ')
      .trim();

    const takaneYouso = (allText, sizeText) => {
      const out = [];
      const t = String(allText || '').toLowerCase();
      HIGH_MATERIALS.forEach((m) => { if (t.indexOf(m.toLowerCase()) >= 0) out.push(m); });
      HIGH_COLORS.forEach((c) => { if (t.indexOf(c.toLowerCase()) >= 0) out.push(c); });
      if (sizeText) {
        for (let i = 0; i < HIGH_SIZES.length; i++) {
          if (String(sizeText).toUpperCase().indexOf(HIGH_SIZES[i]) >= 0) { out.push(HIGH_SIZES[i]); break; }
        }
      }
      HIGH_WORDS.forEach((w) => { if (t.indexOf(w.toLowerCase()) >= 0) out.push(w); });
      const seen = {};
      return out.filter((x) => { if (seen[x]) return false; seen[x] = 1; return true; });
    };

    /* ★2026-08-24 ユーザー『固有名詞が取れるなら固有名詞が一番いいに決まってるだろ』。
       題の【ブランドの直後から「/」まで】が、その商品だけの名前。ここを検索語に使う。
         NIKE AIR MORE UPTEMPO 96/白/921948-401/28cm → AIR MORE UPTEMPO 96
         STANDARD CALIFORNIA KOMY ART WORKS         → KOMY ART WORKS
         TOGA PULLA ボトム/34/…                      → 空（カテゴリー語しか無いため）
       ★ブランドの綴りは辞書と題で違う（辞書 adidas by Stella McCartney ／
         題 adidas by STELLAMcCARTNEY）。記号と空白を落とした形で、
         前から1語ずつ食わせて外す。綴りの違いで外し損ねると固有名詞に混ざる。 */
    /* ★2026-08-24 実機（カインドオル）で確認。値札の帯が題に混ざる。
         「PriceDown」「PriceDown special price」がそのまま検索語に入っていた。
       ユーザー『NEW とかプライスダウンとかいらんぞ』。1語ずつ落とす。 */
    const FUDA_RE = /^(NEW|SALE|PriceDown|Price|Down|special|OFF|USED|SOLD|中古|新品|美品|未使用|送料無料|即決|値下げ|セール|限定価格)$/i;
    const koyuuFromDai = (dai, brand) => {
      try {
        let saki = String(dai == null ? '' : dai);
        /* ★2026-08-24 実機（カインドオル）で確認。題は
             「SCAPA チェックプリーツラップスカート サイズ：38 ¥5,610」の形で、
           サイズから後ろは属性と値段。ここで切らないと ¥5,610 が検索語に入る。 */
        const si = saki.search(/サイズ[:：]?/);
        if (si > 0) saki = saki.slice(0, si);
        /* ★「/」で切るのは【2個以上あるとき】だけ。
             セカスト『ボトム/34/ポリエステル/NVY/TP52-FF250』は属性の並びなので切る。
             カインドオル『Supreme 20SS/Glow-in-the-Dark Zippo』は名前の一部なので
             切ると「SUPREME 20SS」になり商品名が消える（実機で確認）。 */
        if ((saki.match(/\//g) || []).length >= 2) saki = saki.split('/')[0];
        const go = saki.split(/[\s\u3000・_\/／]+/).filter(Boolean);   /* ★2026-08-25 全角の／も区切り */   /* ★2026-08-25「/」も区切り。Columbia …バックパックII/リュック の「リュック」をカテゴリー語として落とすため */
        const N = (x) => String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const bN = N(brand);
        let i = 0, tsumi = '';
        while (bN && i < go.length) {
          const tugi = N(tsumi + go[i]);
          if (!tugi || bN.indexOf(tugi) !== 0) break;
          tsumi += go[i]; i++;
          if (N(tsumi) === bN) break;
        }
        /* ★2026-08-25 実機（カインドオル）で確認。題は商品名と品番が【空白なしで】
           つながっている:
             シアーレイヤードカットソー0121010607
             ダブルモンクストラップヒールシューズD00030
             デニムパンツ25030440223040
           そのまま検索語に入れると、その品番を書いていない出品に当たらない。
           品番は kataCodes が別に取っているので、ここでは切り離す。
           ★日本語の直後に続く英数字4文字以上だけを落とす。
             「Skirtボタンスリットスカート」のように日本語が後ろに来る形は触らない。 */
        const kirihanasu = function (s) {
          return String(s == null ? '' : s)
            .replace(/([ぁ-んァ-ヶ一-龠ー])([A-Za-z0-9][A-Za-z0-9-]{3,})$/, '$1');
        };
        const nokori = go.slice(i).map(kirihanasu).filter((t) => {
          if (!t) return false;
          if (FUDA_RE.test(t)) return false;                     /* NEW / SALE / PriceDown */
          if (/^[¥￥\$]/.test(t)) return false;                   /* ¥5,610 */
          /* ★2026-08-25 ここを「数字だけは全部落とす」にしていたので、
             NIKE AIR MORE UPTEMPO 96 の【96】まで消えていた（実測で確認）。
             サイズは上の「サイズ」で切っているため、ここで落とす必要はない。
             落とすのは値段の形だけにする。 */
          if (/^[0-9０-９]{1,3}([,，][0-9]{3})+円?$/.test(t)) return false;   /* 5,610 */
          if (/^[0-9０-９]+円$/.test(t)) return false;                        /* 5610円 */
          if (/^[0-9]+\/[0-9]+$/.test(t)) return false;           /* 36 1/2 の 1/2 */
          if (/^\d{2}(AW|SS)$/i.test(t)) return false;            /* 20SS / 24AW */
          if (/^\d{2}s(-\d{2}s)?$/i.test(t)) return false;        /* 70s */
          if (CATEGORY_TOKENS.indexOf(t) >= 0) return false;      /* ボトム・パンツ等（単独の時だけ） */
          if (MSQ_GENERIC.indexOf(t) >= 0) return false;
          if (MSQ_JUNK.indexOf(t) >= 0) return false;
          if (COLOR_LIKE.test(t)) return false;
          if (/^(商品の状態|中古|新品|美品|未使用)/.test(t)) return false;
          if (!/[A-Za-z0-9ぁ-んァ-ヶ一-龠]/.test(t)) return false;   /* 記号だけの語（: - ー） */
          /* ★2026-08-24【MSQ_TAIL の除外をやめた】ユーザー指摘
               『SCAPA なら チェックプリーツラップスカートだろうが』。
             「〜スカート」「〜パンツ」で終わる語を落としていたため、仕入元の
             【商品名そのもの】が丸ごと消えていた（実機で SCAPA が「SCAPA ¥5,610」に
             なっていた）。あの除外はメルカリ側で種類語を削るためのもので、
             仕入元の商品名には当てはめてはいけない。 */
          return true;
        });
        return nokori.length ? nokori.join(' ').trim() : '';
      } catch (e) { return ''; }
    };
    /* ★2026-08-25【題をそのまま使う形に作り替えた】ユーザー提案
         『タイトルのそのままで不要なものを取り除いたもの、連なったキーワードを
           そのまま入れればいいのでは？　それよりも精度高くなるか？』
       → 実測で【題そのままの方が正確】だった。3件で確認:
           Supreme Glow-in-the-Dark Zippo   14件・全部このモデル
             （規則で作った「Supreme Zippo」は115件でステッカー¥470〜別モデル混在）
           PERVERZE シアーレイヤードカットソー  5件・PERVERZEのシアー系
           SCAPA チェックプリーツラップスカート  7件・O'NEIL OF DUBLIN×SCAPA のラップスカート
             ★コラボ相手まで自動で当たった。語を選んで作っていたら絶対に出せない。
       ★だから【語を選ぶ・並べ替える】のをやめる。題の順のまま、不要な物だけ落とす。
         落とすのは: サイズから後ろ／値段／NEW・PriceDown等の札／年代(20SS/70s)／
                     ／の後ろの日本語の言い直し／末尾にくっついた品番／色記号 */
    const copyMoji = (dai, brand, size) => {
      try {
        let s = String(dai == null ? '' : dai);
        const si = s.search(/サイズ[:：]?/);
        if (si > 0) s = s.slice(0, si);              /* サイズから後ろは属性と値段 */
        const zi = s.indexOf('／');
        if (zi > 0) s = s.slice(0, zi);              /* ／の後ろは日本語の言い直し */
        /* ★2026-08-25 セカストの題は「名前/属性/属性/…」の並びで、そのまま繋ぐと
           オーバル・白・28cm・ポリエステル まで検索語に入って当たらなくなる（実測で悪化）。
           「/」が2個以上ある時だけ最初の区画にする。カインドオルの
           「Supreme 20SS/Glow-in-the-Dark Zippo」は1個なので切らない（Zippoが残る）。 */
        if (s.split('/').length - 1 >= 2) {
          /* セカストの題は「21SS/カフタンドレス//コットン/BLK/品番」のように
             季節コードと商品名が別区画になる。最初の区画だけを残すと、商品名を
             捨ててブランドだけで検索してしまうため、日本語を含む商品名区画を優先する。
             日本語区画が無いサイトは従来どおり先頭区画を使う。 */
          const parts = s.split(/[\/／]+/).map((x) => String(x || '').trim()).filter(Boolean);
          const jp = parts.find((x) => /[ぁ-んァ-ヶ一-龥]/.test(x)
            && !/^\d{2}(AW|SS)$/i.test(x)
            && !/^(?:BLK|GRY|NVY|BEG|WHT|RED|BLU|KHA|BRN)$/i.test(x));
          s = jp || parts[0] || s;
        }
        const kirihanasu = function (w) {
          return String(w == null ? '' : w)
            .replace(/([ぁ-んァ-ヶ一-龠ー])([A-Za-z0-9][A-Za-z0-9-]{3,})$/, '$1');
        };
        const mita = {};
        /* ★2026-08-26 「NEW BALANCE」の NEW を札と間違えて落としていた。
           実測で「NEW BALANCE BALANCE スニーカー」になる（ブランドの重なり判定が
           外れて、ブランドをもう一度前に足してしまうため）。
           ★直し: ブランド名に入っている語は、札の形でも落とさない。 */
        const B9 = String(brand || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const go = s.split(/[\s\u3000・_\/]+/).map(kirihanasu).filter((t) => {
          if (!t) return false;
          if (FUDA_RE.test(t)
            && B9.indexOf(String(t).toUpperCase().replace(/[^A-Z0-9]/g, '')) < 0) return false;
          if (/^[¥￥\$]/.test(t)) return false;                      /* ¥5,610 */
          if (/^[0-9０-９]{1,3}([,，][0-9]{3})+円?$/.test(t)) return false;
          if (/^[0-9０-９]+円$/.test(t)) return false;
          if (/^[0-9]+\/[0-9]+$/.test(t)) return false;              /* 36 1/2 */
          if (/^\d{2}(AW|SS)$/i.test(t)) return false;               /* 20SS */
          if (/^\d{2}s(-\d{2}s)?$/i.test(t)) return false;           /* 70s */
          if (COLOR_LIKE.test(t)) return false;                      /* BLK GRY */
          if (/^(商品の状態|中古|新品|美品|未使用)/.test(t)) return false;
          const k = t.toLowerCase();
          if (mita[k]) return false;                                 /* 同じ語の重複だけ落とす */
          mita[k] = 1;
          return true;
        });
        /* ブランドが題に無い時だけ先頭に足す（辞書の綴りで補う） */
        const N9 = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const honbun = N9(go.join(''));
        const b9 = String(brand || '').trim();
        if (b9 && N9(b9) && honbun.indexOf(N9(b9)) < 0) go.unshift(b9);
        return go.join(' ').trim();
      } catch (e) { return ''; }
    };
    /* ★第7引数 kwZumi は【もう出来上がっている検索語】。渡された時はそれをそのまま使う。
       「タイトル」ボタン（題から作った語）がここを通るために足した（2026-08-26）。
       ★呼ぶ側は model を空にして渡すこと。そうすれば下の絞り込み
         （個人・メルカリ便）が付き、__msqsrcmodel は付かない。
         題の文字列を型番として渡すと、あちらの型番照合が誤って一致する。 */
    /* ★第8引数 brandNashi は【ブランドを足すな】の印（2026-08-26）。
       ★実機で見つけた不具合: 小窓で「型番のみ」を選んでも
         『UNITED ARROWS DP-6022GR』になっていた。呼ぶ側は brand を空で渡していたが、
         下の brandKirei が【brandFromDict(題) を先に見る】ため、
         空にしても題からブランドが復活していた。
       ★ユーザー指示『選択に出てる型番かブランド＋型番でそのままメルカリ検索しろ』。 */
    const sonomamaUrl = (model, brand, rank, price, img, dai, kwZumi, brandNashi) => {
      /* ★型番が無くても出す（2026-08-12 ユーザー指示「レンズ結果で使うから」）。
         型番があれば「ブランド 型番」、無ければ題（属性を落としたもの）で引く。
         ★__msqsrcmodel は型番がある時だけ付ける。無いのに空で付けると
           あちらの型番照合が空文字と一致してしまう。 */
      /* ★2026-08-17 ユーザー指摘『そのままを押すと NEW などの余計な語が一緒に入る』。
         型番が無い時は題をそのまま検索語にしていたため、"NEW" "SALE" のような札が混ざっていた。
         コピーで使っているのと同じ msqOnlyProper（不要語・色記号・種類語を落とす）を通す。
         ★型番がある時は今までどおり『ブランド 型番』のまま。そちらは触らない。 */
      /* ★2026-08-18 実機『そのままで、ブランド名＋型番以外に先頭にNEWが入る』。
         ★原因: ここへ渡ってくる brand は brandFromDai の当て推量で、辞書で見つからない時は
           題の先頭から3語を取る。トレファクやヤフオクは1行目が NEW / SALE なので、
           それがブランドとして入っていた。型番が無い側は直したが、
           【型番がある側（この行）】が直っていなかった。
         ★直し: 辞書で確かめられたブランドを優先する。辞書で取れない時は札を落とす。 */
      const brandNEW = /^(NEW|SALE|PriceDown|OFF|USED|SOLD|中古|新品|美品|未使用|送料無料|即決|現在|入札|残り|値下げ|セール)$/i;
      const brandKirei = (() => {
        if (brandNashi) return '';        /* ★「型番のみ」を選んだ時は題からも足さない */
        /* 呼び出し側がカードのブランド欄から取った値を優先する。
           題全体を辞書へ再投入すると、LIFE のような部分語へ縮むことがある。 */
        const explicit = String(brand || '').trim();
        if (explicit) return explicit.split(/[\s　]+/).filter((t) => t && !brandNEW.test(t)).join(' ').trim();
        let b = '';
        try { b = brandFromDict(dai) || ''; } catch (e) { }
        if (b) return String(b).trim();
        return '';
      })();
      const kw = kwZumi
        ? String(kwZumi)
        : model
        ? ((brandKirei ? brandKirei + ' ' : '') + model)
        : (() => {
            /* ★2026-08-17 ユーザー指示『その都度違う言葉が来たら足されるのは困る。型番だけを取得しろ』。
               不要語を1つずつ除いていく方式（NEW/SALE…を足し続ける）はやめる。
               題からは【型番の形をしたものだけ】を抜き出す（kataCodes は
               「数字を含む4〜24文字」だけを型番とみなすので、NEW や SALE は最初から入らない）。
               型番が1つも無ければブランドだけで引く。ブランドも無ければ題（従来どおり）。 */
            /* ★2026-08-17 ヤフオクで『NEW a656』のように札がブランド扱いされていた。
               brandFromDai は辞書で見つからないと『先頭から3語』を当て推量で取るため。
               ここでは【辞書で確かめられたブランドだけ】を使う。当て推量は使わない。 */
            let bOK = '';
            try { bOK = brandFromDict(dai) || ''; } catch (e) { }
            /* ★辞書に無い時は、題の中から【型番でも札でも日本語でもない英字の語】を1つ拾う。
               ヤフオクは『NEW 鑑定付き ウォッチ SEIKO …』のように札が先に来るので、
               先頭から取る当て推量はやめて、条件に合う最初の語を選ぶ。 */
            /* ★2026-08-17 実機で『villance』の1語だけで引いてしまった件の直し。
               ★何が起きていたか: 辞書でブランドが引けなかったので、題の中の英字語
                 『villance』を【ブランドとして】採り、それだけで検索していた。
                 villance は ARC'TERYX の上位ライン Veilance のことで、
                 【ブランドではなく、ブランドが作った名前】。ブランドの代わりに置くのは間違い。
               ★ユーザー指摘『ブランドなら arcteryx villance だし、
                 この結果で終わると全く使い物にならん。せめてカテゴリで絞らんと』。
               ★直し: 辞書外の英字語は【固有名詞の候補】として別に持つ。ブランドにはしない。
                 型番が無い時は ブランド ＋ 固有名詞候補 ＋ カテゴリー でつなぐ。
                 1語だけで引くことはもうしない。
               ★★2026-08-17 さらに直し（ユーザー訂正）。
                 『villance が固有名詞』としたのは間違いで、階層を1つ取り違えていた。
                   ブランド ARC'TERYX ／ ライン Veilance ／ 固有名詞 Sphere LT Jacket
                 固有名詞は【複数語の商品名】であることが多い。英字の語を1つだけ拾う作りでは
                 『Sphere』しか残らず、構造的に取れない。
                 → 続いている英字の語を【ひとまとまり】で拾う（最大4語）。
                   日本語の語・型番・札に当たったら、そこで切る。 */
            let koyuuGo = '';
            {
              const fuda = /^(NEW|SALE|PriceDown|OFF|USED|中古|新品|美品|未使用|送料無料|即決|現在|入札|残り)$/i;
              /* ★2026-08-17 ここは『\』が2か所とも落ちていた（写し間違い）。
                 直す前: split(/[s　/]+/) …【文字のs】で切っていた（空白で切れていない）
                         /d/.test(t)     …【文字のd】を見ていた（数字を見ていない）
                 そのため「そのまま」の言葉が題ごと1語になり、数字入りの語も弾けていなかった。 */
              const go = String(dai || '').split(/[\s　\/]+/);
              /* 辞書で引けたブランドそのものなら、固有名詞ではない。
                 ★アポストロフィ等を落として比べる。題が『ARCTERYX』、辞書が
                   『ARC'TERYX』のように書き方が割れると、そのまま比べても一致せず、
                   ブランドを固有名詞としてもう一度足してしまう（机上で確認した）。 */
              const kesu = (x) => String(x).toLowerCase().replace(/[\s　'’`．.\-]/g, '');
              const tsunagi = [];
              for (let i = 0; i < go.length; i++) {
                const t = String(go[i] || '').trim();
                if (!t) continue;
                const eiji = /^[A-Za-z][A-Za-z&.'-]*$/.test(t)
                  && t.length >= 2 && t.length <= 20
                  && !fuda.test(t) && !/\d/.test(t);
                if (!eiji) {
                  /* すでに拾い始めていたなら、そこで切る（商品名は続けて書かれるため） */
                  if (tsunagi.length) break;
                  continue;
                }
                if (bOK && kesu(bOK).indexOf(kesu(t)) >= 0) {
                  /* ブランドそのもの。まだ拾い始めていなければ飛ばすだけ */
                  if (tsunagi.length) break;
                  continue;
                }
                tsunagi.push(t);
                /* ★2026-08-17 ユーザー訂正『固有名詞はほとんどがその連結後だよ』。
                   ブランドの後に続く英字のかたまり【全体】が固有名詞であって、
                   ラインと商品名に分けて考えるのは間違いだった。
                   4語で切っていたが、Alpha SV Jacket Gore Tex Pro のような長い名前を
                   途中で切ってしまう。切らずに全部つなぐ。
                   ★8語だけは上限として残す。題が丸ごと英語のサイトで、
                     題ぜんぶが入ってしまうのを防ぐため（名前が8語を超えることはまず無い）。 */
                if (tsunagi.length >= 8) break;
              }
              koyuuGo = tsunagi.join(' ');
            }
            const k = (kataCodes(dai) || [])[0] || '';
            /* ★ブランドと型番が同じ物になることがある（実機で GMW-B5000-1CJF が2回入った）。
               ブランドの中に型番が入っているなら、型番だけにする。 */
            if (k) {
              const bb = bOK ? String(bOK).trim() : '';
              return (bb && bb.toLowerCase().indexOf(k.toLowerCase()) < 0) ? (bb + ' ' + k) : k;
            }
            /* 型番が無い時。ブランド＋固有名詞候補＋カテゴリー（あるものだけつなぐ） */
            let cat8 = '';
            try {
              const moji8 = String(dai || '');
              for (let i = 0; i < CATEGORY_TOKENS.length; i++) {
                const tk = CATEGORY_TOKENS[i];
                if (moji8.indexOf(tk) >= 0 && tk.length > cat8.length) cat8 = tk;
              }
            } catch (e) { }
            const bu = [];
            if (bOK) bu.push(String(bOK).trim());
            if (koyuuGo) bu.push(koyuuGo);
            /* ★カテゴリーは【商品名が取れなかった時だけ】足す。
               『Sphere LT Jacket』のような商品名が取れているなら、カテゴリーは
               それより弱い情報でしかなく、メルカリはAND（全部を含む物）なので
               足すほど当たらなくなる。ユーザーの『せめてカテゴリで絞らんと』は、
               villance の1語しか無かった時の話。 */
            if (cat8 && koyuuGo.split(' ').filter(Boolean).length < 2) bu.push(cat8);
            if (bu.length) {
              const mita8 = {};
              return bu.join(' ').split(/[\s　]+/).filter((t) => {
                if (!t) return false;
                const kk = t.toLowerCase();
                if (mita8[kk]) return false;
                mita8[kk] = 1;
                return true;
              }).join(' ');
            }
            return msqTrimName(dai);
          })();
      return 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(kw)
        /* ★2026-08-18 実機『そのままを押したときに絞り込みが1つ残ってる（個人）』。
           ★型番で引く時は【絞り込みを1つも付けない】（ユーザー指示）。母数が1件しか
             無いことがあり、個人／メルカリ便の縛りだけでも消えてしまうため。
             rawDefaults 側は既に外したが、こちらが付けていたので残っていた。
           ★型番が無い時（ブランドや固有名詞で引く時）は今までどおり付ける。 */
        + (model ? '' : '&seller_type=0')
        /* ★2026-08-14 実機で確認: seller_type=0 だけでは【ショップの商品が混ざる】。
           足す前=個人4/ショップ2 → item_types=mercari を足した後=個人15/ショップ0。
           本家も seller_type=0&item_types=mercari を必ず一緒に付けている（写し落としだった）。 */
        + (model ? '' : '&item_types=mercari')
        + '&__msqraw=1'
        + (model ? '&__msqsrcmodel=' + encodeURIComponent(model) : '')
        /* ★2026-08-17 ブランドも渡す。あちら（rawKoyuuMeishi）で
           「メルカリが返してきた一覧が本当に同じ商品か」を確かめるのに要る。
           実測: 型番『2S303』でメルカリを引くと、東芝のレコーダー
           『VARDIA RD-S303』など【全く別の商品】が18件返ってきた（あいまい検索のため）。
           ブランドで確かめないと、それを固有名詞として保存してしまう。 */
        + (brand ? '&__msqsrcbrand=' + encodeURIComponent(brand) : '')
        /* ★2026-08-18 仕入元の題も渡す。あちらで【仕入元の題とメルカリの題に
           同じ語が出るか】を見て、固有名詞かどうかを確かめるのに使う（ユーザー案）。
           ★件数で確かめる案は実測で潰れた:『フルメタル』で15件出たが、中身は
             ポケモンカードや水彩絵具で全部別物だった。件数は根拠にならない。
           ★2つの出どころが同じ語を書いている、というのが本当の裏取り。
             メルカリが1件しか無くても成立する（多数決が要らない）。 */
        + (dai ? '&__msqsrcdai=' + encodeURIComponent(String(dai).slice(0, 160)) : '')
        /* ★2026-08-26 ユーザー指摘『メルカリの結果の上に（型番なし）と出ているが、
             型番はあるよな？　出せるなら出せ』。
           ★実機の例: 題が『MSGM ノースリーブワンピース/…/3641MDA60 サイズ40 型番 3641MDA60』
             で型番は分かっているのに、帯が「(型番なし)」になっていた。
           ★理由: __msqsrcmodel は【型番照合に使う正式な値】なので、題で引く時に入れると
             あちらで誤って一致してしまう。だから空にしてある（この判断は変えない）。
           ★直し: 【見せるためだけの型番】を別の名前で渡す。照合には一切使わない。 */
        + (model ? '' : (() => {
            try {
              const k9 = (kataCodes(dai) || [])[0] || '';
              return k9 ? '&__msqsrckata=' + encodeURIComponent(k9) : '';
            } catch (e) { return ''; }
          })())
        + (rank ? '&__msqsrcrank=' + encodeURIComponent(rank) : '')
        + (price ? '&__msqprice=' + encodeURIComponent(String(price).replace(/,/g, '')) : '')
        + (img ? '&__msqsrcimg=' + encodeURIComponent(img) : '');
    };
    /* ★第3引数は【開いた後にボタンへ戻す名前】。省くと今までどおり『そのまま』。
       「タイトル」ボタンもここを通すので、戻す名前を渡せるようにした（2026-08-26）。 */
    const sonomamaHiraku = (u, b, na) => {
      if (b) {
        b.textContent = '開いています…';
        /* ★2026-08-26 ユーザー指示『そのままの名前を型番検索に変えろ』。
           このボタンは【型番 または ブランド＋型番】で引くもの。名前を中身に合わせる。 */
        setTimeout(() => { try { if (b.isConnected) b.textContent = (na || (isShopsHost ? '🛒そのまま' : '型番検索')); } catch (e) { } }, 4000);
      }
      try {
        if (window.MsqApp && window.MsqApp.openMercari) { window.MsqApp.openMercari(u); return; }
      } catch (e) { }
      location.href = u;   /* 窓口が無い時は同じタブで開く（本家のスマホと同じ） */
    };

    let kataBusy = false;

    /* ===== 仕入元を弾かれないための歯止め（2026-08-13 実機で Access Denied が出たため） =====
       ★実際に起きたこと: セカストで Akamai の Access Denied が出た。
         こちらのコードはエラーページから型番を拾い「型番 18.b07fcd17.1786579916.c」と
         参照番号を保存していた（実機の写真で確認）。
       ★原因は断定できない（Akamai の基準は非公開）。言える事実は、
         詳細ページを開く間隔に制限が無く、短時間に何度も開ける状態だったこと。
       ★2026-08-01 にGoogleレンズで弾かれた時に決めた規則をこの経路にも入れる:
           ・商品間 6〜15秒（ばらつきを入れる）
           ・3件連続で失敗したら中断する
       ★この歯止めは外さないこと。同じエラーをもう一度出したら終わりだと言われている。 */
    const KATA_MIN = 6000;         // 最短の間隔（ミリ秒）
    const KATA_YURAGI = 9000;      // これを足した範囲でばらつかせる（最大15秒）
    let kataLast = 0;              // 最後に開いた時刻
    let kataMachi = 0;             // 次に開いてよい時刻
    let kataRenzoku = 0;           // 連続で失敗した数
    let kataTomatta = false;       // 中断したか

    /* 開いてよいか。駄目なら理由を返す。 */
    const kataOK = () => {
      if (kataTomatta) return '中断中（3件続けて読めませんでした）';
      const ima = Date.now();
      if (ima < kataMachi) return 'あと' + Math.ceil((kataMachi - ima) / 1000) + '秒';
      return '';
    };
    const kataTsukatta = () => {
      kataLast = Date.now();
      kataMachi = kataLast + KATA_MIN + Math.floor(Math.random() * KATA_YURAGI);
    };
    /* 読めた中身が「弾かれた画面」でないかを見る。 */
    const kataHajikareta = (moji) => {
      const t = String(moji || '');
      if (!t) return false;
      return /Access Denied|don't have permission|Reference #|edgesuite\.net|Forbidden|403 ERROR|Request unsuccessful/i.test(t);
    };

    /* 詳細ページを裏の枠で開いて、画面の文字から型番を探す。
       ★仕入元にはメルカリのような内部データが無いので、出ている文字を読む。 */
    /* ★2026-08-26 実機（ユーザー指摘）『全体的に謎のR-0084。いっぱい使われてるぞ』。
       ★調べた結果（推測ではない。実機の一覧ページのHTMLで確認した）:
           R-0084 ＝ ページ下の飾り「日本流通自主管理協会 会員番号 R-0084」。
           セカストの全ページに同じ物が入っている。保存済み122件のうち9件がこれだった。
       ★なぜ必ずこれが選ばれたか: 商品ページを body.innerText で丸ごと読んでいるので
         下の飾りまで候補に入る。R-0084 は「英字＋数字＋ハイフン」で kataKurai の1位、
         つまり本物の型番より前に並ぶ。だから毎回これが先頭になっていた。
       ★同じ型の事故は前にもある（Akamai の参照番号を型番として保存していた）。
       ★直し: 本文の【下の飾りから後ろ】を切ってから型番を探す。
         印は下の語。一番先に出た所で切る。正規表現は使わない（バックスラッシュ対策）。 */
    const KATA_ASHI = ['日本流通自主管理協会', '会員番号', '古物商', '特定商取引',
      'カスタマーハラスメント', '会社案内'];
    const kataAshiKiru = (t0) => {
      const t = String(t0 == null ? '' : t0);
      let ichi = -1;
      for (let i = 0; i < KATA_ASHI.length; i++) {
        const p = t.indexOf(KATA_ASHI[i]);
        if (p >= 0 && (ichi < 0 || p < ichi)) ichi = p;
      }
      /* 切った残りが短すぎる時は切らない（飾りが上に出るサイトで本文まで消さないため） */
      if (ichi > 200) return t.slice(0, ichi);
      return t;
    };
    /* ★2026-08-26【拡張機能の「分析」ボタンと同じ取り方に合わせた】ユーザー指示。
       ★実機のセカスト詳細ページ2枚で測った結果（推測ではない）:
           本文ぜんぶを kataCodes（ハイフンや英数字の形で探す）にかけると
             1位 XT-6 / 2位 EMV-3D / 3位 HH12508 / list01 / ecrule01 …
           ＝おすすめ商品の型番・CSSのクラス名・生のJSコードが上位に来る。
           フッターを切っても XT-6 は残る（足切りだけでは直らないことを実測で確認）。
       ★拡張機能 list_extractor.js の msqReadSourceSpecModel は同じ2枚で「(空)」を返す。
         ゴミを返さない。理由は【ラベルの付いた型番しか拾わない】から。
       ★だから同じ形にする。下の3つは list_extractor.js からそのまま持ってきた:
           kataDtValue  … getDtValue（dt→dd と th→td の両対応）
           kataSetsumei … 「商品の説明」という文字の要素の【親だけ】を読む
           kataSpecOK   … ok()。4〜24文字／数字を含む／ASCIIのみ／
                           英字が無い（数字だけ）なら8桁まで。9桁以上は管理番号・JANとみなす */
    const kataKirei = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    const kataDtValue = (d, keys) => {
      try {
        const labels = [].slice.call(d.querySelectorAll('dt,th,.label,.item-label,.spec-name'));
        for (let i = 0; i < labels.length; i++) {
          const lb = labels[i];
          let atari = false;
          for (let j = 0; j < keys.length; j++) {
            if (kataKirei(lb.textContent).indexOf(keys[j]) >= 0) { atari = true; break; }
          }
          if (!atari) continue;
          const next = lb.nextElementSibling;
          if (next) return kataKirei(next.textContent);
          const tr = lb.closest('tr');
          if (tr) {
            const td = tr.querySelector('td');
            if (td) return kataKirei(td.textContent);
          }
        }
      } catch (e) { }
      return '';
    };
    const kataSetsumei = (d) => {
      try {
        const el = [].slice.call(d.querySelectorAll('*')).find(
          (n) => n.children.length === 0 && kataKirei(n.textContent) === '商品の説明');
        return (el && el.parentElement) ? (el.parentElement.textContent || '') : '';
      } catch (e) { return ''; }
    };
    const kataSpecOK = (v) => {
      const t = String(v == null ? '' : v).trim().normalize('NFKC');
      if (!t || t.length < 4 || t.length > 24) return '';
      if (!/[0-9]/.test(t)) return '';
      if (!/^[A-Za-z0-9][A-Za-z0-9\-_\/\.]*$/.test(t)) return '';
      if (!/[A-Za-z]/.test(t) && t.length > 8) return '';
      return t;
    };
    /* 仕入元タイトルから型番を取る。本文全体を走査しない。
       スラッシュを含む型番（例: GG2744/F/S）を途中で分割しないため、
       Lens経路だけはタイトル中の連続した英数字・記号列を使う。 */
    const kataFromShiireTitle = (title) => {
      const t = String(title || '').normalize('NFKC');
      const a = t.match(/(?:^|[\s　\-–—])([A-Za-z0-9][A-Za-z0-9\-_\/\.]{3,23})(?=$|[\s　])/g) || [];
      const c = a.map((x) => x.replace(/^[\s　\-–—]+/, ''))
        .filter((x) => kataSpecOK(x))
        .filter((x) => !/^(?:19|20)\d{2}$|^\d{2}(?:AW|SS)$/i.test(x))
        .filter((x) => !/^m\d{10,13}$/i.test(x));
      return c.sort((x, y) => y.length - x.length)[0] || '';
    };
    /* 仕入元詳細の「商品自身の題」を取る。h1の先頭はサイト共通の
       「ショッピングガイド」などになるため、見出しを1個だけ決め打ちしない。
       型番を含む見出しを優先し、見出しに無いサイトだけog:title／document.titleへ進む。
       例: セカンドストリートの正しい題は
       「SLY カーディガン(厚手)/FREE/.../030IAR70-3941」。 */
    const shiireDetailTitle = () => {
      const a = [];
      const add = (v) => {
        const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        if (t && a.indexOf(t) < 0) a.push(t);
      };
      try {
        const og = document.querySelector('meta[property="og:title"]');
        if (og) add(og.getAttribute('content') || '');
      } catch (e) { }
      try {
        document.querySelectorAll('h1,h2,h3').forEach((e) => add(e.textContent || ''));
      } catch (e) { }
      try { add(document.title || ''); } catch (e) { }
      const hasModel = (v) => {
        try { return !!((kataCodes(v) || [])[0] || (typeof rawModelCodes === 'function' && (rawModelCodes(v) || [])[0])); }
        catch (e) { return false; }
      };
      return a.find(hasModel) || a[0] || '';
    };
     /* ブランディアはランク文字を本文に出さず、商品自身の表に
        condition04.png〜condition10.pngを置く。番号は画像ファイルの
        連番ではなく、同サイトの実際のコンディション点数である。
        condition07.png は実画面で「きれいめ」と確認済み。 */
    const rankFromShiirePage = (moji) => {
      const t = String(moji || '');
      /* トレファク詳細のコンディション欄を最優先する。
         ページ下部の購入ガイドにも「未使用品」等の説明があるため、
         本文全体を先に検索すると本商品の状態を誤る。 */
      const cpos = t.indexOf('コンディション');
      const ctext = cpos >= 0 ? t.slice(cpos, cpos + 220) : '';
      const trefac = ctext.match(/全体的に状態が悪い|やや傷や汚れがあり|目立った傷や汚れなし|傷や汚れあり/);
      if (trefac && trefac[0]) return trefac[0];
      const trefacParen = ctext.match(/[（(]\s*([^）)]+?)\s*[）)]/);
      if (trefacParen && trefacParen[1]) return trefacParen[1].trim();
      const direct = t.match(/商品の状態\s*[:：]\s*(\S+)/);
      if (direct && direct[1]) return direct[1];
      const label = t.match(/(?:コンディションレベル|コンディション|状態|ランク)\s*[:：]?\s*(未使用|新品同様|美品|きれいめ|ふつうに使える|使用感あり|難あり|中古[A-D]|ランク[A-D])/);
      if (label && label[1]) return label[1];
      try {
        if (/brandear\.jp$/i.test(location.hostname)) {
          const row = Array.from(document.querySelectorAll('tr')).find((el) =>
            String(el.querySelector('th')?.textContent || '').trim() === 'コンディションレベル');
          const src = row?.querySelector('img')?.src || '';
           const m = src.match(/condition(0[4-9]|10)\.png/i);
           const names = { '04': '難あり', '05': '使用感あり', '06': 'ふつうに使える',
             '07': 'きれいめ', '08': '美品', '09': '新品同様', '10': '未使用' };
           if (m && names[m[1]]) return names[m[1]];
        }
      } catch (e) { }
      return '';
    };
    /* 仕入元ページの本文だけを読む。Lens/型番カードを body.innerText のまま
       読むと、前の商品に対して生成したアプリ側の「型番」やランクを
       次の商品へ持ち越す。本文からアプリ注入領域を除外し、商品ページの
       表示だけを後段へ渡す。 */
    const shiireSourceText = () => {
      try {
        const b = document.body ? document.body.cloneNode(true) : null;
        if (!b) return '';
        b.querySelectorAll('script, style, noscript, template, [id^="msq-"], [class*="msq-"]').forEach((el) => el.remove());
        return b.innerText || b.textContent || '';
      } catch (e) { return ''; }
    };
    const shiireFieldValue = (labels) => {
      const want = (labels || []).map((x) => kataKirei(x));
      try {
        const row = Array.from(document.querySelectorAll('tr')).find((el) =>
          want.includes(kataKirei(el.querySelector('th')?.textContent || '')));
        if (row) return String(row.querySelector('td')?.textContent || '').trim();
        const dt = Array.from(document.querySelectorAll('dt')).find((el) =>
          want.includes(kataKirei(el.textContent || '')));
        if (dt) return String(dt.nextElementSibling?.textContent || '').trim();
      } catch (e) { }
      return '';
    };
    /* ★型番を1つ選ぶ道。順番はユーザー指定の【型番欄 → タイトル → 本文】のまま。
       変えたのは各段の中身で、本文の段を【ラベル付きだけ】にした。
       kataCodes（裸の語を形で拾う）を本文にかけるのはやめる。題には今までどおりかける。 */
    const kataErabu = (res) => {
      if (!res) return '';
      return kataSpecOK(res.spec)                          /* ①仕様表の型番欄 */
        || kataSpecOK(kataFromText(res.setsu))             /* ②商品の説明の下・ラベル付き */
        || (kataCodes(res.dai)[0] || '')                   /* ③題（今までどおり形で拾う） */
        || kataSpecOK(kataFromText(res.moji));             /* ④本文・ラベル付きのみ */
    };
    /* どこで取れたかだけを返す（PCの札に合わせるため・2026-08-27）。
       ★上の kataErabu と【同じ部品を同じ順で】呼ぶ。値そのものは返さない。
       ★kataErabu を書き換える方が短いが、型番の取得はステーブルなので触らない。
       ★kataErabu の順番を変えた時は、必ずこちらも同じ順に直すこと。 */
    const kataDoko = (res) => {
      if (!res) return '';
      if (kataSpecOK(res.spec)) return '欄';
      if (kataSpecOK(kataFromText(res.setsu))) return '本文';
      if (kataCodes(res.dai)[0]) return '題';
      if (kataSpecOK(kataFromText(res.moji))) return '本文';
      return '';
    };
    /* 詳細ページも一覧の型番検索と同じ入力・同じ順番で判定する。
       詳細ページだけ titleKata を先にすると、030IAR70-3941 の末尾だけを
       3941 として拾うため、一覧と結果が食い違う。 */
    const kataCurrentPage = () => {
      const moji = shiireSourceText();
      return {
        moji: kataAshiKiru(moji),
        dai: shiireDetailTitle(),
        spec: kataDtValue(document, ['型番', '品番', 'モデル番号']),
        setsu: kataSetsumei(document)
      };
    };
    const kataFetch = (url, done) => {
      /* ★2026-08-18 実機『型番あるアディダスのパンツで検索してもアディダス パンツになる。
         そもそも型番がないと判断されてることが間違え』。
         ★下は枠(iframe)で商品ページを開いて読む作りだが、多くの通販サイトは
           X-Frame-Options / CSP で【枠の中に表示させない】。その時 contentDocument が
           読めず、15秒待って『型番なし』になる。ページには型番が載っているのに、である。
         ★直し: 枠で読めなかった時は、素の取得(fetch)で同じページを取り直す。
           取得は枠の制限を受けない。仕入元の一覧と商品ページは【同じサイト】なので、
           送る先も増えない。間隔の歯止めは手前で通しているのでここでは増やさない。 */
      const kataSuNao = (riyuu) => {
        try {
          fetch(url, { credentials: 'same-origin' })
            .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then((t2) => {
              const d2 = new DOMParser().parseFromString(t2, 'text/html');
              const moji2 = (d2 && d2.body) ? (d2.body.innerText || d2.body.textContent || '') : '';
              const hh = d2 ? (d2.querySelector('h1') || d2.querySelector('h2')) : null;
              const dai2 = ((hh && hh.textContent) ? hh.textContent : '') + ' ' + ((d2 && d2.title) || '');
              if (!moji2) { done(null); return; }
              if (kataHajikareta(moji2)) { done({ moji: '', dai: '', hajikareta: true }); return; }
              try { console.warn('[MSQ/型番] 枠で読めず(' + riyuu + ')→素の取得で読めた'); } catch (e) { }
              done({ moji: kataAshiKiru(moji2), dai: dai2,
                spec: kataDtValue(d2, ['型番', '品番', 'モデル番号']),
                setsu: kataSetsumei(d2) });
            })
            .catch(() => done(null));
        } catch (e) { done(null); }
      };
      let fr = null;
      try {
        fr = document.createElement('iframe');
        fr.setAttribute('data-msq-kata', '1');
        /* 枠は画面の中に置く。外に置くと描画が止まって永久に読めない */
        fr.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;'
          + 'opacity:0.01;z-index:-1;pointer-events:none;';
        fr.src = url;
        document.body.appendChild(fr);
      } catch (e) { done(null); return; }
      /* ★2026-08-12 実機で「調べています…」から20秒以上戻らない事故が出た。
         回数だけの打ち切りでは、途中で読めない状態が続くと止まらないことがある。
         時計でも必ず打ち切る（15秒）。戻らないと次の1件も押せなくなる。 */
      const t0 = Date.now();
      let n = 0, mae = '';
      const t = setInterval(() => {
        n++;
        if (Date.now() - t0 > 15000) {
          clearInterval(t);
          try { fr.remove(); } catch (e) { }
          kataSuNao('15秒たっても読めない');
          return;
        }
        let moji = '', dai = '', spec = '', setsu = '';
        try {
          const d = fr.contentDocument;
          if (d && d.body) {
            moji = d.body.innerText || '';
            /* ★仕様表の型番欄と「商品の説明」の下。ここで読まないと後から doc が消える */
            spec = kataDtValue(d, ['型番', '品番', 'モデル番号']);
            setsu = kataSetsumei(d);
            /* ★商品の題は【H1】。'h1,h2' で探すと文書順で最初の見出しが返り、
               セカストでは「ショッピングガイド」というサイトの飾りを拾っていた
               （実機で確認。ブランドが「ショッピングガイド」になった）。 */
            const h = d.querySelector('h1') || d.querySelector('h2');
            dai = (h && h.textContent ? h.textContent : '') + ' ' + (d.title || '');
          }
        } catch (e) { }
        /* 文字が増えなくなったら確定。最長15秒 */
        const ochitsuita = (moji.length > 200 && moji.length === mae.length);
        mae = moji;
        if (!ochitsuita && n < 30) return;
        clearInterval(t);
        try { fr.remove(); } catch (e) { }
        /* ★弾かれた画面なら、型番として拾わない。連続したら中断する。
           これを入れる前は Akamai の参照番号を型番として保存していた（実機で確認）。 */
        if (kataHajikareta(moji)) {
          kataRenzoku++;
          if (kataRenzoku >= 3) {
            kataTomatta = true;
            try { console.warn('[MSQ/仕入元] 3件続けて弾かれたので中断します'); } catch (e) { }
          }
          /* 弾かれた時は次までさらに間を空ける */
          kataMachi = Date.now() + 60000;
          done({ moji: '', dai: '', hajikareta: true });
          return;
        }
        if (!moji) { kataSuNao('枠の中身を読めない'); return; }
        kataRenzoku = 0;
        done({ moji: kataAshiKiru(moji), dai: dai, spec: spec, setsu: setsu });
      }, 500);
    };

    /* ===== 一覧の長押しメニュー（2026-08-17 全面作り直し） =====
       ★ユーザー指摘『一覧からの長押しができないサイトがある（確認できたのはカインドオル。
         全サイトで確認が必要）』。
       ★直す前の作り: タイル1枚ずつ、その中の <img> に直接くっつけていた。
         そのため次の場合に【一度も付かない】:
           ・タイルの中に <img> がまだ無い（写真を後から読むサイト）
           ・そのタイルにすでに「型」ボタンが有る（手前の return で抜けていた）
           ・写真が背景画像で <img> ではない
           ・値段が拾えずタイルとみなされなかった箱
       ★直した後: 画面ぜんぶに1回だけ付ける（触った所からリンクを辿る）。
         タイルの作りにもサイトにも依存しないので、7サイト全部で同じに動く。
       ★長押しの取り方（触れてから600ms・指が10pxより動いたらやめる）は前のまま。 */
    const msqNagaosi = () => {
      if (window.__msqNagaTuita) return;
      window.__msqNagaTuita = true;
      let taima = 0, x0 = 0, y0 = 0, deta = false, url9 = '';
      const yameru = () => { if (taima) { clearTimeout(taima); taima = 0; } };
      const menyuKesu = () => {
        const e2 = document.getElementById('msq-naga-menyu');
        if (e2) e2.remove();
      };
      const menyuDasu = (mx, my, u) => {
        menyuKesu();
        const d = document.createElement('div');
        d.id = 'msq-naga-menyu';
        d.dataset.msqUri = '1';
        d.style.cssText = 'position:fixed;z-index:2147483600;'
          + 'background:#111;color:#fff;border:1px solid #444;border-radius:8px;'
          + 'box-shadow:0 4px 16px rgba(0,0,0,.6);padding:4px;';
        const b3 = document.createElement('button');
        b3.textContent = '結果タブで開く';
        b3.dataset.msqUri = '1';
        b3.style.cssText = 'display:block;width:100%;padding:8px 14px;border:none;'
          + 'border-radius:6px;background:transparent;color:#fff;'
          + 'font:700 13px/1.5 system-ui;cursor:pointer;text-align:left;';
        b3.addEventListener('click', (ev2) => {
          ev2.preventDefault(); ev2.stopPropagation();
          menyuKesu();
          try {
            if (window.MsqApp && typeof window.MsqApp.openKekkaUrl === 'function') {
              window.MsqApp.openKekkaUrl(u);
            }
          } catch (e) { }
        });
        d.appendChild(b3);
        (document.body || document.documentElement).appendChild(d);
        /* 画面からはみ出さない位置に置く */
        const w2 = d.getBoundingClientRect();
        let lx = mx, ly = my + 8;
        if (lx + w2.width > window.innerWidth - 6) lx = window.innerWidth - w2.width - 6;
        if (lx < 6) lx = 6;
        if (ly + w2.height > window.innerHeight - 6) ly = my - w2.height - 8;
        if (ly < 6) ly = 6;
        d.style.left = lx + 'px';
        d.style.top = ly + 'px';
        const soto = (ev3) => {
          if (ev3 && ev3.target && d.contains(ev3.target)) return;
          menyuKesu();
          document.removeEventListener('touchstart', soto, true);
          window.removeEventListener('scroll', soto2, true);
        };
        const soto2 = () => soto(null);
        setTimeout(() => {
          document.addEventListener('touchstart', soto, true);
          window.addEventListener('scroll', soto2, true);
        }, 0);
      };
      const linkNo = (el) => {
        try {
          if (!el || !el.closest) return '';
          if (el.closest('#msq-naga-menyu')) return '';
          if (el.closest('[data-msq-uri]')) return '';   /* こちらが付けた札やボタンの上では出さない */
          const ok = (a) => {
            const h = (a && a.href) || '';
            if (!h || /^javascript:/i.test(h)) return '';
            return h;
          };
          /* ① 押した所から親をたどる（今までどおり） */
          const a1 = el.closest('a[href]');
          if (a1) { const h1 = ok(a1); if (h1) return h1; }
          /* ★2026-08-25 ユーザー報告『長押しの結果タブで開くが出る場所と出ない場所がある』。
             ★原因は①だけだったこと。仕入元サイトには【写真がリンクの外にある】作りがあり、
               写真を押しても親にaが無くて諦めていた。
             ② タイルまで上がって、その中の商品リンクを拾う。
                タイルの目印はサイトによって違うので、li / article / カード風のdiv を
                順に上へ見て、最初に見つかった商品リンクを使う。 */
          let oya = el;
          for (let n = 0; n < 6 && oya; n++) {
            oya = oya.parentElement;
            if (!oya || oya === document.body) break;
            const a2 = oya.querySelector('a[href*="/item/"], a[href*="/products/"], a[href*="/goods/"], a[href]');
            if (a2) { const h2 = ok(a2); if (h2) return h2; }
          }
          /* ★2026-08-25 ユーザー『画像のどこでも押したら反応するようにしろ』。
             ★実機で測った結果:
                 一覧(collections)      123枚中123枚 効く
                 メルカリの検索結果      115枚中115枚 効く
                 商品ページ(products)    23枚中【18枚しか効かない】← 5枚がリンクの外
             ★②で親をたどれば23枚全部拾えるが、リンクがどこにも無い画像は残る。
               その時は【いま開いているページのURL】を使う。商品ページなら
               その商品自身なので、結果タブで開けば正しい物が出る。
               ＝画像の上ならどこを押しても必ず反応する。 */
          if (el.tagName === 'IMG' || el.querySelector && el.querySelector('img')) {
            const ima = String(location.href || '');
            if (ima && !/^javascript:/i.test(ima)) return ima;
          }
          return '';
        } catch (e) { return ''; }
      };
      document.addEventListener('touchstart', (ev) => {
        const t0 = ev.touches && ev.touches[0];
        if (!t0) return;
        url9 = linkNo(ev.target);
        if (!url9) { yameru(); return; }
        x0 = t0.clientX; y0 = t0.clientY; deta = false;
        yameru();
        taima = setTimeout(() => {
          taima = 0; deta = true;
          try { menyuDasu(x0, y0, url9); } catch (e) { }
        }, 600);
      }, { passive: true, capture: true });
      /* ★2026-09-09 上と同じ理由で passive にする（preventDefault は呼んでいない）。
         ★grep用の目印: 指の監視を軽くする */
      document.addEventListener('touchmove', (ev) => {
        const t0 = ev.touches && ev.touches[0];
        if (!t0) return;
        if (Math.abs(t0.clientX - x0) > 10 || Math.abs(t0.clientY - y0) > 10) yameru();
      }, { passive: true, capture: true });
      document.addEventListener('touchend', yameru, true);
      document.addEventListener('touchcancel', yameru, true);
      /* メニューを出した時は、指を離した時のリンク移動を止める */
      document.addEventListener('click', (ev) => {
        if (!deta) return;
        deta = false;
        try { if (ev.target && ev.target.closest && ev.target.closest('#msq-naga-menyu')) return; } catch (e) { }
        ev.preventDefault(); ev.stopPropagation();
      }, true);
      /* ★2026-09-09 ユーザー指示（Aを選択）
           「メルカリもセカストなどの仕入れサイトも全部コピーや商品検索が必要」

         ■ 以前ここにあった物
           document.addEventListener('contextmenu', (ev) => {
             if (linkNo(ev.target)) ev.preventDefault();   // リンクの上だけ止める
           }, true);
           理由は「端末の長押しメニュー（画像を保存など）が重なるので」だった。

         ■ なぜ外したか（実機 ZY22KF7NBD で確認）
           Androidは【長押し＝contextmenu】。ここで止めると文字選択そのものが始まらない。
           仕入元のタイルは【全体が1つのリンク】なので、文字がほぼ全部リンクの中に入り、
           結果として【コピーも商品検索もできない】状態になっていた。
           メルカリは商品名がリンクの外にあるため出る（実測: メルカリ側は止めていない）。
           ユーザーの報告と完全に一致:「メルカリは出る／仕入れサイトは出ない」。

         ■ ★「重なると困る」という前提そのものが間違っていた（2026-09-09 ユーザー指摘）
           ユーザーの言葉:
             「メルカリも結果タブで開くがあるのに　仕入れサイトだけ止めるのは筋がとおらんやろ」
           確認した事: メルカリ側の自前メニュー(msq-mer-naga)は項目1つ「結果タブで開く」で、
           そちらは端末の長押しメニューを【止めていない】。
           ＝同じアプリの中で、メルカリでは【自前メニュー＋端末の選択メニューが両方出た状態】が
             ずっと問題なく使われていた。よって「重なるから止める」は理由になっていない。

         ■ どうしたか
           【止めない】。メルカリ側と同じ扱いにそろえる。
           万一それでも邪魔なら、次は「自前メニューは画像の上だけ」に変える（案B）。
       ★grep用の目印: 長押しを止めない */
    };

    const RE = /(?:[¥￥]\s*([0-9][0-9,]{2,})|([0-9][0-9,]{2,})\s*円)/;
    /* 価格帯のナビ（例: ブランディアの「100,000円～」）は商品ではない。
       ここを商品価格として拾うと、目標売値の141,380円などが商品価格札として
       画面に入り、Lensの仕入れ値にも逆流する。 */
    const msqPriceNav = (el) => {
      try {
        return !!(el && el.closest && el.closest(
          'a[href*="priceHigh"],a[href*="priceLow"],a[href*="/search/list/"]'));
      } catch (e) { return false; }
    };
    /* 仕入元一覧にも、メルカリ一覧と同じく商品ごとの確認表を出す。
       ★2026-09-20 ユーザー依頼。
       カードに実際に表示されている文字・title・time属性だけを読む。
       詳細ページを追加で開いたり、推測で別商品の情報を補ったりしない。
       取れない項目は「未取得」と明示して、誤った値を表示しない。 */
    const sourceConditionShort = (value) => {
      const t = String(value || '');
      const map = {
        '使用感をあまり感じない': '使用感少',
        'やや傷や汚れがあり': 'やや傷',
        '目立った傷や汚れなし': '目立つ傷汚れなし',
        '未使用に近い': '未使用近い',
        '全体的に状態が悪い': '状態悪'
      };
      return map[t] || t;
    };
    const sourceDateShort = (value) => {
      const t = String(value || '').trim();
      const m = t.match(/^(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/);
      if (!m) return t;
      const p = m[1].match(/^20\d{2}[-/.](\d{1,2})[-/.](\d{1,2})$/);
      return p ? (Number(p[1]) + '/' + Number(p[2])) : m[1].replace(/[/.]/g, '-');
    };
    const sourceMetaRead = (tile) => {
       const out = { condition: '', size: '', date: '' };
       try {
        const c = tile.cloneNode(true);
        c.querySelectorAll('[data-msq-uri],.msq-uri,.msq-kata,.msq-sonomama-t,.msq-copy-t,.msq-rec-fuda,.msq-source-meta,button,script,noscript,iframe,style')
          .forEach((e) => e.remove());
        const a = tile.querySelector('a[href]');
        const title = String(a?.getAttribute('title') || a?.getAttribute('auctiontitle') || '');
        const text = (title + ' ' + (c.textContent || '')).replace(/\s+/g, ' ').trim();
        const conditions = ['新品同様', '未使用に近い', 'ふつうに使える', '使用感あり',
          'きれいめ', '難あり', '未使用', '美品', '中古[A-D]', 'ランク[S-D]'];
        for (let i = 0; i < conditions.length; i++) {
          const hit = text.match(new RegExp(conditions[i]));
          if (hit) { out.condition = hit[0]; break; }
        }
        /* トレファク等はカード内に「サイズ：36」を専用要素で持つ。
           先に専用要素を読むことで、価格や商品タイトルの数字をサイズと誤認しない。 */
        const sizeSelectors = [
          '.p-itemlist_size', '.itemCard_size', '.productCard_size',
          '[class*="itemlist_size"]', '[class*="productSize"]', '[class*="product-size"]',
          '.boost-sd__product-option'
        ];
        let sizeFromElement = '';
        let scope = tile;
        for (let level = 0; level < 3 && scope && !sizeFromElement; level++, scope = scope.parentElement) {
          for (let si = 0; si < sizeSelectors.length; si++) {
            const el = scope.querySelector(sizeSelectors[si]);
            const sv = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
            if (!sv) continue;
            const sm = sv.match(/(?:タグ表記)?サイズ\s*[:：]?\s*(.+)$/i);
            if (sm && sm[1]) { sizeFromElement = sm[1].trim(); break; }
          }
        }
        const sizeHit = text.match(/【\s*サイズ\s*[:：]?\s*([^】]+)】/i)
          || text.match(/(?:表記\s*)?サイズ\s*[:：]?\s*([0-9０-９A-Za-zＡ-Ｚａ-ｚ][0-9０-９A-Za-zＡ-Ｚａ-ｚ.／/+-]*(?:\s+[0-9０-９A-Za-zＡ-Ｚａ-ｚ]+)?)/i);
        if (sizeFromElement) out.size = sizeFromElement.replace(/[\s　]+/g, ' ').trim();
        else if (sizeHit && sizeHit[1]) out.size = sizeHit[1].replace(/[\s　]+/g, ' ').trim();
        /* ヤフオクの服は一覧カードのタイトルにサイズが直接入る。
           価格や出品番号をサイズと誤認しないよう、商品種別の後ろだけを見る。 */
        if (!out.size && /(?:^|\.)auctions\.yahoo\.co\.jp$/i.test(location.hostname)) {
          const ytitle = String(tile.querySelector('.Item__title')?.textContent
            || title || '').replace(/[\s　]+/g, ' ').trim();
          const ysize = ytitle.match(/(?:^|[\s　/（）()、,：:])((?:ONE\s*SIZE|FREE|MEDIUM|LARGE|4XL|3XL|2XL|XXL|XL|LL|L|M|S|SS|XS|F|フリー|フリ[ー-]|[0-9０-９]{1,2}号))(?=$|[\s　/（）()、,：:])/i);
          if (ysize && ysize[1]) {
            let ys = ysize[1].replace(/[\s　]+/g, ' ').trim();
            if (/^フリ[ー-]?$/.test(ys)) ys = 'FREE';
            out.size = ys;
          }
        }
        const dateHit = text.match(/(?:出品日|掲載日|登録日|更新日|投稿日)\s*[:：]?\s*(20\d{2}[./-]\d{1,2}[./-]\d{1,2}|令和\d+年\d+月\d+日|\d+日前|\d+時間前)/);
        if (dateHit && dateHit[1]) out.date = dateHit[1];
        if (!out.date) {
          const time = tile.querySelector('time,[datetime],[data-date]');
          const v = String(time?.getAttribute('datetime') || time?.getAttribute('data-date') || time?.textContent || '').trim();
          if (/^(?:20\d{2}[./-]\d{1,2}[./-]\d{1,2}|令和\d+年\d+月\d+日|\d+日前|\d+時間前)$/.test(v)) out.date = v;
        }
        /* 一覧カードに状態欄がないサイトは「未取得」とせず、
           詳細ページにある情報を一覧からは読めないことを明示する。 */
        if (!out.condition && /(?:^|\.)trefac\.jp$/i.test(location.hostname)) out.condition = '取得中';
      } catch (e) { }
      /* カードの価格だけ先に描画され、サイズ欄が後から入るサイトがある。
         上の共通処理で例外が出ても、実際に存在する専用要素は最後に拾う。 */
      try {
        if (!out.size && tile && tile.querySelector) {
          const el = tile.querySelector('.p-itemlist_size,[class*="itemlist_size"],[class*="productSize"],[class*="product-size"]');
          const sv = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
          const sm = sv.match(/(?:タグ表記)?サイズ\s*[:：]?\s*(.+)$/i);
          if (sm && sm[1]) out.size = sm[1].trim();
        }
        if (!out.condition && /(?:^|\.)trefac\.jp$/i.test(location.hostname)) out.condition = '取得中';
        if (tile?.dataset?.msqSourceDetailCondition) out.condition = tile.dataset.msqSourceDetailCondition;
        if (tile?.dataset?.msqSourceDetailDate) out.date = tile.dataset.msqSourceDetailDate;
        /* セカストの一覧が「その他」の場合、詳細ページにある
           「UNIQLOのMと近い」の相当サイズを優先する。 */
        if (tile?.dataset?.msqSourceDetailSize
          && (!out.size || out.size === 'その他')) out.size = tile.dataset.msqSourceDetailSize;
        if (tile?.dataset?.msqSourceDetailSizeLoading === '1' && out.size === 'その他') out.size = '取得中';
        if (tile?.dataset?.msqSourceDetailSizeFailed === '1') out.size = '失敗';
      } catch (e) { }
      return out;
    };
    const sourceMetaAdd = (tile) => {
      try {
        if (!tile) return;
        if (tile.closest && tile.closest('.RecommendItem')) return;
        const sourceHref = String(tile.querySelector('a[href]')?.href || '').trim();
        if (sourceHref) {
          const existing = Array.from(document.querySelectorAll('.msq-source-meta[data-msq-source-href]'))
            .find((el) => el.dataset.msqSourceHref === sourceHref);
          if (existing) return existing;
        }
        const old = tile.querySelector('.msq-source-meta');
        if (old) old.remove();
        const m = sourceMetaRead(tile);
        const table = document.createElement('table');
        table.className = 'msq-source-meta';
        table.dataset.msqUri = '1';
        if (sourceHref) table.dataset.msqSourceHref = sourceHref;
        const yahooPending = /(?:^|\.)auctions\.yahoo\.co\.jp$/i.test(location.hostname)
          && !m.condition && !m.size && !m.date;
        if (yahooPending) table.style.display = 'none';
        table.style.cssText = 'width:100%;table-layout:fixed;border-collapse:collapse;margin-top:4px;font:11px/1.35 system-ui;color:#475569;background:rgba(241,245,249,.78);';
        if (yahooPending) table.style.display = 'none';
        const cell = (tag, value, cls) => '<' + tag + ' class="' + (cls || '') + '" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">' + rawEsc(value || '未取得') + '</' + tag + '>';
        let rows = '<tr>' + cell('th', '状態', 'msq-source-meta-label') + cell('td', sourceConditionShort(m.condition), 'msq-source-meta-value') + '</tr>'
          + '<tr>' + cell('th', 'サイズ', 'msq-source-meta-label') + cell('td', m.size, 'msq-source-meta-value') + '</tr>';
        /* 出品日が実際に取れたカードだけ行を出す。全件未取得の行は表示しない。 */
        if (m.date) rows += '<tr>' + cell('th', '出品日', 'msq-source-meta-label') + cell('td', sourceDateShort(m.date), 'msq-source-meta-value') + '</tr>';
        table.innerHTML = '<tbody>' + rows + '</tbody>';
        tile.appendChild(table);
        return table;
      } catch (e) { }
      return null;
    };
    /* 動的描画サイトでは、価格だけ先に出て確認表が作られることがある。
       その後に同じカードへ入った状態・サイズを、表へ反映するだけにする。
       詳細ページを追加で開かず、既存の取得範囲と通信量は変えない。 */
    const sourceMetaRefresh = () => {
      try {
        if (!sourceMetaListPage) return;
        document.querySelectorAll('.msq-source-meta').forEach((table) => {
          const tile = table.parentElement;
          if (!tile) return;
          const m = sourceMetaRead(tile);
          const cells = table.querySelectorAll('td');
          if (cells[0] && m.condition) cells[0].textContent = sourceConditionShort(m.condition);
          if (cells[1] && m.size) cells[1].textContent = m.size;
          if (m.date) {
            if (cells[2]) cells[2].textContent = sourceDateShort(m.date);
            else {
              const tr = document.createElement('tr');
              tr.innerHTML = '<th class="msq-source-meta-label" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">出品日</th><td class="msq-source-meta-value" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">' + rawEsc(sourceDateShort(m.date)) + '</td>';
              table.querySelector('tbody')?.appendChild(tr);
            }
          }
        });
      } catch (e) { }
    };
     /* 仕入元一覧のカードだけに確認表を出す。
        商品詳細ページのおすすめ商品へ「未取得」を大量表示しない。 */
     const sourceMetaListPage = (() => {
       try {
         const p = String(location.pathname || '');
         if (/\/search\/detail(?:\/|$)|\/store\/\d/.test(p)) return false;
         return /\/search(?:\/|$)/.test(p) || /search_result\.html/.test(p);
       } catch (e) { return false; }
     })();
     /* トレファクは一覧カードに状態がないため、表示中カードの詳細ページだけを
        裏で順番に取得する。全件を一度に開かず、通信量と規制リスクを抑える。 */
     const sourceMetaTrefacFetch = (tile) => {
       try {
         if (!tile || tile.dataset.msqSourceDetailLoading === '1'
           || tile.dataset.msqSourceDetailLoaded === '1') return Promise.resolve();
         const a = tile.querySelector('.p-itemlist_btn[href],a[href]');
         if (!a || !a.href) return Promise.resolve();
         tile.dataset.msqSourceDetailLoading = '1';
         return fetch(a.href, { credentials: 'include' }).then((r) => r.ok ? r.text() : '')
           .then((html) => {
             const d = new DOMParser().parseFromString(html || '', 'text/html');
             const text = String(d.body?.innerText || d.body?.textContent || '');
              const cpos = text.indexOf('コンディション');
              const ctext = cpos >= 0 ? text.slice(cpos, cpos + 220) : '';
              const condMatch = ctext.match(/[（(]\s*([^）)]+?)\s*[）)]/);
              const cond = (condMatch && condMatch[1] ? condMatch[1].trim() : '') || rankFromShiirePage(text) || '';
             const dateHit = text.match(/(?:出品日|掲載日|登録日|更新日|投稿日)\s*[:：]?\s*(20\d{2}[./-]\d{1,2}[./-]\d{1,2}|令和\d+年\d+月\d+日|\d+日前|\d+時間前)/);
              tile.dataset.msqSourceDetailCondition = cond || '失敗';
             tile.dataset.msqSourceDetailDate = dateHit?.[1] || '';
             tile.dataset.msqSourceDetailLoaded = '1';
             const table = tile.querySelector('.msq-source-meta');
             const cells = table ? table.querySelectorAll('td') : [];
              if (cells[0]) cells[0].textContent = sourceConditionShort(tile.dataset.msqSourceDetailCondition);
              if (tile.dataset.msqSourceDetailDate && table) {
                if (cells[2]) cells[2].textContent = sourceDateShort(tile.dataset.msqSourceDetailDate);
                else {
                  const tr = document.createElement('tr');
                  tr.innerHTML = '<th class="msq-source-meta-label" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">出品日</th><td class="msq-source-meta-value" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">' + rawEsc(sourceDateShort(tile.dataset.msqSourceDetailDate)) + '</td>';
                  table.querySelector('tbody')?.appendChild(tr);
                }
              }
           })
           .catch(() => {
              tile.dataset.msqSourceDetailCondition = '失敗';
             tile.dataset.msqSourceDetailLoaded = '1';
             const cell = tile.querySelector('.msq-source-meta td');
              if (cell) cell.textContent = '失敗';
           })
           .finally(() => { try { delete tile.dataset.msqSourceDetailLoading; } catch (e) { } });
       } catch (e) { return Promise.resolve(); }
     };
     let sourceMetaTrefacQueue = [];
     let sourceMetaTrefacBusy = false;
     const sourceMetaTrefacDrain = () => {
       if (sourceMetaTrefacBusy || !sourceMetaTrefacQueue.length) return;
       sourceMetaTrefacBusy = true;
       const tile = sourceMetaTrefacQueue.shift();
       sourceMetaTrefacFetch(tile).finally(() => {
         sourceMetaTrefacBusy = false;
         setTimeout(sourceMetaTrefacDrain, 500);
       });
     };
      const sourceMetaTrefacStart = (tile) => {
       if (!tile || tile.dataset.msqSourceDetailLoading === '1' || tile.dataset.msqSourceDetailLoaded === '1') return;
       if (!sourceMetaTrefacQueue.includes(tile)) sourceMetaTrefacQueue.push(tile);
       sourceMetaTrefacDrain();
      };
      /* セカストの一覧でサイズが「その他」のカードだけ、詳細の
         「UNIQLOの○○と近い」を1件ずつ取得する。ほかのサイズのカードは
         追加通信せず、一覧のサイズをそのまま使う。 */
      const sourceMeta2ndSizeFetch = (tile) => {
        try {
          if (!tile || tile.dataset.msqSourceDetailSizeLoading === '1'
            || tile.dataset.msqSourceDetailSizeLoaded === '1') return Promise.resolve();
          const current = sourceMetaRead(tile).size;
          if (current !== 'その他') return Promise.resolve();
          const a = tile.querySelector('a[href*="/goods/detail/goodsId/"],a[href]');
          if (!a || !a.href) return Promise.resolve();
          tile.dataset.msqSourceDetailSizeLoading = '1';
          /* 相当サイズはセカスト詳細ページのJavaScriptが生成するため、
             fetchしたHTMLには存在しない。同一WebView内の非表示iframeで
             詳細ページを実行し、生成後の表示テキストだけを読む。 */
          return new Promise((resolve) => {
            const frame = document.createElement('iframe');
            frame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;opacity:0;border:0;pointer-events:none;';
            document.body.appendChild(frame);
            let tries = 0;
            let done = false;
            const finish = (size, failed) => {
              if (done) return;
              done = true;
              try { frame.remove(); } catch (e) { }
              if (size) {
                tile.dataset.msqSourceDetailSize = size + '相当';
                tile.dataset.msqSourceDetailSizeFailed = '';
              } else if (failed) tile.dataset.msqSourceDetailSizeFailed = '1';
              tile.dataset.msqSourceDetailSizeLoaded = '1';
              const table = tile.querySelector('.msq-source-meta');
              const cell = table ? table.querySelectorAll('td')[1] : null;
              if (cell) cell.textContent = tile.dataset.msqSourceDetailSize || (failed ? '失敗' : 'その他');
              resolve();
            };
            const poll = () => {
              if (done) return;
              tries++;
              const text = String(frame.contentDocument?.body?.innerText
                || frame.contentDocument?.body?.textContent || '').replace(/\s+/g, ' ');
              const m = text.match(/(?:UNIQLO|ユニクロ)\s*の\s*([0-9０-９A-Za-zＡ-Ｚａ-ｚ]+)(?:\s*サイズ)?\s*と近い/i);
              if (m && m[1]) finish(m[1].trim(), false);
              else if (tries >= 12 && text.length > 1000) finish('', false);
              else if (tries >= 24) finish('', true);
              else setTimeout(poll, 500);
            };
            frame.addEventListener('load', () => setTimeout(poll, 500), { once: true });
            frame.src = a.href;
            setTimeout(() => finish('', true), 15000);
          }).finally(() => { try { delete tile.dataset.msqSourceDetailSizeLoading; } catch (e) { } });
        } catch (e) { return Promise.resolve(); }
      };
      let sourceMeta2ndQueue = [];
      let sourceMeta2ndBusy = false;
      const sourceMeta2ndDrain = () => {
        if (sourceMeta2ndBusy || !sourceMeta2ndQueue.length) return;
        sourceMeta2ndBusy = true;
        const tile = sourceMeta2ndQueue.shift();
        sourceMeta2ndSizeFetch(tile).finally(() => {
          sourceMeta2ndBusy = false;
          setTimeout(sourceMeta2ndDrain, 500);
        });
      };
      const sourceMeta2ndStart = (tile) => {
        if (!tile || tile.dataset.msqSourceDetailSizeLoading === '1'
          || tile.dataset.msqSourceDetailSizeLoaded === '1') return;
        if (!sourceMeta2ndQueue.includes(tile)) sourceMeta2ndQueue.push(tile);
        sourceMeta2ndDrain();
      };
      /* ヤフオクは一覧に状態・サイズがない商品があるため、欠けている商品だけ
         詳細の「商品情報」から読む。終了日時・残り時間は出品日として扱わない。 */
      const sourceMetaYahooFetch = (tile) => {
        try {
          if (!tile || tile.dataset.msqSourceYahooLoading === '1'
            || tile.dataset.msqSourceYahooLoaded === '1') return Promise.resolve();
          const before = sourceMetaRead(tile);
          if (before.condition && before.size) return Promise.resolve();
          const a = tile.querySelector('a[href*="/jp/auction/"],a[href*="/auction/"]');
          if (!a || !a.href) return Promise.resolve();
          tile.dataset.msqSourceYahooLoading = '1';
          return fetch(a.href, { credentials: 'include' }).then((r) => r.ok ? r.text() : '')
            .then((html) => {
              const d = new DOMParser().parseFromString(html || '', 'text/html');
              const raw = String(d.body?.innerText || d.body?.textContent || '');
              const text = raw.replace(/[\s　]+/g, ' ').trim();
              /* Yahoo!のスマホ詳細は本文の「商品情報」が省略されることがある。
                 状態はHTMLの状態欄、サイズはカテゴリ名/keywords、出品日は
                 starttimeから読む。endtime・終了予定は出品日として扱わない。 */
              const stateMatch = raw.match(/(未使用に近い|目立った傷や汚れなし|やや傷や汚れあり|傷や汚れあり|全体的に状態が悪い|未使用)/)
                || html.match(/(?:aria-label=["']状態["'][\s\S]{0,900}?|状態[\s\S]{0,300}?)(未使用に近い|目立った傷や汚れなし|やや傷や汚れあり|傷や汚れあり|全体的に状態が悪い|未使用)/i);
              const infoPos = text.indexOf('商品情報');
              const infoText = infoPos >= 0 ? text.slice(infoPos, infoPos + 900) : '';
              const keywordText = String(d.querySelector('meta[name="keywords"]')?.getAttribute('content') || '');
              const structuredText = Array.from(d.querySelectorAll('script[type="application/ld+json"]'))
                .map((el) => String(el.textContent || '')).join(' ');
              const sizeSource = [infoText, keywordText, structuredText,
                String(d.querySelector('meta[name="description"]')?.getAttribute('content') || '')].join(' ');
              const sizeMatch = sizeSource.match(/(ONE\s*SIZE|FREE|MEDIUM|LARGE|4XL|3XL|2XL|XXL|XL|LL|L|M|S|SS|XS|F|[0-9０-９]{1,2}(?:号)?)\s*サイズ/i);
              const startMatch = text.match(/(?:開始日時|出品日時|出品日)\s*[:：]?\s*(20\d{2}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2})?|令和\d+年\d+月\d+日)/)
                || html.match(/(?:["']starttime["']\s*:\s*["'])(20\d{2}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}:\d{2})?)/i);
              const startMeta = d.querySelector('meta[itemprop="startDate"],time[itemprop="startDate"],[data-start-time]');
              const startValue = startMatch?.[1] || String(startMeta?.getAttribute('content') || startMeta?.getAttribute('datetime') || '').trim();
              if (stateMatch && stateMatch[1]) tile.dataset.msqSourceDetailCondition = stateMatch[1];
              if (!before.size && sizeMatch && sizeMatch[1]) tile.dataset.msqSourceDetailSize = sizeMatch[1].replace(/[\s　]+/g, ' ').trim();
              if (startValue) tile.dataset.msqSourceDetailDate = startValue;
              tile.dataset.msqSourceYahooLoaded = '1';
              const table = tile.querySelector('.msq-source-meta');
              const cells = table ? table.querySelectorAll('td') : [];
              const after = sourceMetaRead(tile);
              if (cells[0] && after.condition) cells[0].textContent = sourceConditionShort(after.condition);
              if (cells[1] && after.size) cells[1].textContent = after.size;
              if (after.date && table) {
                if (cells[2]) cells[2].textContent = sourceDateShort(after.date);
                else {
                  const tr = document.createElement('tr');
                  tr.innerHTML = '<th class="msq-source-meta-label" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">出品日</th><td class="msq-source-meta-value" style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;white-space:normal;overflow-wrap:anywhere;">' + rawEsc(sourceDateShort(after.date)) + '</td>';
                  table.querySelector('tbody')?.appendChild(tr);
                }
              }
              if (table && (after.condition || after.size || after.date)) table.style.display = 'table';
            })
            .catch(() => { tile.dataset.msqSourceYahooLoaded = '1'; })
            .finally(() => { try { delete tile.dataset.msqSourceYahooLoading; } catch (e) { } });
        } catch (e) { return Promise.resolve(); }
      };
      let sourceMetaYahooQueue = [];
      let sourceMetaYahooBusy = false;
      const sourceMetaYahooDrain = () => {
        if (sourceMetaYahooBusy || !sourceMetaYahooQueue.length) return;
        sourceMetaYahooBusy = true;
        const tile = sourceMetaYahooQueue.shift();
        sourceMetaYahooFetch(tile).finally(() => {
          sourceMetaYahooBusy = false;
          setTimeout(sourceMetaYahooDrain, 500);
        });
      };
      const sourceMetaYahooStart = (tile) => {
        if (!tile || tile.dataset.msqSourceYahooLoading === '1' || tile.dataset.msqSourceYahooLoaded === '1') return;
        if (!sourceMetaYahooQueue.includes(tile)) sourceMetaYahooQueue.push(tile);
        sourceMetaYahooDrain();
      };
      const tsuke = () => {
      if (!document.body) return;
      try { msqNagaosi(); } catch (e) { }
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      const mato = [];
      let n;
      while ((n = w.nextNode())) {
        if (mato.length > 300) break;              /* 重くしない */
        const t = (n.nodeValue || '').trim();
        if (!t || t.length > 24) continue;         /* 長い文は値段ではない */
        /* ★2026-08-17 ①送料よけ。ヤフオクは「＋送料740円」が1つの要素になっており、
           これを商品の値段として拾って売値を計算していた（実機の絵で確認）。
           送料・手数料・ポイントの類は商品の値段ではないので数えない。 */
        const msqSouryouYoke = /送料|手数料|ポイント|税込み?価格の内訳|支払い/.test(t);
        if (msqSouryouYoke) continue;
        let m = t.match(RE);
        /* ★②ヤフオクは「1,611」と「円」が別の要素に分かれていて、
           1つの要素だけでは値段と分からない（実機で確認）。
           数字だけの要素は、親の文字がちょうど「◯◯円」になっている時だけ値段とみなす。 */
        if (!m && /^[0-9][0-9,]{2,}$/.test(t) && n.parentElement) {
          const oyaMoji = (n.parentElement.innerText || "").trim();
          if (oyaMoji === t + "円" || oyaMoji === t + " 円") m = [oyaMoji, null, t];
        }
        if (!m) continue;
        const oya = n.parentElement;
        if (!oya || !oya.dataset || oya.dataset.msqUri) continue;
        if (msqPriceNav(oya)) continue;
        /* ★自分が出した札を値段として拾わないこと（2026-08-12 実機で無限に増えた）。
           札の文字は「売値 ¥8,980（益 ¥3,000）」で、これ自体が値段の形をしている。
           次の巡回でそれを拾い、札の中にまた札を足す、を繰り返していた。 */
        if (oya.closest && oya.closest('.msq-uri')) continue;
        const kane = Number(String(m[1] || m[2]).replace(/,/g, ''));
        if (!kane || kane < 100) continue;         /* 送料や個数を拾わない */
        /* ★2026-08-12 ユーザー指摘「必要ないところにまで出ている」。
           値段の形をした文字を無条件に拾っていたため、送料・合計・絞り込みの金額・
           商品ではない箇所にも札が付いていた。【商品1件ぶんの箱の中】に限る。
           7サイトは作りが違うので構造は決め打ちせず、
           「リンクと画像の両方を含む、一番近い箱」を商品1件とみなす。
           画像が3枚以上ある箱は一覧全体などの大きな箱なので採らない。 */
        /* ★2026-08-14 トレファクで全部落ちていた（実機で確認）。
           トレファクは1タイルに画像が3枚（本体＋サムネイル）入っており、
           「画像3枚以上の箱は一覧全体」とみなす決め打ちで【商品そのものを除外】していた。
           実測: 値段25件中23件が除外。道は P>DIV>DIV>A(img:1)>LI(a:3 img:3)>UL(a:204 img:204)。
           ★直し: 枚数で決めない。【商品リンクが1本だけの箱】を商品1件とみなす。
             上へ辿って、商品リンクが2本以上になったら1つ手前で止める（本家 cellOf と同じ考え方）。 */
        let tile = null, oya2 = oya;
        for (let k = 0; k < 10 && oya2; k++) {
          const oya3 = oya2.parentElement;
          if (!oya3 || !oya3.querySelectorAll) break;
          if (oya3.querySelectorAll('a[href]').length > 1 && oya2.querySelector
              && oya2.querySelector('a[href]') && oya2.querySelector('img')) { tile = oya2; break; }
          oya2 = oya3;
          if (oya2.querySelector && oya2.querySelector('a[href]') && oya2.querySelector('img')
              && oya2.querySelectorAll('a[href]').length === 1) { tile = oya2; break; }
        }
        if (!tile) continue;
        /* 状態・サイズ・出品日は価格計算とは独立して先に出す。 */
        if (sourceMetaListPage) {
          const metaTable = sourceMetaAdd(tile);
          if (metaTable && /(?:^|\.)trefac\.jp$/i.test(location.hostname)) sourceMetaTrefacStart(tile);
          if (metaTable && /(?:^|\.)2ndstreet\.jp$/i.test(location.hostname)
            && sourceMetaRead(tile).size === 'その他') sourceMeta2ndStart(tile);
          if (metaTable && /(?:^|\.)auctions\.yahoo\.co\.jp$/i.test(location.hostname)) {
            const yahooMeta = sourceMetaRead(tile);
            if (!yahooMeta.condition || !yahooMeta.size) sourceMetaYahooStart(tile);
          }
        }
        /* ★2026-08-17 エコリングは1商品に「即決価格」と「開始価格」の2つがあり、
           それぞれに札が付いて二重に出ていた（実機の絵で確認）。
           1つの商品に札は1つだけにする。 */
        /* ★2026-08-17 エコリングは1商品に「即決価格」と「開始価格」があり、
           それぞれ別の箱なので tile も別になり、札が2つ出ていた（実機の絵で確認）。
           同じ写真＝同じ商品とみなして1つに絞る。写真が無い時は箱で見る。 */
        const msqShashin = (() => {
          try { const im = tile.querySelector('img'); return (im && (im.currentSrc || im.src)) || ''; }
          catch (e) { return ''; }
        })();
        /* ★2026-08-17 ユーザー指示『即決価格だけでいいわ』。
           エコリングは1商品に「即決価格」と「開始価格」があり札が2つ出ていた。
           実際に買える値段は即決価格なので、開始価格の方には出さない。
           ★同じ写真＝同じ商品。すでに札を付けていて、今回が「開始」なら飛ばす。
             ただし他サイトのように値段が1つだけの所では、今までどおり出す。 */
        const msqDochira = (() => {
          try {
            /* ★見る範囲は自分と1つ上まで。4段も上げると即決と開始の両方を含む
               大きな箱に当たり、どちらも『即決』と誤判定していた（実機で確認）。 */
            let t = oya;
            for (let i = 0; i < 2 && t; i++) {
              const mo = String(t.innerText || '');
              if (mo.indexOf('開始') >= 0) return '開始';
              if (mo.indexOf('即決') >= 0) return '即決';
              t = t.parentElement;
            }
          } catch (e) { }
          return '';
        })();
        /* ★2026-08-17 ユーザー指示『即決価格だけでいいわ』。
           『開始』の文字で見分けようとしたが、エコリングは値段とラベルが別のセルにあり
           見分けられなかった（実機で確認）。
           ★同じ写真＝同じ商品として1つだけにする。DOMの並びは即決価格が先なので、
             残るのは即決価格の方になる（実機の絵で確認済み）。 */
        /* ★写真が取れないタイルもあるので、その時はリンク先で同じ商品かを見る。 */
        const msqShirushi = msqShashin || (() => {
          try { const a2 = tile.querySelector('a[href]'); return (a2 && a2.href) || ''; }
          catch (e) { return ''; }
        })();
        if (msqShirushi && mato.some((x) => x[3] === msqShirushi)) continue;
        mato.push([oya, kane, tile, msqShirushi]);
      }
      mato.forEach((x) => {
        /* ★2026-08-17 tile をここで取り出す。以前は売値の札より後ろで宣言していたため、
           札を足す所で tile が使えず（初期化前）、足す先の判定が効いていなかった。 */
        const oya = x[0], kane = x[1], tile = x[2];
        /* 同じ商品カードに価格要素が複数あるサイトがある。
           想定売値は商品ごとに1札だけにする。 */
        if (tile && tile.querySelector && tile.querySelector('.msq-uri[data-msq-goal-fuda="1"]')) return;
        const goalHref = String(tile?.querySelector('a[href*="/jp/auction/"],a[href]')?.href || '').trim();
        if (goalHref && Array.from(document.querySelectorAll('.msq-uri[data-msq-goal-fuda="1"]'))
          .some((el) => el.dataset.msqGoalHref === goalHref)) return;
        oya.dataset.msqUri = '1';                  /* 二度付けしない */

        /* ★2026-08-27 ホット判定（ユーザー「ホットツールも付けたか」）。
           辞書が読めていない時は何もしない。上限を超えていれば光らせない。
           ★題は札の文字を拾わないよう、こちらが足した物を除いた文字を使う。 */
        try {
          const dai9 = (function () {
            try {
              const c = tile.cloneNode(true);
              c.querySelectorAll('[data-msq-uri],.msq-uri,.msq-kata,.msq-sonomama-t,.msq-copy-t,.msq-rec-fuda')
                .forEach(function (e) { e.remove(); });
              return (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            } catch (e) { return ''; }
          })();
          let kata9 = '';
          try {
            const a9 = tile.querySelector('a[href]');
            if (a9 && a9.href) kata9 = kataSagasu(a9.href);
          } catch (e) { }
          const h9 = rawHotMiru(dai9, kata9, kane);
          /* ★2026-08-27 見せ方はPCと完全に同じにした（ユーザー
             「PCと同じだ 別にする意味がどこにある？」）。
             R131 で独自に出していた赤い札は取り下げ。
             枠を付ける先は、PC と同じく【商品のリンク】。 */
          if (h9 && h9.hot) {
            var link9 = null;
            try { link9 = tile.querySelector('a[href]'); } catch (e) { }
            rawHotHikaru(link9 || tile, h9);
          }
        } catch (e9) { }

        const g = goal(kane);
        if (!g) return;
        const s = document.createElement('span');
        s.className = 'msq-uri';
        s.dataset.msqUri = '1';   /* 札自身も対象外にする（二重の歯止め） */
        s.dataset.msqGoalFuda = '1';
        if (goalHref) s.dataset.msqGoalHref = goalHref;
        s.style.cssText = 'display:block;margin-top:2px;padding:1px 4px;border-radius:4px;'
          /* ★2026-08-17 実機で右端が切れていた（トレファクは3列で1列125px程度なのに
             この札は235px必要）。折り返しを許して切れないようにする。
             ★以前これで縦に潰れたのは幅23pxまで潰された時。今は箱に入れるか
               親の幅が確保されているので潰れない。念のため最低幅を持たせる。 */
          + 'background:#0b3b5c;color:#7dd3fc;font:700 11px/1.4 system-ui;'
          + 'white-space:normal;word-break:keep-all;min-width:60px;max-width:100%;box-sizing:border-box;';
        /* ★2026-08-17 どの値段から出した予想かを頭に書く。
           エコリングは1商品に『即決価格』と『開始価格』があり、
           2つ札が出た時にどちらか分からなかった（実機の絵で確認）。 */
        const msqNaFuda = (() => {
          try {
            let t = oya;
            for (let i = 0; i < 4 && t; i++) {
              const mo = String(t.innerText || '');
              if (mo.indexOf('即決') >= 0) return '即決 ';
              if (mo.indexOf('開始') >= 0) return '開始 ';
              if (mo.indexOf('現在') >= 0) return '現在 ';
              t = t.parentElement;
            }
          } catch (e) { }
          return '';
        })();
        s.textContent = '売値 ¥' + g.sell.toLocaleString() + '（益 ¥' + g.want.toLocaleString() + '）';
        /* ★2026-08-17 足す先を選ぶ（msqTsukeSaki）。実機の絵で確認した崩れの直し。
           カインドオルは値段の箱が【横並び】で、そこに札やボタンを足すと
           箱の幅を全員で奪い合い、【サイト自身の価格まで1文字ずつ縦書きに潰れた】。
           横並びの箱なら、そこではなくタイル全体の下に足す。
           縦並びのサイト（セカスト・トレファク等）は今までどおり値段の箱に足す。 */
        const msqTsukeSaki = (() => {
          try {
            /* ★2026-08-17 実機の絵で確認して判定を変えた。display で見ても効かなかった。
               カインドオルは値段の箱が極端に狭く、そこに札を足すと
               サイトの価格が1文字ずつ縦書きに潰れる（絵で確認）。
               ★幅で判定する。狭い箱（120px未満）なら、そこではなくタイル全体の下に足す。
                 セカスト等は値段の箱が十分広いので、今までどおりそこに足す。 */
            const st = getComputedStyle(oya);
            /* ★実機で測った値: 親は SPAN で display:flex / flex-direction:row、幅273px。
               ここに札やボタンを足すと横に並び、サイトの価格が1文字ずつ縦に潰れる。
               幅では判定できない（273pxあるため）。並び方で判定する。 */
            if (/flex/.test(st.display) && st.flexDirection !== 'column' && tile && tile !== oya) return tile;
            /* ★2026-08-17 ヤフオクで、こちらのボタンが「入札 9／残り 16時間」より
               上に出て、その行を巻き込んで見えた（実機の絵で確認）。
               ★実機で測った並び: 値段の箱から3段上がった所で、はじめて
                 次の兄弟が「入札／残り」になる。値段の箱に足すと入札より前に入る。
               ★直し: 上へ辿って「次に兄弟がいる」段を探し、そこがタイルの中なら
                 タイル側（＝一番下）に置く。 */
            const msqShitaNi = (() => {
              if (!tile || tile === oya) return null;
              let t2 = oya;
              for (let i = 0; i < 6 && t2 && t2 !== tile; i++) {
                const tsugi = t2.nextElementSibling;
                if (tsugi && (tsugi.innerText || '').trim().length > 0) return tile;
                t2 = t2.parentElement;
              }
              return null;
            })();
            if (msqShitaNi) return msqShitaNi;
          } catch (e) { }
          return oya;
        })();
        /* ★2026-08-17 タイルに足す時は、タイル幅いっぱいに広がって見た目がひどくなる。
           小さく横に並ぶようにする。値段の箱に足す従来のサイトでは何も足さない（見た目そのまま）。 */
        /* ★2026-08-17 タイルに直接足すと、タイルが縦並びのため4つの間が大きく空く。
           小さな箱を1つ作って、その中に横に詰めて並べる。 */
        /* セカストは価格欄の親にお気に入り（ハート）が同居する。
           そこへ直接ボタンを足すと、元サイトのハートと同じ行に入り重なる。
           商品カードの並びや列数は変えず、価格欄の中だけ専用の下段を作る。 */
        const msqHeartInOya = (() => {
          try {
            const re = /お気に入り|favorite|wishlist|heart|ハート|♡|♥/i;
            return Array.from(oya.querySelectorAll('button,[role="button"],[aria-label],[title],[data-testid]'))
              .some((e) => re.test(String(e.getAttribute('aria-label') || '') + ' '
                + String(e.getAttribute('title') || '') + ' '
                + String(e.getAttribute('data-testid') || '') + ' '
                + String(e.className || '')));
          } catch (e) { return false; }
        })();
        const msqHako = (() => {
          if (msqTsukeSaki === oya && !msqHeartInOya) return oya;
          let h = null;
          for (let i = 0; i < msqTsukeSaki.children.length; i++) {
            if ((msqTsukeSaki.children[i].className || '') === 'msq-hako') { h = msqTsukeSaki.children[i]; break; }
          }
          if (!h) {
            h = document.createElement('div');
            h.className = 'msq-hako';
            h.dataset.msqUri = '1';
            /* ★2026-08-17 実測: 親(タイル)の gap が 35px あり、価格との間が空きすぎる。
               その分だけ上へ詰める。親の gap を読んで打ち消すので、サイトが変わっても合う。 */
            let sukima = 0;
            try {
              const g = parseFloat(getComputedStyle(msqTsukeSaki).rowGap || '0');
              if (g > 6) sukima = g - 6;   /* 6pxだけ残す（くっつきすぎない） */
            } catch (e) { }
            h.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:0 6px 6px;align-items:center;'
              + 'width:100%;box-sizing:border-box;'
              + (msqHeartInOya
                ? 'clear:both;margin-top:4px;'
                : (sukima ? ('margin-top:-' + Math.round(sukima) + 'px;') : ''));
            try { msqTsukeSaki.appendChild(h); } catch (e) { }
          }
          return h;
        })();
        const msqChiisaku = (msqTsukeSaki !== oya || msqHeartInOya)
          ? 'display:inline-block;width:auto;max-width:max-content;margin:2px 4px 0 0;vertical-align:middle;align-self:flex-start;flex:0 0 auto;' : '';
        if (msqChiisaku) s.style.cssText += msqChiisaku;
        try { msqHako.appendChild(s); } catch (e) { }

        /* ★「型」ボタン（2026-08-12 ユーザー依頼）。
           この商品の詳細ページを裏で開いて、本文から型番を取って出す。
           押した時だけ1件。押さなければ通信はゼロ。取った型番は保存する。 */
        if (!tile || tile.querySelector('.msq-kata')) return;
        const a2 = tile.querySelector('a[href]');
        if (!a2) return;
        const url = a2.href;
        if (!url) return;
        /* ★写真の長押しメニューは、ここ（タイル1枚ずつ）から
           上の msqNagaosi（画面ぜんぶに1回だけ）へ移した（2026-08-17）。
           理由は msqNagaosi の説明を参照。ここには置かないこと。 */
        const b2 = document.createElement('button');
        b2.className = 'msq-kata';
        b2.dataset.msqUri = '1';   /* 値段拾いの対象にしない */
        /* ★2026-08-17 実機で測って直した。このボタンだけ高さ35px（＝2行に折り返し）で、
           他（売値17px・コピー19px・そのまま19px）と揃わず崩れて見えていた。
           文字「型番を調べる」が親の幅で折り返していたため。1行に固定する。 */
        b2.style.cssText = 'display:block;margin-top:2px;padding:2px 6px;border:none;'
          + 'border-radius:4px;background:#ca8a04;color:#fff;font:700 11px/1.4 system-ui;'
          + 'cursor:pointer;white-space:nowrap;';
        /* ★一覧では【商品ごとに】そのままを出す（2026-08-12 ユーザー指示）。
           型番が分かった商品にだけ付ける（型番が無いと検索できないため）。
           ブランドはそのタイルの題の先頭の語、値段と写真もそのタイルの物を使う。 */
        const sonomamaTile = (v) => {
          /* ★型番が無くても出す（ユーザー指示「レンズ結果で使うから」）。
             型番が無い時は題（属性を落としたもの）で引く。 */
          if (tile.querySelector('.msq-sonomama-t')) return;
          const s3 = document.createElement('button');
          s3.className = 'msq-sonomama-t';
          s3.dataset.msqUri = '1';
          s3.textContent = '型番検索';   /* ★2026-08-26 改名（型番／ブランド＋型番で引く） */
          /* ★2026-08-17 コピーの横に並べる（上の説明を参照） */
          s3.style.cssText = 'display:inline-block;margin:2px 4px 0 0;padding:2px 6px;border:none;'
            + 'border-radius:4px;background:rgba(190,24,93,.92);color:#fff;'
            + 'font:700 11px/1.4 system-ui;cursor:pointer;';
          s3.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            /* ★2026-08-17 「そのまま」もコピーと同じ題の取り方にする。
               1行目だけだとカインドオルで型番に届かず、札(New/PriceDown)を拾っていた。 */
            const dai2 = copyDaiFromTile(tile) || daiFromTile(tile);
            const brand2 = brandFromTile(tile);
            let img2 = '';
            try { const im2 = tile.querySelector('img'); if (im2) img2 = im2.src || ''; } catch (e) { }
            const hz2 = kataLoad();
            const susumu = (v3) => sonomamaHiraku(sonomamaUrl(v3, brand2, '', kane, img2, dai2), s3);
            /* ★2026-08-25 ユーザー依頼『そのままのボタンは型番のみとブランド＋型番を
               えらべるようにすればいいと思うのだが』→ 押した時に小窓で2択を出す。
               ★どちらで開くかが押す前に分かるように、交互切替ではなく小窓にした（本人了承）。
               ★型番が取れていない時は2択にならないので、今までどおり題で開く。
               ★そのままは【型番検索を走らせない】。メルカリの検索を開いて見せ方を変えるだけ
                 （inject.js:22 の説明のとおり）。ここもその性質は変えていない。 */
            const erabaseru = (v3) => {
              const kata9 = String(v3 || '').trim();
              if (!kata9 || !brand2) { susumu(kata9); return; }
              const furui = document.getElementById('msq-sonomama-erabu');
              if (furui) furui.remove();
              const d9 = document.createElement('div');
              d9.id = 'msq-sonomama-erabu';
              d9.dataset.msqUri = '1';
              d9.style.cssText = 'position:fixed;z-index:2147483600;'
                + 'background:#111;color:#fff;border:1px solid #444;border-radius:8px;'
                + 'box-shadow:0 4px 16px rgba(0,0,0,.6);padding:4px;';
              const tsukuru = (moji, tsukau) => {
                const b9 = document.createElement('button');
                b9.textContent = moji;
                b9.dataset.msqUri = '1';
                b9.style.cssText = 'display:block;width:100%;padding:9px 14px;border:none;'
                  + 'background:transparent;color:#fff;font:600 13px/1.3 system-ui;'
                  + 'text-align:left;cursor:pointer;white-space:nowrap;';
                b9.addEventListener('click', (e9) => {
                  e9.preventDefault(); e9.stopPropagation();
                  d9.remove();
                  susumu(tsukau);
                });
                return b9;
              };
              /* 型番のみ … sonomamaUrl はブランドを足すので、ここでブランドを空にする */
              const b1 = document.createElement('button');
              b1.textContent = '型番のみ　' + kata9;
              b1.dataset.msqUri = '1';
              b1.style.cssText = 'display:block;width:100%;padding:9px 14px;border:none;'
                + 'background:transparent;color:#fff;font:600 13px/1.3 system-ui;'
                + 'text-align:left;cursor:pointer;white-space:nowrap;';
              b1.addEventListener('click', (e9) => {
                e9.preventDefault(); e9.stopPropagation();
                d9.remove();
                sonomamaHiraku(sonomamaUrl(kata9, '', '', kane, img2, dai2, '', true), s3);
              });
              d9.appendChild(b1);
              d9.appendChild(tsukuru('ブランド＋型番　' + brand2 + ' ' + kata9, kata9));
              (document.body || document.documentElement).appendChild(d9);
              try {
                const r9 = s3.getBoundingClientRect();
                const w9 = d9.getBoundingClientRect();
                let lx9 = r9.left, ly9 = r9.bottom + 6;
                if (lx9 + w9.width > window.innerWidth - 6) lx9 = window.innerWidth - w9.width - 6;
                if (lx9 < 6) lx9 = 6;
                if (ly9 + w9.height > window.innerHeight - 6) ly9 = r9.top - w9.height - 6;
                if (ly9 < 6) ly9 = 6;
                d9.style.left = lx9 + 'px';
                d9.style.top = ly9 + 'px';
              } catch (e) { }
              const kesu9 = (e9) => {
                if (e9 && e9.target && d9.contains(e9.target)) return;
                d9.remove();
                document.removeEventListener('touchstart', kesu9, true);
                document.removeEventListener('click', kesu9, true);
              };
              setTimeout(() => {
                document.addEventListener('touchstart', kesu9, true);
                document.addEventListener('click', kesu9, true);
              }, 0);
            };
            /* 既に調べてあれば、そのまま検索へ（通信しない） */
            if (v || Object.prototype.hasOwnProperty.call(hz2, url)) {
              erabaseru(v || hz2[url] || '');
              return;
            }
            /* ★まだ調べていなければ【押した時に型番を取りに行ってから】検索する
               （2026-08-12 ユーザー依頼「一覧でそのままを押せば型番も検索にいって
                 そのまま検索に入るように」）。2回押す手間を無くす。
               取った型番は保存するので、次からは通信なしで進む。 */
            const modosu = () => setTimeout(() => {
              try { if (s3.isConnected) s3.textContent = '型番検索'; } catch (e) { }
            }, 2000);
            if (kataBusy) { s3.textContent = '1件ずつ'; modosu(); return; }
            /* ★間隔の歯止め（2026-08-13）。弾かれないよう6〜15秒あける。
               ★待たされるくらいなら題で引く方がよいので、待ち時間を出して止める。 */
            const machi2 = kataOK();
            if (machi2) { s3.textContent = machi2; modosu(); return; }
            kataBusy = true; kataTsukatta();
            s3.textContent = '型番を調べています…';
            kataFetch(url, (res) => {
              kataBusy = false;
              if (res && res.hajikareta) {
                s3.textContent = kataTomatta ? '中断（弾かれました）' : '弾かれました';
                modosu();
                return;                      /* 弾かれた時は検索へ進まない */
              }
              let v3 = '';
              if (res && res.moji) {
                v3 = kataErabu(res);
                kataSave(url, v3, kataDoko(res));   /* ★2026-08-27 出どころも残す */
                try { dasu(v3, msqStrongModel(v3)); } catch (e) { }
              }
              /* 型番が取れなくても止めない。取れなければ題で検索する。 */
              erabaseru(v3);   /* ★2026-08-25 取りに行った後も2択の小窓を出す */
            });
          });
          if (msqChiisaku) s3.style.cssText += msqChiisaku;
          try { msqHako.appendChild(s3); } catch (e) { }
        };
        const dasu = (v, tsuyoi) => {
          /* ★弱い型番（数字だけ等）はそれと分かるように出す。単独で引くと別物ばかり出るため。 */
          /* ★2026-08-27 PCと同じ形にする（型番(題) H765120）。
             出どころが分からない古い保存では、今までどおり「型番 X」と出す。 */
          const doko9 = v ? kataDokoSagasu(url) : '';
          b2.textContent = v
            ? ('型番' + (doko9 ? '(' + doko9 + ')' : '') + ' ' + v + (tsuyoi ? '' : '（弱）'))
            : '型番なし';
          b2.disabled = true;
          b2.style.setProperty('background', v ? '#0b3b5c' : '#444', 'important');
          b2.style.setProperty('color', v ? '#7dd3fc' : '#aaa', 'important');
          sonomamaTile(v);
        };
        /* ★2026-08-27 手元に無くても、GASで共有された型番があれば出す。 */
        const kyouyuu = kataSagasu(url);
        let titleKata = '';
        try {
          const titleDai = copyDaiFromTile(tile);
          const titleBrand = brandFromTile(tile);
          titleKata = (kataCodes(titleDai, titleBrand) || [])[0] || '';
        } catch (e) { }
        if (kyouyuu || titleKata) {
          const picked = kyouyuu || titleKata;
          dasu(picked, msqStrongModel(picked));
        }
        else {
          /* ★2026-08-27 押す機能を外した（ユーザー「一度も押したことがない」）。
             型番検索が保存の無い時に自分で調べて保存するので、完全な重複だった
             （実機: 一度も押していないのに129件溜まっていた）。
             ★札としては残す。あったか無かったかが分からなくなるため。
             ★型番の取り方(kataErabu)・保存(kataSave)・間隔の歯止め(kataOK/kataBusy)は
               型番検索の側にそのまま在る。ここを消しても取得は1つも失われない。 */
          b2.textContent = '型番 未確認';
          b2.disabled = true;
          b2.style.setProperty('background', '#444', 'important');
          b2.style.setProperty('color', '#aaa', 'important');
        }
        if (msqChiisaku) b2.style.cssText += msqChiisaku;
        try { msqHako.appendChild(b2); } catch (e) { }
        /* ★ワンコピ（2026-08-14 ユーザー依頼）。画像の左下。
           ブランド＋題（不要語を落とし、高値要素だけ足したもの）をコピーする。 */
        const cpb = document.createElement('button');
        cpb.className = 'msq-copy-t';
        cpb.dataset.msqUri = '1';
        /* ★2026-08-26 ユーザー指示『コピーって名前をやめてタイトルにしよう』 */
        cpb.textContent = 'タイトル';
        /* ★2026-08-17 ユーザー指示『そのままはコピーの横に並べろ』。
           この2つだけ横に並べる（売値の札と型番は今までどおり）。 */
        cpb.style.cssText = 'display:inline-block;margin:2px 4px 0 0;padding:2px 6px;border:none;'
          + 'border-radius:4px;background:rgba(13,148,136,.92);color:#fff;'
          + 'font:700 11px/1.4 system-ui;cursor:pointer;';
        cpb.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const dai5 = copyDaiFromTile(tile);
          /* ★ブランドは題の先頭から取る。トレファクは1行目が「SALE」で使えないため。 */
          const brand5 = brandFromTile(tile);
          /* ★2026-08-17 ユーザー指定の強さの順に組み立てる。
               （強）型番　（中）固有名詞　（弱）ブランド＋カテゴリー＋高値要素
             ★型番は題から拾うか、「型」ボタンで取って保存した物を使う。
             ★固有名詞は【メルカリで共通して使われている語】。
               「そのまま」で型番の一覧を1回開くと、あちらで測って保存される
               （rawKoyuuMeishi）。開いていない型番では空のまま＝弱の段に落ちる。
             ★どれを出すか:
               ・固有名詞が分かっているなら【ブランド＋固有名詞】を出す。
                 型番だけだと、型番を書いていない同じ商品を取りこぼして相場が狂うため
                 （ユーザー指摘）。型番で引きたい時は「そのまま」を押せばよい。
               ・分かっていなければ【ブランド＋型番】。
               ・型番も無ければ【ブランド＋カテゴリー＋高値要素】。 */
          let kata5 = '';
          try {
            kata5 = (kataCodes(dai5, brand5) || [])[0] || '';
            if (!kata5) {
              const a5 = tile.querySelector('a[href]');
              if (a5 && a5.href) kata5 = kataSagasu(a5.href);   /* ★2026-08-27 共有も見る */
            }
          } catch (e) { }
          let koyuu5 = '';
          try { koyuu5 = kata5 ? rawKoyuuLoad(kata5) : ''; } catch (e) { }
          /* ★ブランドと固有名詞が重なることがある（実測: メルカリの題は
             「NIKE DUNK LOW」のようにブランドを含むため、こちらが足すと二重になる）。
             大文字小文字は無視して、先に出てきた表記を残す。 */
          const tsunagu = (b, x) => {
            const mita5 = {};
            return ((b ? String(b).trim() + ' ' : '') + x).split(/[\s　]+/)
              .filter((t) => {
                if (!t) return false;
                const k = t.toLowerCase();
                if (mita5[k]) return false;
                mita5[k] = 1;
                return true;
              }).join(' ').trim();
          };
          let moji5 = '';
          /* ★2026-08-26 実機（ユーザー指摘）『コピーはタイトルを取るようになってるはず。
               余計なワードを除いた。HELLY HANSEN なら「HELLY HANSEN ジャケット」が正解。
               ポリエステルは高値要素ではない＝低値要素だから入れないのが正解』。
             ★これまでは【型番があると型番で引いて】いたため
               HELLY HANSEN → 「HELLY HANSEN HH12508」
               HYSTERIC GLAMOUR → 「HYSTERIC GLAMOUR R-0084」（下の足切りの件）
               になり、メルカリでは当たらなかった。型番で引きたい時は「そのまま」がある。
             ★直し: コピーは【題から作る】に一本化する。型番の段は使わない。
               固有名詞（メルカリで実際に共通して使われていた語）が分かっている時だけ
               それを足す。分かっていなければ題（copyMoji）。 */
          /* ★2026-08-26 ユーザー『コピーはタイトルだけだろ』。
             固有名詞の段も外して、題だけにする。GLR のような略や、
             サイズ・種類語が混ざった固有名詞が入ると、題の語ではなくなるため。 */
          moji5 = copyMoji(dai5, brand5, '');
          const modosu5 = () => setTimeout(() => {
            try { if (cpb.isConnected) cpb.textContent = 'タイトル'; } catch (e) { }
          }, 1800);
          if (!moji5) { cpb.textContent = '取れず'; modosu5(); return; }
          /* ★2026-08-26 ユーザー指示『コピーって名前をやめてタイトルにしよう。
               そしてそのままと同じでタイトルを押すとメルカリの絞り込み結果が出るように変更しろ』
               『間隔はそのままと同じ』『規制に引っかからないように』。
             ★写す（クリップボード）のはやめて、メルカリの絞り込み結果を開く。
             ★歯止めは「そのまま」と【同じ物を共有する】（kataOK / kataTsukatta）。
               別に持つと、2つのボタンを交互に押した時に間隔が実質半分になり、
               弾かれる元になる（2026-08-13 の Access Denied と同じ道）。
             ★型番ではないので __msqsrcmodel は付けない（model を空で渡す）。
               付けるとあちらの型番照合が題の文字列と一致してしまう。
               絞り込み（個人・メルカリ便）は型番なしの時と同じものが付く。 */
          if (kataBusy) { cpb.textContent = '1件ずつ'; modosu5(); return; }
          const machi5 = kataOK();
          if (machi5) { cpb.textContent = machi5; modosu5(); return; }
          kataTsukatta();
          let img5 = '';
          try { const im5 = tile.querySelector('img'); if (im5) img5 = im5.src || ''; } catch (e) { }
          sonomamaHiraku(sonomamaUrl('', brand5, '', kane, img5, dai5, moji5), cpb, 'タイトル');
        });
        if (msqChiisaku) cpb.style.cssText += msqChiisaku;
        try { msqHako.appendChild(cpb); } catch (e) { }
        /* ★型番を調べる前でも「そのまま」は出す（型番が無ければ題で引く）。 */
        sonomamaTile(kataSagasu(url));   /* ★2026-08-27 共有された型番も見る */
      });
    };
    /* ★商品の詳細ページでも型番を出す（2026-08-12 ユーザー指摘
       「せっかく出した型番が詳細見えたら消える」）。
       詳細ページは【いま開いているページ自身】なので通信は要らない。その場で取る。
       取り所は一覧と同じ 型番欄 → タイトル → 本文 の3つ。 */
    const shosaiKata = () => {
       if (!document.body) return;
       /* Shops詳細は「相場」と「そのまま」だけを使う。通常サイト用の
          型番札（Shops（弱）を含む）は検索語と重複するため表示しない。 */
       if (isShopsHost) {
         const f0 = document.getElementById('msq-kata-fuda');
         if (f0) f0.remove();
         return;
       }
       const moji = document.body.innerText || '';
      if (moji.length < 200) return;
      /* ★2026-08-12 実機で「検索画面にも札が出る」不具合（ユーザー指摘）。
         本文全体を読んでいたため、検索履歴に残っていた型番 G-5600UE-1JF を拾い、
         商品ページですらない画面に札が浮いてメニューを覆っていた。
         ★固定で出すこの札は【型番欄】と【H1（商品の題）】だけを見る。本文全体は見ない。
           検索画面にはどちらも無いので、自然に出なくなる。
         ★本文からの抽出は、商品ごとのボタン（詳細を開いて調べる方）で使う。 */
      /* ★出すのは【商品の詳細ページだけ】。判定はURL（上の SHOSAI）。
         一覧では商品ごとのボタンが型番を持つので、固定の札は出さない。
         実機で /buy（カテゴリの入口）や検索画面に札が浮いていたのを直す。 */
      if (!shosaiPage()) {
        const f0 = document.getElementById('msq-kata-fuda'); if (f0) f0.remove();
        return;
      }
      const dai = shiireDetailTitle();
      /* 詳細ページは【商品タイトル → 型番欄 → 本文ラベル】の順で採る。
         仕入元の型番欄が空欄・別商品の値になるサイトがあるため、
         商品自身の題に含まれる型番を先に使う。本文全体は読まない。 */
      const v = kataErabu(kataCurrentPage());
      let fuda = document.getElementById('msq-kata-fuda');
      if (!v) { if (fuda) fuda.remove(); return; }
      if (!fuda) {
        fuda = document.createElement('div');
        fuda.id = 'msq-kata-fuda';
        fuda.dataset.msqUri = '1';   /* 値段拾いの対象にしない */
        /* ★2026-08-12 実機の写真で確認。上に置くとサイトのロゴやタブを覆っていた。
           クエッタの拡張機能と同じく【下寄り】に置く。 */
        /* 固定ボタンの順: レンズ → 型番検索 → 型番 → 辞書。 */
        fuda.style.cssText = 'position:fixed;left:6px;bottom:44px;height:32px;box-sizing:border-box;display:flex;align-items:center;z-index:2147483000;'
          + 'background:#0b3b5c;color:#7dd3fc;font:700 13px/1.5 system-ui;'
          + 'padding:4px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.5);';
        document.body.appendChild(fuda);
      }
      const s2 = '型番 ' + v + (msqStrongModel(v) ? '' : '（弱）');
      if (fuda.textContent !== s2) fuda.textContent = s2;
      /* この詳細ページのURLでも覚えておく。一覧に戻った時に押し直さなくて済む。 */
      const hz = kataLoad();
      if (hz[location.href] !== v) kataSave(location.href, v);
    };

    /* ===== 「そのまま」ボタン（2026-08-12 ユーザー依頼） =====
       本家 list_extractor.js 7918-7935 の【メルカリそのまま】をそのまま写した。
         ・keyword は「ブランド 型番」
         ・付ける条件は seller_type=0 と item_types=mercari。**並び順・販売状況・状態は付けない**
           （メルカリの画面でそのまま操作する、というのがこの機能の意味）
         ・__msqsrcmodel には【型番だけ】を渡す。ブランドを混ぜると
           あちらの型番照合が一致しなくなる（本家に明記されている）
         ・照合も絞り込みもしない。開くだけ。
       ★アプリではメルカリタブで開く（MainActivity に openMercari を追加済み）。 */
    /* ===== レンズ検索（第1段: レンズを開くところまで）2026-08-13 =====
       本家 list_extractor.js 7697-7765 を写した。写し落とし厳禁の点:
         ★<meta name="referrer" content="no-referrer"> が必須。
           付けないと仕入元のURLがRefererに乗り、Googleに403で拒否される（本家に実測記録あり）。
         ★その結果 referrer が空になるので、ツールから来た目印は
           window.name('MSQSTATE:') と URLの msqfrom=1 の【二重】で持つ。
         ★画像は fetch(cors/omit) で読み、駄目なら img+canvas で回り込む。
         ★uploadbyurl は塞がれている。画像そのものを送る形でなければ通らない。
       ★スマホ（＝このアプリ）は【同じ画面で移動する】。本家のスマホと同じ。
       ★人が動かす速さを守る。レンズは2026-08-01に実際に弾かれた実績があるので、
         型番調べと同じ 6〜15秒の歯止め（kataOK/kataTsukatta）を通す。 */
    const LENS_STATE_PREFIX = 'MSQSTATE:';
    /* base64 → Blob。アプリの窓口が返した中身を画像に戻す。 */
    const lensB64ToBlob = (b64) => {
      const bin = atob(b64);
      const len = bin.length;
      const arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: 'image/jpeg' });
    };
    /* 画像を取る。戻り値は { blob, b64 }。
       ★まずアプリの窓口で取る（2026-08-13 実機で確認して追加）。
         仕入元の画像は別オリジンのCDNにあり、CORSが無いので
         fetch も img+canvas も【原理的に読めない】（表示はできる）。
         拡張機能は権限で読めるが、アプリのWebViewには権限が無い。
       ★窓口が無い版でも動くよう、無ければ従来の方法へ落とす。 */
    const lensImageBlob = (u) => {
      if (!u) return Promise.resolve(null);
      try {
        if (window.MsqApp && window.MsqApp.fetchImage) {
          /* ★参照元（いま見ているページ）を渡す。付けないとCDNに403で弾かれる（実機で確認）。 */
          const b64 = window.MsqApp.fetchImage(u, location.href);
          if (b64) {
            try { return Promise.resolve({ blob: lensB64ToBlob(b64), b64: b64 }); } catch (e) { }
          }
        }
      } catch (e) { }
      return fetch(u, { mode: 'cors', credentials: 'omit' })
        .then((r) => r.blob())
        .then((b) => ({ blob: b, b64: '' }))
        .catch(() => new Promise((res, rej) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => {
            try {
              const cv = document.createElement('canvas');
              cv.width = im.width; cv.height = im.height;
              cv.getContext('2d').drawImage(im, 0, 0);
              cv.toBlob((b) => (b ? res(b) : rej(new Error('canvas失敗'))), 'image/jpeg', 0.9);
            } catch (e) { rej(e); }
          };
          im.onerror = rej;
          im.src = u;
        }).then((b) => ({ blob: b, b64: '' })).catch(() => null));
    };
    /* 商品の写真を【出てくる順に】集める。本家の各サイトの抽出処理と同じ考え方。
       ・アイコン・ロゴ・飾りは除く（URLの言葉で判定）
       ・小さすぎる物は除く（100px未満は飾り）
       ・同じURLは1回だけ
       戻り値は順番どおりの配列。レンズには [0]（＝1枚目）を渡す。 */
    const lensImages = () => {
      const out = [], mita = {};
      try {
        document.querySelectorAll('img').forEach((im) => {
          const s = String(im.currentSrc || im.src || '').split('?')[0];
          if (!s || mita[s]) return;
          if (/icon|logo|avatar|sprite|banner|badge|blank|dummy|noimage/i.test(s)) return;
           const r = im.getBoundingClientRect();
           /* ショップス詳細は元画像を80pxサムネイルで表示する。
              サムネイルの表示サイズだけで判定すると、商品画像まで飾り扱いになり
              「写真が無い」で止まる。ショップスのuploaded-imageだけはnaturalサイズを使う。 */
           const shopsUploaded = isShopsHost && im.alt === 'uploaded-image';
           const w = shopsUploaded ? (im.naturalWidth || r.width || 0) : (r.width || im.naturalWidth || 0);
           const h = shopsUploaded ? (im.naturalHeight || r.height || 0) : (r.height || im.naturalHeight || 0);
          if (w < 100 || h < 100) return;
          mita[s] = 1;
          out.push(im.currentSrc || im.src);
        });
      } catch (e) { }
      return out;
    };
    /* ★どれが「この商品の写真」かを決める（2026-08-13 実機で2回外して確定）。
       ① 一番大きい画像 → 拡大用の別カットを掴んだ
       ② 出てくる順の1枚目 → 【似た商品のサムネイルが先に並んでいて別商品を掴んだ】
          実測: ページ goodsId/2308365834482 に対し、1枚目は goods/221899/38/15244/…
                本物は goods/230836/58/34482/… で5番目だった
       ③ 採用: 【ページのIDを含む画像】の1枚目。
          セカストは goodsId/2308365834482 → 画像 goods/230836/58/34482/ と桁が分かれるので、
          画像URLの数字だけを連結して、ページのIDが入っているかで見る。
          ★IDが取れない／一致が無いサイトでは、従来どおり出てくる順の1枚目に落とす。 */
    /* ★2026-08-14 実機で指摘「レンズ結果に使われる画像がどこの馬の骨か分からない」。
       トレファクの詳細では、この商品の写真ではあるが【5枚目のカット】が選ばれていた。
       DOMの並びが 05,06,01,02,03,04… と入れ替わっていたため（実機で確認）。
       ★本家 list_extractor.js は og:image を images[0] に入れて、それをレンズへ送る。
         og:image はページ自身が「この商品の代表写真」と宣言している物なので、
         並び順に左右されない。同じやり方に合わせる。
       ★og:image は小さい版のことがある（トレファクは w384、DOM側に同じ絵の w630）。
         同じファイル名の物が集めた中にあれば、そちら（大きい版）を使う。
       ★og:image が無いサイトでは、今までどおりの選び方に落ちる。 */
    const lensMainImage = () => {
      const list = lensImages();
      /* ブランディアは og:image が商品写真ではなくサイトのロゴを返す商品ページがある。
         ロゴをLensへ送ると、Lensの検索結果もブランディアのロゴになる。
         商品画像は image1/0/<商品番号>_1.jpg の規則を優先する。 */
      const isBrandear = /(^|\.)brandear\.jp$/i.test(String(location.hostname || ''));
      const isBrandearProduct = (u) => /\/image1\/0\/\d+_1\.jpg(?:$|[?#])/i.test(String(u || ''));
      if (isBrandear) {
        const bp = list.find((u) => isBrandearProduct(u));
        if (bp) return bp;
      }
      let og = '';
      try {
        const m = document.querySelector('meta[property="og:image"]')
          || document.querySelector('meta[name="og:image"]');
        og = m ? String(m.getAttribute('content') || '').split('?')[0] : '';
      } catch (e) { }
      /* ブランディアのロゴog:imageは捨て、商品画像の候補へ落とす。 */
      if (isBrandear && og && !isBrandearProduct(og)) og = '';
      if (og && /^https?:/i.test(og)) {
        const na = og.split('/').pop();
        if (na) {
          for (let i = 0; i < list.length; i++) {
            if (String(list[i]).split('?')[0].split('/').pop() === na) return list[i];
          }
        }
        return og;
      }
      if (!list.length) return '';
      const id = (location.pathname.match(/\d{6,}/g) || []).sort((a, b) => b.length - a.length)[0] || '';
      if (id) {
        for (let i = 0; i < list.length; i++) {
          const suji = String(list[i]).replace(/[^0-9]/g, '');
          if (suji.indexOf(id) >= 0) return list[i];
        }
      }
      return list[0];
    };

    const lensActionUrl = (q, state) =>
      'https://lens.google.com/upload?ep=gisbubu&hl=ja&msqfrom=1&q=' + encodeURIComponent(q)
      + (state ? '&msqstate=' + encodeURIComponent(state) : '');
    /* 同じ画面に空ページを書いて、そこから画像をPOSTする。 */
    const lensPost = (blob, actionUrl, backUrl, b64, jotai) => {
      /* ★2026-08-13 ユーザー指示「別のタブ（結果）で開いて、そこで完結させる」。
         仕入元の一覧を潰さないため、自分の画面は書き換えない。
         中身のHTMLを作って「結果」タブに渡し、送信はあちらで行う。
         ★<meta name="referrer" content="no-referrer"> は必ず入れる（無いと403）。
         ★画像は base64 で埋め込む。タブをまたぐのでファイルの実体は渡せない。 */
      if (b64) {
        try {
          if (window.MsqApp && window.MsqApp.openKekka) {
            const html = '<html><head><meta name="referrer" content="no-referrer">'
              /* ★2026-08-15 この「送信中…」ページだと分かる目印。
                 これが無いと、土台のURLが lens.google.com のせいで
                 レンズ結果ページと区別できず、送信前に仕入元の情報を
                 読み捨ててしまっていた（上のルーティングの説明を参照）。 */
              + '<meta name="msq-send" content="1">'
              + '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
              + '<body style="background:#0f172a;color:#fff;font-family:system-ui,sans-serif;'
              + 'text-align:center;padding-top:25%">'
              + '<p id="msq-send-status">Googleレンズへ画像を送っています… 0秒</p>'
              + '<form id="f" method="POST" enctype="multipart/form-data" action="'
              + String(actionUrl).replace(/"/g, '&quot;') + '">'
              + '<input id="i" type="file" name="encoded_image"></form>'
              + '<script>(function(){'
              /* ★仕入元の情報は、この画面の中で window.name に入れる（2026-08-14）。
                 実機で仕入値が渡っていなかった。window.name は【同じWebViewの中でしか残らない】。
                 仕入元タブで設定しても、結果タブは別のWebViewなので受け取れなかった。
                 送信の直前にこちら側で入れれば、Googleへ移動した後も残る。 */
              + 'try{window.name=' + JSON.stringify('MSQSTATE:' + (jotai || '{}')) + ';}catch(e){}'
              + 'var b=atob("' + b64 + '");var n=b.length;var a=new Uint8Array(n);'
              + 'for(var k=0;k<n;k++)a[k]=b.charCodeAt(k);'
              + 'var f=new File([a],"image.jpg",{type:"image/jpeg"});'
              + 'var d=new DataTransfer();d.items.add(f);'
              + 'document.getElementById("i").files=d.files;'
              + 'var ms=Date.now(),st=document.getElementById("msq-send-status");'
              + 'setInterval(function(){if(st)st.textContent="Googleレンズへ画像を送っています… "+Math.floor((Date.now()-ms)/1000)+"秒";},500);'
              + 'setTimeout(function(){document.getElementById("f").submit();},200);'
              + '})();<\/script>'
              + '</body></html>';
            /* ★R154: HTML全体を1回のBinder引数に渡すと、画像便では
               Android WebViewが詳細を出さずScript errorで止まる。対応版は
               16KBずつ渡し、旧版では従来窓口へ戻す。 */
            if (window.MsqApp.openKekkaBegin && window.MsqApp.openKekkaPart && window.MsqApp.openKekkaEnd) {
              try {
                window.MsqApp.openKekkaBegin();
                let ix = 0, partSize = 16000;
                const sendPart = () => {
                  try {
                    if (ix < html.length) {
                      window.MsqApp.openKekkaPart(html.slice(ix, ix + partSize));
                      ix += partSize;
                      lensObi('一覧商品のLens解析データを結果タブへ送信中… '
                        + Math.min(100, Math.round(ix * 100 / html.length)) + '%');
                      setTimeout(sendPart, 0);
                      return;
                    }
                    window.MsqApp.openKekkaEnd();
                  } catch (e) {
                    lensObi('Lens解析データの受け渡しに失敗しました');
                  }
                };
                sendPart();
                return true;
              } catch (e) { }
            }
            window.MsqApp.openKekka(html);
            return true;
          }
        } catch (e) { }
      }
      /* 窓口が無い版では、本家のスマホと同じく自分の画面で送る（従来どおり） */
      let dt;
      try {
        const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
        dt = new DataTransfer();
        dt.items.add(file);
      } catch (e) { return false; }
      try {
        document.open();
        document.write('<html><head><meta name="referrer" content="no-referrer"></head>'
          + '<body style="background:#0f172a;color:#fff;font-family:system-ui,sans-serif;'
          + 'text-align:center;padding-top:25%">'
          + '<p>Googleレンズへ画像を送っています...</p>'
          + (backUrl ? '<p><a style="color:#93c5fd" href="'
              + String(backUrl).replace(/"/g, '&quot;') + '">元のページに戻る</a></p>' : '')
          + '</body></html>');
        document.close();
        setTimeout(() => {
          try {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = actionUrl;
            form.enctype = 'multipart/form-data';
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.name = 'encoded_image';
            inp.files = dt.files;
            form.appendChild(inp);
            document.body.appendChild(form);
            form.submit();
          } catch (e) { }
        }, 200);
        return true;
      } catch (e) { return false; }
    };

    /* rawLensSendBatch は後段の別ブロックにあるため、ローカルconstの
       lensPostを直接参照できない。実機でReferenceErrorになっていた。
       アプリ一覧Lensからも同じ送信処理を使えるよう明示的に共有する。 */
    /* Lensへ渡す仕入れ値。アプリが追加した売値札・ボタン・結果パネルを
       document.body.innerText から先に拾わないようにする。ブランディアは
       商品本体の価格欄を優先し、一覧・ナビの価格と混同しない。 */
    const lensSourcePrice = () => {
      const parse = (t) => {
        const s = String(t || '');
        const m = s.match(/[¥￥]\s*([0-9][0-9,]{2,})/)
          || s.match(/([0-9][0-9,]{2,})\s*円/);
        return m ? (m[1] || '') : '';
      };
      try {
        const host = String(location.hostname || '').toLowerCase();
        if (host.indexOf('brandear.jp') >= 0) {
          const e = document.querySelector('#item_metadata .non-tax-price')
            || document.querySelector('#item_metadata');
          const p = parse(e && (e.textContent || e.innerText || ''));
          if (p) return p;
        }
      } catch (e) { }
      try {
        const c = document.body && document.body.cloneNode(true);
        if (!c) return '';
        c.querySelectorAll('[data-msq-uri],.msq-uri,.msq-kata,.msq-sonomama-t,.msq-copy-t,'
          + '.msq-rec-fuda,#msq-lens-obi,#msq-lens-panel,#msq-lens,#msq-sonomama,'
          + '#msq-plus,#msq-cookie,#msq-hotdict-btn,#msq-raw-bar,#msq-raw-style')
          .forEach((e) => e.remove());
        return parse(c.innerText || c.textContent || '');
      } catch (e) { return ''; }
    };
    /* STABLE: 「そのまま」ボタンの位置・選択式検索の動作は固定。
       型番／ブランド＋型番を選んで開く既存経路を変更しない。 */
    const sonomama = () => {
      if (!document.body) return;
      const aru = document.getElementById('msq-sonomama');
      /* ★画面に固定するこのボタンは【商品の詳細ページだけ】に出す（2026-08-12 ユーザー指摘
         「そのままのボタンがあちこちに出るぞ」「検索の場所にも出てる」）。
         一覧では商品ごとに別のボタンを出すので、ここで固定の物まで出すと二重になる。
         ★判定はURL（上の SHOSAI）。5サイトとも実機で開いて記録した形。
         ★型番が無くても出す（ユーザー指示「レンズ結果で使うから」）。 */
      if (!shosaiPage()) {
        if (aru) aru.remove();
        return;
      }
      if (aru) return;
      const b = document.createElement('button');
      b.id = 'msq-sonomama';
      b.dataset.msqUri = '1';
      b.textContent = isShopsHost ? '🛒そのまま' : '型番検索';   /* ShopsはQuettaと同じ表示 */
      /* ★型番の札のすぐ下。上に置くとサイトのロゴやタブを覆う（実機の写真で確認）。 */
      b.style.cssText = 'position:fixed;left:6px;bottom:84px;height:32px;box-sizing:border-box;display:flex;align-items:center;z-index:2147483000;'
        + 'background:rgba(190,24,93,.92);color:#fff;font:700 13px/1.5 system-ui;'
        + 'padding:5px 12px;border:none;border-radius:6px;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer;';
      b.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const moji = shiireSourceText();
        const dai = shiireDetailTitle();
        /* Shopsは通常の仕入れサイトと違い、説明文の「〇品番」直下だけを使う。
           空欄なら、別の型番を推測して検索語へ足さない。 */
        const model = isShopsHost ? shopsDraftModel() : kataErabu(kataCurrentPage());
        /* ★型番が無くても止めない。無ければ題で引く（レンズ結果で使うため）。 */
        /* ★ブランドは【H1（商品の題）】から。先頭1語だけにすると
           EMPORIO ARMANI が「EMPORIO」になり、メルカリの結果がほぼ0件になる
           （実機で確認）。日本語が出るまでの語をつなげる。 */
        /* Shopsのブランドは説明文の「〇ブランド」直下だけを使う。
           欄が空ならタイトルから別のブランドを推測しない。 */
       const brandRaw = isShopsHost ? shopsDraftBrand() : brandFromDai(dai);
       /* Shopsのブランド欄は「英語／カタカナ」の表記がある。検索語では
          区切り記号を残さず、英語名と読みを空白でつなぐ。 */
       const brand = isShopsHost
         ? String(brandRaw || '').replace(/[／/｜|]+/g, ' ').replace(/\s+/g, ' ').trim()
         : brandRaw;
        const rank = rankFromShiirePage(moji);
        const price = lensSourcePrice();
        let img = '';
        try {
          let big = 0;
          document.querySelectorAll('img').forEach((im) => {
            const r = im.getBoundingClientRect();
            const a3 = r.width * r.height;
            if (a3 > big && im.src) { big = a3; img = im.src; }
          });
        } catch (e) { }
       const openSonomama = (withBrand) => {
         const u = withBrand
           ? sonomamaUrl(model, brand, rank, price, img, dai)
           : sonomamaUrl(model, '', rank, price, img, dai, '', true);
         sonomamaHiraku(u, b);
       };
       /* Shops詳細の型番検索は、仕入元一覧の型番検索と同じ2択にする。 */
       if (isShopsHost && model && brand) {
         const old = document.getElementById('msq-sonomama-erabu');
         if (old) old.remove();
         const menu = document.createElement('div');
         menu.id = 'msq-sonomama-erabu';
         menu.dataset.msqUri = '1';
         menu.style.cssText = 'position:fixed;z-index:2147483600;background:#111;color:#fff;'
           + 'border:1px solid #444;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.6);'
           + 'padding:4px;width:min(360px,calc(100vw - 12px));box-sizing:border-box;';
         const addChoice = (label, fn) => {
           const x = document.createElement('button');
           x.type = 'button';
           x.textContent = label;
           x.dataset.msqUri = '1';
           x.style.cssText = 'display:block;width:100%;padding:9px 14px;border:none;'
             + 'background:transparent;color:#fff;font:600 13px/1.3 system-ui;'
             + 'text-align:left;cursor:pointer;white-space:normal;overflow-wrap:anywhere;';
           x.addEventListener('click', (e) => {
             e.preventDefault(); e.stopPropagation();
             menu.remove();
             fn();
           });
           menu.appendChild(x);
         };
         addChoice('型番のみ\n' + model, () => openSonomama(false));
         addChoice('ブランド＋型番\n' + brand + '\n' + model, () => openSonomama(true));
         (document.body || document.documentElement).appendChild(menu);
         try {
           const br = b.getBoundingClientRect();
           const mr = menu.getBoundingClientRect();
           let left = br.left;
           let top = br.top - mr.height - 6;
           if (left + mr.width > window.innerWidth - 6) left = window.innerWidth - mr.width - 6;
           if (left < 6) left = 6;
           if (top < 6) top = br.bottom + 6;
           menu.style.left = left + 'px';
           menu.style.top = top + 'px';
         } catch (e) { }
         const close = (e) => {
           if (e && e.target && menu.contains(e.target)) return;
           menu.remove();
           document.removeEventListener('touchstart', close, true);
           document.removeEventListener('click', close, true);
         };
         setTimeout(() => {
           document.addEventListener('touchstart', close, true);
           document.addEventListener('click', close, true);
         }, 0);
         return;
       }
       openSonomama(true);
      });
      document.body.appendChild(b);

      /* STABLE: ショップスの「🛍 相場」ボタン。レンズ相場検索の既存経路を変更しない。 */
      /* ★レンズ（第1段）。画像をGoogleレンズへ送る。 */
      if (document.getElementById('msq-lens')) return;
      const lb = document.createElement('button');
      lb.id = 'msq-lens';
      lb.dataset.msqUri = '1';
      lb.textContent = isShopsHost ? '🛍 相場' : 'レンズ';
          lb.style.cssText = 'position:fixed;left:6px;bottom:124px;height:32px;box-sizing:border-box;display:flex;align-items:center;z-index:2147483000;'
        + 'background:rgba(37,99,235,.92);color:#fff;font:700 13px/1.5 system-ui;'
        + 'padding:5px 12px;border:none;border-radius:6px;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer;';
      lb.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        /* ★人が動かす速さを守る。レンズは実際に弾かれた実績がある（2026-08-01）。 */
        const machi3 = kataOK();
        if (machi3) {
          lb.textContent = machi3;
          setTimeout(() => { try { if (lb.isConnected) lb.textContent = isShopsHost ? '🛍 相場' : 'レンズ'; } catch (e) { } }, 2000);
          return;
        }
        /* ★2026-08-13 実機で「1枚目じゃない」と指摘を受けて直した。
           私は「一番大きい画像」を選んでいたが、本家は【出てくる順に集めて1枚目】を使う
           （extractShopsInfo 等は querySelectorAll('img') の順に push し、images[0] を渡す）。
           大きさで選ぶと、拡大用の別カットや関連商品を掴むことがある。
           ★同じ規則にする: 画面に出てくる順・アイコンやロゴを除く・小さすぎる物を除く。 */
        const img2 = lensMainImage();
        if (!img2) { lb.textContent = '写真が無い'; return; }
        /* ★2026-08-17 実機で判明: カインドオルの h1 は『チェックスカート2S303』だけで
           ブランドが入っておらず、レンズの検索欄が『メルカリ』だけになっていた。
           og:title には『SEVEN TEN by MIHO KAWAHITO(…) チェックスカート2S303 2S303 …』と
           ブランドも型番も入っている（実機で確認）。og:title を先に使う。
           ★og:title はどのサイトも商品名を入れる決まりの場所なので、他サイトでも効く。 */
        const msqOgDai = (() => {
          try {
            const m = document.querySelector('meta[property="og:title"]');
            const v = m ? String(m.getAttribute('content') || '').trim() : '';
            return (v && v.length >= 4) ? v : '';
          } catch (e) { return ''; }
        })();
        const dai3 = shiireDetailTitle();
        /* ★2026-08-17 実機の絵で判明: レンズの検索欄が『メルカリ』だけになっており、
           ブランドが入っていなかった。そのためレンズがメルカリ全体から似た画像を探し、
           別ブランド（Jocomomola / fig London など）が混ざっていた。
           ★原因: カインドオルの題は『チェックスカート2S303』のようにブランドを含まない。
           ★直し: 題で取れない時は、ページの本文からも辞書で探す。
           ★検索語は本家と同じ『ブランド メルカリ』。型番があれば型番も足す
             （本家も型番専用の時は型番を入れている）。 */
        /* ★2026-08-17 ユーザー指摘『ブランドは SEVEN TEN by MIHO KAWAHITO であって
           SEVEN TEN ではない』。辞書には『SEVEN TEN』までしか無く、途中で切れていた。
           og:title は『ブランド名(カナ) 商品名 …』の形なので、最初の『(』の前まで
           をブランドとみなす。辞書で取れた物より長ければ、そちらを使う。 */
        const msqKakkoMae = (() => {
          try {
            const v = String(msqOgDai || '');
            const i = v.search(/[(（]/);
            if (i < 2) return '';
            const t = v.slice(0, i).trim();
            /* 日本語だけの物はブランドでなく商品名のことが多いので採らない */
            if (!/[A-Za-z]/.test(t)) return '';
            return (t.length >= 2 && t.length <= 40) ? t : '';
          } catch (e) { return ''; }
        })();
        /* ★2026-08-18 【括弧の中の読み（カタカナ）も取る】。
           ★移植元（拡張機能 スマホ同期用_62-3-5/list_extractor.js:8781〜8784）は
             括弧の【前】と【中】の両方を照合のキーにしている。
             こちらは前だけを取り、目の前にあるカタカナを捨てていた。
             メルカリの題は『アークテリクス』とカナで書く人が多いので、
             これが無いと同じブランドでも一致しない。 */
        const msqKakkoNaka = (() => {
          try {
            const v = String(msqOgDai || '');
            const m = v.match(/[(（]([^)）]{2,30})[)）]/);
            const t = m ? String(m[1]).trim() : '';
            /* 数字や記号だけの括弧書きは読みではない */
            if (!t || !/[ぁ-んァ-ヶ一-龥A-Za-z]/.test(t)) return '';
            return t;
          } catch (e) { return ''; }
        })();
        const msqBrandHonbun = (() => {
          /* Shopsは出品説明の「〇ブランド」直下を一次情報にする。
             英語・カナ・ひらがな・漢字をそのまま保持し、辞書で短縮しない。 */
          if (isShopsHost) return shopsDraftBrand();
          /* ★2026-09-19 実機で確定: Brandearの本文には商品欄の正しい
             「ブランド」(Kate spade)と、検索履歴の「Drawer」が同居する。
             本文全体を brandFromDict に渡すと、商品と無関係な検索履歴の
             Drawerを拾ってしまう。まず商品欄のブランドだけを読む。 */
          try {
            const moji5 = shiireSourceText();
            const lines = String(moji5).split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
            let field = shiireFieldValue(['ブランド', 'ブランド名']);
            if (field) return String(field).replace(/[（(].*$/, '').trim();
            for (let i = 0; i < lines.length; i++) {
              const same = lines[i].match(/^ブランド(?:名)?\s*[:：]\s*(.+)$/i);
              if (same) { field = same[1]; break; }
              if (/^ブランド(?:名)?$/i.test(lines[i])) {
                field = lines[i + 1] || '';
                break;
              }
            }
            if (field) {
              const cleanField = String(field).replace(/[（(].*$/, '').trim();
              /* 構造化された商品欄は正式表記そのもの。辞書の短い先頭一致
                 （Kate spade → KATE）で切らず、欄の全文を使う。 */
              const bField = cleanField;
              if (bField && !/^(?:ブランド|ブランド名|なし|ノーブランド|その他)$/i.test(bField)) return bField;
            }
          } catch (e) { }
          const b1 = brandFromDai(dai3);
          if (msqKakkoMae && msqKakkoMae.length > String(b1 || '').length) return msqKakkoMae;
          if (b1) return b1;
          return '';
        })();
        const brand3 = msqBrandHonbun;
        const msqKataQ = (() => {
          try {
            const c1 = (kataCodes(dai3) || [])[0] || '';
            return c1 || '';
          } catch (e) { return ''; }
        })();
         /* ★2026-09-19 検証結果: 「メルカリ」だけでは画像の似た別ブランドが
            上位5件を占めた。検索語には、辞書が同一系統として確認できる場合だけ
            付加ラインを外した代表ブランドを使う。照合用の brand3 はライン名を
            保持し、検索語の短縮だけで同一ブランド判定を緩めない。 */
         const msqDaihyoBrand = (() => {
           try {
             const raw = String(brand3 || '').trim();
             if (!raw) return '';
             const base = lNorm(raw);
             const ascii = /[A-Za-z]/.test(raw);
             const cand = (lBrandKakikata(raw) || []).filter((v) => {
               const x = String(v || '').trim();
               const nx = lNorm(x);
               if (!x || nx.length < 4 || nx.length >= base.length) return false;
               if (ascii !== /[A-Za-z]/.test(x)) return false;
               return base.indexOf(nx) === 0;
             }).sort((a, b) => lNorm(b).length - lNorm(a).length);
             return String(cand[0] || raw).trim();
           } catch (e) { return String(brand3 || '').trim(); }
         })();
         const q = ((msqDaihyoBrand ? msqDaihyoBrand + ' ' : '') + 'メルカリ').trim();
        try { if (msqKataQ) { /* 検索語には使わない（上の説明を参照） */ } } catch (e) { }
        lb.textContent = '写真を読んでいます…';
        kataTsukatta();
        lensImageBlob(img2).then((got) => {
          if (!got || !got.blob) {
            /* ★理由を出す。黙って「読めず」だけだと原因を推測することになる。 */
            let riyuu = '';
            try {
              if (window.MsqApp && window.MsqApp.lastError) riyuu = window.MsqApp.lastError() || '';
            } catch (e) { }
            lb.textContent = riyuu ? ('写真×' + riyuu.slice(0, 24)) : '写真を読めず';
            try { console.warn('[MSQ/レンズ] 画像を読めず: ' + riyuu + ' / ' + img2); } catch (e) { }
            return;
          }
          /* 戻り先と仕入元の情報を、画面をまたいでも残る window.name に持たせる。
             ★no-referrer で referrer が消えるため、目印は window.name と msqfrom の二重。 */
          /* ★jotai4 は try の外で宣言する。中で const にすると、
             try の外から使った時に『定義されていない』で落ちる
             （node --check は通るので気づけない。実機で初めて出る型）。 */
          let jotai4 = '{}';
          try {
            /* ★仕入値・ランク・写真も渡す（2026-08-14）。
               これが無いとレンズ側で利益が出せず、止める判定もできない。
               ランクは本家と同じ「商品の状態 : 中古B」の形から拾う。 */
            /* ★2026-08-17 ここが「結果ツールに利益も仕入元の写真も情報も出ない」の真因。
               もとは moji を読んでいたが、moji は【そのままボタンの中】で宣言された物で、
               この【レンズボタンの中】からは見えない（ブロックまたぎ）。
               毎回 ReferenceError: moji is not defined で落ち、すぐ下の catch(e){} が
               握りつぶすため、jotai4 が '{}' のまま送られていた。
               ＝仕入値も写真も題もブランドもランクも、1つもレンズ側へ渡っていなかった。
               ★実機の証拠(2026-08-17・端末の版R84): 進行の記録の鍵は全部揃っているのに
                 cost=0 / img無し / dai無し / brand無し / rank無し / hitsuyou=0 だった。
                 ＝lensStart は動いている(TDZは直っている)が、渡された中身が空。
               ★直し方: この枠の中で自分でページの文字を読む。他の枠の物を借りない。 */
            const moji4 = shiireSourceText();
            const rank4 = rankFromShiirePage(moji4);
            const price4 = lensSourcePrice();
            /* ★2026-08-17 ユーザー指示『タイトル、そこで取れないなら本文、
               そこでも取れないなら型番欄』。レンズを押す時は仕入元の詳細ページに
               いるので、本文も型番欄もその場で読める（通信は増えない）。
               ★実機の証拠: 題が『チェックスカート2S303』のように日本語とくっついていると
                 タイトルからは1つも抜けなかった（kataCodes が空を返す）。
                 その場合に本文・型番欄まで見に行く。 */
            /* ★2026-08-17 ユーザー指示:
                 『型番が見つからなければ3つの場所を見る。
                   型番らしきものが見つかれば3つ見て照合する』
               ★3か所（タイトル／本文／型番欄）から候補を取り、
                 2か所以上で同じ物が出たら、それを本物とみなす（照合）。
                 揃わなければ【型番欄→タイトル→本文】の順に採る。
                 型番欄は『型番：』と書かれた欄なので、本文から拾うより確かなため。
               ★実機の証拠: カインドオル『ポインテール カーディガン6203703』は
                 タイトル=空／本文=I18n（誤り）／型番欄=6203703（正解）だった。 */
            let model4 = '';
            try {
              const c0 = isShopsHost ? shopsDraftModel() : '';             /* Shops: 〇品番の直下 */
              const c1 = kataFromShiireTitle(dai3) || '';                  /* ① タイトル */
              const c2 = kataSpecOK(kataDtValue(document, ['型番', '品番', 'モデル番号'])) || '';
              /* 本文全体はサイトの計測文字列や前の商品を含むため読まない。 */
              /* 本文全体の英数字（管理番号・CSS名・別商品の型番）を多数決に
                 入れると、商品自身の型番欄を短い断片で上書きする。PC側と同じく
                 商品自身のタイトル／型番欄／説明ラベルだけを使う。 */
              /* Shopsは「〇品番」直下だけを使う。通常サイトは従来順を維持。 */
              model4 = isShopsHost ? c0 : (c1 || c2 || '');
            } catch (e) { }
            /* ★2026-08-17 ユーザー指示『同じブランド・同じカテゴリー（＝同じ商品）で止めろ』。
               レンズ側でカテゴリー照合をするために、仕入元のカテゴリーもここで渡す。
               取り方は上の CATEGORY_TOKENS に当たる一番長い語（「デニムパンツ」と「パンツ」なら前者）。 */
            let cat4 = '';
            try {
              const moji6 = String(dai3 || '');
              for (let i = 0; i < CATEGORY_TOKENS.length; i++) {
                const tk = CATEGORY_TOKENS[i];
                if (moji6.indexOf(tk) >= 0 && tk.length > cat4.length) cat4 = tk;
              }
            } catch (e) { }
            jotai4 = JSON.stringify({
              back: location.href, dai: dai3, brand: brand3, model: model4, cat: cat4,
              /* ★ブランドの読み（カタカナ）。移植元と同じく、照合の2つ目のキーにする */
              brandKana: msqKakkoNaka,
              cost: String(price4).replace(/,/g, ''), rank: rank4, img: img2
            });
          } catch (e) { }
          /* ★2026-08-15 アプリ側の置き場にも預ける。
             window.name は POST＋Googleのリダイレクトを通ると消えることを実機で確認した
             （着地直後の window.name が空だった）。HTMLの中で入れる分はそのまま残し、
             こちらは保険。両方あればどちらかが生きる。 */
          try {
            if (window.MsqApp && typeof window.MsqApp.msqSave === 'function') {
              window.MsqApp.msqSave('msqstate', jotai4);
            }
          } catch (e) { }
          const ok = lensPost(got.blob, lensActionUrl(q, ''), location.href, got.b64, jotai4);
          if (!ok) lb.textContent = '送れず';
          else lb.textContent = isShopsHost ? '🛍 相場' : 'レンズ';   /* 自分の画面は残るので文字を戻す */
        }).catch(() => { lb.textContent = '写真を読めず'; });
      });
      document.body.appendChild(lb);

      /* ★Cookieの削除（2026-08-13 ユーザー要望）。
         セカストの Access Denied は Cookie を消すと直ることがある。
         ★【このサイトの分だけ】消す。全部消すとメルカリのログインまで消える。
         ★押し間違い防止に2回押し。1回目は確認、5秒で元に戻る。 */
      /* ★2026-08-13 ユーザー指示「通常は押せないように、押したときだけ出現」。
         画面の縦中央・右端に「＋」を置き、押した時だけCookieのボタンを出す。
         間違って触らないよう、普段は存在しない。 */
      if (document.getElementById('msq-plus')) return;
      let cbKakunin = false;
      const pb = document.createElement('button');
      pb.id = 'msq-plus';
      pb.dataset.msqUri = '1';
      pb.textContent = '＋';
      pb.style.cssText = 'position:fixed;right:4px;top:50%;transform:translateY(-50%);'
        + 'z-index:2147483000;width:28px;height:28px;border:none;border-radius:14px;'
        + 'background:rgba(71,85,105,.55);color:#fff;font:700 16px/1 system-ui;'
        + 'cursor:pointer;padding:0;';
      document.body.appendChild(pb);

      const cb = document.createElement('button');
      cb.id = 'msq-cookie';
      cb.dataset.msqUri = '1';
      cb.textContent = 'Cookie';
      cb.style.cssText = 'position:fixed;right:38px;top:50%;transform:translateY(-50%);'
        + 'z-index:2147483000;display:none;'
        + 'background:rgba(71,85,105,.92);color:#fff;font:700 12px/1.5 system-ui;'
        + 'padding:4px 10px;border:none;border-radius:6px;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer;';
      pb.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const deteru = (cb.style.display !== 'none');
        cb.style.display = deteru ? 'none' : 'block';
        pb.textContent = deteru ? '＋' : '×';
        if (deteru) { cbKakunin = false; cb.textContent = 'Cookie'; }
      });
      cb.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!cbKakunin) {
          cbKakunin = true;
          cb.textContent = 'このサイトのCookieを消す？';
          setTimeout(() => {
            try { if (cb.isConnected && cbKakunin) { cbKakunin = false; cb.textContent = 'Cookie'; } } catch (e) { }
          }, 5000);
          return;
        }
        cbKakunin = false;
        try {
          if (window.MsqApp && window.MsqApp.clearCookies) {
            const n = window.MsqApp.clearCookies(location.href);
            cb.textContent = (n >= 0) ? ('消した ' + n + '件・読み直します') : '消せず';
            if (n >= 0) setTimeout(() => { try { location.reload(); } catch (e) { } }, 900);
            return;
          }
        } catch (e) { }
        cb.textContent = '窓口が無い';
      });
      document.body.appendChild(cb);
    };

    /* Shopsでは一覧に追加ボタンを一つも出さず、詳細にも通常サイト用の
       型番札・Cookie・辞書を出さない。「相場」「そのまま」だけを詳細に残す。 */
    const shopsListRemoveExtras = () => {
      try {
        if (!isShopsHost) return;
        document.querySelectorAll('#msq-hotdict-btn').forEach((el) => el.remove());
        /* 公開商品の詳細も、下書き編集と同じく
           「🛒そのまま」→型番のみ／ブランド＋型番の選択式を残す。
           商品一覧だけは補助ボタンを出さない。 */
        const shopsProductDetailPage = shosaiPage()
          || /\/products\/[^/]+\/?$/.test(location.pathname || '');
        if (shopsProductDetailPage) {
          document.querySelectorAll('#msq-kata-fuda,#msq-plus,#msq-cookie').forEach((el) => el.remove());
          return;
        }
        document.querySelectorAll(
          '.msq-uri[data-msq-goal-fuda="1"],.msq-kata,.msq-copy-t,.msq-sonomama-t,.msq-hako,'
          + '#msq-sonomama,#msq-lens,#msq-kata-fuda,#msq-hotdict-btn,#msq-plus,#msq-cookie,'
          + '#msq-lens-obi,#msq-lens-panel'
        ).forEach((el) => el.remove());
      } catch (e) { }
    };

    const hajimeru = () => {
      try { tsuke(); } catch (e) { }
      try { if (isShopsHost && typeof window.__msqMarkShopsOptionalBadges === 'function') window.__msqMarkShopsOptionalBadges(); } catch (e) { }
      try { shopsListRemoveExtras(); } catch (e) { }
      try { sourceMetaRefresh(); } catch (e) { }
      try { shosaiKata(); } catch (e) { }
      try { sonomama(); } catch (e) { }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hajimeru);
    else hajimeru();
    /* 後から描かれる作りのサイトがあるので、何度か見に行く */
    setTimeout(hajimeru, 1500);
    setTimeout(hajimeru, 3500);
    setInterval(hajimeru, 2000);
  }

  /* ==========================================================================
     レンズ検索（第2段・第3段）2026-08-14
     ユーザー指定の流れ:
       レンズ結果を出す → 画像をゆっくりスクロールして集める → 下にボタンが出る
       → 押すとメルカリを1枚ずつ開く
       → 「仕入値を割っている」または「利益1000円未満」が【2件】たまった時点で止まる
       → その2件の画像と価格を出し、続行するか選ばせる（押さない限り止まったまま）
       → 続行を押せば再開し、また2件たまれば止まる。これを最後まで繰り返す
       → 最後まで行ったら、画像と情報を並べる
       → 下の半透明の紫ボタンで、最後の結果ツールを出す
     ★止めるだけで捨てない。数字を全部出す（私の判定が間違っていれば目で分かるように）。
     ★利益の計算・状態の扱いは本家（list_extractor.js / msq_core.js）と同じ:
         手数料 仕入770 / 送料750 / 販売10% / 外注500
         売り切れがある → 高値・安値・平均×0.98 の3つ
         売り切れが無い → 販売中の最安値だけ（参考値）
         対象は【仕入元と同じ状態】に限る。他の状態へは広げない
         状態の並び new/likenew/good/fair/poor/bad/unknown（この順が仕様）
     ★人が動かす速さを守る。レンズは2026-08-01に実際に弾かれた実績がある。
     ========================================================================== */

  /* 仕入元のランク → メルカリの状態（本家 SHOP_RANK_TO_COND と同じ） */
  function lCondFromRank(r) {
    const t = String(r || '').replace(/[\s　]/g, '');
    if (!t) return '';
    if (LRANK_TO_COND[t]) return LRANK_TO_COND[t];
    const keys = Object.keys(LRANK_TO_COND);
    for (let i = 0; i < keys.length; i++) if (t.indexOf(keys[i]) >= 0) return LRANK_TO_COND[keys[i]];
    return '';
  }
  /* メルカリの状態の文字 → 内部の区分（本家 condKeyLoose と同じ考え方） */
  function lCondKey(c) {
    const t = String(c || '');
    if (!t) return 'unknown';
    if (/新品[、,・\s]?\s*未使用/.test(t)) return 'new';
    if (/未使用に近い/.test(t)) return 'likenew';
    if (/目立った傷や汚れなし/.test(t)) return 'good';
    if (/やや傷や汚れあり/.test(t)) return 'fair';
    if (/傷や汚れあり/.test(t)) return 'poor';
    if (/全体的に状態が悪い/.test(t)) return 'bad';
    return 'unknown';
  }
  function lProfit(sell, cost) {
    const s = Number(sell) || 0, c = Number(cost) || 0;
    const sellFee = s * LFEE.sellRate;
    return Math.round(s - c - LFEE.purchase - LFEE.shipping - sellFee - LFEE.outsource);
  }

  /* 進行の記録。画面をまたいでも残るよう sessionStorage に置く。
     ★window.name は仕入元から渡された状態（MSQSTATE:）が入っているので、
       レンズ側で1回だけ読んで、すぐ空にする（本家と同じ。残すと次の商品で使い回す）。 */
  /* ★進行の記録は window.name に持つ（2026-08-14 実機で直した）。
     最初は sessionStorage に置いていたが、あれは【サイトごとに別々】。
     google.com で書いた記録は jp.mercari.com へ移った瞬間に読めなくなり、
     紫のボタンを押しても記録が無く、黙って終わっていた（実機で確認）。
     本家がURLに全部載せているのは、まさにこれが理由。
     window.name はサイトをまたいでも同じタブなら残るので、そちらに持つ。
     ★仕入元から来た情報（MSQSTATE:）とは別の目印（MSQRUN:）にする。 */
  function lStateRead() {
    try {
      const n = (typeof window.name === 'string') ? window.name : '';
      if (n.indexOf(LRUN) === 0) return JSON.parse(n.slice(LRUN.length) || 'null');
    } catch (e) { }
    return null;
  }
  function lStateWrite(o) {
    try {
      let t = JSON.stringify(o);
      /* ★大きくなりすぎたら、見終わった分の題と写真を削って軽くする。
         数と価格と状態は残す（利益の計算に要るため）。
         見積もり: 29件で約9,900文字。余裕はあるが歯止めは置く。 */
      if (t.length > 400000 && o.mita && o.mita.length) {
        o.mita.forEach(function (r) { r.img = ''; r.name = String(r.name || '').slice(0, 20); });
        t = JSON.stringify(o);
      }
      window.name = LRUN + t;
    } catch (e) { }
  }
  function lSrcRead() {
    /* 仕入元から渡された情報を1回だけ受け取る（本家と同じ。読んだら空にする） */
    try {
      const n = (typeof window.name === 'string') ? window.name : '';
      if (n.indexOf('MSQSTATE:') === 0) {
        const v = JSON.parse(n.slice('MSQSTATE:'.length) || '{}');
        try { window.name = ''; } catch (e) { }
        return v;
      }
    } catch (e) { }
    /* ★2026-08-15 window.name が消えている時はアプリ側の置き場から拾う。
       POST＋Googleのリダイレクトを通ると window.name が消えることを実機で確認した。
       これが無いと仕入値も写真も届かず、利益が出せない。
       ★読んだら消す（次の商品で使い回さないため。本家と同じ考え方）。 */
    try {
      if (window.MsqApp && typeof window.MsqApp.msqLoad === 'function') {
        const t = String(window.MsqApp.msqLoad('msqstate') || '');
        if (t) {
          const v2 = JSON.parse(t);
          try { window.MsqApp.msqSave('msqstate', ''); } catch (e) { }
          return v2;
        }
      }
    } catch (e) { }
    return null;
  }

  /* ===== レンズ結果を集める =====
     ★ゆっくり送る（ユーザー指示「画像をゆっくりスクロールしてサーチ」）。
       1回に1画面ぶんだけ送り、増えなくなったら止める。
       速く回すと弾かれる（2026-08-01の実績）。 */
  /* ★2026-08-14 作り直した。最初は「外部サイトのリンクを無差別に拾う」作りにしていたが、
     本家（list_extractor.js の extractMercariUrls）を読んだところ
     【メルカリの商品IDだけを拾う】のが正しい実装だった。他サイトは最初から拾わない。
     探し方も本家と同じ9通りをそのまま写す（1つでも欠けると取りこぼす）。 */
  /* ===== ブランド／カテゴリーの照合（2026-08-17 新規） =====
     ★ユーザー指示『違うブランド・違うカテゴリーで止まるな。同じブランド同じカテゴリー
       （つまり同じ商品）で止めろ』。
     ★レンズ結果のタイルでも、メルカリの商品ページでも、同じ物差しで見る。
     ★答えは3つ: true=同じ / false=違う / null=判断できない（材料が無い）。
       null を「違う」として扱うと材料が無いだけの物まで消えるので、必ず分けて返す。 */
  function lNorm(s) {
    return String(s || '').toUpperCase().replace(/[\s　_\-・.'"”“’‘]/g, '');
  }
  /* ===== ブランドの【英語⇔日本語⇔カナ】をそろえる（2026-08-18 新規） =====
     ★実機『レンズ結果後に辞書照合が入ってない。まだ別ブランドがメルカリで検索されてる』。
     ★真因: lBrandAu は仕入元のブランド（英語表記）と、メルカリの題を
       そのまま突き合わせていた。メルカリの題は『アークテリクス』のようにカナで書く人が多く、
       ARC'TERYX とは1文字も一致しない。だから【同じブランドなのに違う】と判定され、
       照合が効いていないように見えていた。
     ★直し: brand.csv の [英語, 日本語, カナ] を使って、書き方の違いを全部ためす。
       ・メルカリの画面では localStorage の msq_raw_brands（rawBrandLoad が貯めた物）
       ・レンズの画面ではそれが無いので、アプリの共通の置き場から読む
         （3画面共通。一度メルカリ側で引けたブランドはそこへ預けておく）
     ★通信は増やさない。すでに貯めてある物を読むだけ。 */
  let lBrandHyo = null;
  function lBrandHyoYomu() {
    if (lBrandHyo !== null) return lBrandHyo;
    lBrandHyo = [];
    try {
      const c = JSON.parse(localStorage.getItem('msq_raw_brands') || 'null');
      if (c && c.v && c.v.length) lBrandHyo = c.v;
    } catch (e) { }
    return lBrandHyo;
  }
  function lBrandKakikata(b) {
    const out = [b];
    const tasu = (x) => { if (x && out.indexOf(x) < 0) out.push(x); };
    /* ① まず、前に調べて預けてある分を見る（レンズの画面でも読める） */
    try {
      const t = rawKoyuuLoad('BRANDPAIR:' + lNorm(b));
      if (t) { String(t).split('	').forEach(tasu); return out; }
    } catch (e) { }
    /* ② 辞書から探す（メルカリの画面ならここで取れる） */
    try {
      const hyo = lBrandHyoYomu();
      const B = lNorm(b);
      if (B.length >= 2) {
        for (let i = 0; i < hyo.length; i++) {
          const r = hyo[i] || [];
          const en = lNorm(r[0] || ''), ja = lNorm(r[1] || ''), ka = lNorm(r[2] || '');
          if ((en && en === B) || (ja && ja === B) || (ka && ka === B)
              || (en.length >= 4 && B.indexOf(en) === 0)) {
            tasu(r[0]); tasu(r[1]); tasu(r[2]);
          }
        }
      }
      /* 取れたら預ける。次はレンズの画面からでも使える */
      if (out.length > 1) { try { rawKoyuuSave('BRANDPAIR:' + lNorm(b), out.join('	')); } catch (e) { } }
    } catch (e) { }
    return out;
  }
  function lBrandAu(moji, st) {
    const b0 = String((st && st.brand) || '').trim();
    if (!b0 || b0.length < 2) return null;        /* 仕入元のブランドが無ければ判定しない */
    const T = lNorm(moji);
    if (!T) return null;                          /* 相手の文字が無ければ判定しない */
    /* 型番が一致していれば、ブランドの書き方が違っても同じ商品（本家と同じ考え方） */
    const M = lNorm((st && st.model) || '');
    if (M.length >= 4 && T.indexOf(M) >= 0) return true;
    /* ★2026-08-18 英語・日本語・カナの全部の書き方でためす。
       メルカリの題は『アークテリクス』のようにカナで書く人が多く、英語表記のままでは
       1文字も一致しない。これが【照合が効いていなかった真因】。 */
    const kaki = lBrandKakikata(b0);
    /* ★仕入元の題にあった読み（カタカナ）も必ずキーに入れる。移植元と同じ考え方。
       辞書が読めていない時でも、これだけで『アークテリクス』に当たる。 */
    try {
      const kn = String((st && st.brandKana) || '').trim();
      if (kn.length >= 2 && kaki.indexOf(kn) < 0) kaki.push(kn);
    } catch (e) { }
    for (let n = 0; n < kaki.length; n++) {
      const b1 = String(kaki[n] || '').trim();
      if (b1.length < 2) continue;
      const B = lNorm(b1);
      if (B && T.indexOf(B) >= 0) return true;
      /* 『SEVEN TEN by MIHO KAWAHITO』のように長いブランドは、相手が途中までしか
         書いていないことがある。先頭2語・先頭1語でも見る（4文字以上に限る）。 */
      const go = b1.split(/[\s　]+/).filter((x) => x.length >= 2);
      if (go.length >= 2) {
        const B2 = lNorm(go[0] + go[1]);
        if (B2.length >= 4 && T.indexOf(B2) >= 0) return true;
      }
      if (go.length >= 1) {
        const B1 = lNorm(go[0]);
        if (B1.length >= 4 && T.indexOf(B1) >= 0) return true;
      }
    }
    /* Lens結果側で英語・日本語・カナの対応表をまだ持てていない時は、
       表記が違うだけの同一ブランドを「不一致」と確定してはいけない。
       確認できる別表記が無い状態は判断不能として残す。 */
    const hasAlternative = kaki.some((x) => {
      const k = lNorm(x);
      return k && k !== lNorm(b0);
    });
    return hasAlternative ? false : null;
  }
  /* 文字からカテゴリーを1つ取る（当たる中で一番長い語。デニムパンツ と パンツ なら前者） */
  function lCatNo(moji) {
    let c = '';
    try {
      const t = String(moji || '');
      for (let i = 0; i < CATEGORY_TOKENS.length; i++) {
        const tk = CATEGORY_TOKENS[i];
        if (t.indexOf(tk) >= 0 && tk.length > c.length) c = tk;
      }
    } catch (e) { }
    return c;
  }
  function lCatAu(moji, st) {
    const c0 = String((st && st.cat) || '').trim();
    if (!c0) return null;                         /* 仕入元のカテゴリーが無ければ判定しない */
    const c1 = lCatNo(moji);
    if (!c1) return null;                         /* 相手のカテゴリーが読めなければ判定しない */
    if (c0 === c1) return true;
    if (c0.indexOf(c1) >= 0 || c1.indexOf(c0) >= 0) return true;   /* デニムパンツ↔パンツ */
    return false;
  }

  /* ===== レンズのタイルから「在庫あり」バッジ・値段・文字を拾う（2026-08-17 新規） =====
     ★ユーザー指示『先にレンズ結果の段階で売り切れと販売中に分けろ』。
     ★取り方は本家 スマホ同期用_62-3-5/list_extractor.js:9282 の msqFindTileContainer /
       リンクから上へ辿り、商品リンクが2本以上になる1つ手前を「1件ぶんの箱」とみなす。
     ★リンクが取れないID（HTMLの文字だけから拾った物）は、箱が無いので分からない。
       その時は『在庫ありバッジ無し』＝売り切れ側として先に回す（開けば本当の状態が分かる）。 */
  function lTileOya(a) {
    let hako = a.parentElement, el = hako;
    for (let d = 0; d < 10 && el && el.parentElement; d++) {
      const oya = el.parentElement;
      try { if (oya.querySelectorAll('a[href*="mercari.com"]').length > 1) break; } catch (e) { break; }
      hako = oya; el = oya;
    }
    return hako;
  }
  function lensTairuJouhou(list) {
    const map = {};
    try {
      document.querySelectorAll('a[href]').forEach((a) => {
        let dec = a.href || '';
        try { dec = decodeURIComponent(dec); } catch (e) { }
        const m = dec.match(/mercari\.com\/item\/(m\d{10,})/);
        if (!m || map[m[1]]) return;
        const tile = lTileOya(a);
        if (!tile) return;
        let txt = '';
        try { txt = String(tile.innerText || '').slice(0, 300); } catch (e) { }
        let ne = 0;
        const pm = txt.match(/[¥￥]\s*([0-9][0-9,]{2,})/);
        if (pm) ne = parseInt(String(pm[1]).replace(/,/g, ''), 10) || 0;
        map[m[1]] = { txt: txt, zaiko: /在庫あり/.test(txt), ne: ne };
      });
    } catch (e) { }
    list.forEach((r) => {
      const v = map[r.id];
      r.txt = v ? v.txt : '';
      r.zaiko = v ? v.zaiko : false;
      r.ne = v ? v.ne : 0;
    });
    return list;
  }

  function lensHirouIds(mita, out) {
    let fueta = 0;
    const tasu = (id) => {
      /* Lens画面からアプリが取得する対象は、Lens全体の上位5件だけ。
         ここで止めないと、ボタン表示が「31件」のように全件になり、
         後段で5件へ切ってもユーザーには全件取得に見える。 */
      if (out.length >= 5) return;
      if (!id || !/^m\d{10,}$/.test(id)) return;
      if (mita[id]) return;
      mita[id] = 1;
      /* Lensの並び順は画像一致の強さを持つ。後段で商品名だけに頼らず使う。 */
      out.push({ id: id, url: 'https://jp.mercari.com/item/' + id, lensRank: out.length });
      fueta++;
    };
    let html = '';
    try { html = (document.body && document.body.innerHTML) || ''; } catch (e) { }
    /* ①〜⑥ HTMLの文字から（生・URLエンコード・二重エンコード・JSONのitemId/id） */
    const patterns = [
      /https?:\/\/(?:jp\.|www\.)?mercari\.com\/item\/(m\d{10,})/g,
      /mercari\.com[%/]item[%/](m\d{10,})/gi,
      /mercari(?:\.|%2E)com(?:\/|%2F)item(?:\/|%2F)(m\d{10,})/gi,
      /jp%2Emercari%2Ecom%2Fitem%2F(m\d{10,})/gi,
      /"itemId"\s*:\s*"(m\d{10,})"/g,
      /"id"\s*:\s*"(m\d{10,})"/g
    ];
    for (let i = 0; i < patterns.length; i++) {
      const re = patterns[i]; let m;
      re.lastIndex = 0;
      while ((m = re.exec(html)) !== null) tasu(m[1]);
    }
    /* ⑦ リンクや data 属性から */
    try {
      document.querySelectorAll('a[href], [data-url], [data-action-url]').forEach((a) => {
        const href = a.href || a.getAttribute('href') || '';
        const dataHref = a.getAttribute('data-action-url') || a.getAttribute('data-url') || a.getAttribute('ping') || '';
        [href, dataHref].forEach((u) => {
          if (!u) return;
          let dec = u; try { dec = decodeURIComponent(u); } catch (e) { }
          const m = dec.match(/mercari\.com\/item\/(m\d{10,})/);
          if (m) tasu(m[1]);
        });
      });
    } catch (e) { }
    /* ⑧ Googleの中継リンクを復号 */
    try {
      document.querySelectorAll('a[href*="google.com/url"], a[href*="/url?"], a[href*="imgres"]').forEach((a) => {
        const href = a.href || '';
        const pr = /[?&](?:url|q|imgrefurl|ru|target)=([^&]+)/g; let pm;
        while ((pm = pr.exec(href)) !== null) {
          try {
            const dec = decodeURIComponent(pm[1]);
            const m = dec.match(/mercari\.com\/item\/(m\d{10,})/);
            if (m) tasu(m[1]);
          } catch (e) { }
        }
      });
    } catch (e) { }
    /* ⑨ 引用表示（cite など）の文字から */
    try {
      document.querySelectorAll('cite, [class*="url"], [class*="cite"], [class*="source"], [class*="domain"]').forEach((el) => {
        const m = (el.textContent || '').match(/mercari\.com\/item\/(m\d{10,})/);
        if (m) tasu(m[1]);
      });
    } catch (e) { }
    return fueta;
  }

  function lensAtsumeru(done) {
    /* ★2026-08-14 本家（list_extractor.js の msqFindScrollTargets /
       msqHumanScrollBurst / scrapeLensForMercari）と同じ送り方に直した。
       それまでは1画面ぶんを1.5秒ごとに【一気に】飛ばしていたため、
         ・画面がカクカク動く（ユーザー指摘「スクロールが滑らかでない」）
         ・本家コメントの言うとおり「本当に読み込む時間」を与えられていない
       ★本家に合わせた点は3つ:
         ① 送る先を探す … レンズのモバイル版は、ページ全体ではなく内側の枠だけが
            動くことがある。その時 window.scrollTo をいくら呼んでも1mmも動かない。
            overflow-y が auto/scroll で、中身がはみ出している枠を最大5つまで探して
            一緒に送る。
         ② 小刻みに送る … 1回に260〜620pxぶんを、12〜28pxずつ・刻みごとに30〜70ms待って送る。
         ③ 終わりの判定 … 「一番下に着いている」かつ「集まった件数が変わらない」が
            3回続いた時だけ終わる。下に着いていなければ、増えなくても続ける。 */
    const out = [], mita = {};
    let kai = 0, onaji = 0, mae = -1;
    lensHirouIds(mita, out);
    /* ★2026-08-17 実測（3ページ: 9件/27件/14件）で、スクロールの前と後で
       拾えるIDの【集合が完全に一致】した（増えたID0件・消えたID0件）。
       理由: こちらはHTML全体を正規表現で見るので、画面に描かれていなくても1回で全部拾える。
       （本家は画面のタイルを見るため、仮想スクロールで消える分をスクロールで集める必要があった）
       ★よって「1回送って増えなければ即終わる」。増えるページのために確認は残す。 */
    const msqHajimeNo = out.length;

    /* ① 送る先を探す（本家 msqFindScrollTargets と同じ） */
    const mato = [{
      okuru: (y) => window.scrollTo(0, y),
      takasa: () => document.documentElement.scrollHeight
    }];
    try {
      const zen = document.querySelectorAll('body *');
      let n = 0;
      for (let i = 0; i < zen.length && n < 5; i++) {
        const el = zen[i];
        if (el.scrollHeight - el.clientHeight < 100) continue;
        let ov = '';
        try { ov = getComputedStyle(el).overflowY; } catch (e) { continue; }
        if (!/auto|scroll/.test(ov)) continue;
        mato.push({
          okuru: (y) => { el.scrollTop = y; },
          takasa: () => el.scrollHeight,
          ima: () => el.scrollTop,
          hiro: () => el.clientHeight
        });
        n++;
      }
    } catch (e) { }

    const ran = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ② 小刻みに送る（本家 msqHumanScrollBurst と同じ） */
    const okuru = async (kyori) => {
      let nokori = kyori;
      while (nokori > 0) {
        const t = Math.min(nokori, ran(12, 28));
        try { window.scrollBy(0, t); } catch (e) { }
        nokori -= t;
        await nemuru(ran(30, 70));
      }
    };

    const shita = () => {
      try {
        const h = Math.max(document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0);
        return (window.scrollY + window.innerHeight) >= (h - 20);
      } catch (e) { return true; }
    };

    /* ★2026-09-19 ユーザー指示:
         「1回目のスクロールは良いが、そこで止めた際に2回目のスクロールは入れない」
       Lensモバイル版はdocumentではなく内側の枠だけが動くことがあるため、
       window.scrollYだけでなく、見つけた内側のスクロール枠も最下部か確認する。
       1回目で最下部へ着いた時は、その回の収集結果を確定して2回目へ進まない。
       まだ最下部でない場合だけ、従来どおり次のスクロールを許可する。 */
    const ichidomeSoko = () => {
      if (shita()) return true;
      if (mato.length <= 1) return false;
      try {
        return mato.slice(1).every((x) =>
          typeof x.ima === 'function' && typeof x.hiro === 'function'
            && (x.ima() + x.hiro()) >= (x.takasa() - 20));
      } catch (e) { return false; }
    };

    /* ★2026-08-17 ユーザー指摘『レンズ結果のスクロールが止まらん！4回目！』。
       ★真因（コードで確認した。推測ではない）:
         出口が「shita()（＝一番下に着いている）かつ 増えない が3回」しか無く、
         shita() は window.scrollY で見ている。レンズが【内側の枠】を動かす画面では
         window.scrollY が0のまま動かないため、shita() が永久に false になり、
         増えていなくても最大150周まわり続けていた。
       ★直し方は3つ。どれか1つに当たれば必ず着地する。
         ① 一番下に着いているかに関係なく、3回続けて増えなければ終わる
         ② 一番下に着いていて1回増えなければ終わる（今までどおり、ただし3回→1回）
         ③ 何があっても25秒で終わる（着地したことを測るのが目的なので、待たせない）
       ★周回の上限も 150 → 30 に下げる。1周およそ1秒なので、①②③のどれよりも遅い。 */
    const msqHajimeToki = Date.now();
    (async () => {
      await nemuru(ran(500, 1100));
      while (kai < 30) {
        kai++;
        await okuru(ran(260, 620));
        /* 内側の枠は小刻みにせず一番下まで送る（本家と同じ。見つかること自体が稀なため） */
        for (let i = 1; i < mato.length; i++) {
          try { mato[i].okuru(mato[i].takasa()); } catch (e) { }
        }
        await nemuru(ran(120, 380));
        if (Math.random() < 0.12) await nemuru(ran(350, 900));
        lensHirouIds(mita, out);
        try {
          const o = document.getElementById('msq-lens-obi');
          if (o) o.textContent = 'レンズの結果を集めています… ' + out.length + '件（' + kai + '回目）';
        } catch (e) { }
        /* ③ 終わりの判定（本家と同じ）。
           比べるのは「その瞬間の数」ではなく【ここまでに集まった合計】。
           レンズは画面外の古いタイルをDOMから消すので、その瞬間の数だけ見ると
           新しい物を見つけていても増えて見えないことがある（本家のコメントに実績あり）。 */
        /* ★1回目で最下部に着いたら、そこで確定して2回目を送らない。 */
        if (kai === 1 && ichidomeSoko()) break;
        /* ★1回送って1件も増えないなら、このページは最初から全部入っている。すぐ終わる。 */
        if (kai === 1 && out.length === msqHajimeNo) break;
        if (out.length === mae) onaji++; else onaji = 0;
        mae = out.length;
        if (onaji >= 3) break;                              /* ① 増えない */
        if (shita() && onaji >= 1) break;                   /* ② 下に着いていて増えない */
        if (Date.now() - msqHajimeToki > 25000) break;      /* ③ 25秒で必ず終わる */
      }
      done(out);
    })();
  }

  /* ===== Lens結果を「見た目で一致」に固定する =============================
     Google Lensは初期表示が「すべて」のため、全経路で同じ視覚一致の結果を
     読むようにする。通常仕入れ・逆引き・仕入れサイト別の違いは、ここへ
     到達する前の入口だけで、結果画面の読み取りは共通。 */
  function lensMitatameIchi(done) {
    let kai = 0, owatta = false;
    const finish = () => {
      if (owatta) return;
      owatta = true;
      done();
    };
    const t = setInterval(() => {
      kai++;
      let eranda = false;
      try {
        const els = document.querySelectorAll('button,[role="tab"],[role="button"],a');
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const txt = String(el.textContent || '').replace(/[\s　]+/g, ' ').trim();
          const ari = String(el.getAttribute('aria-label') || '').replace(/[\s　]+/g, ' ').trim();
          const title = String(el.getAttribute('title') || '').replace(/[\s　]+/g, ' ').trim();
          const s = txt + ' ' + ari + ' ' + title;
          if (!/(?:見た目\s*で\s*一致|視覚的\s*に\s*一致|visual\s+matches)/i.test(s)) continue;
          const selected = el.getAttribute('aria-selected') === 'true'
            || el.getAttribute('data-selected') === 'true'
            || /選択中|selected/i.test(s);
          if (!selected) {
            try { el.click(); } catch (e) {
              try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e2) { }
            }
          }
          eranda = true;
          break;
        }
      } catch (e) { }
      if (eranda) {
        clearInterval(t);
        lensObi('見た目で一致でレンズ結果を取得しています…');
        setTimeout(finish, 700);
        return;
      }
      /* 画面の描画待ち。ここで別モードのまま読み始めない。 */
      if (kai >= 30) {
        clearInterval(t);
        lensObi('「見た目で一致」を確認できないため、レンズ結果の取得を停止しました');
      }
    }, 200);
  }

  /* ===== メルカリの商品ページから中身を読む =====
     ★本家は DOM から 状態/状態区分/サイズ/日付/本文の型番 を拾っている。
       アプリは props.item から同じ項目を一度に読める（一覧タイルで実証済み）。
       読む項目は本家と同じ。出どころだけ確実な方に変えている。 */
  function lItemData() {
    let mi = null, mita = 0;
    try {
      const els = document.querySelectorAll('div,main,section,article');
      for (let i = 0; i < els.length && !mi && mita < 400; i++) {
        const el = els[i];
        let kagi = null;
        for (const k in el) { if (k.indexOf('__reactFiber$') === 0) { kagi = k; break; } }
        if (!kagi) continue;
        mita++;
        let f = el[kagi];
        for (let j = 0; j < 30 && f; j++) {
          const p = f.memoizedProps || f.pendingProps;
          if (p) {
            for (const q in p) {
              const v = p[q];
              if (v && typeof v === 'object' && !Array.isArray(v) && ('description' in v)) { mi = v; break; }
            }
          }
          if (mi) break;
          f = f.return;
        }
      }
    } catch (e) { }
    /* 商品によっては props の直下ではなく
       children[0].props.item / itemData に入る。直下取得を残したまま、
       商品ID・商品名・説明を持つ商品オブジェクトだけを限定的に探す。 */
    if (!mi) {
      try {
        const seen = new WeakSet();
        let visited = 0;
        const findItem = (v, depth) => {
          if (!v || typeof v !== 'object' || depth > 8 || visited >= 12000) return null;
          if (seen.has(v)) return null;
          seen.add(v); visited++;
          if (!Array.isArray(v)
            && /^m\d{10,}$/.test(String(v.id || ''))
            && typeof v.name === 'string'
            && Object.prototype.hasOwnProperty.call(v, 'description')) return v;
          if (Array.isArray(v)) {
            for (let i = 0; i < Math.min(v.length, 20); i++) {
              const hit = findItem(v[i], depth + 1);
              if (hit) return hit;
            }
            return null;
          }
          for (const k of Object.keys(v).slice(0, 80)) {
            const hit = findItem(v[k], depth + 1);
            if (hit) return hit;
          }
          return null;
        };
        const els2 = document.querySelectorAll('div,main,section,article');
        for (let i = 0; i < els2.length && !mi && i < 400; i++) {
          const el = els2[i];
          const kagi = Object.keys(el).find((x) => x.indexOf('__reactFiber$') === 0);
          if (!kagi) continue;
          let f = el[kagi];
          for (let j = 0; j < 30 && f && !mi; j++) {
            mi = findItem(f.memoizedProps || f.pendingProps, 0);
            f = f.return;
          }
        }
      } catch (e) { }
    }
    if (!mi) return null;
    /* メルカリの状態の番号 → 区分（1..6 が LCOND_RANK の先頭6つに対応） */
    const cid = parseInt(mi.itemConditionId, 10);
    const cond = (cid >= 1 && cid <= 6) ? LCOND_RANK[cid - 1] : 'unknown';
    let size = '';
    try {
      size = (mi.itemSize && mi.itemSize.name)
        || (Array.isArray(mi.itemSizes) && mi.itemSizes[0] && mi.itemSizes[0].name) || '';
    } catch (e) { }
    return {
      id: String(mi.id || ''),
      name: String(mi.name || ''),
      price: rawNum(mi.price),
      /* ★状態は props だけで決めない。本家はボタンの文字で見ている（下の lState）。
         ここは参考値として持つだけ。 */
      soldProps: (mi.status === 'ITEM_STATUS_SOLD_OUT' || mi.status === 'ITEM_STATUS_TRADING'),
      /* ★2026-08-17 状態が『不明』になるのを無くすため、props の生の値も持っておく。
         ボタンの文字で決められなかった時だけ、こちらを使う（下の lensYomu）。 */
      statusRaw: String(mi.status || ''),
      /* ★2026-08-17 ブランド照合のため。メルカリの商品は brand を持っていることがあり、
         題の文字を探すより確か。無ければ空のままで、題での照合に落ちる。 */
      brandProps: (function () {
        try {
          if (mi.brand && mi.brand.name) return String(mi.brand.name);
          if (Array.isArray(mi.brands) && mi.brands[0] && mi.brands[0].name) return String(mi.brands[0].name);
        } catch (e) { }
        return '';
      })(),
      cond: cond,
      size: size,
      created: rawNum(mi.created),
      updated: rawNum(mi.updated),
      desc: String(mi.description || ''),
      img: (function () {
        try {
          if (Array.isArray(mi.photos) && mi.photos[0]) return String(mi.photos[0]);
          if (Array.isArray(mi.thumbnails) && mi.thumbnails[0]) return String(mi.thumbnails[0]);
        } catch (e) { }
        return '';
      })()
    };
  }


  /* ===== 1枚ずつ開いて読む（第3段） =====
     ★本家 msqCheckSoldSequentially と同じ形。同じタブで商品ページへ移動し、
       読み終わったら次の商品へ。進み具合は sessionStorage に持つ
       （本家はURLに載せているが、URLが長くなると壊れるので入れ物だけ変えた。
        持つ中身と順番は同じ）。
     ★ユーザー指定: 利益1000円未満（仕入値を割っている物を含む）が【2件】たまったら止まる。
       止めるだけで捨てない。画像と価格を出し、続行を押すまで動かない。 */

  function lensSusumu() {
    const st = lStateRead();
    /* ★黙って終わらない（2026-08-14 実機で「押しても始まらずそのまま終わった」）。
       記録が読めない時は理由を出す。出さないと原因を推測することになる。 */
    if (!st || !st.list || !st.list.length) {
      lensObi('進行の記録が読めません（もう一度レンズから始めてください）');
      return;
    }
    if (st.tomatta) return;                       /* 止まっている。続行待ち */
    const i = st.idx || 0;
    if (i >= st.list.length) { lensOwari(); return; }
    const id = st.list[i].id;
    st.idx = i;
    lStateWrite(st);
    /* 次の商品へ。人が見る速さで動く（間隔は下の lensYomu の待ちで確保） */
    location.replace('https://jp.mercari.com/item/' + id + '?__msqlens=1');
  }

  /* ★2026-08-14 実機で「紫を押すとメルカリが1枚開いて止まる」と言われて分かった:
     この3つを【呼んでいるのに一度も書いていなかった】。lWaitState で
     ReferenceError になり、帯が「調べています 1/56」のまま永久に止まっていた。
     node --check はこの型を1つも捕まえない。
     ★中身は本家 list_extractor.js の
       msqDetectState / msqWaitForStableState /
       msqExtractConditionFromItemPage / msqExtractSizeFromItemPage
     をそのまま写したもの。待ち時間・判定回数・セレクタは1つも変えていない。 */

  /* 今の状態をボタンの文字から見る（本家 msqDetectState と同じ） */
  function lStateNow() {
    try {
      const b = Array.prototype.slice.call(document.querySelectorAll('button'));
      for (let i = 0; i < b.length; i++) {
        const t = (b[i].textContent || '').trim();
        if (t === '売り切れました') return 'sold_out';
        if (t.indexOf('購入手続きへ') >= 0) return 'available';
      }
      const moji = document.body ? (document.body.textContent || '') : '';
      if (moji.indexOf('該当する商品は削除されています') >= 0) return 'deleted';
      if (moji.indexOf('ページが見つかりませんでした') >= 0) return 'not_found';
    } catch (e) { }
    return 'unknown';
  }

  /* 状態が落ち着くまで待つ（本家 msqWaitForStableState と同じ）。
     ★本家: 先に2500〜4500ms待つ → 400msごとに見る → 同じ答えが2回続いたら確定
             → 9000msで打ち切り、その時点の答えを返す。
     ★アプリ側は約束事(Promise)を使わずコールバックで返す。待ち方と回数は本家のまま。 */
  function lWaitState(done) {
    const ran = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const hajime = ran(2500, 4500);
    const kagiri = 9000;
    let mae = null, kaisuu = 0, tatta = hajime;
    setTimeout(function miru() {
      const ima = lStateNow();
      if (ima !== 'unknown' && ima === mae) {
        kaisuu++;
        if (kaisuu >= 2) { done(ima); return; }
      } else {
        kaisuu = (ima === 'unknown') ? 0 : 1;
      }
      mae = ima;
      if (tatta >= kagiri) { done(mae); return; }
      tatta += 400;
      setTimeout(miru, 400);
    }, hajime);
  }

  /* 商品の状態（本家 msqExtractConditionFromItemPage と同じ） */
  function lCondFromPage() {
    try {
      const el = document.querySelector('span[data-testid="商品の状態"]');
      if (!el) return '';
      const t = Array.prototype.slice.call(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || '').trim()).join('');
      return t || '';
    } catch (e) { return ''; }
  }

  /* サイズ（本家 msqExtractSizeFromItemPage と同じ） */
  function lSizeFromPage() {
    try {
      const el = document.querySelector('span[data-testid="サイズ"]');
      if (!el) return '';
      const t = Array.prototype.slice.call(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || '').trim()).join('');
      return t || (el.textContent || '').trim() || '';
    } catch (e) { return ''; }
  }

  /* Lens候補の「同じ商品」判定。
     ブランド名・カテゴリー名だけでは別商品を区別できない。
     Lens自身が画像で付けた上位5件は、明示的なブランド不一致が無い場合に限り
     Lens全体の順位で優先して通す。別ブランドを上位順位だけで通してはいけない。
     6件目以降は型番またはGeminiが読んだ商品固有語が題にある時だけ通す。 */
  function lLensKoyuukagi(st) {
    const out = [];
    const tasu = (v) => {
      const k = lNorm(v);
      if (!k || k.length < 4) return;
      if (out.indexOf(k) >= 0) return;
      try {
        if (CATEGORY_TOKENS.some((x) => lNorm(x) === k)) return;
        const kk = lBrandKakikata(String((st && st.brand) || '')) || [];
        if (kk.some((x) => lNorm(x) === k)) return;
        if (String((st && st.brandKana) || '').trim()
            && lNorm(st.brandKana) === k) return;
      } catch (e) { }
      out.push(k);
    };
    try {
      /* 「検索のコツ」はメルカリでの補助検索表示用であり、
         同じ商品と判定する固有語ではない。PC側の逆引きでも、
         商品欄と高値要素欄を分けて扱っている。 */
      [st && st.gemini, st && st.geminiOshi].forEach((arr) => {
        (Array.isArray(arr) ? arr : []).forEach((v) => {
          String(v || '').split(/[\s　・／/]+/).forEach(tasu);
        });
      });
    } catch (e) { }
    return out;
  }
  function lLensOnaji(r, st) {
    /* Lens全体の上位5件。仕入れサイトごとの順位ではない。題名の差で落とさない。 */
    if (Number.isFinite(Number(r && r.lensRank)) && Number(r.lensRank) < 5) return true;
    const T = lNorm(String((r && r.name) || '') + ' ' + String((r && r.brand) || ''));
    const M = lNorm((st && st.model) || '');
    if (M.length >= 4 && T.indexOf(M) >= 0) return true;
    return lLensKoyuukagi(st).some((k) => T.indexOf(k) >= 0);
  }

  /* 商品ページに着いた時。読んで、記録して、止まるか進むかを決める。 */
  function lensYomu() {
    const st = lStateRead();
    if (!st || !st.list || !st.list.length) return;
    const i = st.idx || 0;
    if (i >= st.list.length) { lensOwari(); return; }
    /* 今どちらを回っているか（売り切れ側 → 販売中側）を帯に出す */
    const dan = (typeof st.uriKazu === 'number' && i >= st.uriKazu) ? '販売中' : '売り切れ';
    lensObi('調べています ' + (i + 1) + '/' + st.list.length + '（' + dan + '）');
    /* ★2026-08-18 1枚ずつ見る時も、辞書照合の結果を必ず出す（ユーザー指摘）。
       出さないと、効いているのか一度も動いていないのかが分からない。 */
    window.__msqTeruKagi = (() => {
      try {
        const kk = lBrandKakikata(String(st.brand || ''));
        const kn = String(st.brandKana || '').trim();
        if (kn && kk.indexOf(kn) < 0) kk.push(kn);
        return kk.filter((x) => String(x || '').trim().length >= 2).join(' / ') || '（ブランド未取得）';
      } catch (e) { return '（読めず）'; }
    })();

    /* ★2026-08-17 ユーザー指示『ページ見つかりませんでしたや別ブランドは早めに閉じろよ。
       何も情報取れないし』。
       ★「ページが見つかりませんでした」「削除されています」は開いた瞬間に文字が出ている。
         状態が落ち着くのを待つ（2.5〜4.5秒＋確認）必要がないので、待たずに次へ行く。
       ★次へ行くまでの間も、こういう物は 0.8〜1.5秒にする（普通の物は今までどおり4〜7秒）。 */
    const tsugiE = (mijikai) => {
      lStateWrite(st);
      if (st.idx >= st.list.length) { lensOwari(); return; }
      const machi = mijikai
        ? (800 + Math.floor(Math.random() * 700))
        : (1000 + Math.floor(Math.random() * 3000));
      lensObi('次の商品へ（' + (machi / 1000).toFixed(1) + '秒後）');
      setTimeout(lensSusumu, machi);
    };

    setTimeout(() => {
      const haya = lStateNow();
      if (haya === 'not_found' || haya === 'deleted') {
        st.mita = st.mita || [];
        st.mita.push({
          id: st.list[i].id, name: '', price: 0, sold: false, state: haya,
          cond: 'unknown', size: '', created: 0, updated: 0, img: '', model: '',
          brand: '', cat: '', rieki: null, onaji: false, onajiShouhin: false,
          tobasu: (haya === 'not_found') ? 'ページが見つかりません' : '削除されています'
        });
        st.idx = i + 1;
        tsugiE(true);
        return;
      }

      /* ★状態はボタンの文字で。本家と同じく待って2回確認する。 */
      lWaitState((state) => {
        /* ★2026-08-17 ユーザー指示『状態不明とかありえんからな』。
           ・売り切れ/販売中 … ボタンの文字で決まらない時は props の status を使う
           ・商品の状態（区分）… 読めない時は1秒あけて2回まで読み直す
           それでも読めない時だけ unknown にする（今までは1回読んで即 unknown だった）。 */
        const yomu2 = (nokori) => {
          const d = lItemData() || {};
          let cond = lCondKey(lCondFromPage()) || d.cond || 'unknown';
          if (nokori > 0 && (cond === 'unknown' || !d.name)) {
            setTimeout(() => yomu2(nokori - 1), 1000);
            return;
          }
          let state2 = state;
          if (state2 === 'unknown' && d.statusRaw) state2 = d.soldProps ? 'sold_out' : 'available';
          const rec = {
            id: st.list[i].id,
            lensRank: Number.isFinite(Number(st.list[i].lensRank)) ? Number(st.list[i].lensRank) : null,
            name: d.name || '',
            price: d.price || 0,
            sold: (state2 === 'sold_out'),
            state: state2,
            cond: cond,
            size: lSizeFromPage() || d.size || '',
            created: d.created || 0,
            updated: d.updated || 0,
            img: d.img || '',
            model: rawModelFromDesc(d.desc || '') || (rawModelCodes(d.name || '')[0] || ''),
            brand: d.brandProps || ''
          };
          rec.cat = lCatNo(rec.name);
          /* ★2026-08-17 ユーザー指示『同じブランド同じカテゴリー、つまり同じ商品で止めろ。
             今は違うブランド、違うカテゴリー、販売中で止まってる』。
             ここで【同じ商品か】を判定して、止める数に入れるかを決める。 */
          const brandAu = lBrandAu(rec.name + ' ' + rec.brand, st);
          const catAu = lCatAu(rec.name, st);
          rec.brandAu = brandAu;                       /* true=同じ false=違う null=判断できない */
          rec.catAu = catAu;
          const lensJoui5 = Number.isFinite(Number(st.list[i].lensRank))
            && Number(st.list[i].lensRank) < 5;
           /* ブランド辞書が明示的に不一致を返した物は、Lens上位5件でも別商品。
              「判断できず」は表記揺れの可能性があるため、従来どおり上位5件の
              画像優先を許可する。 */
           const brandNG = (String(st.brand || '').trim() && brandAu === false);
           /* Lens全体の上位5件は、題名上の「ワンピース／長袖ロングシャツ」差やブランド表記差
              より画像一致を優先する。ただし明示的なブランド不一致は通さない。
              6件目以降は型番またはGemini固有語を要求する。 */
           const identityAu = lLensOnaji(st.list[i], st);
           const catNG = (String(st.cat || '').trim() && catAu === false && !lensJoui5);
           rec.identityAu = identityAu;
           rec.onajiShouhin = !brandNG && (lensJoui5 || (identityAu && !catNG));
          /* ★照合の結果を帯に出す。何と何を照らして、どう決まったかを見えるようにする。 */
          try {
            lensObi('調べています ' + (i + 1) + '/' + st.list.length + '（' + dan + '）'
              + '\n辞書照合のキー: ' + (window.__msqTeruKagi || '（未取得）')
              + '\n相手: ' + String(rec.name || '（題なし）').slice(0, 30)
              + '\n判定: ブランド' + (brandAu === true ? '一致' : (brandAu === false ? '不一致' : '判断できず'))
              + ' / カテゴリー' + (catAu === true ? '一致' : (catAu === false ? '不一致' : '判断できず'))
              + ' → ' + (rec.onajiShouhin ? '同じ商品' : '別商品として飛ばす'));
          } catch (e) { }
          if (brandNG) rec.tobasu = '別ブランド';
          else if (catNG) rec.tobasu = '別カテゴリー';
          else if (!lensJoui5 && !identityAu) rec.tobasu = '同一商品の根拠なし';
          /* 利益。仕入元と同じ状態の物だけを見る（本家の決まり）。 */
          rec.rieki = (st.cost > 0 && rec.price > 0) ? lProfit(rec.price, st.cost) : null;
          rec.onaji = (st.cond ? (rec.cond === st.cond) : true);
          st.mita = st.mita || [];
          st.mita.push(rec);
          /* ★止める条件（2026-08-17 ユーザー指示で作り直した）。
             次を【全部】満たす物が2件たまった時だけ止める。
               ① 売り切れ（販売中では止めない）
               ② 同じブランド
               ③ 同じカテゴリー
               ④ 仕入元と同じ状態（違う状態の値段で比べても意味が無い）
               ⑤ 利益が1000円未満（仕入値を割っている物を含む）
             直す前は ④⑤ だけを見ていたので、違うブランド・違うカテゴリー・販売中で
             止まっていた（ユーザー指摘のとおり）。 */
          if (rec.sold && rec.onajiShouhin && rec.onaji
              && rec.rieki !== null && rec.rieki < LMIN_RIEKI) {
            st.mitatsu = st.mitatsu || [];
            st.mitatsu.push(rec);
          }
          st.idx = i + 1;
          if ((st.mitatsu || []).length >= LTOMARU) {
            st.tomatta = true;
            lStateWrite(st);
            lensTomaru(st);
            return;
          }
          /* ★別ブランド・別カテゴリーは、これ以上見ても何も分からないので短く切り上げる。 */
          tsugiE(!!rec.tobasu);
        };
        yomu2(2);
      });
    }, 1200);
  }

  /* 帯（今なにをしているかを出す。黙って動かない） */
  function lensObi(s) {
    /* Google Lensの結果ページには進行用の黒帯を出さない。既に残っていても消す。 */
    if (LENS_HOST) {
      const old = document.getElementById('msq-lens-obi');
      if (old) old.remove();
      return;
    }
    let e = document.getElementById('msq-lens-obi');
    if (!e) {
      e = document.createElement('div');
      e.id = 'msq-lens-obi';
      e.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483600;'
        + 'background:#0b3b5c;color:#fff;font:700 13px/1.6 system-ui;padding:6px 10px;'
        + 'white-space:pre-wrap;';
      (document.body || document.documentElement).appendChild(e);
    }
    e.textContent = s;
  }


  /* ===== 止まった時（利益未達が2件たまった） =====
     ★ユーザー指定「画像と価格を出せ。続行を押さない限りそこでストップ」。
       違う商品なら続行、そうでなければ手で仕入元に戻って別の物を調べる。
     ★理由と数字を全部出す。私の判定が間違っていれば目で分かるように。 */
  function lensTomaru(st) {
    const mi = (st.mitatsu || []).slice(-LTOMARU);
    /* ★2026-08-17 ユーザー指示『止まった時に出す情報にブランド、タイトル、型番などが
       ないから見分けられないんだぞ』。
       ・仕入元の側 … ブランド／タイトル／型番／カテゴリー／状態／仕入値／必要な売値
       ・止めた商品 … タイトル全文（切らない）／ブランド／型番／カテゴリー／状態／売り切れか
       これで「本当に同じ商品なのか」を目で確かめられる。 */
    const sourceImg = lensShiireImg(st, 44);
    let h = '<div style="font:700 15px/1.6 system-ui;color:#fff;">'
      + '利益未達のため止めました（' + LTOMARU + '件）</div>'
      + '<div style="font:400 12px/1.7 system-ui;color:#cbd5e1;margin-bottom:8px;'
      + 'background:#111827;border-radius:8px;padding:6px;">'
      + '<b style="color:#fff;">仕入元</b>　'
      + sourceImg
      + '<br>ブランド <b style="color:#fff;">' + rawEsc(st.brand || '（未取得）') + '</b>'
      + '　カテゴリー ' + rawEsc(st.cat || '（未取得）')
      + '<br>タイトル ' + rawEsc(st.dai || '（未取得）')
      + '<br>型番 ' + rawEsc(st.model || '（未取得）')
      + '　状態 ' + (LCOND_LABEL[st.cond] || '（未取得）')
      + '<br>仕入 ¥' + (st.cost || 0).toLocaleString()
      + '　必要な売値 ¥' + (st.hitsuyou || 0).toLocaleString()
      + '　調べた ' + (st.idx || 0) + '/' + st.list.length + '件</div>';
    mi.forEach((r) => {
      h += '<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;'
        + 'background:#111827;border-radius:8px;padding:6px;">'
        + (r.img ? '<img src="' + rawEsc(r.img) + '" style="width:72px;height:72px;'
            + 'object-fit:cover;border-radius:6px;flex:0 0 auto;">' : '')
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font:700 13px/1.4 system-ui;color:#fff;">¥' + r.price.toLocaleString()
        + '　<span style="color:#f87171;">利益 ¥' + (r.rieki === null ? '—' : r.rieki.toLocaleString()) + '</span></div>'
        + '<div style="font:400 11px/1.5 system-ui;color:#e2e8f0;word-break:break-all;">'
        + rawEsc(r.name || '（題を取れず）') + '</div>'
        + '<div style="font:400 11px/1.5 system-ui;color:#94a3b8;">'
        + 'ブランド ' + rawEsc(r.brand || '（題から判定）')
        + '　カテゴリー ' + rawEsc(r.cat || '（未取得）') + '</div>'
        + '<div style="font:400 11px/1.5 system-ui;color:#94a3b8;">'
        + (r.sold ? '売り切れ' : '販売中') + '　' + (LCOND_LABEL[r.cond] || r.cond)
        + '　型番 ' + rawEsc(r.model || '（未取得）') + '</div>'
        + '</div></div>';
    });
    h += '<div style="display:flex;gap:8px;margin-top:10px;">'
      + '<button id="msq-lens-zoku" style="flex:1;padding:10px;border:none;border-radius:8px;'
      + 'background:#2563eb;color:#fff;font:700 14px/1.2 system-ui;">続行する</button>'
      + '<button id="msq-lens-owa" style="flex:1;padding:10px;border:none;border-radius:8px;'
      + 'background:#475569;color:#fff;font:700 14px/1.2 system-ui;">ここで終わる</button>'
      + '</div>';
    lensPanel(h);
    lensShiireLinkTukeru();
    const z = document.getElementById('msq-lens-zoku');
    if (z) z.addEventListener('click', () => {
      const s2 = lStateRead(); if (!s2) return;
      s2.tomatta = false;
      s2.mitatsu = [];        /* 数え直す。次の2件でまた止まる */
      lStateWrite(s2);
      lensPanelKesu();
      lensSusumu();
    });
    const o = document.getElementById('msq-lens-owa');
    if (o) o.addEventListener('click', () => { lensPanelKesu(); lensOwari(); });
  }

  function lensPanel(html) {
    lensPanelKesu();
    const d = document.createElement('div');
    d.id = 'msq-lens-panel';
    d.style.cssText = 'position:fixed;left:8px;right:8px;top:40px;bottom:40px;'
      + 'z-index:2147483600;background:#0f172a;border:1px solid #334155;border-radius:10px;'
      + 'padding:10px;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.6);';
    d.innerHTML = html;
    (document.body || document.documentElement).appendChild(d);
  }
  function lensPanelKesu() {
    const e = document.getElementById('msq-lens-panel');
    if (e) e.remove();
  }

  /* Lens結果の仕入元画像から元の商品ページへ戻る。
     以前はimgだけを描画しており、画像を押しても何も起きなかった。 */
  function lensShiireImg(st, size) {
    const img = String((st && st.img) || '').trim();
    if (!img) return '';
    const px = Number(size) || 64;
    const inner = '<img src="' + rawEsc(img) + '" style="width:' + px + 'px;height:' + px
      + 'px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:6px;">';
    const url = String((st && st.back) || '').trim();
    return url
      ? '<a id="msq-lens-source" href="#" data-url="' + rawEsc(url)
        + '" aria-label="仕入元ページを開く" style="display:inline-block;cursor:pointer;">'
        + inner + '</a>'
      : inner;
  }
  function lensShiireLinkTukeru() {
    const a = document.getElementById('msq-lens-source');
    if (!a) return;
    a.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const url = String(a.getAttribute('data-url') || '').trim();
      if (!url) return;
      try {
        if (window.MsqApp && typeof window.MsqApp.openShiire === 'function') {
          window.MsqApp.openShiire(url); return;
        }
      } catch (e) { }
      try { location.href = url; } catch (e) { }
    });
  }

  /* ===== 最後まで行った時 =====
     ★ユーザー指定「いったん画像と情報だけ並べて、さらに下に出る半透明の紫のボタンを押すと
       最後の結果ツールが出る」。 */
  function lensOwari() {
    const st = lStateRead();
    if (!st) return;
    /* ★2026-08-15 実機で「結果ツールを出すを押しても動かない」の原因。
       この関数が呼ばれ続けており、6秒間にパネルを9回も作り直していた（実測）。
       押して結果ツールに差し替わっても、すぐここが元の一覧に戻していた。
       ★もう出しているなら何もしない。作り直すのは1回だけ。 */
    if (document.getElementById('msq-lens-panel')) return;
    st.owatta = true;
    lStateWrite(st);
    const mita = st.mita || [];
    /* ★Geminiの見立てはそのまま出す。勝手に検索語には使わない（外れていたら目で分かるように） */
    const gemRet = (st.gemini && st.gemini.length)
      ? ('<div style="font:400 12px/1.7 system-ui;color:#a7f3d0;background:#111827;'
         + 'border-radius:8px;padding:6px;margin:6px 0;">Geminiの見立て: '
         + rawEsc(st.gemini.join(' / ')) + '</div>')
      : '';
    /* ★2026-08-17 ユーザー指示『同じブランドが全件の中でもうないと分かったら
       「同じブランドがないため止めました」を出せ』。
       最後まで回っても同じブランドが1件も無かった時は、それを見出しに出す。 */
    const onajiKazu = mita.filter((r) => r.onajiShouhin).length;
    const brandNashi = (String(st.brand || '').trim() && onajiKazu === 0 && mita.length > 0);
    let h = brandNashi
      ? ('<div style="font:700 15px/1.6 system-ui;color:#fca5a5;">'
         + '同じブランドがないため止めました</div>'
         + '<div style="font:400 12px/1.7 system-ui;color:#cbd5e1;margin-bottom:8px;">'
         + 'ブランド <b style="color:#fff;">' + rawEsc(st.brand || '') + '</b>'
         + '　カテゴリー ' + rawEsc(st.cat || '（未取得）')
         + '<br>' + mita.length + '件ぜんぶ見ましたが、同じブランドは1件もありませんでした。</div>')
      : ('<div style="font:700 15px/1.6 system-ui;color:#fff;">'
         + '調べ終わりました（' + mita.length + '件中、同じ商品 ' + onajiKazu + '件）</div>');
    h += gemRet;
    mita.forEach((r) => {
      h += '<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;'
        + 'background:#111827;border-radius:8px;padding:6px;'
        + (r.tobasu ? 'opacity:.55;' : '') + '">'
        + (r.img ? '<img src="' + rawEsc(r.img) + '" style="width:64px;height:64px;'
            + 'object-fit:cover;border-radius:6px;flex:0 0 auto;">' : '')
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font:700 13px/1.4 system-ui;color:#fff;">¥' + r.price.toLocaleString()
        + '　<span style="color:#94a3b8;">' + (r.sold ? '売り切れ' : '販売中') + '</span>'
        + (r.tobasu ? '　<span style="color:#fbbf24;">' + rawEsc(r.tobasu) + '</span>' : '')
        + '</div>'
        + '<div style="font:400 11px/1.5 system-ui;color:#e2e8f0;word-break:break-all;">'
        + rawEsc(r.name || '（題を取れず）') + '</div>'
        + '<div style="font:400 11px/1.5 system-ui;color:#94a3b8;">'
        + 'ブランド ' + rawEsc(r.brand || '（題から判定）')
        + '　カテゴリー ' + rawEsc(r.cat || '（未取得）') + '</div>'
        + '<div style="font:400 11px/1.5 system-ui;color:#94a3b8;">'
        + (LCOND_LABEL[r.cond] || r.cond) + (r.size ? '　' + rawEsc(r.size) : '')
        + '　型番 ' + rawEsc(r.model || '（未取得）') + '</div>'
        + '</div></div>';
    });
    h += '<button id="msq-lens-tool" style="position:sticky;bottom:0;width:100%;margin-top:10px;'
      + 'padding:12px;border:none;border-radius:8px;background:rgba(147,51,234,.75);'
      + 'color:#fff;font:700 15px/1.2 system-ui;">結果ツールを出す</button>';
    lensPanel(h);
    const b = document.getElementById('msq-lens-tool');
    if (b) b.addEventListener('click', () => lensTool(st));
  }


  /* ===== 最後の結果ツール =====
     ★ユーザー指定「仕入元の画像と情報、利益3パターン、下にウインドウの固定で
       結果を売り切れ⇒販売中で状態別（仕入元の状態を先頭で出す）」。
     ★利益3パターンは本家 msqRenderProfitHtml と同じ規則:
         売り切れがある → 高値 / 安値 / 平均×0.98
         売り切れが無い → 販売中の最安値だけ（参考値）
         どちらも無い   → 出さない（違う状態の値段で計算しても意味が無い）
         対象は【仕入元と同じ状態】に限る。他の状態へは広げない
     ★状態の並びは new/likenew/good/fair/poor/bad/unknown（本家の仕様）。
       そのうえで【仕入元の状態を先頭】に持ってくる（ユーザー指定）。 */
  /* ★2026-08-15 全面差し替え。ユーザー指示「結果ツールをメルカリサーチと全く同じにしろ」。
     それまでは自作で、本家とレイアウトも並びも別物だった。
     ここは本家 showOverlay に渡す形に詰め替えるだけにして、
     見た目と絞り込みは本家のコード（上に丸ごと持ってきた分）にそのまま任せる。
     ★詰め替えの形は本家 msqFinishMercariResult（スマホ同期用_62-3-5/list_extractor.js:10440）と同じ。 */
  function lensTool(st) {
    /* ★2026-08-17 ユーザー指摘『レンズ結果の後、ブランド・カテゴリの照合が行われてない。
       違うブランドでメルカリを開いてる』。実機で確認した例（SEVEN TEN by MIHO KAWAHITO）:
       読んだ6件のうち同じブランド0件・違うブランド6件（Jocomomola / fig London など）。
       ★本家 list_extractor.js:8694『★全サイト共通化: ブランド不一致のLens結果を除外
         （別ブランド混入対策）』と同じことをする。カテゴリーも同じ商品かの判定に使う。
       ★レンズ結果のページでは弾かない（Googleの要約なので誤って消す。本家もそうしている）。
         メルカリを読んだ【後】の結果に対してだけ弾く。
       ★仕入元のブランドが分からない時は1件も弾かない（材料が無いのに絞ると全部消える）。
       ★型番が分かっている物は、ブランドが違って見えても残す（型番が一致＝同じ商品）。 */
    const msqBrandNozoku = (list, st2) => {
      const b0 = String((st2 && st2.brand) || '').trim();
      const m0 = String((st2 && st2.model) || '').trim();
      if (!b0 || b0.length < 2) return list;      /* ブランドが無ければ弾かない */
      const B = b0.toUpperCase().replace(/[\s\u3000]/g, '');
      const M = m0.toUpperCase().replace(/[\s\u3000_-]/g, '');
      /* ★2026-08-17 判定を lBrandAu にそろえた。ここだけ別の書き方をしていると、
         止める時の判定（lensYomu）と結果ツールに残る物が食い違う。物差しは1つにする。 */
      const nokoru = list.filter((r) => {
        const na = String(r.name || '').toUpperCase().replace(/[\s\u3000]/g, '');
        const lensJoui5 = Number.isFinite(Number(r && r.lensRank))
          && Number(r.lensRank) < 5;
        if (M && na.replace(/[_-]/g, '').indexOf(M) >= 0) return true;   /* 型番が一致 */
        const brandHit = lBrandAu((r.name || '') + ' ' + (r.brand || ''), st2) === true
          || na.indexOf(B) >= 0;                                           /* ブランドが一致 */
         /* lBrandAu が明示的に不一致を返した物は、Lens上位5件でも残さない。
            表記揺れで判断不能（null）の場合だけ、上位5件の画像優先を許可する。 */
         if (lBrandAu((r.name || '') + ' ' + (r.brand || ''), st2) === false) return false;
         if (lensJoui5) return true;
        if (!brandHit) return false;
        /* ブランド・カテゴリーだけでは同じ商品とは言えない。Lens左上、型番、
           Gemini固有語のいずれかを満たすものだけを結果へ渡す。左上は「ワンピース／
           長袖ロングシャツ」のような題名差があるため、カテゴリー文字では落とさない。 */
        if (!lLensOnaji(r, st2)) return false;
        if (lensJoui5) return true;
        return lCatAu((r.name || '') + ' ' + (r.cat || ''), st2) !== false;
      });
      /* Lens順位が取れている今回の経路では、判定不能を理由に全件へ戻さない。
         それ以外の古い状態だけは従来どおり元の一覧を残す。 */
      if (nokoru.length) return nokoru;
      const ranked = list.filter((r) => Number.isFinite(Number(r && r.lensRank)));
      return ranked.length ? ranked.slice(0, 1) : list;
    };
    /* 結果ツールへ渡すのは、ブランド照合を通過したLens全体の上位5件だけ。
       これまでは上位5件を判定の優先順位に使うだけで、通過した全件（実機で30件）を
       結果ツールへ渡していた。Lens順位を明示的に絞る。 */
    const mita = msqBrandNozoku((st && st.mita) ? st.mita : [], st)
      .slice()
      .sort((a, b) => {
        const ar = Number.isFinite(Number(a && a.lensRank)) ? Number(a.lensRank) : 999999;
        const br = Number.isFinite(Number(b && b.lensRank)) ? Number(b.lensRank) : 999999;
        return ar - br;
      })
      .slice(0, 5);
    const items = mita.map((r) => ({
      id: r.id,
      price: r.price || 0,
      isSold: (r.sold === true) ? true : ((r.sold === false) ? false : null),
      condition: revCond(r.cond),
      name: r.name || '',
      thumbnail: r.img || '',
      url: 'https://jp.mercari.com/item/' + r.id,
      likes: r.likes || 0,
      hasStockBadge: false,
      /* ★2026-08-17 名前が食い違っていて【一度も渡っていなかった】。
         こちらが作っているのは r.cat / r.model なのに、r.category / r.modelCode を
         読んでいたため、結果ツールのカテゴリー絞り込みと型番はいつも空だった。 */
      category: r.cat || r.category || '',
      size: r.size || '',
      created: r.created || 0,
      updated: r.updated || 0,
      modelCode: r.model || r.modelCode || ''
    }));
    const summary = calculateSummary(items);
    /* 仕入元の情報。渡ってきていない時は空のまま（本家も同じ扱い） */
    const payload = {
      images: st && st.img ? [st.img] : [],
      brand: (st && st.brand) || '',
      name: (st && st.dai) || '',
      price: (st && st.cost) || 0,
      rank: (st && st.rank) || '',
      keyword: '',
      backUrl: (st && st.back) || ''
    };
    try { lensPanelKesu(); } catch (e) { }
    try { injectStyle(); } catch (e) { }
    showOverlay(payload, { items: items, summary: summary, error: items.length ? null : 'メルカリ該当なし' });
    /* ===== Gemini推奨ワード（2026-08-18 ユーザー依頼） =====
       ★『一覧に GEMINI 推奨検索ワードとして出す場所あれば』→ 置き場所を結果ツールにした。
         レンズ経路には【メルカリの一覧が1回も出てこない】（商品ページを1枚ずつ開くだけ）ので、
         一覧の帯に置いても永久に見えなかった。ユーザー指摘のとおり。
       ★出す言葉: Geminiの『検索のコツ』があればそれ、無ければ『見立て』（商品名）。
         検索のコツは商品によって書かれないことが実機で確認できたため、見立てを控えにする。
       ★★押した時は【メルカリタブで開く】（ユーザー指示『結果が消えないように別タブにしろ』）。
         結果タブにこの結果ツールが残るので、タブを切り替えれば戻ってこられる。
       ★絞り込みは付けない。母数を増やすのが目的のため。 */
    try {
      const kotoba = [];
      ((st && st.geminiKotsu) || []).forEach((x) => { if (x && kotoba.indexOf(x) < 0) kotoba.push(x); });
      /* ★『お探しの商品は…』の文と、青枠に白抜き（strong/a）から作った推奨も足す（ユーザー依頼） */
      ((st && st.geminiOshi) || []).forEach((x) => { if (x && kotoba.indexOf(x) < 0) kotoba.push(x); });
      if (!kotoba.length) ((st && st.gemini) || []).forEach((x) => { if (x && kotoba.indexOf(x) < 0) kotoba.push(x); });
      if (kotoba.length) {
        const furu = document.getElementById('msq-gemini-tool');
        if (furu) furu.remove();
        const box = document.createElement('div');
        box.id = 'msq-gemini-tool';
        box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483601;'
          + 'background:#064e3b;padding:6px 8px;display:flex;flex-wrap:wrap;gap:6px;'
          + 'align-items:center;box-shadow:0 -2px 10px rgba(0,0,0,.5);';
        const mi = document.createElement('span');
        mi.textContent = 'Gemini推奨';
        mi.style.cssText = 'color:#a7f3d0;font:700 12px/1.4 system-ui;';
        box.appendChild(mi);
        kotoba.slice(0, 3).forEach((g) => {
          const b = document.createElement('button');
          b.textContent = g.length > 22 ? (g.slice(0, 22) + '…') : g;
          b.title = g + ' でメルカリを引く（メルカリタブで開きます）';
          b.style.cssText = 'padding:6px 10px;border:none;border-radius:6px;background:#10b981;'
            + 'color:#04231b;font:700 12px/1.2 system-ui;cursor:pointer;';
          b.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            try {
              const u = new URL('https://jp.mercari.com/search');
              u.searchParams.set('keyword', g);
              u.searchParams.set('__msqraw', '1');
              u.searchParams.set('__msqdef', '1');   /* 絞り込みを勝手に付けない */
              if (st && st.img) u.searchParams.set('__msqsrcimg', st.img);
              if (st && st.rank) u.searchParams.set('__msqsrcrank', st.rank);
              if (st && st.cost) u.searchParams.set('__msqprice', String(st.cost));
              if (st && st.brand) u.searchParams.set('__msqsrcbrand', st.brand);
              if (st && st.dai) u.searchParams.set('__msqsrcdai', String(st.dai).slice(0, 160));
              if (window.MsqApp && typeof window.MsqApp.openMercari === 'function') {
                window.MsqApp.openMercari(u.toString());   /* 別タブ。結果ツールは残る */
              } else {
                window.open(u.toString(), '_blank');
              }
            } catch (e) { }
          });
          box.appendChild(b);
        });
        (document.body || document.documentElement).appendChild(box);
      }
    } catch (e) { }
  }


  /* ===== レンズ結果ページに着いた時（第2段の入口） =====
     ★ユーザー指定「レンズ結果を出した後に画像をゆっくりスクロールしてサーチ、
       その後下にボタンが出て、それを押下するとメルカリが1枚ずつ開く」。
     ★勝手に開き始めない。集め終わってボタンを出すところまでで止める。 */
  /* ===== Geminiの「AIによる概要」から固有名詞を読む（2026-08-18 新規） =====
     ★ユーザーの絵で確定した形: 固有名詞は【必ず「」で囲まれている】。
       例「…インサレーションジャケット『Atom AR Hoody（アトム AR フーディ）』、または…」
     ★Googleへの通信は【1回も増やさない】。すでに開いているこのページを読むだけ。
     ★1つに決めない。上の例のように2つ出ることがある（AR か LT か迷っていた）。
     ★カッコの中は読み仮名なので捨てる。 */
  function lensGemini() {
    /* ★2026-08-18 実機（USB接続）で中を見て作り直した。推測ではない。
       ★直す前がなぜ毎回『見つかりません』だったか:
         『AI による概要』を含む要素は実測で【23個】あり、こちらは一番小さい物を選んでいた。
         それは【見出しの文字だけの要素】で中身が入っていない。だから何も取れなかった。
       ★実物の中身（セカストのATOのパンツで確認）:
         「AI による概要 / お探しのアイテムは、日本のメンズファッションブランド
           ato（アトウ）の定番人気のフレアスラックスパンツ…
           🔎 メルカリでの検索のコツ
             ato フレア パンツ / ato スラックス 44 / アトウ 立体裁断 パンツ」
       ★よって拾うのは3つ:
         ① 「」で囲まれた語（商品名）
         ② ブランドの読み（カタカナ）… ato（アトウ）の形。辞書が読めない画面でもこれで取れる
         ③ 『メルカリでの検索のコツ』に並ぶ検索語… Gemini が用意した実際のキーワード
       ★要素をたどるのはやめ、本文の文字から切り出す（要素の作りが変わっても壊れない）。 */
    const kara = { go: [], kana: '', kotsu: [], overview: '' };
    try {
      const body = document.body ? (document.body.innerText || '') : '';
      const i2 = body.search(/AI[\s　]*による概要/);
      if (i2 < 0) return kara;
      /* AI概要の後ろには、Googleが表示する出品・購入の案内が続く。
         そこは商品情報ではないため、項目名の例外語を足すのではなく、
         商品概要ブロックの終端で読む範囲を切る。 */
      const all = body.slice(i2, i2 + 1800);
      const end = all.search(/メルカリでの調べ物をお手伝いします|出品するために|購入するために/);
      const naka = end >= 0 ? all.slice(0, end) : all;
      const out = [], mita = {};
      const tasu = (v) => {
        const t = String(v || '').trim();
        if (t.length < 2 || t.length > 40) return;
        /* AI概要には状態文・リンク見出しも「」で混ざる。これらを固有名詞として
           保存すると、商品名ではない語で逆引きして別商品を拾う。 */
        if (/^(商品説明文|商品の説明|目立った傷|傷や汚れ|美品|着用|新品|中古)/.test(t)) return;
        if (/^型番\s*[:：]?$/i.test(t)) return;
        if (/^(https?:\/\/|jp\.|www\.)/i.test(t)) return;
        if (/(プライバシー|ポリシー|利用規約|フィードバック|もっと見る)/i.test(t)) return;
        const k = t.toLowerCase();
        if (mita[k]) return;
        mita[k] = 1;
        out.push(t);
      };
      const re = /[「『]([^」』]{2,40})[」』]/g;
      let m;
      while ((m = re.exec(naka)) !== null) tasu(String(m[1]).split(/[（(]/)[0]);
      /* ② ブランドの読み。英字のうしろの丸括弧に入っているカタカナ */
      let kana = '';
      const km = naka.match(/[A-Za-z][A-Za-z0-9&.' -]{1,30}[（(]([ァ-ヶー・]{2,20})[）)]/);
      if (km) kana = km[1];
      /* ③ 検索のコツに並ぶ語 */
      const overview = j2 >= 0 ? naka.slice(0, j2) : naka;
      const kotsu = [];
      const j2 = naka.indexOf('検索のコツ');
      if (j2 >= 0) {
        naka.slice(j2).split(/\r?\n/).slice(1, 14).forEach((ln) => {
          const t = String(ln || '').trim().replace(/（[^）]*）/g, '').trim();
          if (!t || t.length > 40) return;
          if (/AI\s*モード|さらに詳しく|フィードバック|もっと見る|Mercari|Google|[-–—]\s/.test(t)) return;  /* 画面の飾りやサイト名 */
          if (/[。：:、]/.test(t)) return;                 /* 説明の文は捨てる */
          if (t.split(/[\s　]+/).filter(Boolean).length < 2) return;  /* 1語だけは弱い */
          if (kotsu.indexOf(t) < 0) kotsu.push(t);
        });
      }
      /* ★2026-08-18 ユーザー指示『お探しの商品は…にある ato フレアスラックスパンツと
         青枠に白抜きで書かれてるのも拾って載せろよ』。実機で中を見て作った。
         ★青枠に白抜き＝AIによる概要の中の <strong> と <a>。実測:
             STRONG「ato（アトウ）」／ A「ato 2タック フレア トラウザーズ スラックスパンツ」
             A「メルカリ」← これは飾りなので落とす
         ★『ブランド ato（アトウ） のフレアスラックスパンツです』の形からは
           『ato フレアスラックスパンツ』を作る（ブランド＋品物）。 */
      const oshi = [];
      const oshiTasu = (v) => {
        const t = String(v || '').replace(/[（(][^）)]*[）)]/g, ' ').replace(/[\s　]+/g, ' ').trim();
        if (t.length < 3 || t.length > 40) return;
        if (/^(メルカリ|Mercari|Google|ZOZOTOWN|ラクマ|ヤフオク|楽天)$/i.test(t)) return;
        if (/^(https?:\/\/|jp\.|www\.)/i.test(t)) return;
        /* ブランド名だけ（1語）は検索語として弱いので入れない。実測で『ato』が混じった */
        if (t.split(' ').filter(Boolean).length < 2) return;
        if (t.indexOf('|') >= 0) return;                 /* 『… | ato onlinestore』のような見出し */
        if (oshi.indexOf(t) < 0) oshi.push(t);
      };
      try {
        /* ①『ブランド ◯◯（読み） の △△です』から ブランド＋品物 を作る */
        const bm = naka.match(/ブランド[\s　]*([^\s　（(]{2,20})[（(][^）)]*[）)][\s　]*の[\s　]*([^\s　。、]{2,20})です/);
        if (bm) oshiTasu(bm[1] + ' ' + bm[2]);
        /* ② 青枠に白抜き（strong と a）。概要の塊の中だけを見る */
        let hako = null;
        const el2 = document.querySelectorAll('div,section,article');
        for (let k = 0; k < el2.length && k < 3000; k++) {
          const t2 = (el2[k].innerText || '');
          if ((t2.indexOf('AI による概要') >= 0 || t2.indexOf('AIによる概要') >= 0)
              && t2.length > 200 && t2.length < 3000) { hako = el2[k]; break; }
        }
        if (hako) hako.querySelectorAll('strong,b,a').forEach((e2) => {
          /* hako全体には概要後の案内が入る場合がある。
             AI概要ブロック内に実際にある要素だけを商品候補へ渡す。 */
          const v2 = String(e2.textContent || '').replace(/[\s　]+/g, ' ').trim();
          if (v2 && naka.indexOf(v2) >= 0) oshiTasu(v2);
        });
      } catch (e) { }
      return { go: out, kana: kana, kotsu: kotsu.slice(0, 4), oshi: oshi.slice(0, 5), overview: overview };
    } catch (e) { return kara; }
  }

  /* ===== レンズ結果からメルカリを押した時、戻れなくなる件の直し（2026-08-18） =====
     ★ユーザー報告『レンズ結果のメルカリをクリックするとそこから戻ることが不可能になる』。
     ★実機（USB接続）で確かめた事実:
       ・レンズ結果は【結果タブ】の中にある（履歴の長さ2）
       ・そこでメルカリのリンクを押すと、そのタブ自体がメルカリへ移動し、レンズ結果が消える
       ・window.name はタブ（WebView）をまたがないので、進行の記録も一緒に失われる
     ★直し: レンズ結果の中のメルカリのリンクは【メルカリタブ】で開く。
       結果タブにはレンズ結果が残るので、タブを切り替えるだけで戻れる。
       ★受け口が無い時（普通のブラウザ等）は今までどおり同じタブで開く。 */
  function lensRinkuNaosu() {
    if (window.__msqLensRinku) return;
    window.__msqLensRinku = true;
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('#msq-lens-panel') || t.closest('#msq-lens-go')) return;   /* こちらの画面は除く */
        const a = t.closest('a[href]');
        if (!a) return;
        let u = a.href || '';
        try { u = decodeURIComponent(u); } catch (e) { }
        /* ★正規表現は使わない。この案件では  が落ちる写し間違いを何度も起こしているため、
           素の文字で判定する。判定したいのは『メルカリの商品ページか』だけ。 */
        const low = u.toLowerCase();
        if (low.indexOf('mercari.com/item/') < 0 && low.indexOf('mercari.com/shops/product/') < 0) return;
        const m = [u];
        if (!m) return;
        if (!(window.MsqApp && typeof window.MsqApp.openMercari === 'function')) return;
        ev.preventDefault(); ev.stopPropagation();
        window.MsqApp.openMercari(m[0]);
      } catch (e) { }
    }, true);
  }

  function lensStart() {
    /* リンクの別タブ送りは、収集済み・再注入後も有効にする。 */
    try { lensRinkuNaosu(); } catch (e) { }
    /* ★2026-09-19 ユーザー指摘「結果ページのリンクを開いて戻ると
       スクロールが再開する」。結果タブへ戻るたびの再注入で、初回の
       見た目一致選択・収集をもう一度始めない。初回処理中も二重起動させない。 */
    if (window.__msqLensCollecting || window.__msqLensScrollDone) return;
    try {
      const oldRun = lStateRead();
      if (oldRun && oldRun.scrollDone) {
        window.__msqLensScrollDone = true;
        return;
      }
    } catch (e) { }
    window.__msqLensCollecting = true;
    /* 仕入元から渡された情報を1回だけ受け取る（window.name はここで空にする） */
    const src = lSrcRead();
    if (src) {
      const st0 = {
        cost: rawNum(src.cost), rank: src.rank || '', cond: lCondFromRank(src.rank || ''),
        model: src.model || '',
        brandKana: src.brandKana || '',
        /* ★2026-08-17 カテゴリーも受け取る（仕入元側 jotai4 の cat）。
           古い版から渡ってきて cat が無い時は、題から取り直す。 */
        cat: src.cat || lCatNo(src.dai || ''),
        dai: src.dai || '', brand: src.brand || '', img: src.img || '', back: src.back || '',
        rawLens: src.rawLens || null,
        list: [], mita: [], mitatsu: [], idx: 0, tomatta: false, owatta: false
      };
      /* 必要な売値（利益1000円を取るのに要る値段）。止まった時に出す。 */
      st0.hitsuyou = st0.cost > 0
        ? Math.ceil((LMIN_RIEKI + st0.cost + LFEE.purchase + LFEE.shipping + LFEE.outsource)
            / (1 - LFEE.sellRate))
        : 0;
      lStateWrite(st0);
    }
    lensObi('レンズ結果の「見た目で一致」を選択しています…');
    lensMitatameIchi(() => lensAtsumeru((zenList) => {
      const st = lStateRead() || { list: [], mita: [], mitatsu: [], idx: 0 };
      /* ★2026-08-17 ユーザー指示3つを、ここ（レンズ結果の段階）でまとめて行う。
           ①『ここで出た件数でブランド照合とカテゴリー照合を入れんと意味ないぞ』
           ②『先にレンズ結果の段階で売り切れと販売中に分けて、売り切れを先に回して、
              最後まで回ったら販売中を安い順で回す』
           ③『同じブランドが全件の中でもうないと分かったら
              「同じブランドがないため止めました」を出せ』
         ★弾くのは【違うと分かった物だけ】。判断できない物（タイルの文字が取れない等）は残す。
           材料が無いだけの物まで消すと、全部消えて何も分からなくなる。 */
      lensTairuJouhou(zenList);
      /* 一覧カードから始めたLensは、相場チェック用の通常フローへ入れない。
         1便の結果を読んで不足時だけ次便を送り、情報が揃ったら逆引きへ戻す。 */
      if (st.rawLens) {
        try { rawLensListResult(st); } catch (e) {
          try { console.error('[MSQ/rawLensListResult]', e && (e.stack || e.message || e)); } catch (e0) { }
          const p = st.rawLens.rawLens || st.rawLens;
          const raw = p.raw || {};
          try { rawGyakuStart(raw.dai, raw.cost, raw.kata, (p.signals && p.signals.brand) || raw.brand, raw.img, p.signals || {}); }
          catch (e2) { try { console.error('[MSQ/rawGyakuFallback]', e2 && (e2.stack || e2.message || e2)); } catch (e3) { } }
        }
        return;
      }
      const zenbu = zenList.length;
      const chigauB = [], chigauC = [];
      let list = zenList.filter((r) => {
        if (lBrandAu(r.txt, st) === false) { chigauB.push(r); return false; }
        return true;
      });
      /* ③ ブランド表記の違い・辞書未取得で全件が不一致になっても、
         Lens候補を全消しして止めない。候補を残して次の確認へ進める。 */
      if (!list.length && zenbu > 0 && String(st.brand || '').trim()) {
        list = zenList.slice();
      }
      /* Lensの候補段ではカテゴリー文字で落とさない。
         今回の左上は「長袖ロングシャツ」と表示されるが、仕入元は「ワンピース」で、
         この文字だけの差で画像一致候補を消していた。カテゴリーは商品ページを開いた後、
         Lens順位・型番・Gemini固有語と合わせて最終判定する。 */
      /* ② 売り切れ（在庫ありバッジ無し）を先、販売中（在庫あり）を後。販売中は安い順。 */
      const uri = list.filter((r) => !r.zaiko);
      const han = list.filter((r) => r.zaiko)
        .sort((a, b) => ((a.ne || 99999999) - (b.ne || 99999999)));
      list = uri.concat(han);
      st.list = list;
      st.uriKazu = uri.length;      /* ここから先が「販売中」（帯に出す） */
      st.idx = 0; st.mita = []; st.mitatsu = []; st.tomatta = false; st.owatta = false;
       lStateWrite(st);
       st.scrollDone = true;
       window.__msqLensCollecting = false;
       window.__msqLensScrollDone = true;
       lStateWrite(st);
      /* ★何をどう絞ったかを必ず出す。出さないと、絞りすぎているのか
         そもそも候補が無いのかを、こちらが推測することになる。 */
      /* ★2026-08-18 ユーザー指摘『ログ欄に辞書照合したと出ないから怪しいと思ってた』。
         そのとおりで、どのキーで照合したのかを一度も出していなかった。
         黙って判定しない。使ったキーを必ず帯に出す。 */
      let kagiMoji = '（ブランド未取得）';
      try {
        const kk = lBrandKakikata(String(st.brand || ''));
        const kn = String(st.brandKana || '').trim();
        if (kn && kk.indexOf(kn) < 0) kk.push(kn);
        const kk2 = kk.filter((x) => String(x || '').trim().length >= 2);
        if (kk2.length) kagiMoji = kk2.join(' / ');
      } catch (e) { }
      const shibori = '候補 ' + zenbu + '件 → ' + list.length + '件'
        + '（別ブランド -' + chigauB.length + ' / 別カテゴリー -' + chigauC.length + '）\n'
        + '売り切れ ' + uri.length + '件を先に、そのあと販売中 ' + han.length + '件を安い順';
      /* ★Geminiの固有名詞をここで1回だけ読む（追加の通信ゼロ）。
         型番が分かっていれば、それをキーにして預ける（置き場は3画面共通）。 */
      try {
        const gg = lensGemini();
        st.gemini = gg.go || [];
        st.geminiKotsu = gg.kotsu || [];
        st.geminiOshi = gg.oshi || [];
        /* ★2026-08-18 ユーザー依頼『一覧に GEMINI 推奨検索ワードとして出す場所あれば』。
           Gemini が『🔎 メルカリでの検索のコツ』として自分で書いている行。
           メルカリの一覧（別のタブ）で出すため、3画面共通の置き場へ預ける。
           ★通信は増えない。すでに読んである文字を渡すだけ。 */
        try {
          if (st.geminiKotsu.length) rawKoyuuSave('GEMINIWORDS', st.geminiKotsu.join('|'));
        } catch (e) { }
        /* ★ブランドの読み（カタカナ）。仕入元の題から取れていない時はGeminiの分を使う。
           これが辞書照合のキーに入るので、メルカリのカナ表記の題にも当たるようになる。 */
        if (!String(st.brandKana || '').trim() && gg.kana) st.brandKana = gg.kana;
        lStateWrite(st);
        if (st.gemini && st.gemini.length && st.model) {
          rawKoyuuSave('GEMINI:' + st.model, st.gemini.join(' / '));
        }
      } catch (e) { }
      const gemMoji = (st.gemini && st.gemini.length)
        ? ('\nGeminiの見立て: ' + st.gemini.join(' / '))
        : '\nGeminiの見立て: （AIによる概要が見つかりません）';
      /* ★キーは Gemini の読みを受け取った【後】に作り直す。
         先に作ると、Geminiから取れたカタカナが帯に出ない。 */
      try {
        const kk2 = lBrandKakikata(String(st.brand || ''));
        const kn2 = String(st.brandKana || '').trim();
        if (kn2 && kk2.indexOf(kn2) < 0) kk2.push(kn2);
        const kk3 = kk2.filter((x) => String(x || '').trim().length >= 2);
        if (kk3.length) kagiMoji = kk3.join(' / ');
      } catch (e) { }
      const kotsuMoji = (st.geminiKotsu && st.geminiKotsu.length)
        ? ('\nGeminiの検索のコツ: ' + st.geminiKotsu.join(' ／ ')) : '';
      lensObi(shibori + '\n辞書照合のキー: ' + kagiMoji + gemMoji + kotsuMoji);
      /* ★ここでは開かない。ボタンを出して待つ。 */
      const b = document.createElement('button');
      b.id = 'msq-lens-go';
      b.textContent = 'メルカリを1枚ずつ調べる（' + list.length + '件）';
      b.style.cssText = 'position:fixed;left:8px;right:8px;bottom:12px;z-index:2147483600;'
        + 'padding:14px;border:none;border-radius:10px;background:rgba(147,51,234,.85);'
        + 'color:#fff;font:700 15px/1.2 system-ui;box-shadow:0 4px 16px rgba(0,0,0,.5);';
      if (!list.length) {
        b.textContent = 'メルカリの候補が0件でした';
        b.disabled = true;
        b.style.background = 'rgba(71,85,105,.85)';
      }
      b.addEventListener('click', () => {
        if (!list.length) return;
        b.remove();
        lensSusumu();
      });
      (document.body || document.documentElement).appendChild(b);
    }));
  }

  /* ===== メルカリの商品ページに着いた時の受け口 =====
     ★__msqlens=1 が付いている時だけ動く。普通に商品を見ている時は何もしない。 */
  function lensItemHook() {
    try {
      if (!/[?&]__msqlens=1/.test(location.search)) return false;
      const st = lStateRead();
      if (!st || !st.list || !st.list.length) return false;
      if (st.tomatta || st.owatta) {
        /* 止まっている／終わっている時は、その画面を出し直す */
        if (st.owatta) lensOwari(); else lensTomaru(st);
        return true;
      }
      /* ★2026-08-15 実機で捕まえた不具合の直し。
         rawStart() はファイルの一番下で 0ms / 1200ms / 3000ms の【3回】呼ばれる。
         そのたびに ここ を通るため、商品ページ1枚に対して lensYomu() が
         2〜3回走り、同じ商品が2〜3件として記録されていた。
         ★実測（2026-08-15 実機・商品を1枚しか開いていない状態）:
             読了2件・未達2件、どちらも同じ ¥9,800 の同じ商品、
             URLは /item/m76974195254 のまま動いていない。
             その結果、本当は1件しか見ていないのに「2件たまった」として止まった。
         ★本家 list_extractor.js の直し方に合わせる:
             ・6150〜6152行「二重注入防止」
                 if (window.__msQuettaRan__) return; window.__msQuettaRan__ = true;
               で、1ページにつき1回しか走らせていない。
             ・1枚ずつの精査(10373行あたり)も packed[idx] という【決まった場所】に
               書くので、仮に2回走っても件数は増えない作りになっている。
           こちらは push で足す作りなので、同じ歯止めをここに置く。
         ★一覧(/search)側の rawStart は今までどおり何回でも走ってよい。
           ここで止めるのは商品ページの読み取り1回分だけ。 */
      if (lYonda === location.href) return true;
      lYonda = location.href;
      lensYomu();
      return true;
    } catch (e) { return false; }
  }

  /* ★RAW_BUILD / rawNum / rawEsc はファイルの先頭（ルーティングより前）へ移した
     （2026-08-15）。理由はあちらの説明を参照。ここには置かないこと。 */

  const RAW_HIDE_KEY = 'msq_raw_hidden';   // ✕で消したもの（商品IDの一覧）
  const RAW_COLS_KEY = 'msq_raw_cols';     // 何列で見るか
  const RAW_LIKE_KEY = 'msq_raw_liked';    // メルカリ本体で反映確認できたいいね
  const RAW_LIKE_PENDING = 'msq_raw_like_pending'; // 一覧→商品ページの反映待ち
   /* ★本体のハート(data-testid=item-thumbnail-icon)を一覧の一番上に残す。
      自前のハートは作らず、本体の操作・表示を使う。 */
   const RAW_NATIVE_LIKE_HIDDEN = 'data-msq-native-like-hidden';
   const RAW_NATIVE_LIKE_STYLE = 'data-msq-native-like-style';

  /* ★2026-08-08 「既定は2列」にしたのに実機は1列で始まった（実機で確認）。
     原因は保存された列数。前の作り（3列→2列→1列）で押した値が残っていて、
     既定より保存が優先されるため、いつまでも1列のまま。
     ボタンの意味を変えた時に1回だけ捨てる。以後は押した通りに残る。 */
   try {
     if (localStorage.getItem('msq_raw_cols_v') !== '3') {
       localStorage.removeItem(RAW_COLS_KEY);
       localStorage.setItem(RAW_COLS_KEY, '2');
       localStorage.setItem('msq_raw_cols_v', '3');
     }
   } catch (e) { }

  /* 目標の利益を出すのに必要な売値。仕入元一覧の青い札と同じ式。
     ここでは共有せず自前で持つ（この枠を独立させるため）。 */
  const RAW_FEE = { purchase: 770, shipping: 750, sellRate: 0.10, outsource: 500 };
  function rawGoal(cost) {
    const c = rawNum(cost);
    if (c <= 0) return null;
    const want = rawGoalWant(c);   /* ★2026-09-12 4段＋利益率。PCと同じ */
    const raw = (want + c + RAW_FEE.purchase + RAW_FEE.shipping + RAW_FEE.outsource)
      / (1 - RAW_FEE.sellRate);
    return { sell: Math.ceil((raw - 80) / 100) * 100 + 80, want: want };
  }

  /* 一覧をそのまま読む。書き込む前に必ずこちらで読み直すこと。 */
  function rawLoadHiddenNama() {
    try { return new Set(JSON.parse(localStorage.getItem(RAW_HIDE_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  /* ★書き戻しはここでやらないこと。ここは const rawHidden の初期化から呼ばれるため、
       まだ宣言されていない RAW_HIDE_META を使うことになり、読み込んだ瞬間に落ちる
       （TDZ。この案件で何度も踏んでいる型）。書き戻しは rawModoshiUshinawareta で、
       すべての宣言より後ろから1回だけ呼ぶ。 */
  function rawLoadHidden() { return rawLoadHiddenNama(); }
  function rawSaveHidden(set) {
    try { localStorage.setItem(RAW_HIDE_KEY, JSON.stringify(Array.from(set))); } catch (e) { }
  }
  const rawHidden = rawLoadHidden();
  const rawUndo = [];   // 直前に消したものを戻す用

  function rawLikeLoad() {
    try {
      const o = JSON.parse(localStorage.getItem(RAW_LIKE_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function rawLikeSave(o) {
    try { localStorage.setItem(RAW_LIKE_KEY, JSON.stringify(o || {})); } catch (e) { }
  }
  function rawLikeSet(id, on) {
    const o = rawLikeLoad();
    if (on) o[id] = true; else delete o[id];
    rawLikeSave(o);
  }
  /* スマホWeb版の一覧ハートと同じ送信方法。
     本体は商品ページへ移動せず、/likes/add または /likes/del に
     FormData(item_id) を送る。ログインCookieは現在のWebViewを使う。 */
  async function rawLikeApi(id, on) {
    const fd = new FormData();
    fd.append('item_id', String(id));
    const res = await fetch(on ? '/likes/add' : '/likes/del', {
      method: 'POST', credentials: 'include', body: fd
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  }
  function rawLikePendingLoad() {
    try { return JSON.parse(sessionStorage.getItem(RAW_LIKE_PENDING) || 'null'); }
    catch (e) { return null; }
  }
  function rawLikePendingSave(o) {
    try { sessionStorage.setItem(RAW_LIKE_PENDING, JSON.stringify(o || {})); } catch (e) { }
  }
  function rawLikePendingClear() {
    try { sessionStorage.removeItem(RAW_LIKE_PENDING); } catch (e) { }
  }
  function rawLikeToast(s) {
    try {
      let el = document.getElementById('msq-raw-like-msg');
      if (!el) {
        el = document.createElement('div');
        el.id = 'msq-raw-like-msg';
        el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:2147483001;'
          + 'padding:10px 12px;border-radius:8px;background:#0f172a;color:#fff;'
          + 'font:700 13px/1.35 system-ui,-apple-system,sans-serif;text-align:center;'
          + 'box-shadow:0 2px 8px rgba(0,0,0,.35);';
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = String(s || '');
      clearTimeout(el.__msqTimer);
      el.__msqTimer = setTimeout(() => { try { el.remove(); } catch (e) { } }, 2600);
    } catch (e) { }
  }
  function rawLikeButtonActive(btn) {
    if (!btn) return false;
    try {
      const s = [
        btn.getAttribute('aria-label') || '',
        btn.getAttribute('title') || '',
        btn.getAttribute('data-testid') || '',
        btn.getAttribute('aria-pressed') || '',
        btn.innerHTML || ''
      ].join(' ');
      if (/ログインが必要|ログインが必要です|login required/i.test(s)) return false;
      if (btn.getAttribute('aria-pressed') === 'true') return true;
      return /解除|済み|取り消し|unlike|remove|filled|solid/i.test(s);
    } catch (e) { return false; }
  }
  function rawLikeDetailStart() {
    let p = rawLikePendingLoad();
    if (!p || !p.id || !p.ts) return;
    if (Date.now() - Number(p.ts) > 120000) { rawLikePendingClear(); return; }
    const m = String(location.pathname || '').match(/^\/item\/([^/?#]+)/);
    if (!m || m[1] !== String(p.id)) return;
    const btn = Array.from(document.querySelectorAll(
      'button[data-testid="icon-heart-button"],button[aria-label*="いいね"],'
      + 'button[aria-label*="イイね"],[role="button"][aria-label*="いいね"],'
      + '[role="button"][aria-label*="イイね"]'
    )).find((e) => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden';
    });
    if (!btn) return;
    const label = [btn.getAttribute('aria-label') || '', btn.getAttribute('title') || ''].join(' ');
    if (/ログインが必要|login required/i.test(label)) {
      rawLikePendingClear();
      rawLikeToast('メルカリのいいねにはログインが必要です');
      return;
    }
    const desired = p.on !== false;
    const nowOn = rawLikeButtonActive(btn);
    if (nowOn === desired) {
      rawLikeSet(String(p.id), desired);
      rawLikePendingClear();
      setTimeout(() => { try { history.back(); } catch (e) { } }, 250);
      return;
    }
    if (p.busy) return;
    p.busy = true;
    rawLikePendingSave(p);
    try { btn.click(); } catch (e) { rawLikePendingClear(); return; }
    setTimeout(() => {
      const after = rawLikeButtonActive(btn);
      if (after === desired) {
        rawLikeSet(String(p.id), desired);
        rawLikePendingClear();
        setTimeout(() => { try { history.back(); } catch (e) { } }, 250);
      } else {
        rawLikePendingClear();
        rawLikeToast('メルカリ側のいいね反映を確認できませんでした');
      }
    }, 600);
  }

  /* ===== ✕で消した物の自動解放と、ページ単位のロック（2026-08-11） =====
     ユーザー指示「消したは数日で戻していい。ただし必要なページはロックできると助かる。
     ロックは1件ずつではなく【その商品ページ＝その検索条件】丸ごと。一覧で見たい」。
     ★今まで商品IDしか持っていなかったため、古い物を選んで戻すことができなかった。
       いつ消したか・どの検索条件で消したかを一緒に残す。 */
  const RAW_HIDE_META = 'msq_raw_hidden_meta';  // {商品ID: [消した時刻, 検索条件]}
  const RAW_LOCK_KEY = 'msq_raw_locks';         // 残す（自動で戻さない）検索条件の一覧
  /* ★2026-08-27 起点を変えた。「✕を押してから」ではなく
       【その検索を最後に開いてから】この日数で自動で戻す。
       開くたびに時計を進めるので、使い続けている検索の✕は永久に残る。
       7日だと、まだ調べている最中の検索でも勝手に戻っていた（実機で確認）。 */
  const RAW_HIDE_DAYS = 30;

  /* ★この鍵は自前で作る。よく似た rawBaseKey は下の方で const 宣言されており、
     読み込みの早い時点で呼ぶと「初期化前に使った」で落ちる（過去に実際に落ちた）。 */
  /* ★2026-08-27 空白の書き方をそろえる。
     URLの中では + も %20 も同じ「空白」だが、文字としては別物。
     揃えないと、同じ検索なのに別の検索と判定される（実機で78文字目から食い違っていた）。
     ★下の rawBaseKey にも同じものを入れてある。片方だけ直すと今度はそちらがずれる。 */
  function rawKeySoroeru(t) {
    return String(t == null ? '' : t).split('+').join('%20');
  }
  function rawPageKey() {
    try {
      const u = new URL(location.href);
      u.searchParams.delete('page_token');
      return rawKeySoroeru(u.search || '?');
    } catch (e) { return rawKeySoroeru(location.search || '?'); }
  }

  function rawLoadMeta() {
    try { return JSON.parse(localStorage.getItem(RAW_HIDE_META) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function rawSaveMeta(m) {
    try { localStorage.setItem(RAW_HIDE_META, JSON.stringify(m)); } catch (e) { }
  }
  /* ★2026-08-27 空白の書き方を揃えてから返す。
       08-27 に鍵を %20 に揃える直しを入れたが、それより前に登録した南京錠は
       「+」のままで永久に一致せず、掛けたページが7日で黙って戻されていた
       （実機で 8個中5個が どの記録にも当たっていなかった）。 */
  function rawLoadLocks() {
    try {
      const a = JSON.parse(localStorage.getItem(RAW_LOCK_KEY) || '[]');
      return Array.isArray(a) ? a.map(rawKeySoroeru) : [];
    }
    catch (e) { return []; }
  }
  function rawSaveLocks(a) {
    try { localStorage.setItem(RAW_LOCK_KEY, JSON.stringify(a)); } catch (e) { }
  }

  /* ✕で消した時の記録。IDだけでなく、いつ・どのページかも残す。 */
  function rawMarkHidden(id) {
    rawHidden.add(id); rawUndo.push(id);
    /* ★2026-08-27 丸ごと上書きしない。画面が2つ以上あると、古い手持ちで
       相手の✕を消していた（実機で9件が失われていた）。足す1件だけを足す。 */
    { const t = rawLoadHiddenNama(); t.add(id); rawSaveHidden(t); }
    const m = rawLoadMeta();
    m[id] = [Date.now(), rawPageKey()];
    rawSaveMeta(m);
  }

  /* 記録(meta)にあるのに、IDの一覧から失われている物を書き戻す（2026-08-27）。
     ★実機で9件が失われていた（7日以内なのに戻ってしまう物）。
       原因は一覧の丸ごと上書き。meta が本物の記録で、一覧はその索引。
     ★期限切れの物まで戻るが、この直後に走る rawPurgeHidden が正しく片付ける。
     ★「全部戻す」は meta も空にするので、ここで生き返ることはない。
     ★すべての宣言より後ろから呼ぶこと（前で呼ぶと TDZ で落ちる）。 */
  function rawModoshiUshinawareta() {
    try {
      const m = rawLoadMeta();
      const t = rawLoadHiddenNama();
      let modo = 0;
      Object.keys(m).forEach((id) => {
        if (t.has(id)) return;
        t.add(id); rawHidden.add(id); modo++;
      });
      if (modo) rawSaveHidden(t);
      return modo;
    } catch (e) { return 0; }
  }

  /* 期限切れを戻す。ロックしたページで消した物は何日経っても戻さない。 */
  function rawPurgeHidden() {
    const m = rawLoadMeta();
    const locks = rawLoadLocks();
    const now = Date.now();
    const lim = RAW_HIDE_DAYS * 864e5;
    let modoshita = 0, kaita = false;
    const kesu = [];
    rawHidden.forEach((id) => {
      const e = m[id];
      /* ★記録が無い物＝この仕組みを入れる前に消した物。捨てずに今日付けにする。
         いきなり期限切れ扱いにすると、これまで消してきた物が一斉に生き返るため。 */
      if (!e) { m[id] = [now, '']; kaita = true; return; }
      /* ★2026-08-27 こちらも書き方を揃えて見る（古い「+」入りの記録に当てるため） */
      if (e[1] && locks.indexOf(rawKeySoroeru(e[1])) >= 0) return;
      if ((now - (e[0] || now)) > lim) {
        rawHidden.delete(id); delete m[id]; kesu.push(id); modoshita++; kaita = true;
      }
    });
    /* ★2026-08-27 丸ごと上書きすると、別の画面で消した分を巻き添えにする。
       読み直した一覧から、戻す物だけを引いて書く。 */
    if (kesu.length) { const t = rawLoadHiddenNama(); kesu.forEach((id) => t.delete(id)); rawSaveHidden(t); }
    if (kaita) { rawSaveMeta(m); }
    return modoshita;
  }

  /* その検索を開いたら、その条件で消した物の時計を今日に進める（2026-08-27）。
     ★これが「起点は最後に開いた日」の本体。使い続けている検索の✕は期限が来ない。
     ★1日以上経っている物だけ書く（毎回書くと記録174KBを開くたびに書き直すため）。
     ★鍵は書き方を揃えて見る。古い「+」入りの記録もここで今の書き方に直る。 */
  function rawTouchPage() {
    try {
      const key = rawPageKey();
      if (!key || key === '?') return 0;
      const m = rawLoadMeta();
      const now = Date.now();
      let kaita = 0;
      Object.keys(m).forEach((id) => {
        const e = m[id];
        if (!e || !e[1]) return;
        if (rawKeySoroeru(e[1]) !== key) return;
        if ((now - (e[0] || 0)) < 864e5) return;
        e[0] = now; e[1] = key; kaita++;
      });
      if (kaita) rawSaveMeta(m);
      return kaita;
    } catch (e) { return 0; }
  }

  const rawIdOf = (a) => {
    try {
      /* ★Shopsの商品はURLが違う（/shops/product/…）。個人の出品(/item/…)しか
         見ていなかったため、Shopsのタイルには✕が付かなかった（2026-08-08 実機）。 */
      const h = String(a.getAttribute('href') || '');
      const m = h.match(/\/item\/([^/?#]+)/) || h.match(/\/shops\/product\/([^/?#]+)/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  };

  /* ------------------------------------------------------------------ 見た目 */
  function rawInjectStyle() {
    if (document.getElementById('msq-raw-style')) return;
    const st = document.createElement('style');
    st.id = 'msq-raw-style';
    st.textContent = [
      /* ★画面の上に固定する（ウィンドウ枠固定と同じ考え方）。
         ただし固定しただけだと下の中身を覆い、メルカリの検索窓に届かなくなる。
         帯の高さぶんだけページ全体を下げる（下の rawPushDown）。 */
      /* ★2026-08-11 帯が2段になり、その下のメルカリのヘッダまで押し下げていた。
         実測: 1段目330px／画面389px。字と余白を詰めて1段に収める（実機で指摘）。 */
      /* ★2026-09-21 上部メニューをウインドウ枠のように固定しない。
         本物のメルカリアプリと同じく、ページの流れに置いてスクロールで自然に
         上下する。固定のままにすると純正ヘッダ・絞り込み行と重なり、
         一瞬の表示崩れを作るため。 */
      '#msq-raw-bar{position:static;z-index:2147483000;display:flex;flex-direction:column;gap:5px;',
      'align-items:stretch;padding:4px 7px;background:#0f172a;color:#fff;',
      'font:700 11px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);}',
      '#msq-raw-meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center;min-width:0;}',
      '#msq-raw-topline{display:flex;align-items:center;gap:3px;width:100%;min-width:0;flex-wrap:wrap;}',
      '#msq-raw-info{display:flex;align-items:center;gap:5px;margin-left:0;min-width:0;max-width:100%;flex:0 0 100%;flex-wrap:wrap;white-space:normal;}',
      '#msq-raw-actions{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;width:100%;min-width:0;',
      'overflow-x:auto;overflow-y:hidden;padding-bottom:1px;scrollbar-width:none;}',
      '#msq-raw-actions::-webkit-scrollbar{display:none;}',
      '#msq-raw-bar img{width:36px;height:36px;object-fit:cover;border-radius:6px;background:#fff;}',
      '#msq-raw-bar .msq-raw-btn{flex:0 0 auto;box-sizing:border-box;min-height:34px;',
      'padding:0 10px;border:none;border-radius:7px;background:#2563eb;color:#fff;',
      'font:700 13px system-ui;cursor:pointer;}',
      '#msq-raw-bar .msq-raw-goal{color:#7dd3fc;}',
      '#msq-raw-bar .msq-raw-query{flex:0 0 100%;width:100%;min-width:0;box-sizing:border-box;',
      'padding:6px 10px;border:1px solid rgba(148,163,184,.55);border-radius:20px;',
      'background:#1e293b;color:#fff;font:600 12px/1.3 system-ui;outline:none;}',
      '#msq-raw-bar .msq-raw-query:focus{border-color:#60a5fa;',
      'box-shadow:0 0 0 2px rgba(96,165,250,.25);}',
       /* ★本体ハートを一番上に残し、その下を✕→仕→型の順にする。 */
       '.msq-raw-shiire{position:absolute;right:9px;top:72px;z-index:1;width:26px;height:26px;',
      'border-radius:13px;border:none;background:rgba(37,99,235,.85);color:#fff;',
      'font:700 12px/1 system-ui;cursor:pointer;}',
       /* ★本文から型番を調べる「型」。本体ハート・✕・仕の下。 */
       '.msq-raw-kata{position:absolute;right:9px;top:104px;z-index:1;width:26px;height:26px;',
      'border-radius:13px;border:none;background:rgba(202,138,4,.85);color:#fff;',
      'font:700 12px/1 system-ui;cursor:pointer;}',
       '.msq-raw-x{position:absolute;right:9px;top:40px;z-index:1;width:26px;height:26px;',
      'border-radius:13px;border:none;background:rgba(15,23,42,.72);color:#fff;',
      'font:700 14px/1 system-ui;cursor:pointer;}',
      /* ★色を決め打ちにしない。#111(黒)にしていたため、暗い画面では
         黒地に黒で見えなかった（2026-08-08 実機）。周りの文字色に合わせる。 */
      '.msq-raw-sub{display:block;padding:0 4px 6px;',
      'font:600 11px/1.3 system-ui,-apple-system,sans-serif;color:#7dd3fc;word-break:break-all;}',
      '.msq-raw-title{display:block;padding:3px 4px 6px;',
      'font:600 12px/1.35 system-ui,-apple-system,sans-serif;color:inherit;',
      'word-break:break-all;}',
    ].join('');
    document.documentElement.appendChild(st);
  }

  /* 列数を変える。メルカリの一覧はグリッドなので、列数だけ上書きする。
     ★中身には触らない。効かない作りに変わっても、元の見た目に戻るだけ。 */
  /* ★2026-08-08 当て先を決め打ちにしていたので一度も効かなかった。
     並びの箱を【その場で探す】方式に変える。
     やり方: 商品タイルをいくつか拾い、その親をたどって
     「タイルを3枚以上ぶら下げている箱」を見つける。それが並びの箱。
     見つからなければ何もしない（元の見た目のまま）。 */
  /* こちらが足した箱。並びを探す時にここは見ない。
     ★2026-08-08 これを入れていなかったため、持ち越し箱（並びの手前に入る）の
       中の商品を先頭とみなし、そちらを「メルカリの並び」と取り違えていた。
       結果、列数がこちらの箱に当たり、メルカリ本体は3列のまま残った（実機）。 */
  const rawMine = (el) => !!(el && el.closest
    && el.closest('#msq-raw-carry,#msq-raw-add,#msq-brand-box,#msq-raw-bar,#msq-haya'));

  /* ★2026-08-11 広告の見分け方（実機で確認）。
     メルカリの広告タイルは href に ?ad_id=… &ad_auction_id=… が必ず付く。
     本物の商品には付かない（実機の一覧87件で ad_id 付きは0件）。
     文字の「PR」では見分けられない。今の広告は⚡の帯だけで PR の字を持たない。 */
  const rawIsAd = (a) => /[?&]ad_(id|auction_id)=/.test((a && a.getAttribute && a.getAttribute('href')) || '');

  /* ★2026-08-11 広告を【溜め込みに入れない・入っていたら捨てる】ための道具。
     実機で確認: 次ページを取り込むたびに広告も一緒に持ってきて持ち越しに保存し、
     読み直すたびに復活していた。素の広告は3件なのに84件まで積み上がっていた。
     ★消すのは広告1枚ぶんの入れ物まで。商品が2つ以上入る箱には絶対に広げない。 */
  /* ★2026-08-27 ✕で消した物を、入れ直す時にも捨てる。
     ★rawDropAds（広告を捨てる）とまったく同じ形にしてある。
       入れ直す経路が増えた時は、rawDropAds を呼んでいる所の隣に必ずこれも呼ぶこと。
     ★rawHidden は localStorage に残っているので、ページを読み直しても消えない。
       見ずに入れ直していたのが復活の原因だった（実機で1件再現）。 */
  function rawDropHidden(box) {
    try {
      if (!box || !rawHidden || !rawHidden.size) return 0;
      let keshita = 0;
      box.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach(function (a) {
        const id = rawIdOf(a);
        if (!id || !rawHidden.has(id)) return;
        /* タイルごと消す。1マス分が詰まる動きは cellOf と同じ考え方で親をたどる */
        let t = a;
        for (let i = 0; i < 8 && t && t.parentElement && t.parentElement !== box; i++) t = t.parentElement;
        if (t && t.parentElement === box) { t.remove(); keshita++; }
      });
      return keshita;
    } catch (e) { return 0; }
  }
  function rawDropAds(root) {
    if (!root || !root.querySelectorAll) return 0;
    const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
    let n = 0;
    const ads = [];
    root.querySelectorAll(SEL).forEach((a) => { if (rawIsAd(a)) ads.push(a); });
    ads.forEach((a) => {
      let box = a;
      for (let up = 0; up < 5; up++) {
        const p = box.parentElement;
        if (!p || p === root) break;                     // 入れ物そのものは消さない
        if (p.querySelectorAll(SEL).length !== 1) break; // 他の商品が入る箱には広げない
        box = p;
      }
      try { box.remove(); n++; } catch (e) { }
    });
    return n;
  }

  function rawFindGrid() {
    const list = [];
    document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach((a) => {
      if (rawMine(a)) return;
      /* ★2026-08-11 これが「1列にしたのに下は3列」の正体（実機で確認）。
         #item-grid の中は【広告ブロック3件】＋【本物のUL87件】に分かれていて、
         1件目が広告タイルだったため、そこから親を辿って広告ブロックを
         「並びの箱」と取り違え、1列を広告に当てていた。本物のULは3列のまま残る。
         広告は数に入れない。 */
      if (rawIsAd(a)) return;
      if (a.querySelector('img') || a.querySelector('[role="img"]')) list.push(a);
    });
    /* ★2026-08-09 3件以上を要求していたため、売り切れが1件しか無い検索では
       箱が見つからず、1列にしても画面いっぱいにならなかった（実機で指摘）。
       1件でも探す。 */
    if (list.length < 1) return null;
    let node = list[0];
    let best = null, bestN = -1, bestUl = false;
    for (let i = 0; i < 6 && node && node.parentElement; i++) {
      node = node.parentElement;
      if (rawMine(node)) break;         // こちらの箱に迷い込んだらそこまで
      let n = 0;
      for (let k = 0; k < node.children.length; k++) {
        const c = node.children[k];
        if (c.querySelector && (c.querySelector('a[href*="/item/"],a[href*="/shops/product/"]')
          || (c.matches && c.matches('a[href*="/item/"],a[href*="/shops/product/"]')))) n++;
      }
      const ul = (node.tagName === 'UL' || node.tagName === 'OL');
      /* タイルが多い段を選ぶ。同数なら並び用の箱(UL/OL)を優先する。
         ★商品が1件だとどの段もタイル1個で並ぶので、この優先が無いと
           すぐ上のDIVを箱と間違える。 */
      if (n > bestN || (n === bestN && ul && !bestUl)) { bestN = n; best = node; bestUl = ul; }
    }
    /* ★2026-08-09 判定を「一番タイルが多い段」に変えた。検証台で実物を測った結果:
           a → DIV(子2/タイル1) → LI(子1/タイル1) → UL(子120/タイル15) → #item-grid(子2/タイル1)
       並びのULは枠を先に120個作り、商品は後から入る。読み込み直後は15個しか
       入っていないため、「6割以上がタイル」では 15>=72 が成立せず、
       箱と認めないまま3列で残っていた（前日の実機は117個まで埋まって成立していただけ）。
       一番多い段はどの時点でもULなので、多数決で選ぶ方が確実。
       上の段はタイルが1個しか無いので取り違えない。 */
    return bestN >= 1 ? best : null;
  }

  /* ★2026-08-09 一覧を離れる時に、こちらが付けた指定を全部はがす。
     メルカリは画面を切り替えても要素を作り直さず使い回すため、列数の指定
     （2列のグリッド）が商品ページの入れ物に残り、拡大画面の画像が
     半分の大きさに縮んで下にずれていた。
     検証台で実測: 素は 上端92/高さ732、こちらのコード有りは 上端173/高さ412。
     ★はがすのは【こちらが付けた物だけ】。メルカリ本来の指定には触らない。 */
  let rawStyledGrid = null;
  /* ★2026-08-11 貼り付け位置を毎回測り直すと、帯が出る・ログイン段が隠れるの
     2回ぶん位置が動いて「ダブって」見える（実機で指摘）。
     帯の高さは出ている時に覚えておき、隠れている間もその値を使う。 */
  let rawBarH = 0;

   function rawCleanup() {
    /* ロゴ行と検証操作帯をまとめた仮ラッパーを外し、DOM順を戻す。 */
    try { rawRestoreUnifiedHeaderWindow(); } catch (e) { }
    /* ★2026-08-12 下メニューの「仕入」と、そのための列指定は【はがさない】。
       ユーザー依頼で「検索していない時も仕入を出す」ようにしたため、
       ここで消すと、消す→付け直すの往復になり【メニューがちらつく】。
       実機で確認: navの節は同じまま（メルカリは作り直していない）のに、
       4.0秒 子4・仕入0 → 4.5秒 子5・仕入1 を繰り返していた。
       ★この後始末が元々直したかったのは【商品ページの拡大画面】であって
         下メニューではない。下メニューの分だけ外す。 */
    /* ★2026-09-09 rawFutatsume の剥がす所と同じ間違いがここにもあった。
         [data-msq-2dan] は一致しない（正しくは data-msq2dan）。一覧を離れる時に
         貼り付きが残ったままだった。margin/padding も一緒に戻す（積み上がり防止）。
       ★grep用の目印: 印は data-msq2dan */
    document.querySelectorAll('[data-msq2dan]').forEach((e) => {
      ['position','top','z-index','background',
        'margin-left','margin-right','padding-left','padding-right'
      ].forEach((q) => { try { e.style.removeProperty(q); } catch (err) { } });
      try { delete e.dataset.msq2dan; } catch (err) { }
    });
    document.querySelectorAll('[data-msq-login]').forEach((e) => {
      try { e.style.removeProperty('display'); delete e.dataset.msqLogin; } catch (err) { }
    });
    const b = document.getElementById('msq-raw-bar');
    if (b) b.remove();
    /* ★2026-08-11 #msq-brand-box をここに入れていたのが原因で、ブランド一覧が
       出た瞬間に消えていた。ブランド一覧は /search ではない画面に出るので、
       『一覧を離れたら片付ける』の対象にしてはいけない。 */
    /* ★2026-09-09 浮かせた本物の行は必ず元に戻す（★grep: 本物を浮かせる）。
       戻さないまま商品ページへ行くと、浮いた行が residual で残る。 */
    try { rawUkasu(false); } catch (e) { }
    /* ★2026-09-09 自前の絞り込みの行も一覧を離れる時に片付ける（★grep: 帯の下に自前の行） */
    ['#msq-raw-carry', '#msq-raw-add', '#msq-raw-status', '#msq-shibori-gyou'].forEach((s) => {
      const e = document.querySelector(s);
      if (e) e.remove();
    });
    if (rawStyledGrid) {
      ['display', 'grid-template-columns', 'gap'].forEach((p) => {
        try { rawStyledGrid.style.removeProperty(p); } catch (e) { }
      });
      rawStyledGrid = null;
    }
    try { if (document.body) document.body.removeAttribute('data-msq-raw-grid-ready'); } catch (e) { }
    /* ★こちらが貼り付けた絞り込み・タグの行を元に戻す（2026-08-11） */
    document.querySelectorAll('[data-msq-stick]').forEach((e) => {
      ['position', 'top', 'z-index', 'background', 'padding',
        'margin-left', 'margin-right', 'padding-left', 'padding-right']
        .forEach((p) => { try { e.style.removeProperty(p); } catch (err) { } });
      try { delete e.dataset.msqStick; delete e.dataset.msqTagrow; delete e.dataset.msqSide; } catch (err) { }
    });
    /* ★こちらが横並びにした見出し脇の箱を元に戻す（2026-08-11） */
    document.querySelectorAll('[data-msq-head],[data-msq-head-ng]').forEach((e) => {
      ['display', 'flex-direction', 'align-items', 'justify-content', 'flex-wrap', 'gap']
        .forEach((p) => { try { e.style.removeProperty(p); } catch (err) { } });
      try { delete e.dataset.msqHead; delete e.dataset.msqHeadNg; } catch (err) { }
    });
    /* ★2026-09-21 読み込み途中に一時的に隠した操作行を必ず戻す。 */
    document.querySelectorAll('[data-msq-head-pending]').forEach((e) => {
      try { e.style.removeProperty('visibility'); delete e.dataset.msqHeadPending; } catch (err) { }
    });
    /* ★2026-09-21 スクロール方向連動の行を元のstyleへ戻す。 */
    document.querySelectorAll('[data-msq-scroll-reveal-row]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-scroll-reveal-row');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-scroll-reveal-row');
      } catch (err) { }
    });
    /* ★2026-09-21 ネイティブ一覧用ヘッダーのスクロール監視を解除する。 */
    try {
      const st = window.__msqNativeHeaderReveal;
      if (st && st.listener) window.removeEventListener('scroll', st.listener);
      delete window.__msqNativeHeaderReveal;
    } catch (err) { }
    document.querySelectorAll('[data-msq-native-row]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-native-row');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-native-row');
      } catch (err) { }
    });
    /* ★2026-09-21 純正操作行の整列で透明化した親も元に戻す。 */
    document.querySelectorAll('[data-msq-native-menu-wrap]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-native-menu-wrap');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-native-menu-wrap');
      } catch (err) { }
    });
    document.querySelectorAll('[data-msq-native-menu-root]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-native-menu-root');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-native-menu-root');
      } catch (err) { }
    });
    /* ★2026-09-21 純正の並び替え・状態・絞り込みを含むsectionの固定を戻す。 */
    document.querySelectorAll('[data-msq-unpin-sort-row]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-unpin-sort-row');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-unpin-sort-row');
      } catch (err) { }
    });
    /* ★隠した会員登録・ログインの段を戻す（2026-08-11） */
    document.querySelectorAll('[data-msq-login]').forEach((e) => {
      try { e.style.removeProperty('display'); delete e.dataset.msqLogin; } catch (err) { }
    });
    /* ★こちらが下げたヘッダを元に戻す（2026-08-11） */
    const hd = document.querySelector('header');
    if (hd && hd.dataset && hd.dataset.msqTop) {
      try { hd.style.removeProperty('top'); delete hd.dataset.msqTop; } catch (e) { }
    }
    /* ★2026-09-21 上部ヘッダーの固定解除を一覧から離れる時に戻す。
       検証中の一覧だけで static にしているため、元のstyleを復元する。 */
    document.querySelectorAll('[data-msq-unpin-header]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-unpin-header');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-unpin-header');
      } catch (err) { }
    });
    document.querySelectorAll('[data-msq-slim-login]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-slim-login');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-slim-login');
      } catch (err) { }
    });
    /* ★本体ハートの重複表示を一覧から離れる時に復元する。 */
    document.querySelectorAll('[' + RAW_NATIVE_LIKE_HIDDEN + ']').forEach((e) => {
      try {
        const moto = e.getAttribute(RAW_NATIVE_LIKE_STYLE);
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute(RAW_NATIVE_LIKE_HIDDEN);
        e.removeAttribute(RAW_NATIVE_LIKE_STYLE);
      } catch (err) { }
    });
    /* ★2026-09-21 ホームの「いいね！した商品」にだけ付けた2列指定を戻す。 */
    document.querySelectorAll('[data-msq-home-like-cols]').forEach((e) => {
      try {
        const moto = e.getAttribute('data-msq-home-like-cols');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-home-like-cols');
      } catch (err) { }
    });
    document.querySelectorAll('[data-msq-tight]').forEach((e) => {
      ['margin-top', 'padding-top', 'margin-bottom', 'padding-bottom'].forEach((p) => {
        try { e.style.removeProperty(p); } catch (err) { }
      });
      try { delete e.dataset.msqTight; } catch (err) { }
    });
    document.querySelectorAll('[data-msq-ad]').forEach((e) => {
      try { e.style.removeProperty('display'); delete e.dataset.msqAd; } catch (err) { }
    });
    /* 隠した「販売中のみ表示」も戻す */
    const cb = document.querySelector('[data-testid="on-sale-condition-checkbox"]');
    const lab = cb ? (cb.closest('label') || cb.parentElement) : null;
    if (lab) { try { lab.style.removeProperty('display'); } catch (e) { } }
  }

   /* ★2026-09-21 ホームの「いいね！した商品」は検索一覧とは別のUL。
      ページ全体で一番大きい箱を選ぶ既存処理では3列のまま残ったため、
      見出し直下のsection内にある実グリッドだけを2列にする。 */
   function rawApplyHomeLikeCols() {
     const h = Array.from(document.querySelectorAll('h1,h2,h3,div,span,a'))
       .find((e) => (e.textContent || '').trim() === 'いいね！した商品');
     const section = h && h.closest('section');
     if (!section) return;
     const grids = Array.from(section.querySelectorAll('ul,ol,div')).filter((e) => {
       const z = getComputedStyle(e);
       return z.display === 'grid'
         && e.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').length > 1;
     });
     const grid = grids.sort((a, b) =>
       a.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').length
       - b.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').length)[0];
     if (!grid) return;
     if (!grid.hasAttribute('data-msq-home-like-cols')) {
       grid.setAttribute('data-msq-home-like-cols', grid.getAttribute('style') || '');
     }
     grid.style.setProperty('grid-template-columns', 'repeat(2,minmax(0,1fr))', 'important');
     grid.style.setProperty('gap', '8px', 'important');
   }

   function rawApplyCols() {
    /* ★既定は2列（ユーザー指定 2026-08-08）。
       何も保存されていない時＝初回や、ページが切り替わった時も2列で始まる。 */
    const cols = rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2;
    const grid = rawFindGrid();
    if (!grid) return;
    /* ★2026-08-11 前に当てた箱と違う箱になったら、前の指定を先に外す（実機で確認）。
       外していなかったため、取り違えた箱（広告の枠）に1列指定が残り続けていた。 */
    if (rawStyledGrid && rawStyledGrid !== grid) {
      ['display', 'grid-template-columns', 'gap'].forEach((p) => {
        try { rawStyledGrid.style.removeProperty(p); } catch (e) { }
      });
      rawStyledGrid = null;
    }
    if (cols > 0) {
      const firstPaint = rawStyledGrid !== grid
        || grid.style.display !== 'grid'
        || !document.body
        || document.body.getAttribute('data-msq-raw-grid-ready') !== '1';
      rawStyledGrid = grid;   // 離れる時にはがせるよう覚えておく
      if (firstPaint) {
        /* 先行CSSの visibility だけでは、WebViewの合成済み3列フレームが
           再表示されることがあった。いったん描画対象から外してレイアウトを
           確定させ、次のフレームで2列だけを表示する。 */
        grid.style.setProperty('display', 'none', 'important');
        grid.style.setProperty('grid-template-columns', 'repeat(' + cols + ',1fr)', 'important');
        grid.style.setProperty('gap', '8px', 'important');
        try { void grid.offsetHeight; } catch (e) { }
        requestAnimationFrame(() => {
          if (rawStyledGrid !== grid) return;
          grid.style.setProperty('display', 'grid', 'important');
          grid.style.setProperty('grid-template-columns', 'repeat(' + cols + ',1fr)', 'important');
          grid.style.setProperty('gap', '8px', 'important');
          try { if (document.body) document.body.setAttribute('data-msq-raw-grid-ready', '1'); } catch (e) { }
        });
      } else {
        grid.style.setProperty('display', 'grid', 'important');
        grid.style.setProperty('grid-template-columns', 'repeat(' + cols + ',1fr)', 'important');
        grid.style.setProperty('gap', '8px', 'important');
      }
    } else {
      // 元に戻す（こちらが足した指定だけを外す）
      grid.style.removeProperty('display');
      grid.style.removeProperty('grid-template-columns');
      grid.style.removeProperty('gap');
    }
  }

   /* --------------------------------------------------------- タイルに足すもの */
   function rawDecorate() {
     const grid = rawFindGrid();   // 1回だけ探す（タイルごとに探すと重い）
    const anchors = document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]');
    anchors.forEach((a) => {
      /* ★2026-08-08 タイルの見つけ方を緩めた。
         data-testid="item-thumbnail" を必須にしていたが、アプリ側のメルカリには
         その印が無く、✕もタイトルも1つも付かなかった（実機で確認）。
         画像さえ入っていればタイルとみなす。 */
      if (a.closest('#msq-haya')) return;
      if (!a.querySelector('img') && !a.querySelector('[role="img"]')) return;
      const id = rawIdOf(a);
      if (!id) return;

      /* ★2026-08-08 重さの原因はここだった。
         タイル1枚ごとに親を8段さかのぼり、その都度ページ全体を検索していたため、
         タイル100枚で800回の全体検索を2秒ごとに繰り返していた。
         もう手を入れてあるタイルは、何もせずに即座に飛ばす。 */
      const hidden = rawHidden.has(id);
      const hasX = !!a.querySelector('.msq-raw-x');
      /* ★メルカリのWeb版はスマホ表示でタイトルを出さない（アプリ版は出す）。
         なのでタイトルはこちらで付ける。ユーザー確認済み（2026-08-08）。
         ★飛ばす条件に入れる「タイトルがあるか」は、必ず【付ける場所と同じ所】を見ること。
           違う場所を見ると永久に一致せず、毎回すべてを調べ直して重くなる。 */
      /* 商品カードはこの <a> 自身。parentElement は一覧全体の
         .group (多数の商品リンクを含む) なので、そこを読むと
         先頭カードの題名・価格が全カードに流用される。 */
      const par = a;
      const hasTitle = !!(par && par.querySelector('.msq-raw-title'));
      /* ★2026-08-12 行(.msq-raw-sub)の有無も見る。題と✕だけで飛ばすと、
         既に題が付いたタイルには行が永久に出ない。 */
      const hasSub = !!(par && par.querySelector('.msq-raw-sub'));
       if (!hidden && hasX && hasTitle && hasSub) return;

      /* マス（並びの1コマ）を見つける。そのタイルだけを含む一番外側まで遡る。
         必要になった時だけ呼ぶ（毎回やると重い）。 */
      const cellOf = (el) => {
        const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
        let box = el;
        for (let up = 0; up < 8; up++) {
          const p = box.parentElement;
          if (!p) break;
          if (p.querySelectorAll(SEL).length > 1) break;
          box = p;
        }
        return box;
      };

      if (hidden) { cellOf(a).style.display = 'none'; return; }

      if (!hasX) {
        a.style.position = 'relative';
        const x = document.createElement('button');
        x.className = 'msq-raw-x';
        x.textContent = '✕';
        x.title = 'この商品を消す';
        x.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          rawMarkHidden(id);   /* いつ・どのページで消したかも残す（2026-08-11） */
          cellOf(a).style.display = 'none';
          rawUpdateCount();
        });
        a.appendChild(x);
       /* ★2026-08-11 ③逆引き。この商品を仕入元サイトで探す（ユーザー指示）。
           押した言葉は画像の説明文から作る（タイトルと同じ出どころ）。 */
        const sh = document.createElement('button');
        sh.className = 'msq-raw-shiire';
        sh.textContent = '仕';
        sh.title = 'この商品を仕入元サイトで探す';
        sh.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const im = a.querySelector('[role="img"]') || a.querySelector('img');
          const label = (im && (im.getAttribute('aria-label') || im.getAttribute('alt'))) || '';
          /* par2 もカード自身に固定する。親グループを使うと
             カフタンドレスを押しても先頭商品の題名で検索してしまう。 */
          const par2 = a;
          const t = par2 && par2.querySelector('.msq-raw-title');
          /* ★2026-08-30 逆引きの判定に売値と型番が要るので一緒に渡す。
             値段はReactの中身から取り、無ければタイルの文字から拾う（既存と同じ考え方）。 */
          var uri9 = 0, kata9 = "", bra9 = "", itemUrl9 = "";
          try {
            itemUrl9 = a.href || a.getAttribute('href') || '';
            var it9 = rawItemData(a) || {};
            uri9 = rawNum(it9.price) || 0;
            /* ★2026-08-30 メルカリ自身が持っているブランド欄。
               実機で確認: 題が「ジャケットのみ」でも itemBrand は FABIANA FILIPPI だった。
               これを使わないと「絞れる語が無い」と判定して逆引きを止めてしまう。 */
            bra9 = String((it9.itemBrand && it9.itemBrand.name) || "");
            if (!uri9) { var m9 = (a.textContent || "").match(RAW_NE_RE); if (m9) uri9 = Number(m9[1].split(",").join("")) || 0; }
            var dai9 = (t && t.textContent) || label.replace("の画像", "");
            var cs9 = (typeof rawModelCodes === "function") ? (rawModelCodes(dai9) || []) : [];
            kata9 = cs9.length ? cs9[0] : "";
          } catch (e) { }
          /* ★2026-08-30 メルカリ側の画像も渡す（結果画面に並べるため） */
          var gaz9 = "";
          try {
            var img9 = a.querySelector("img");
            if (img9) gaz9 = img9.currentSrc || img9.src || img9.getAttribute("data-src") || "";
          } catch (e) { }
          rawShiirePanel((t && t.textContent) || label.replace('の画像', ''), uri9, kata9, bra9, gaz9, itemUrl9);
        });
        a.appendChild(sh);
       const kb = document.createElement('button');
        kb.className = 'msq-raw-kata';
        kb.textContent = '型';
        kb.title = '本文から型番を調べる（押した時だけ通信します）';
        kb.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          rawModelGo(a, id);
        });
        a.appendChild(kb);
      }

      /* 画像の下にタイトルを出す（メルカリのWeb版スマホ表示には無いため）。
         文字は画像の説明文(aria-label / alt)から取る。
         ★付ける場所は a.parentElement。上の「飛ばす条件」と同じ場所であること。 */
      if (par && !hasTitle) {
        const im = a.querySelector('[role="img"]') || a.querySelector('img');
        const label = (im && (im.getAttribute('aria-label') || im.getAttribute('alt'))) || '';
        const name = label.replace('の画像', '').replace('売り切れ', '')
          .replace(/[\d,]+円/, '').trim();
        if (name) {
          const t = document.createElement('span');
          t.className = 'msq-raw-title';
          t.textContent = name + (label.indexOf('売り切れ') >= 0 ? '  【売切】' : '');
          par.appendChild(t);
        }
      }

      /* ★2026-08-30 題の下に「いくらまでなら仕入れてよいか」を出す（ユーザー依頼）。
         ★浮かせて重ねない。拡張機能側で浮かせたら題に重なって読めなくなった。
         ★売値はタイルの本物のデータ（rawItemData）から取る。文字から拾わない。 */
      if (par && !par.querySelector(".msq-raw-line")) {
        try {
          const k9 = rawItemData(a) || {};
          const uri9b = rawNum(k9.price) || 0;
          if (uri9b >= 500) {
            const g9 = rawGoalKaeruLine(uri9b);
            /* ★2026-09-12 PCのタイルと同じ4色にした（ユーザーと決めた案ウ）。
                 色そのもの＝売れたかどうか。色の濃さ＝どこで買えるか。
                   濃い緑  売れた   買える線 2,000円以上   ネットでも店舗でも狙える
                   黄緑    売れた   買える線 2,000円未満   店舗で値札を見る時だけ
                   濃い青  販売中   買える線 2,000円以上   ネットでも店舗でも狙える
                   水色    販売中   買える線 2,000円未満   店舗で値札を見る時だけ
                   灰      　       　                    1円で仕入れても基準に届かない
               ★色だけだと画面を撮った時に分からないので、文字にも「店舗のみ」を出す。
               ★grep用の目印: 利益の基準は1か所 */
            const ureta9 = (function () {
              try {
                const im9 = a.querySelector('[role="img"]') || a.querySelector('img');
                const lb9 = (im9 && (im9.getAttribute('aria-label') || im9.getAttribute('alt'))) || '';
                if (lb9.indexOf('売り切れ') >= 0) return true;
                return String(a.textContent || '').indexOf('売り切れ') >= 0;
              } catch (e) { return false; }
            })();
            const netKaeru9 = !!g9 && g9.cost >= RAW_NERAU_SITA;
            const obiIro9 = ureta9
              ? (netKaeru9 ? "rgba(21,128,61,.94)" : "rgba(132,204,22,.94)")
              : (netKaeru9 ? "rgba(30,58,138,.92)" : "rgba(14,165,233,.92)");
            const ln = document.createElement("span");
            ln.className = "msq-raw-line";
            ln.textContent = g9
              ? (g9.cost.toLocaleString() + "円以下で仕入れれば利益" + g9.want.toLocaleString()
                + "円" + (netKaeru9 ? "" : "\n店舗のみ"))
              : "基準に届かない（1円でも利益なし）";
            ln.title = "利益の基準（利益計算ツールと同じ）: "
              + "仕入4,000未満→益1,500かつ50% ／ 8,000未満→益2,000かつ35% ／ "
              + "15,000未満→益3,000かつ30% ／ 15,000以上→益5,000かつ25%";
            ln.style.cssText = "display:block;margin:3px 4px 0;padding:3px 6px;border-radius:6px;"
              + "font:700 10px/1.35 system-ui;color:#fff;white-space:pre-line;"
              + "overflow-wrap:break-word;background:" + (g9 ? obiIro9 : "rgba(71,85,105,.9)") + ";";
            par.appendChild(ln);
          }
        } catch (e) { }
      }

      /* ★2026-08-12 タイルの下に「◯日で売れた (月/日) ・ サイズ」を出す。
         題とは別に足す。題が先に付いていても行だけ足せるようにするため
         （まとめると、既に題が付いたタイルには永久に出ない）。 */
      if (par && !par.querySelector('.msq-raw-sub')) {
        const k = rawItemData(a);
        /* ★型番は【本文から取れた時だけ】出す（2026-08-12 ユーザー指摘）。
           タイトルから抜いた型番を出しても、タイトルはすぐ上に出ているので
           情報が1つも増えない。意味があるのは「タイトルに無く本文にある型番」だけ。
           本文は商品を開かないと取れない（実測 1件3〜4秒）ので、取れた物には
           data-msq-m を付けておき、ここではそれを読むだけにする。 */
        let mo = '';
        for (let p = a; p && p !== document.body; p = p.parentElement) {
          if (p.getAttribute && p.getAttribute('data-msq-m')) { mo = p.getAttribute('data-msq-m'); break; }
        }
        /* 一度調べた商品は、押さなくても出す（保存から。通信はしない） */
        if (!mo) { const hz = rawModelLoad(); if (hz[id]) mo = hz[id]; }
        const hon = k ? rawUriKaku(k) : '';
        const moji = hon + (mo ? (hon ? ' ・ ' : '') + '型番 ' + mo : '');
        if (moji) {
          const s2 = document.createElement('span');
          s2.className = 'msq-raw-sub';
          s2.textContent = moji;
          par.appendChild(s2);
        }
      }
    });
  }

  /* 帯は画面に固定しているので、その高さぶんだけページ全体を下げる。
     これをしないと、上に戻った時にメルカリの検索窓が帯の下に隠れて押せない。 */
  /* ★2026-08-08 「高さぶんページを下げる」は効かなかった。
     メルカリの作りが body の余白を見ていないため、帯が検索窓を覆ったままだった。
     作りに左右されない方法に変える:【一番上にいる時だけ帯を隠す】。
     少しでもスクロールすれば出るので、常時見える利点はほぼ保てる。 */
  function rawPushDown() {
    const bar = document.getElementById('msq-raw-bar');
    if (!bar) return;
    /* ★2026-09-21 固定帯の出し入れをやめる。
       帯は通常のページ要素として流し、スクロール位置で display/top を
       切り替えない。これで純正ヘッダの自然な隠れ方・現れ方を邪魔しない。 */
    return;
    if (document.body && document.body.dataset.msqPad) {
      document.body.style.removeProperty('padding-top');
      delete document.body.dataset.msqPad;
    }
    if (window.__msqRawTopWatch) return;
    window.__msqRawTopWatch = true;
    const upd = () => {
      const b = document.getElementById('msq-raw-bar');
      if (!b) return;
      const y = window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
      /* ★2026-08-16 「びりびり（画面が細かく震える）」と
         「絞り込みが上に吸い付いて下のタイトルだけが出る」の直し。
         ★実機で往復そのものを捕まえた（スクロール位置35px・3秒間）:
             メルカリのログイン段 … display:none !important ⇄ (空)  144回（毎秒48回）
             こちらの帯          … display:flex ⇄ display:none      136回（毎秒45回）
         ★仕組み（自分で自分を揺らしていた）:
             しきい値は60px。ログイン段の高さは37px。
             ① y=35 なので帯を隠す → ログイン段を戻す → 37px下がって y=72
             ② y=72 で60を超えたので帯を出す → ログイン段を隠す → 37px戻って y=35
             ③ ①に戻る … を毎秒約48回。これが「びりびり」の正体。
           あわせて、この往復中はヘッダの高さが 94 ⇄ 57 で暴れるため、
           帯の top が94のまま絞り込み行(107px)の上に乗り、
           「絞り込みが吸い付いて見えない」状態にもなっていた。同じ原因。
         ★直し方: しきい値に【幅】を持たせる（ヒステリシス）。
             出す時は y>=60、引っ込める時は y<15。
             幅45px はログイン段の37pxより大きいので、
             段の出し入れで位置が動いても、しきい値をまたぎ返さない＝往復しない。
           （上端に戻れば今までどおり引っ込む。見た目の決まりは変えていない） */
      const maeDeru = !!window.__msqObiDeru;
      const deru = maeDeru ? (y >= 15) : (y >= 60);
      window.__msqObiDeru = deru;
      b.style.setProperty('display', deru ? 'flex' : 'none', 'important');
      /* ★2026-08-12 スクロールすると虫眼鏡が消える件（実機で指摘）。
         実測: メルカリのヘッダは sticky top:0 高さ57px z-index 1200。
               こちらの帯は fixed top:0 高さ51px z-index 21億。
               帯が【虫眼鏡の入った段】に重なって隠していた。
         ★メルカリのヘッダは動かさない（位置を動かすとあちらの固定計算が壊れ、
           「スクロールすると検索メニューが消える」になる。記録に5回失敗とある）。
           動かすのは【こちらの帯だけ】。ヘッダの高さぶん下へずらす。 */
      if (deru) {
        try {
          const hd = document.querySelector('header');
          const hh = hd ? Math.round(hd.getBoundingClientRect().height) : 0;
          let ue = (hh > 0 && hh < 200) ? hh : 0;
          /* ★2026-08-16 「絞り込みが消える」の直し（案B・ユーザー決定）。
             ★実測（メルカリの検索一覧・スクロール150〜400px）:
                 メルカリ自身の絞り込み行 … 56〜108px に貼り付く（高さ52px）
                 こちらの帯               … 57〜108px（重なり順 21億 対 1100）
               ＝絞り込み行52pxのうち【51pxを帯が塗りつぶし】、見えるのは1pxだけ。
                 これが「絞り込みが消える／タイトルだけ出る」の正体。
             ★直し方: 帯を【絞り込み行の真下】から始める。
                 帯は position:fixed なので、動かしても他の物の位置は1pxも動かない。
                 ＝押し下げの余白も、商品の並びも、帯の中身の見た目も一切変わらない。
                 ＝位置が変わっても layout が動かないので、前に直した往復（びりびり）も
                   蒸し返さない（fixed は他要素のレイアウトに影響しないため）。
             ★絞り込み行が無い画面（一番上／その行が無いページ）は、
               今までどおりヘッダの高さのまま。判定を増やしても振動しないのは上と同じ理由。
             ★探すのは section だけ（div まで見ると数千個を毎回調べることになり重い）。 */
          let shita = 0;
          const sec = document.querySelectorAll('section');
          for (let i = 0; i < sec.length; i++) {
            const e = sec[i];
            if ((e.id || '').indexOf('msq') === 0) continue;
            const t = e.textContent || '';
            if (t.indexOf('絞り込み') < 0 || t.indexOf('並び替え') < 0) continue;
            if (getComputedStyle(e).position !== 'sticky') continue;
            const r = e.getBoundingClientRect();
            if (r.height <= 0 || r.height > 120) continue;
            if (r.top > 200) continue;
            const shimo = Math.round(r.bottom);
            if (shimo > shita) shita = shimo;
          }
          if (shita > ue && shita < 300) ue = shita;
          /* ★2026-09-09 点滅（往復）の安全装置。ユーザー指示「同じものを新しい版にも入れろ」。
               今日、私が rawFutatsume に「行を帯の下端に貼る」を足したせいで
                 行は帯の下に付く → 帯は行の下に付く → …
               の堂々巡りになり、帯の top が 152 ⇄ 56 を0.7秒ごとに往復した（実測）。
               その変更は取り消したが、【二度と点滅させない】ための歯止めをここに置く。
             やり方: top の履歴を持ち、A→B→A→B と2往復したら【その場で固定】する。
                     固定する値は大きい方＝絞り込み行の下（帯が行を覆わない側）。
             ★帯を最初から固定はしない。それをすると帯が絞り込み行を覆う
               2026-08-16 の不具合が戻る。あくまで「暴れたら止める」。
             ★grep用の目印: 帯の往復を止める */
          try {
            if (!window.__msqObiKotei) {
              if (!window.__msqObiRireki) window.__msqObiRireki = [];
              const rir = window.__msqObiRireki;
              if (!rir.length || rir[rir.length - 1] !== ue) {
                rir.push(ue);
                if (rir.length > 6) rir.shift();
                const n = rir.length;
                if (n >= 4 && rir[n - 1] === rir[n - 3] && rir[n - 2] === rir[n - 4]
                  && rir[n - 1] !== rir[n - 2]) {
                  window.__msqObiKotei = Math.max(rir[n - 1], rir[n - 2]);
                  try { msqDiary('帯の往復を止めた', rir.join('→') + ' なので ' + window.__msqObiKotei + 'px に固定'); } catch (e2) { }
                }
              }
            }
            if (window.__msqObiKotei) ue = window.__msqObiKotei;
          } catch (e) { }
          b.style.setProperty('top', ue + 'px', 'important');
        } catch (e) { }
      }
      try { rawFutatsume(deru); } catch (e) { }
      /* ★2026-08-11 下へ送ると検索欄（虫眼鏡）が押せなくなっていた（実機で指摘）。
         メルカリのヘッダは2段（1段目＝ロゴと虫眼鏡／2段目＝会員登録・ログイン）で
         位置はsticky top:0・z-index 1200。こちらの帯は fixed top:0・z-index 21億なので、
         帯が出た瞬間に【1段目だけ】をぴったり覆っていた。消えていたのではなく隠していた。
         ★帯の高さぶんヘッダを下げる。こちらが下げた分は離れる時に必ず戻す（rawCleanup）。 */
      /* ★2026-08-12 ここで【ヘッダを帯の高さぶん下げる】【ログイン段を隠す】を
         していたが、両方とも撤去した。
         ユーザー指摘「アプリでは固定されている。ブラウザが固定されていないだけ」。
         そのとおりで、メルカリはアプリの中では絞り込みの行を自分で固定している。
         こちらがヘッダの位置と高さを動かしたせいで、あちらの固定計算が壊れ、
         「スクロールすると検索メニューが消える」になっていた。
         ★メルカリのヘッダには一切触らない。触ると必ず固定が壊れる。
         ★帯が虫眼鏡の段に被る件は、別のやり方（帯を下に置く等）で解く。 */
    };
    window.addEventListener('scroll', upd, { passive: true });
    /* ★内側の枠がスクロールする作りだと window の scroll が来ないことがある。
       取り残されないよう、定期的にも見る（軽い処理なので負担にならない）。 */
    setInterval(upd, 700);
    upd();
  }

  /* ========== 見出しとプルダウンの間を詰める（2026-08-11・PATCH） ==========
     ユーザー指示「ジャケットの検索結果と売り切れのみプルダウンの間の無駄な空きを消せ」。
     ★実測: 見出しの下端142 → 一覧の上端291 の149px。空白ではなく
       【並び替え(新しい順)の行】が丸ごと1行を使っていた（右寄せなので左が空いて見える）。
     ★親は flex の column-reverse。これを row-reverse にすると
       「新しい順 / 売り切れのみ / 絞り込み」が1行に並ぶ。実機で 149→127px。
       さらに縦の余白を削って 111px（38px 詰まる）。見出し・タグ行と重ならないことを確認済み。
     ★前に一度崩した原因は【掴む箱を上まで登りすぎた】こと。
       並び替えと状態ボタンの【共通の親】だけを掴み、見出しを含む箱なら何もしない。 */
  /* ★2026-08-20 販売状況の3択は2通りある。
       ・こちらが作った【ボタン】（メルカリが3択を出さない画面用）
       ・メルカリ純正の【select】data-testid="item-status-filter-select"
     ボタンしか見ていなかったため、偽物を引っ込めた途端に
       ・見出しの一列化(rawTightenHead)  ・スクロール時の貼り付き(rawFutatsume)
     の2つが【丸ごと効かなくなった】（実機で確認: 並び替えが上の行に残って高さが増え、
     スクロールしても絞り込みと並び替えが出ない）。探し方を1か所にまとめる。 */
  function rawJotaiEl() {
    const sel = document.querySelector('[data-testid="item-status-filter-select"]');
    if (sel && sel.getBoundingClientRect().width > 0) return sel;
    const cb = document.querySelector('[data-testid="on-sale-condition-checkbox"]')
      || document.querySelector('input.merCheckbox');
    if (cb && cb.getBoundingClientRect().width > 0) {
      return cb.closest('label') || cb.parentElement || cb;
    }
    let b = null;
    document.querySelectorAll('button').forEach((e) => {
      if (b) return;
      const t = (e.textContent || '').trim();
      if (t.indexOf('売り切れのみ') === 0 || t.indexOf('販売中のみ') === 0
        || t.indexOf('すべての商品') === 0 || t.indexOf('全ての商品') === 0) b = e;
    });
    return b;
  }

   function rawTightenHead() {
     if (!rawOnSearch()) return;
    /* 上部操作行の横並び・余白変更は停止。
       純正DOMを加工すると「新しい順」だけ別親へ残るため、
       上部メニューは rawRestoreNativeHead の1系統に任せる。 */
    return;
    const h1 = document.querySelector('h1');
    const grid = document.getElementById('item-grid') || rawFindGrid();
    if (!h1 || !grid) return;

    /* ① 並び替え と ② 状態のボタン */
    let lab = null, btn = null;
    document.querySelectorAll('label').forEach((e) => {
      if (!lab && (e.textContent || '').indexOf('並び替え') >= 0) lab = e;
    });
    btn = rawJotaiEl();
    /* 絞り込みがまだ生成途中の段階では、親を横並びへ変更しない。
       先に並び順・状態だけを詰めると、後から来る絞り込みが別行へ残り、
       読み込み中だけ上部メニューが分解される。 */
    const shibori = Array.from(document.querySelectorAll('button,a'))
      .find((e) => (e.textContent || '').trim().indexOf('絞り込み') === 0
        && e.getBoundingClientRect().width > 0);
    if (!lab || !btn) return;

    /* 絞り込みだけ遅れて生成される間は、先に出た「新しい順」だけを
       一時表示しない。最終表示の幅・左右位置には手を加えない。 */
    if (!shibori) {
      let pending = lab.parentElement;
      for (let i = 0; i < 10 && pending && !pending.contains(btn); i++) pending = pending.parentElement;
      if (pending) {
        const r0 = pending.getBoundingClientRect();
        if (r0.width > 0 && r0.width <= window.innerWidth + 2 && r0.height > 0 && r0.height <= 120) {
          pending.style.setProperty('visibility', 'hidden', 'important');
          if (pending.dataset) pending.dataset.msqHeadPending = '1';
        }
      }
      return;
    }
    document.querySelectorAll('[data-msq-head-pending]').forEach((e) => {
      try { e.style.removeProperty('visibility'); delete e.dataset.msqHeadPending; } catch (err) { }
    });

    /* ③ 共通の親だけを掴む。見出しまで含むなら触らない（崩れる） */
    let oya = lab.parentElement;
    for (let i = 0; i < 10 && oya && !oya.contains(btn); i++) oya = oya.parentElement;
    if (!oya || oya.contains(h1) || !oya.contains(shibori)) return;

    /* 絞り込みがまだ生成途中の間は、並び替え・状態だけを画面に出さない。
       先に2項目だけ見せると、後から来る絞り込みが別行へ残り、
       読み込み中だけ上部メニューが分解される。親が小さな操作行であることを
       確認してから隠す。3項目がそろった回で同じ親を横並びにして戻す。 */
    /* ★2026-08-11 横一列にすると41px詰まる。1回目は状態ボタンが狭まり、
       開いたプルダウンが「すべて／の商品」と2行に折れて間延びした（実機・R35で確認）。
       本当の原因は【子が縮んだ】こと。flex の子は既定で縮むので、
       子に flex-shrink:0 を入れて元の幅を保たせる。実測で合計330px＜画面389pxなので収まる。 */
    /* ★2026-08-11 うまくいかなかった時に印を付けていなかったため、
       700ms/2秒ごとに【当てる→測る→戻す】を延々と繰り返し、画面がびりびり震え、
       下の赤帯（この検索条件を保存する）まで出たり消えたりした（実機で指摘）。
       駄目だった時も覚えて、二度とやり直さない。 */
    if (!(oya.dataset && (oya.dataset.msqHead || oya.dataset.msqHeadNg))) {
      /* ★入るかどうかは事前に計算できない（子は行ごと全幅なので合計が必ず超える）。
         いったん当ててみて、横にはみ出したら戻す。 */
      {
        oya.style.setProperty('display', 'flex', 'important');
        oya.style.setProperty('flex-direction', 'row-reverse', 'important');
        oya.style.setProperty('align-items', 'center', 'important');
        oya.style.setProperty('justify-content', 'space-between', 'important');
        oya.style.setProperty('flex-wrap', 'nowrap', 'important');
        oya.style.setProperty('gap', '8px', 'important');
        /* ★2026-08-20 ここが '0 0 auto'（縮まない）だったため、3つの幅の合計が
           画面を超えた時に【並び替えが画面の左の外へ押し出されて見えなくなった】
           （実機で 左-110〜-10 を実測。ユーザー『並び替えが消えた』の正体）。
           縮んでよいことにする。実機で 並び替え15〜115／販売状況121〜246／
           絞り込み246〜373 と、3つとも画面の中に収まることを確認済み。 */
        oya.style.setProperty('justify-content', 'flex-end', 'important');
        for (let i = 0; i < oya.children.length; i++) {
          oya.children[i].style.setProperty('flex', '0 1 auto', 'important');
          oya.children[i].style.setProperty('min-width', '0', 'important');
        }
        const hamideru = document.documentElement.scrollWidth > window.innerWidth + 2;
        if (hamideru) {
          ['display', 'flex-direction', 'align-items', 'justify-content', 'flex-wrap', 'gap']
            .forEach((q) => oya.style.removeProperty(q));
          for (let i = 0; i < oya.children.length; i++) {
            oya.children[i].style.removeProperty('flex');
            oya.children[i].style.removeProperty('min-width');
          }
          if (oya.dataset) oya.dataset.msqHeadNg = '1';   /* 二度とやり直さない */
        } else if (oya.dataset) {
          oya.dataset.msqHead = '1';
        }
      }
    }

    /* ★2026-09-21 実機確認：純正の操作行は1つだが、通常位置へ流れて
       商品画像の上に残っていた。複製行や親のtransformは使わず、
       3項目を含む純正sectionだけを画面上端へstickyにする。
       top:0 は初期表示では自然位置、スクロール後だけ上端に止まるため、
       メルカリ本体のヘッダーや検索保存枠を押し下げない。 */
    try {
      const sec = oya.closest && oya.closest('section');
      if (sec && sec.getBoundingClientRect().height > 0 && sec.getBoundingClientRect().height <= 120) {
        if (!sec.hasAttribute('data-msq-native-row')) {
          sec.setAttribute('data-msq-native-row', sec.getAttribute('style') || '');
        }
        sec.style.setProperty('position', 'sticky', 'important');
        sec.style.setProperty('top', '0px', 'important');
        sec.style.setProperty('z-index', '1100', 'important');
        sec.style.setProperty('background', '#222', 'important');
        sec.style.removeProperty('transform');
        sec.style.removeProperty('transition');
        sec.style.removeProperty('will-change');
      }
    } catch (e) { }

    /* ④ 見出しの下から一覧の上までの【縦の余白だけ】を削る。並びは変えない。 */
    const top = h1.getBoundingClientRect().bottom + window.scrollY;
    const end = grid.getBoundingClientRect().top + window.scrollY;
    if (end <= top) return;
    const mn = document.querySelector('main');
    if (mn && !(mn.dataset && mn.dataset.msqTight)) {
      const pt = parseFloat(getComputedStyle(mn).paddingTop) || 0;
      if (pt > 8) { mn.style.setProperty('padding-top', '8px', 'important'); mn.dataset.msqTight = '1'; }
    }
    document.querySelectorAll('main *').forEach((e) => {
      if (e.dataset && e.dataset.msqTight) return;
      const r = e.getBoundingClientRect();
      const t = r.top + window.scrollY, b = r.bottom + window.scrollY;
      if (b <= top || t >= end) return;
      if (r.height > 300) return;                 // 大きい入れ物は触らない
      if (rawMine(e)) return;                     // こちらの箱は触らない
      const cs = getComputedStyle(e);
      let sawari = false;
      if ((parseFloat(cs.marginBottom) || 0) > 0) { e.style.setProperty('margin-bottom', '0px', 'important'); sawari = true; }
      if ((parseFloat(cs.marginTop) || 0) > 0) { e.style.setProperty('margin-top', '0px', 'important'); sawari = true; }
      if (e.tagName !== 'BUTTON' && (parseFloat(cs.paddingBottom) || 0) > 4) {
        e.style.setProperty('padding-bottom', '2px', 'important'); sawari = true;
      }
      if (sawari && e.dataset) e.dataset.msqTight = '1';
    });
  }

  /* ★2026-09-21 検証アプリの一覧では、メルカリWebの
     header.page-header(position:sticky)をウインドウ枠のように残さない。
     本物のメルカリアプリで確認した、下スクロール時に上部が流れて消える
     挙動へ合わせる。元のstyleは一覧を離れる時に rawCleanup で戻す。 */
  function rawUnpinHeader() {
    if (!rawOnSearch()) return;
    const h = document.querySelector('header.page-header') || document.querySelector('header');
    if (!h) return;
    if (!h.hasAttribute('data-msq-unpin-header')) {
      h.setAttribute('data-msq-unpin-header', h.getAttribute('style') || '');
    }
    h.style.setProperty('position', 'static', 'important');
    h.style.removeProperty('top');
  }

  /* 上部の操作行もheaderと同じページの流れにする。
     行そのものは純正要素を使い、固定だけを解除する。 */
  function rawUnpinSortRow() {
    if (!rawOnSearch()) return;
    const lab = Array.from(document.querySelectorAll('select'))
      .find((e) => (e.textContent || '').indexOf('おすすめ順') >= 0);
    const filter = Array.from(document.querySelectorAll('button,a'))
      .find((e) => (e.textContent || '').trim().indexOf('絞り込み') === 0
        && e.getBoundingClientRect().width > 0);
    if (!lab || !filter) return;
    let sec = null;
    document.querySelectorAll('section').forEach((e) => {
      if (sec || e.getBoundingClientRect().height > 220) return;
      if (e.contains(lab) && e.contains(filter)) sec = e;
    });
    if (!sec) return;
    if (!sec.hasAttribute('data-msq-unpin-sort-row')) {
      sec.setAttribute('data-msq-unpin-sort-row', sec.getAttribute('style') || '');
    }
    sec.style.setProperty('position', 'static', 'important');
    sec.style.removeProperty('top');
    sec.style.removeProperty('z-index');
  }

  /* ★2026-09-21 上部メニューの所有者はここだけにする。
     純正の「販売中のみ・並び替え・絞り込み」を複製せず、同じ純正section内で
     1行に整列する。旧版の自前状態ボタン、別行、transform、fixedは使わない。 */
  function rawRestoreNativeHead() {
    try {
      document.querySelectorAll('[data-msq-scroll-reveal-row]').forEach((e) => {
        const moto = e.getAttribute('data-msq-scroll-reveal-row');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-scroll-reveal-row');
      });
      document.querySelectorAll('[data-msq2dan]').forEach((e) => {
        ['position', 'top', 'z-index', 'background', 'transform', 'box-shadow',
          'margin-left', 'margin-right', 'padding-left', 'padding-right']
          .forEach((q) => { try { e.style.removeProperty(q); } catch (err) { } });
        delete e.dataset.msq2dan;
      });
      document.querySelectorAll('[data-msq-stick]').forEach((e) => {
        ['position', 'top', 'z-index', 'background', 'padding', 'transform',
          'margin-left', 'margin-right', 'padding-left', 'padding-right']
          .forEach((q) => { try { e.style.removeProperty(q); } catch (err) { } });
        delete e.dataset.msqStick;
      });
      document.querySelectorAll('[data-msq-unpin-header]').forEach((e) => {
        const moto = e.getAttribute('data-msq-unpin-header');
        if (moto) e.setAttribute('style', moto);
        else e.removeAttribute('style');
        e.removeAttribute('data-msq-unpin-header');
      });
      /* 本体の検索操作行を、純正要素のまま1行へ戻す。 */
      const lab = Array.from(document.querySelectorAll('label'))
        .find((e) => (e.textContent || '').indexOf('並び替え') >= 0);
      const statusInput = document.querySelector('[data-testid="on-sale-condition-checkbox"]')
        || document.querySelector('input.merCheckbox');
      const jotai = statusInput
        ? (statusInput.closest('label') || statusInput.parentElement || statusInput)
        : rawJotaiEl();
      const shibori = Array.from(document.querySelectorAll('button,a'))
        .find((e) => (e.textContent || '').trim().indexOf('絞り込み') === 0
          && e.getBoundingClientRect().width > 0);
      if (lab && jotai && shibori) {
        let sec = null;
        document.querySelectorAll('section').forEach((e) => {
          if (sec || e.getBoundingClientRect().height <= 0 || e.getBoundingClientRect().height > 180) return;
          if (e.contains(lab) && e.contains(jotai) && e.contains(shibori)) sec = e;
        });
        if (sec) {
          const root = sec.firstElementChild || sec;
          if (!root || !root.contains(lab) || !root.contains(jotai) || !root.contains(shibori)) return;
          if (!root.hasAttribute('data-msq-native-menu-root')) {
            root.setAttribute('data-msq-native-menu-root', root.getAttribute('style') || '');
          }
          root.style.setProperty('display', 'flex', 'important');
          root.style.setProperty('flex-direction', 'row', 'important');
          root.style.setProperty('align-items', 'center', 'important');
          root.style.setProperty('flex-wrap', 'nowrap', 'important');
          root.style.setProperty('gap', '4px', 'important');
          root.style.setProperty('width', '100%', 'important');
          root.style.setProperty('min-width', '0', 'important');
          root.style.setProperty('box-sizing', 'border-box', 'important');

          /* 2つの純正行ラッパーだけを透明化し、3つの純正コントロールを
             root直下の同じflex行として扱う。要素の複製・移動はしない。 */
          [lab, jotai, shibori].forEach((control) => {
            let n = control;
            while (n && n.parentElement && n.parentElement !== root) {
              n = n.parentElement;
              if (!n.hasAttribute('data-msq-native-menu-wrap')) {
                n.setAttribute('data-msq-native-menu-wrap', n.getAttribute('style') || '');
              }
              n.style.setProperty('display', 'contents', 'important');
            }
          });
          const setCtrl = (e, order, basis) => {
            if (!e || !e.style) return;
            e.style.setProperty('order', String(order), 'important');
            e.style.setProperty('flex', '0 1 ' + basis, 'important');
            e.style.setProperty('min-width', '0', 'important');
            e.style.setProperty('box-sizing', 'border-box', 'important');
            e.style.setProperty('white-space', 'nowrap', 'important');
          };
          setCtrl(lab, 1, '100px');
          setCtrl(jotai, 2, '120px');
          setCtrl(shibori, 3, '127px');

          if (!sec.hasAttribute('data-msq-native-row')) {
            sec.setAttribute('data-msq-native-row', sec.getAttribute('style') || '');
          }
          sec.style.setProperty('position', 'sticky', 'important');
          sec.style.setProperty('top', '56px', 'important');
          sec.style.setProperty('z-index', '1100', 'important');
          sec.style.setProperty('background', '#222', 'important');
          /* sticky中に左右の余白から商品画像が見えて「行が分離」していた。
             純正section自身だけを全幅の不透明な帯にし、内側の3項目位置は維持する。 */
          sec.style.setProperty('width', 'calc(100% + 32px)', 'important');
          sec.style.setProperty('margin-left', '-16px', 'important');
          sec.style.setProperty('padding-left', '16px', 'important');
          sec.style.setProperty('padding-right', '16px', 'important');
          sec.style.setProperty('box-sizing', 'border-box', 'important');
          sec.style.removeProperty('transform');
          sec.style.removeProperty('transition');
          sec.style.removeProperty('will-change');
        }
      }
    } catch (e) { }
  }

  /* ロゴ行より上端を基準に、実物のMercariヘッダーと検証操作帯を
     ひとつの親にまとめてスクロール方向へ連動させる。複製や個別固定はしない。 */
  function rawRestoreUnifiedHeaderWindow() {
    const revealState = window.__msqNativeHeaderReveal;
    if (revealState && typeof revealState.restoreRows === 'function') {
      try { revealState.restoreRows(); } catch (e) { }
    }
    const relay = window.__msqMovingNativeRelay;
    if (relay) {
      window.removeEventListener('click', relay, true);
      window.removeEventListener('change', relay, true);
      delete window.__msqMovingNativeRelay;
    }
    document.querySelectorAll('[data-msq-moving-source]').forEach((e) => {
      const display = e.getAttribute('data-msq-moving-display') || '';
      const priority = e.getAttribute('data-msq-moving-priority') || '';
      if (display) e.style.setProperty('display', display, priority);
      else e.style.removeProperty('display');
      ['data-msq-moving-source','data-msq-moving-display','data-msq-moving-priority']
        .forEach((a) => e.removeAttribute(a));
    });
    document.querySelectorAll('[data-msq-moving-kind]').forEach((e) => e.remove());
    const w = document.getElementById('msq-scroll-header-window');
    if (!w) return;
    const p = w.parentNode;
    if (p) while (w.firstChild) p.insertBefore(w.firstChild, w);
    w.remove();
  }

  /* 既存のロゴ付き移動枠を広げ、検索操作・検索結果見出し・選択済み条件を
     同じ枠内へ入れる。複製の操作だけは、元のMercari要素へ中継する。 */
  function rawEnsureMovingNativeContent(w) {
    if (!w || !rawOnSearch()) return;
    const movingSelector = '[data-msq-moving-kind]';
    const actionSelector = 'button,a,label,select,input,[role="button"]';
    const sourceFor = (kind) => document.querySelector('[data-msq-moving-source="' + kind + '"]');
    const cloneFor = (kind) => w.querySelector('[data-msq-moving-kind="' + kind + '"]');
    const nativeText = (e) => (e.textContent || '').replace(/\s+/g, '');
    const hideSource = (e, kind) => {
      if (!e.hasAttribute('data-msq-moving-source')) {
        e.setAttribute('data-msq-moving-source', kind);
        e.setAttribute('data-msq-moving-display', e.style.getPropertyValue('display'));
        e.setAttribute('data-msq-moving-priority', e.style.getPropertyPriority('display'));
      }
      e.style.setProperty('display', 'none', 'important');
    };
    const cloneSource = (source, kind) => {
      if (!source) return null;
      let clone = cloneFor(kind);
      if (!clone) {
        clone = source.cloneNode(true);
        Array.from([clone].concat(Array.from(clone.querySelectorAll('*')))).forEach((e) => {
          Array.from(e.attributes).forEach((a) => {
            if (a.name === 'id' || a.name === 'for' || a.name.indexOf('data-msq-') === 0) {
              e.removeAttribute(a.name);
            }
          });
        });
        clone.setAttribute('data-msq-moving-kind', kind);
        Array.from(clone.querySelectorAll(actionSelector)).forEach((e, i) => {
          e.setAttribute('data-msq-moving-index', String(i));
        });
        w.appendChild(clone);
      }
      if (kind === 'menu') {
        clone.style.setProperty('display', 'block', 'important');
        clone.style.setProperty('position', 'static', 'important');
        clone.style.setProperty('top', 'auto', 'important');
        clone.style.setProperty('left', 'auto', 'important');
        clone.style.setProperty('width', '100%', 'important');
        clone.style.setProperty('max-width', '100%', 'important');
        clone.style.setProperty('box-sizing', 'border-box', 'important');
        clone.style.setProperty('margin-left', '0', 'important');
        clone.style.setProperty('margin-right', '0', 'important');
        /* ショップスから開いた結果WebViewでは、純正メニューをクローンした
           中に「検索条件を保存する」bottom-white-panelが残る。純正の
           position:fixedをそのままにすると、結果一覧の上へ別帯として浮き、
           メニューが分離して見える。結果WebViewだけ通常フローへ戻し、
           メニューの一部として一緒に動かす。メルカリ本体タブでは触らない。 */
        if (window.__msqResultTabFromShops) {
          clone.querySelectorAll('[data-testid="bottom-white-panel"]').forEach((panel) => {
            panel.style.setProperty('position', 'static', 'important');
            panel.style.setProperty('top', 'auto', 'important');
            panel.style.setProperty('right', 'auto', 'important');
            panel.style.setProperty('bottom', 'auto', 'important');
            panel.style.setProperty('left', 'auto', 'important');
            panel.style.setProperty('transform', 'none', 'important');
            panel.style.setProperty('width', '100%', 'important');
            panel.style.setProperty('margin-top', '4px', 'important');
            panel.style.setProperty('z-index', 'auto', 'important');
          });
        }
      }
      hideSource(source, kind);
      return clone;
    };

    let menuSource = sourceFor('menu');
    if (!menuSource) {
      const rows = Array.from(document.querySelectorAll('section')).filter((e) => {
        if (e.closest(movingSelector)) return false;
        const t = nativeText(e), r = e.getBoundingClientRect();
        return r.height > 0 && r.height <= 220 && t.indexOf('並び替え') >= 0
          && t.indexOf('絞り込み') >= 0
          && (t.indexOf('全ての商品') >= 0 || t.indexOf('すべての商品') >= 0);
      }).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
      menuSource = rows[0] || null;
    }
    const menuClone = cloneSource(menuSource, 'menu');

    let titleSource = sourceFor('title');
    if (!titleSource) {
      const heading = Array.from(document.querySelectorAll('h1'))
        .find((e) => !e.closest(movingSelector));
      if (heading) {
        const parent = heading.parentElement;
        titleSource = parent && (parent.innerText || '').trim() === (heading.innerText || '').trim()
          ? parent : heading;
      }
    }
    cloneSource(titleSource, 'title');

    let chipsSource = sourceFor('chips');
    if (!chipsSource) {
      const heading = Array.from(document.querySelectorAll('h1'))
        .find((e) => !e.closest(movingSelector));
      const bottom = heading ? heading.getBoundingClientRect().bottom : -1;
      chipsSource = Array.from(document.querySelectorAll('.merChipGroup')).filter((e) => {
        if (e.closest(movingSelector) || !e.querySelector('button')) return false;
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top >= bottom - 8 && r.top <= bottom + 180;
      }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
    }
    const chipsClone = cloneSource(chipsSource, 'chips');

    const sync = (source, clone) => {
      if (!source || !clone) return;
      const from = Array.from(source.querySelectorAll(actionSelector));
      const to = Array.from(clone.querySelectorAll(actionSelector));
      to.forEach((e, i) => {
        const original = from[i];
        if (!original) return;
        if (e.tagName === 'SELECT') e.selectedIndex = original.selectedIndex;
        if (e.tagName === 'INPUT') { e.checked = original.checked; e.value = original.value; }
      });
    };
    sync(menuSource, menuClone);

    if (!window.__msqMovingNativeRelay) {
      window.__msqMovingNativeRelay = function (ev) {
        const root = ev.target && ev.target.closest ? ev.target.closest(movingSelector) : null;
        if (!root) return;
        const kind = root.getAttribute('data-msq-moving-kind');
        const action = ev.target.closest(actionSelector);
        if (!action || !root.contains(action)) return;
        const index = Number(action.getAttribute('data-msq-moving-index'));
        const source = sourceFor(kind);
        const originals = source ? source.querySelectorAll(actionSelector) : [];
        const original = originals[index];
        if (!original) return;
        if (ev.type === 'click') {
          if (kind === 'menu' && action.tagName === 'SELECT') return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          original.click();
          return;
        }
        if (kind !== 'menu') return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (action.tagName === 'SELECT') {
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
          if (setter && setter.set) setter.set.call(original, action.value);
          else original.value = action.value;
        } else if (action.tagName === 'INPUT'
          && (action.type === 'checkbox' || action.type === 'radio')) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
          if (setter && setter.set) setter.set.call(original, action.checked);
          else original.checked = action.checked;
        }
        original.dispatchEvent(new Event('input', { bubbles: true }));
        original.dispatchEvent(new Event('change', { bubbles: true }));
      };
      window.addEventListener('click', window.__msqMovingNativeRelay, true);
      window.addEventListener('change', window.__msqMovingNativeRelay, true);
    }
  }

  function rawEnsureUnifiedHeaderWindow() {
    if (!rawOnSearch()) return null;
    let h = document.querySelector('header.page-header') || document.querySelector('header');
    let b = document.getElementById('msq-raw-bar');
    if (!h || !b) return null;
    let w = document.getElementById('msq-scroll-header-window');
    if (w && h.parentElement === w && b.parentElement === w && h.nextElementSibling === b) {
      rawEnsureMovingNativeContent(w);
      return w;
    }
    if (w) rawRestoreUnifiedHeaderWindow();
    h = document.querySelector('header.page-header') || document.querySelector('header');
    b = document.getElementById('msq-raw-bar');
    if (!h || !b || !h.parentNode || h.parentNode !== b.parentNode || h.nextElementSibling !== b) return null;
    w = document.createElement('div');
    w.id = 'msq-scroll-header-window';
    h.parentNode.insertBefore(w, h);
    w.appendChild(h);
    w.appendChild(b);
    rawEnsureMovingNativeContent(w);
    return w;
  }

  /* 先頭の商品画像から約2枚分スクロールした後、一体の上部UIを
     スクロールに合わせて上へ動かし、上端から順に画面外へ送る。 */
  function rawScrollReveal() {
    if (!rawOnSearch()) return;
    const resultGapReduction = 40;
    if (!window.__msqNativeHeaderReveal) {
      const readY = () => window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
      const st = {
        routeKey: location.href,
        lastY: readY(),
        progress: 0,
        image: null,
        triggerY: null,
        wrapper: null,
        rows: [],
        apply: null,
        listener: null,
        restoreRows: null
      };
      st.restoreRows = () => {
        const props = ['opacity', 'transition', 'pointer-events'];
        st.rows.forEach((row) => {
          props.forEach((name) => {
            const saved = row.original[name];
            if (saved.value) row.el.style.setProperty(name, saved.value, saved.priority);
            else row.el.style.removeProperty(name);
          });
        });
        st.rows = [];
        st.wrapper = null;
      };
      st.apply = () => {
        try {
          if (!rawOnSearch()) return;
          if (st.routeKey !== location.href) {
            st.restoreRows();
            const oldWindow = document.getElementById('msq-scroll-header-window');
            if (oldWindow) oldWindow.style.setProperty('transform', 'translateY(0)', 'important');
            st.routeKey = location.href;
            st.image = null;
            st.triggerY = null;
            st.progress = 0;
            st.lastY = readY();
          }
          const w = rawEnsureUnifiedHeaderWindow();
          if (!w) return;
          w.style.setProperty('position', 'sticky', 'important');
          w.style.setProperty('top', '0px', 'important');
          w.style.setProperty('z-index', '1200', 'important');
          w.style.setProperty('width', '100%', 'important');
          w.style.setProperty('box-sizing', 'border-box', 'important');
          w.style.setProperty('margin-bottom', (-resultGapReduction) + 'px', 'important');
          w.style.setProperty('transition', 'transform 120ms ease-out', 'important');
          w.style.setProperty('will-change', 'transform', 'important');
          w.style.setProperty('pointer-events', 'none', 'important');

          const nextRows = Array.from(w.children).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          const sameRows = st.wrapper === w && st.rows.length === nextRows.length
            && st.rows.every((row, i) => row.el === nextRows[i]);
          if (!sameRows) {
            st.restoreRows();
            st.wrapper = w;
            const props = ['opacity', 'transition', 'pointer-events'];
            st.rows = nextRows.map((el) => {
              const original = {};
              props.forEach((name) => {
                original[name] = {
                  value: el.style.getPropertyValue(name),
                  priority: el.style.getPropertyPriority(name)
                };
              });
              return { el, original };
            });
          }

          if (!st.image || !document.contains(st.image) || st.triggerY === null) {
            const candidates = Array.from(document.querySelectorAll('a[href*="/item/"] img'))
              .map((el) => ({ el, rect: el.getBoundingClientRect() }))
              .filter((item) => item.rect.width > 0 && item.rect.height > 0
                && item.el.complete && item.el.naturalWidth > 0)
              .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
            const first = candidates[0];
            if (first) {
              st.image = first.el;
              st.triggerY = Math.max(0,
                first.rect.top + readY() - w.getBoundingClientRect().bottom - resultGapReduction)
                + first.rect.height * 2;
              st.progress = 0;
              st.lastY = readY();
            }
          }

          const totalDistance = Math.max(1, w.getBoundingClientRect().height);
          st.progress = Math.max(0, Math.min(totalDistance, st.progress));
          w.style.setProperty('background', '#222', 'important');
          w.style.setProperty('transform', 'translateY(' + (-st.progress).toFixed(1) + 'px)', 'important');

          st.rows.forEach((row) => {
            row.el.style.setProperty('pointer-events', 'auto', 'important');
          });
        } catch (e) { }
      };
      st.listener = () => {
        try {
          if (st.triggerY === null) st.apply();
          const y = readY();
          const delta = y - st.lastY;
          if (st.triggerY !== null && st.wrapper && Math.abs(delta) >= 1) {
            const totalDistance = Math.max(1, st.wrapper.getBoundingClientRect().height);
            if (delta > 0 && y > st.triggerY) {
              const scrollAfterTrigger = Math.max(0, y - Math.max(st.lastY, st.triggerY));
              st.progress = Math.min(totalDistance, st.progress + scrollAfterTrigger);
            } else if (delta < 0) {
              st.progress = Math.max(0, st.progress + delta);
            }
          }
          st.lastY = y;
          st.apply();
        } catch (e) { }
      };
      window.addEventListener('scroll', st.listener, { passive: true });
      window.__msqNativeHeaderReveal = st;
    }
    window.__msqNativeHeaderReveal.apply();
  }

  /* ★2026-09-21 Web版だけにある会員登録・ログイン段を一覧では隠す。
     本物のメルカリアプリの上部にはこの段がなく、ここが高さ約37pxを占めて
     メニュー全体を分厚くしていた。検索欄を含む段は絶対に隠さない。 */
  function rawSlimHeader() {
    if (!rawOnSearch()) return;
    const h = document.querySelector('header.page-header') || document.querySelector('header');
    if (!h) return;
    for (let i = 0; i < h.children.length; i++) {
      const e = h.children[i];
      const t = (e.textContent || '');
      if (t.indexOf('会員登録') < 0 || t.indexOf('ログイン') < 0) continue;
      if (e.querySelector('[aria-label*="検索"],input,form,a[href*="/search"]')) continue;
      if (!e.hasAttribute('data-msq-slim-login')) {
        e.setAttribute('data-msq-slim-login', e.getAttribute('style') || '');
      }
      e.style.setProperty('display', 'none', 'important');
    }
  }

  /* ★2026-08-12 絞り込みの行を固定する実装は撤去した。
     6回作って6回とも壊した（見出しとタグ行がその下に潜り込んで隠れる）。
     素のメルカリはあの行を固定していない（PCのChromeで実測）。二度と作らない。 */

  /* ================= 広告を消す（2026-08-08・PATCH） =================
     ユーザー指示「PRの削除　商品一覧と下に出る広告」。
     ★対象は【商品一覧の中と、その下】だけ。それ以外の画面は触らない。
       一覧の外まで働いて、検索候補の画面のブランドを消した（実機で確認）。
     ★「商品リンクが無い＝広告」で判定してはいけない。2回それで中身を消している。 */
  /* ★2026-08-20 ユーザー『実機を見ろ　何も映ってない　スクロールすると出るが、止まると出なくなる』
     ★実機で犯人を特定した（推測ではない）。elementFromPoint で画面の真ん中に何が乗っているかを見た結果:
         DIV 389x909 上-128 position:fixed z-index:2 背景 rgb(34,34,34)
         中身は『検索条件を保存する／マイコレに追加』だけ
       メルカリの小さな部品なのに、画面全部を覆う大きさ＋不透明な背景で乗っていた。
       だから商品はDOMにあるのに1つも見えず、真っ黒になっていた。
       スクロールで一瞬出るのは、この箱が描き直される瞬間。
     ★消さない。position を static に戻して背景を透明にするだけ。
       消すと中の『検索条件を保存する』まで無くなるし、箱ごと消して商品を巻き込んだ前科がある。
     ★守り: こちらが作った物(#msq…)と、商品リンクを含む箱には絶対に触らない。
       中身が60文字を超える箱も触らない（本物の画面を巻き込むため）。
       画面の8割以上の高さがある fixed の箱だけが対象。 */
  function rawOoiHazusu() {
    try {
      for (const n of document.querySelectorAll('div')) {
        /* ★2026-08-20 ここに【印があると二度とやらない】があり、広告と同じ落とし穴だった。
           メルカリ側が style を消して出し直すと、印だけ残って覆いが戻る（実機で確認）。
           印は残すが、毎回当て直す（同じ値を入れ直すだけなので何度やっても同じ）。 */
        if (n.id && String(n.id).indexOf('msq') === 0) continue;
        if (getComputedStyle(n).position !== 'fixed') continue;
        const r = n.getBoundingClientRect();
        if (r.height < window.innerHeight * 0.8) continue;
        if (n.querySelector('a[href*="/item/"]')) continue;
        if ((n.textContent || '').trim().length > 60) continue;
        n.dataset.msqOoi = '1';
        /* ★2026-08-20 position は触らない。触ると中に入っているメルカリのヘッダ
           （マーク・虫眼鏡）が流れて消える（ユーザー『メルカリのマークがない』
           『虫眼鏡もない』で実機確認）。背景を透明にするだけで覆いは取れる。 */
        n.style.setProperty('background', 'transparent', 'important');
        n.style.setProperty('background-color', 'transparent', 'important');
        /* ★2026-08-20 透明にしても【指を食っていた】。ユーザー『新しい順が押せん』の真因。
           実機で確認: この箱は 389x909 で全画面を覆い、中身の本物のボタン
           （検索条件を保存する／マイコレに追加）は画面の外(上-112)にある。
           つまり見えている面は全部【空っぽの覆い】。指を通す。
           中の本物のボタンだけは受けられるように戻す（画面に入ってきた時のため）。 */
        n.style.setProperty('pointer-events', 'none', 'important');
        n.querySelectorAll('button,a,select,input,[role="button"]').forEach((c) => {
          try { c.style.setProperty('pointer-events', 'auto', 'important'); } catch (e) { }
        });
      }
    } catch (e) { }
  }

  /* ホーム画面のメルカリ公式キャンペーン帯を、広告非表示ONの時だけ隠す。
     ★通信遮断(msqKokokuBlock)は第三者ドメイン向けで、
       campaign.jp.mercari.com は本体保護のため通信を許可している。
       そのため画像が読み込まれた後の見た目だけを、既知のキャンペーンリンクに限定して処理する。
     ★検索結果の rawHideAds とは別に、ホームやSPA遷移後にも効かせる。
     ★広い親を推測して消さず、キャンペーンのリンク自身だけを対象にする。 */
  function rawHideHomeCampaign() {
    try {
      const api = window.MsqApp;
      const on = !!(api && api.getKokokuBlock && api.getKokokuBlock());
      const old = document.querySelectorAll('[data-msq-campaign-ad]');
      if (!on) {
        old.forEach((e) => {
          try { e.style.removeProperty('display'); delete e.dataset.msqCampaignAd; } catch (x) { }
        });
        return;
      }
      const seen = new Set();
      document.querySelectorAll(
        'a[href*="campaign.jp.mercari.com"],img[src*="campaign.jp.mercari.com"]'
      ).forEach((e) => {
        const box = e.closest('a') || e;
        if (seen.has(box)) return;
        seen.add(box);
        const r = box.getBoundingClientRect();
        if (r.width < window.innerWidth * 0.6 || r.height < 50) return;
        box.style.setProperty('display', 'none', 'important');
        box.dataset.msqCampaignAd = '1';
      });
    } catch (e) { }
  }

  function rawHideAds() {
    const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
    /* ★2026-08-11 一覧の先頭に並ぶ広告が消えていなかった（実機で確認）。
       下の札さがしは文字が「PR」ちょうどの物しか見ないが、今の広告は⚡の帯だけで
       PR の字を持たない。href の ad_id で見分けて、その箱ごと隠す。
       ★歯止め: 本物の商品が1件でも入っている箱までは絶対に遡らない。
         （過去にブランド一覧・カテゴリ一覧を巻き込んで消した。中身が消えるのは
           取り返しがつかない。広告が消え残る方がまし。） */
    const ads = [];
    /* ★こちらの箱（#msq-raw-add）に入った広告も対象にする。次ページを足す時に
       広告ごと持ってくるため、rawMine で除くと下の方に広告が残る（実機で確認）。 */
    document.querySelectorAll(SEL).forEach((a) => { if (rawIsAd(a)) ads.push(a); });
    ads.forEach((a) => {
      /* ★遡るのは【広告1枚ぶんの入れ物】まで。商品が2つ以上入る箱に達したら止める。
         ブロックごと隠すより狭いが、こちらの方が絶対に巻き添えが出ない。
         広告の枠は中身が全部消えるので、隙間も残らない。 */
      let box = a;
      for (let up = 0; up < 5; up++) {
        const p = box.parentElement;
        if (!p || p === document.body || p === document.documentElement) break;
        if (p.id && p.id.indexOf('msq-') === 0) break;   // こちらの箱そのものは隠さない
        if (p.querySelectorAll(SEL).length !== 1) break; // 他の商品が入る箱には広げない
        box = p;
      }
      /* ★2026-08-20 実機で広告(⚡)が復活していた。真因は【印があると二度と消さない】こと。
         メルカリ側が inline style を消して出し直すので、印だけ残って消え残る
         （実機で確認: data-msq-ad は付いたまま style属性が空・display=block）。
         印は「対象だった物」の記録として残し、今見えているなら消し直す。 */
      if (box.dataset && box.dataset.msqAd && getComputedStyle(box).display === 'none') return;
      box.style.setProperty('display', 'none', 'important');
      if (box.dataset) box.dataset.msqAd = '1';
    });
    /* ★2026-08-08 「虫眼鏡から検索した時のブランド」が出なくなっていた（実機）。
       依頼は【商品一覧と、その下に出る広告】。それ以外は触ってはいけない。
       一覧の箱が見つからない画面（検索候補の画面など）では何もしない。 */
    const grid = rawFindGrid();
    if (!grid) return;
    const inScope = (el) => {
      if (grid.contains(el)) return true;                 // 一覧の中
      const pos = grid.compareDocumentPosition(el);
      return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING)   // 一覧より下
        && !(pos & Node.DOCUMENT_POSITION_CONTAINS);      // 一覧を包む親は対象外
    };
    /* ★2026-08-08 これで【ブランド一覧・カテゴリ一覧を消してしまった】（実機で確認）。
       PRの札から親を6段さかのぼり「商品リンクが入っていない一番外側」を隠していたため、
       一覧の下にある「カテゴリーから探す／ブランドから探す」まで巻き込んだ。
       商品リンクを持たないのは広告だけではない、というのが読み違い。
       ★歯止め: 次のどれかが入っている箱は、何があっても隠さない。 */
    /* ★2026-08-08 ②の直しでもブランド一覧だけ消え残った（実機）。
       文字と /search だけでは足りない。一覧は【リンクがたくさん並ぶ】もので、
       広告の枠はそうではない。そこを歯止めの本命にする。
       広告が少し消え残る方がまし。中身が消えるのは取り返しがつかない。 */
    const rawKeep = (el) => {
      if (!el || el === document.body || el === document.documentElement) return true;
      if (el.querySelector(SEL)) return true;                   // 商品
      if (el.querySelector('a[href*="/search"],a[href*="/brand"],a[href*="/category"]')) return true;
      /* 押せるものが並んでいる＝一覧。ブランド候補はリンクではなくボタンのこともある */
      if (el.querySelectorAll('a,button,[role="button"]').length >= 4) return true;
      const t = el.textContent || '';
      if (t.indexOf('ブランド') >= 0 || t.indexOf('カテゴリ') >= 0) return true;
      return false;
    };
    /* 目印は2つ。どちらも札そのものが1つの箱に入っている形。
         ・並びに混ざる広告 … <P>PR
         ・一覧の下の広告   … 「他のサイトの関連広告」の見出し
       札から上へ遡り、守る物が入る手前で止めて、そこを隠す。 */
    const marks = document.querySelectorAll('p,span,div,h1,h2,h3,h4');
    for (let i = 0; i < marks.length; i++) {
      const e = marks[i];
      if (e.children.length !== 0) continue;
      const t = (e.textContent || '').trim();
      if (t !== 'PR' && t !== '他のサイトの関連広告') continue;
      if (!inScope(e)) continue;          // 一覧の外（検索候補の画面など）は触らない
      let box = e;
      for (let up = 0; up < 6; up++) {
        const p = box.parentElement;
        if (!p || !inScope(p) || rawKeep(p)) break;
        box = p;
      }
      /* ★2026-08-20 上と同じ理由。印があっても見えていれば消し直す。 */
      if (box.dataset && box.dataset.msqAd && getComputedStyle(box).display === 'none') continue;
      box.style.setProperty('display', 'none', 'important');
      if (box.dataset) box.dataset.msqAd = '1';
    }
  }

  /* ============ 「次へ」をなくして繋げる（2026-08-08・PATCH） ============
     ユーザー指示「次へボタンを出さずに続ける」。
     やり方は下の rawCarryGo / rawCarryRestore を見ること。
     下まで来たら自動で次のページへ移動し、それまでの商品を持ち越して手前に置く。 */
  let rawMoreBusy = false;
  let rawMoreFail = 0;   // 連続で読めなかった回数（何度も試して表示を潰さないため）
  let rawNextUrl = '';        // 次に読むページ
  let rawNextTaken = false;   // ページの「次へ」から1回だけ受け取る
  let rawAdded = 0;           // 実際に足せたページ数
  let rawGen = 0;             // 検索し直したら世代を上げ、途中の読み込みを捨てる
  let rawSearchKey = null;
  const rawSeenPages = new Set();

  function rawFindNextLink(doc) {
    const d = doc || document;
    const as = d.querySelectorAll('a[href*="page_token"],a[href*="page="],a[rel="next"]');
    for (let i = 0; i < as.length; i++) {
      const t = (as[i].textContent || '').trim();
      if (t.indexOf('次へ') >= 0 || as[i].getAttribute('rel') === 'next') return as[i];
    }
    return null;
  }

  /* 「次へ」を隠す。
     ★毎回やること。メルカリが描き直すと新しい「次へ」が出るため、1回隠すだけでは
       「消える時と消えない時がある」状態になる（2026-08-08 実機）。
     ★ただし1ページも足せていない間は隠さない。隠してから読めなかったら、
       先へ進む手段が無くなって行き止まりになる。 */
  function rawHideNext() {
    const link = rawFindNextLink();
    if (!link) return;
    if (!rawNextTaken) { rawNextUrl = link.href || ''; rawNextTaken = true; }
    /* ★「次へ」を出し直す仕掛けは置かない（2026-08-12 ユーザー指摘）。
       次へが出ていると【まだ続きがある】という意味になり、この機能と矛盾する。
       上限に当たった時は古い物を押し出して進み続ける（rawCarryGo を見ること）。 */
    /* ★2026-08-27 ユーザー『次へを消したのか？ めどがわからんやん』
         『一番下に降りる 次へがある 読み込む じゃないとあかんやろ』
         『一番下に降りる 次へがない 読み込まない が正常やろ』。
       ★隠すのをやめる。次へは【まだ続きがあるかどうかの目印】として要る。
         見えている → まだ続きがある（下まで行けば自動で読む／手で押してもいい）
         見えない   → もう続きが無い（読み込まない）
       ★2026-08-12 に「次へが出ていると、まだ続きがあるという意味になって矛盾する」
         という理由で隠すことにした記録があるが、ユーザーの今の使い方では逆で、
         目印として見えている方がよい。指示に合わせて隠すのをやめる。
       ★要素そのものには触らない。前に隠した分があれば元に戻すだけ。 */
    link.style.removeProperty('display');
  }

  /* 「前へ」を隠す（2026-08-12 ユーザー依頼）。次へだけ消えて前へが残っていた。
     ★実機で実物を確認: 前へは rel を持たず、文字が「前へ」・親は DIV.merButton。
       次へも同じ入れ物に並んでいる。
     ★href では選ばないこと。言語切替の「日本語」リンクも href に page= を持っており、
       href で選ぶと言語切替まで消える（実機で確認）。文字で選ぶ。
     ★次へと同じく、1ページも足せていない間は隠さない。隠してから読めなかったら
       先へ進む手段が無くなって行き止まりになる。 */
  function rawHidePrev() {
    if (rawAdded <= 0) return;
    document.querySelectorAll('a[href*="page_token"],a[href*="page="],a[rel="prev"]').forEach((a) => {
      const t = (a.textContent || '').trim();
      if (t.indexOf('前へ') < 0 && a.getAttribute('rel') !== 'prev') return;
      a.style.setProperty('display', 'none', 'important');
    });
  }

  /* 帯に状態を出す。コンソール無しで様子が分かるようにするため。 */
  function rawMoreSay(s) {
    const el = document.getElementById('msq-raw-more');
    if (el) el.textContent = s;
  }

  /* ★2026-08-08 方式を作り直した（3回目）。実機で確かめた結果。
       ① fetchでHTMLを読む   → 商品が1件も入っていない（メルカリは後から描くため）
       ② 見えない画面で開く  → 実機で0件。「次を読めず（中止）」を確認して破棄
       ③ 【実際にページを移動し、前のページの商品を持ち越す】 ← いまここ
     本物のページ移動なので「商品が描かれない」ということが起きない。
     持ち越しは sessionStorage（アプリを閉じれば消える）。
     ★持ち越した商品はメルカリの並びの【中】には入れない。自分の箱を並びの手前に
       作ってそこへ入れる。メルカリが並びを作り直した時に消されないようにするため。 */
  const RAW_CARRY = 'msq_raw_carry';    // 持ち越す商品のHTML
  const RAW_CHAIN = 'msq_raw_chain';    // こちらが移動させた印
  const RAW_QUEUE = 'msq_raw_queue';    // 続けて開くURL（ブランドを複数選んだ時）
  /* 型番の一覧から測った固有名詞。同じ物を二度、順番待ちに積まないための印（2026-08-18） */
  const RAW_KOYUU_TSUNAGU = 'msq_raw_koyuu_tsunagu';
  const RAW_CARRY_MAX = 2000000;        // 溜め込みの上限（約2MB）
  let rawChainBusy = false;

  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } };
  const ssDel = (k) => { try { sessionStorage.removeItem(k); } catch (e) { } };

  function rawCarryStyle() {
    const box = document.getElementById('msq-raw-carry');
    if (!box) return;
    const cols = rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2;
    box.style.setProperty('display', 'grid', 'important');
    box.style.setProperty('grid-template-columns', 'repeat(' + cols + ',1fr)', 'important');
    box.style.setProperty('gap', '8px', 'important');
  }

  /* ================= 溜め込みを「HTMLまるごと」から「データだけ」へ =================
     2026-08-12 ユーザー承認。実機で測った数字が根拠。
       今のやり方 … 1件2,957文字 → 2MBで【676件】で打ち止め。
                    しかも中身は 空の枠(merSkeleton)1,467個・全部同じSVG350個・
                    class属性355,732文字で、【題も本文も1文字も入っていない】
                    （保存の中で一番長い文字は7文字の "170,000"）
       データ     … 1件およそ200文字 → 2MBで【約1万件】。しかも題・値段・日付・
                    ブランド・サイズ・状態が入る＝今より情報が増える
     ★本文(description)は一覧には無い。props.item の全27項目を実機で出して確認済み。
       型番を足したい時はタイトル(name)から抜くことになる。
     ★見た目を変えないため、タイルは自作しない。メルカリ自身のタイルを1枚だけ
       「型」として覚えておき、リンク・ID・題・値段・画像だけ差し替える。
     ★この1つを false にすれば元のHTML方式に戻る。 */
  const RAW_CARRY_V2 = true;
  const RAW_TPL = 'msq_raw_tpl';    // タイルの型（メルカリのタイル1枚ぶんのHTML）
  const RAW_DATA = 'msq_raw_data';  // 溜めた商品のデータ（配列のJSON）
  const RAW_FURUI = 'msq_raw_furui';   // 半年より古くて外した件数（帯に出す）
  const RAW_FULL = 'msq_raw_full';     // 溜め込みが一杯で止まっている印
  let rawPruneOK = false;              // 「古いのを読み込む」を押した＝古い分を外してよい

  /* メルカリのタイルを1枚、型として覚える。こちらが足した物は外してから覚える。 */
  /* 型が「見えない状態」で覚えられていないか調べる。
     ★中身は見ない。一番外側の見え方(display/opacity)だけを見る。 */
  function rawTplKusatteru(html) {
    try {
      const d = document.createElement('div');
      d.innerHTML = String(html || '');
      const e = d.firstElementChild;
      if (!e) return true;
      const st = (e.getAttribute('style') || '').split(' ').join('');
      if (st.indexOf('display:none') >= 0) return true;
      if (st.indexOf('opacity:0') >= 0) return true;
      return false;
    } catch (e) { return false; }
  }
  function rawGrabTpl() {
    const aru = ssGet(RAW_TPL);
    /* ★2026-08-27 既に焼き込まれた腐った型を捨てる。
       sessionStorage はページを読み直しても残るので、直した版を入れても
       display:none 入りの型が生き残り、溜め込みのタイルが見えないままになる。 */
    if (aru && rawTplKusatteru(aru)) {
      ssDel(RAW_TPL);
      try { console.log('[MSQ/そのまま] 見えない型を捨てた（採り直す）'); } catch (e) { }
    } else if (aru) { return aru; }
    const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
    let tpl = null;
    document.querySelectorAll(SEL).forEach((a) => {
      if (tpl || rawMine(a) || rawIsAd(a)) return;
      let li = a;
      for (let i = 0; i < 6 && li.parentElement; i++) { if (li.tagName === 'LI') break; li = li.parentElement; }
      if (!li || !li.querySelector('img')) return;
      if (li.querySelector('.merSkeleton')) return;   /* 空の枠は型にしない */
      /* ★2026-08-27 消えているタイルを型にしない。
         実機で ✕で消したタイル(display:none)を型にしてしまい、溜め込みから
         組み直したタイル24枚が全部 生まれた瞬間に見えなかった。 */
      try { if (getComputedStyle(li).display === 'none') return; } catch (e) { }
      const c = li.cloneNode(true);
      c.querySelectorAll('.msq-raw-x,.msq-raw-title,.msq-raw-sub,.msq-raw-shiire,.msq-raw-line').forEach((e) => e.remove());
      /* ★2026-08-27 見え方を左右する3つだけ型から落とす。
         なぞって消す途中のタイル(transform/opacity が付く)を拾っても安全にするため。
         class も中身も一切触らない。落とすのはこの3つだけ。 */
      try {
        [c].concat(Array.from(c.querySelectorAll('[style]'))).forEach((e) => {
          if (!e.style) return;
          ['display', 'opacity', 'transform'].forEach((p) => e.style.removeProperty(p));
          if (!e.getAttribute('style')) e.removeAttribute('style');
        });
      } catch (e) { }
      tpl = c.outerHTML;
    });
    if (tpl) ssSet(RAW_TPL, tpl);
    return tpl;
  }

  /* タイル1枚から、保存する中身を取り出す。Reactがあれば正確な値、無ければ説明文から。 */
  function rawTileData(a) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/(?:item|shops\/product)\/([^/?#]+)/);
    if (!m) return null;
    const d = { u: href, i: m[1] };
    const it = rawItemData(a);
    if (it) {
      if (it.name) d.n = String(it.name);
      if (it.price) { const p = rawNum(it.price); d.p = p ? p.toLocaleString() : String(it.price); }
      if (it.created) d.c = String(it.created);
      if (it.updated) d.w = String(it.updated);
      if (it.status && it.status !== 'ITEM_STATUS_ON_SALE') d.s = 1;
      try { d.z = (it.itemSize && it.itemSize.name)
        || (Array.isArray(it.itemSizes) && it.itemSizes[0] && it.itemSizes[0].name) || ''; } catch (e) { }
      try { d.b = (it.itemBrand && it.itemBrand.name) || ''; } catch (e) { }
    }
    const im = a.querySelector('img');
    if (im) d.t = im.getAttribute('src') || '';
    if (!d.n) {
      /* ★題は rawDecorate と同じ出どころ（[role="img"] の aria-label）から取る。
         違う所から取ると、組み直した時に題が出なくなる。 */
      const ro = a.querySelector('[role="img"]');
      const lb = (ro && ro.getAttribute('aria-label')) || (im && im.getAttribute('alt')) || '';
      d.n = lb.replace('の画像', '').replace('のサムネイル', '')
        .replace('売り切れ', '').replace(/[\d,]+円/, '').trim();
      if (lb.indexOf('売り切れ') >= 0) d.s = 1;
      const pm = lb.match(/([\d,]+)円/);
      if (pm && !d.p) d.p = pm[1];
    }
    if (!d.z) delete d.z;
    if (!d.b) delete d.b;
    return d.n ? d : null;
  }

  /* 型に中身を差し替えてタイルを1枚組む。
     ★差し替えるのは5か所だけ（実機で構造を出して決めた）。他はメルカリのHTMLのまま。 */
  function rawBuildTile(d, tpl) {
    const w = document.createElement('div');
    w.innerHTML = tpl;
    const li = w.firstElementChild;
    if (!li) return null;
    const a = li.querySelector('a[href]');
    if (!a) return null;
    a.setAttribute('href', d.u);
    const lb = (d.n || '') + 'の画像' + (d.s ? ' 売り切れ' : '') + (d.p ? ' ' + d.p + '円' : '');
    const thumb = li.querySelector('[class*="merItemThumbnail"]') || li.querySelector('[role="img"]');
    if (thumb) { if (d.i) thumb.id = d.i; thumb.setAttribute('aria-label', lb); }
    const ic = li.querySelector('[class*="imageContainer"]');
    if (ic) ic.setAttribute('aria-label', (d.n || '') + 'のサムネイル');
    const im = li.querySelector('img');
    if (im) {
      im.setAttribute('src', d.t || '');
      im.setAttribute('alt', (d.n || '') + 'のサムネイル');
      try { im.removeAttribute('srcset'); } catch (e) { }
    }
    const num = li.querySelector('[class*="number__"]');
    if (num && d.p) num.textContent = d.p;
    /* 売り切れの帯。型が売り切れ用なので、販売中の物では外す */
    const st = li.querySelector('[data-testid="thumbnail-sticker"]');
    if (st && !d.s) st.remove();
    /* ★日付とサイズを印として持たせる。これが無いと rawDecorate の「飛ばす条件」
       (題・✕・行がそろう) が永久に満たされず、2秒ごとに全タイルを調べ直して重くなる。
       1万枚では確実に固まるので、ここは省略できない。 */
    if (d.c) li.setAttribute('data-msq-c', d.c);
    if (d.w) li.setAttribute('data-msq-w', d.w);
    if (d.z) li.setAttribute('data-msq-z', d.z);
    /* ★2026-08-27 値段も印にする。これが無いと組み直したタイルが全部0円扱いになり、
       高い順・安い順がまったく効かない（実機で24枚が動かなかった）。
       ★カンマは外して入れること。rawNum は Number() なので "7,330" は NaN になる。 */
    if (d.p) li.setAttribute('data-msq-p', String(d.p).split(',').join(''));
    return li;
  }

  function rawDataRead() {
    try { const a = JSON.parse(ssGet(RAW_DATA) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }

  /* ★2026-08-26 ユーザー指摘『次へが出る前に結果の画像がまだあるのに、いきなり
       読み込みが始まり最初に戻る』『下に継ぎ足した続きから見れないと意味がない』。
     ★調べた結果: DOMの並びは [前のページ][新しいページ] で、既に
       「下に継ぎ足し」になっている。壊れていたのは【見る位置】だけだった。
       rawCarryGo は本物のページ移動なので、ブラウザが画面を先頭へ戻す。
       そこへ前のページを並びの手前に入れるため、
       画面の先頭＝前のページの1件目＝【最初に戻った】ように見えていた。
     ★直し: 移動した後【新しい並びの先頭】まで送る。DOMの構造は触らない。
       ★作法は rawKeepRestore と同じにする（ここだけ別の書き方をしない）:
         描き終わるまで待って何回か試す／届いたら止める／一覧から離れたら止める。
       ★商品ページから戻る時の位置戻し(RAW_KEEP)が控えている時は譲る。
         あちらは元居た場所そのものに戻すので、二重に動かすと喧嘩になる。 */
  function rawTsuzukiHe(grid) {
    if (!grid) return;
    try { if (ssGet(RAW_KEEP)) return; } catch (e) { }
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (!rawOnSearch() || !grid.isConnected) { clearInterval(t); return; }
      const bar = document.getElementById('msq-raw-bar');
      const sukima = bar ? (bar.getBoundingClientRect().height + 6) : 6;
      const ima = window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
      const mato = grid.getBoundingClientRect().top + ima - sukima;
      if (mato <= 0) { clearInterval(t); return; }
      if (Math.abs(ima - mato) < 40) { clearInterval(t); return; }
      try { window.scrollTo(0, mato); } catch (e) { }
      if (n >= 12) clearInterval(t);
    }, 400);
  }
  function rawCarryRestore() {
    if (window.__msqCarryDone) return;
    const grid = rawFindGrid();
    if (!grid || !grid.parentElement) return;    // 並びが出るまで待つ
    window.__msqCarryDone = true;
    const chain = ssGet(RAW_CHAIN);
    ssDel(RAW_CHAIN);
    const html = ssGet(RAW_CARRY);
    if (!chain) {                                 // 自分で検索し直した＝溜めた分は捨てる
      ssDel(RAW_CARRY); ssDel(RAW_DATA); ssDel(RAW_FURUI); ssDel(RAW_FULL);
      return;
    }

    if (RAW_CARRY_V2) {
      const list = rawDataRead();
      if (!list.length) return;
      const tpl = rawGrabTpl();
      if (!tpl) { window.__msqCarryDone = false; return; }   /* 型がまだ。次の回に試す */
      const box = document.createElement('div');
      box.id = 'msq-raw-carry';
      let n = 0;
      list.forEach((d) => {
        if (rawHidden.has(d.i)) return;            /* ✕で消した物は出さない */
        const li = rawBuildTile(d, tpl);
        if (li) { box.appendChild(li); n++; }
      });
      grid.parentElement.insertBefore(box, grid);
      rawAdded++;
      rawCarryStyle();
      rawMoreSay('前のページ ' + n + '件');
      rawTsuzukiHe(grid);        /* ★続きから見せる */
      return;
    }

    if (!html) return;
    const box = document.createElement('div');
    box.id = 'msq-raw-carry';
    box.innerHTML = html;
    /* ★すでに保存されてしまった広告もここで捨てる（2026-08-11）。
       これが無いと、直す前に溜まった分が読み直すたびに復活し続ける。 */
    rawDropAds(box);
    rawDropHidden(box);   /* ★2026-08-27 ✕で消した物を復活させない */
    grid.parentElement.insertBefore(box, grid);
    rawAdded++;                                  // 繋がった＝「次へ」を隠してよい
    rawCarryStyle();
    rawMoreSay('前のページ ' + box.children.length + '件');
    rawTsuzukiHe(grid);        /* ★続きから見せる */
  }

  /* いま出ている商品を全部しまってから、次のURLへ移動する。 */
  function rawCarryGo(url) {
    const grid = rawFindGrid();
    if (!grid) { rawMoreSay('並びが見つからず'); rawChainBusy = false; return; }

    if (RAW_CARRY_V2) {
      rawGrabTpl();                                  /* 型をここで確実に覚えておく */
      const list = rawDataRead();
      const mita = new Set();
      list.forEach((d) => mita.add(d.i));
      /* ★ページ全体から拾う。同じ商品は入れない（実測で1.5倍前後の重複があった）。
         空の枠(merSkeleton)は題が取れないので rawTileData が null を返し、自然に落ちる。 */
      document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach((a) => {
        if (rawIsAd(a)) return;
        const d = rawTileData(a);
        if (!d || mita.has(d.i)) return;
        mita.add(d.i);
        list.push(d);
      });

      let moji = JSON.stringify(list);
      if (moji.length > RAW_CARRY_MAX) {
        /* ★「次へ」は出さない（2026-08-12 ユーザー指摘）。理由が2つある:
             ① 次へが出ていると【まだ続きがある】という意味になり、
                「次へをなくして自動で繋げる」という機能そのものと矛盾する
             ② 手で押すと溜めた分が全部消える。復元は【こちらが移動させた印】が
                無いと捨てる作りのため（rawCarryRestore の !chain の枝）
           ★代わりに【古いのを読み込む】ボタンを一覧の下に出して、いったん止まる。
             次のページ＝新しい順の続き＝【古い商品】なので、そう書けば意味が正しい。
             黙って古い分を捨てて進むより、押してもらう方が安全。
             ★ユーザーの狙い: こちらのコードが間違って少ない件数で止まった時も、
               このボタンが出れば目で気づける。 */
        if (!rawPruneOK) {
          ssSet(RAW_FULL, '1');
          try { rawFuruiBtn(); } catch (e) { }
          rawMoreSay('溜め込みが一杯（古いのを読み込む）');
          rawChainBusy = false;
          return;
        }
        rawPruneOK = false;
        /* 押された。まず半年より古い物を落とし、それでも足りなければ古い順に削る。
           日付が無い物は「古い」と判断できないので残す。
           落とした数は帯に出す（黙って減らすと「勝手に消えた」になるため）。 */
        const ima = Date.now() / 1000;
        const hantoshi = 183 * 24 * 60 * 60;
        const toshi = (d) => rawNum(d.w) || rawNum(d.c) || 0;
        let keshita = 0;
        const nokori = list.filter((d) => {
          const t = toshi(d);
          if (t && (ima - t) >= hantoshi) { keshita++; return false; }
          return true;
        });
        list.length = 0;
        nokori.forEach((d) => list.push(d));
        moji = JSON.stringify(list);
        if (moji.length > RAW_CARRY_MAX) {
          /* 半年で切っても入らない時は、新しい順に並べてから後ろ（古い方）を削る。
             ★1件ずつ測ると件数の2乗の手間になって固まる。5%ずつまとめて削る。 */
          list.sort((x, y) => toshi(y) - toshi(x));
          while (list.length > 50 && JSON.stringify(list).length > RAW_CARRY_MAX) {
            const kezuru = Math.max(1, Math.floor(list.length * 0.05));
            for (let i = 0; i < kezuru && list.length > 50; i++) { list.pop(); keshita++; }
          }
          moji = JSON.stringify(list);
        }
        if (keshita > 0) {
          const mae = rawNum(ssGet(RAW_FURUI)) || 0;
          ssSet(RAW_FURUI, String(mae + keshita));
        }
      }
      /* ★保存の失敗を握りつぶさない（2026-08-12 ユーザー指摘）。
         ssSet は失敗しても黙って通るため、ブラウザ側の容量が RAW_CARRY_MAX より
         小さい場合、上限に達する前に保存が失敗し、次のページで古い内容が復元されて
         「件数が伸びない・原因が出ない」になる。今日追っていた症状と同じ見え方。
         失敗したら一杯扱いにして「古いのを読み込む」を出す。 */
      try {
        sessionStorage.setItem(RAW_DATA, moji);
      } catch (e) {
        ssSet(RAW_FULL, '1');
        try { rawFuruiBtn(); } catch (e2) { }
        rawMoreSay('保存できず（古いのを読み込む）');
        rawChainBusy = false;
        return;
      }
      ssDel(RAW_CARRY);                              /* 古いHTML方式の残りは捨てる */
      ssSet(RAW_CHAIN, '1');
      rawMoreSay('次のページへ…');
      location.href = url;
      return;
    }

    const tmp = document.createElement('div');
    const old = document.getElementById('msq-raw-carry');
    tmp.innerHTML = (old ? old.innerHTML : '') + grid.innerHTML;
    /* こちらが足した✕とタイトルは外す。写しても押せないので、移動先で付け直させる。 */
    tmp.querySelectorAll('.msq-raw-x,.msq-raw-title,.msq-raw-sub,.msq-raw-shiire,.msq-raw-line').forEach((e) => e.remove());
    rawDropAds(tmp);   /* ★広告は溜め込みに入れない（2026-08-11） */
    const html = tmp.innerHTML;
    if (html.length > RAW_CARRY_MAX) {
      rawMoreSay('これ以上は溜められません');
      rawChainBusy = false;
      return;
    }
    ssSet(RAW_CARRY, html);
    ssSet(RAW_CHAIN, '1');
    rawMoreSay('次のページへ…');
    location.href = url;
  }

  /* 溜め込みが一杯で止まった時だけ、一覧の下に出すボタン（2026-08-12 ユーザー指定）。
     ★文字は「古いのを読み込む」。次のページ＝新しい順の続き＝古い商品なので、
       「次へ」と書くと「まだ続きがある」という誤った意味になる。
     ★帯には置かない。帯にボタンを足すと3段になって版の札が落ちる前科がある。
     ★押すと、半年より古い物→それでも足りなければ古い順に外して、続きへ進む。 */
  function rawFuruiBtn() {
    const iru = !!ssGet(RAW_FULL);
    const aru = document.getElementById('msq-raw-furui');
    if (!iru) { if (aru) aru.remove(); return; }
    if (aru) return;
    const grid = rawFindGrid();
    if (!grid || !grid.parentElement) return;
    const b = document.createElement('button');
    b.id = 'msq-raw-furui';
    b.textContent = '古いのを読み込む';
    b.style.cssText = 'display:block;width:100%;margin:10px 0;padding:14px;'
      + 'border:none;border-radius:10px;background:#ca8a04;color:#fff;'
      + 'font:700 15px/1.2 system-ui;cursor:pointer;';
    b.addEventListener('click', () => {
      rawPruneOK = true;
      ssDel(RAW_FULL);
      try { b.remove(); } catch (e) { }
      rawMoreSay('古いのを外して続けます…');
      try { rawChainStep(); } catch (e) { }
    });
    grid.parentElement.appendChild(b);
  }

  /* 検索窓に文字を入れにくい件の直し（2026-08-12 ユーザー指摘・実機で確認）。
     実測: 入力欄 左87 幅217 右端304／✕ボタン 左304 幅34＝【隙間ゼロで密着】。
           43文字入れると 中身506px に対し 見える幅217px（289pxはみ出す）のに
           送りは0のままで、末尾が見えない。包む箱は overflow:auto で横に動くため、
           右へ送ろうとすると箱ごと動いて指が隣の✕に乗る。
     直し: ①包む箱は横に動かさない ②文字が✕に密着しないよう右に余白
           ③打っている場所が見えるところまで【入力欄の中だけ】を送る
     ★メルカリのヘッダはFROZEN。位置・高さ・表示は1つも変えていない。
       変えたのは overflow と右余白だけで、この3行を消せば元に戻る。 */
  function rawKensakuWaku() {
    /* ★2026-08-12 querySelector で1つだけに当てていたため、検索窓を開いた時に
       【新しく作られる入力欄】に当たっていなかった（実機で 直しが入っているか:false を確認）。
       全部に当てる。印は要素ごとに付くので二度手間にはならない。 */
    document.querySelectorAll(
      'input[type="search"],input[aria-label*="検索"],input[placeholder*="検索"]'
    ).forEach((inp) => { rawKensakuHitotsu(inp); });
  }

  function rawKensakuHitotsu(inp) {
    if (!inp || !inp.dataset || inp.dataset.msqKen) return;
    const box = inp.parentElement;
    if (!box) return;
    inp.dataset.msqKen = '1';
    try { box.style.setProperty('overflow', 'hidden', 'important'); } catch (e) { }
    try { inp.style.setProperty('padding-right', '8px', 'important'); } catch (e) { }
    const okuru = () => {
      try {
        if (document.activeElement !== inp) return;
        const s = inp.selectionStart;
        if (s == null || s >= inp.value.length) inp.scrollLeft = inp.scrollWidth;
      } catch (e) { }
    };
    inp.addEventListener('input', okuru);
    inp.addEventListener('focus', okuru);
    inp.addEventListener('click', okuru);
    /* ★2026-08-12 実機の画面で確認した本当の症状。
       右ボタンで文字送りを続けると、文末に着いた時点でカーソルが入力欄から出て、
       ✕やカメラのボタンに青い枠（フォーカス）が移ってしまう。
       Android のキー操作の標準動作で、横スクロールとは別物だった。
       文末では右、文頭では左を、入力欄の外へ出さない。 */
    inp.addEventListener('keydown', (ev) => {
      try {
        const k = ev.key;
        if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
        const s = inp.selectionStart, e2 = inp.selectionEnd;
        if (s == null || s !== e2) return;                 /* 選択中は邪魔しない */
        if (k === 'ArrowRight' && s >= inp.value.length) { ev.preventDefault(); okuru(); }
        if (k === 'ArrowLeft' && s <= 0) ev.preventDefault();
      } catch (e) { }
    });
  }

  /* ★2026-09-21 トップの検索欄を純正DOMのまま表示する。
     トップではメルカリ純正の検索フォームがDOMにあるが、モバイル用CSSで
     centerSectionごとdisplay:noneになっている。別ロゴ・別虫眼鏡・別入力を
     作らず、純正フォームの入れ物だけを見える状態へ戻す。
     検索結果では独自の検索欄を使うため、ヘッダー側の重複する検索ボタンだけを
     隠す。すべて変更前styleを属性へ保存し、トップ・検索一覧以外へ移る時に復元する。 */
  function rawTopSearchLayout() {
    const ATTR = 'data-msq-top-search-style';
    const restore = () => {
      document.querySelectorAll('[' + ATTR + ']').forEach((e) => {
        try {
          const v = e.getAttribute(ATTR);
          if (v) e.setAttribute('style', v); else e.removeAttribute('style');
          e.removeAttribute(ATTR);
        } catch (err) { }
      });
    };
    const h = document.querySelector('header.page-header') || document.querySelector('header');
    if (!h) return;
    const isHome = location.pathname === '/';
    const isSearch = typeof rawOnSearch === 'function' && rawOnSearch();
    /* 純正の検索専用画面へ切り替わった直後はURLがまだ / のまま。
       bodyがfixedになった時点で、トップ用に保存したflex・幅・非表示styleを
       すべて戻す。候補表示中は「検索履歴」の文字が消えるため文字判定を使わない。
       ホーム本体はbodyが通常状態なので対象外。 */
    try {
      const bc = getComputedStyle(document.body);
      if (isHome && bc.position === 'fixed') {
        restore();
        /* トップ表示中に付けたflex/幅/高さが、Reactの再描画で
           data-msq-top-search-style属性なしの新DOMへ残ることがある。
           本番の履歴が多い状態ではこれが検索画面を高さ0にし、
           ×を画面外へ押し上げていた。検索画面の純正寸法へ戻す。 */
        const clearTopOnly = (e, names) => {
          if (!e) return;
          names.forEach((name) => { try { e.style.removeProperty(name); } catch (err) { } });
        };
        const searchScreenCenter = h.querySelector('[class*="centerSection"]');
        const searchScreenAc = searchScreenCenter && searchScreenCenter.querySelector('[data-testid="search-autocomplete"]');
        const searchScreenAuto = searchScreenAc && searchScreenAc.querySelector('[class*="autocomplete"]');
        const searchScreenBox = searchScreenAc && searchScreenAc.querySelector('[class*="inputContainer"]');
        const searchScreenForm = searchScreenAc && searchScreenAc.querySelector('form[data-testid="chip-search-input"]');
        clearTopOnly(searchScreenCenter, ['flex', 'min-width', 'padding']);
        clearTopOnly(searchScreenAc, ['position', 'display', 'width', 'height']);
        clearTopOnly(searchScreenAuto, ['flex', 'min-width', 'width']);
        clearTopOnly(searchScreenBox, ['flex', 'min-width']);
        clearTopOnly(searchScreenForm, ['flex', 'min-width', 'width', 'height']);
        if (searchScreenCenter && getComputedStyle(searchScreenCenter).display !== 'flex') {
          searchScreenCenter.style.setProperty('display', 'flex', 'important');
        }
        return;
      }
    } catch (e) { }
    if (!isHome && !isSearch) { restore(); return; }
    if (!isHome) restore();

    const remember = (e) => {
      if (!e || e.hasAttribute(ATTR)) return;
      e.setAttribute(ATTR, e.getAttribute('style') || '');
    };
    /* 検索一覧では、独自入力欄と同じ役割の純正ヘッダー検索ボタンを重ねない。 */
    h.querySelectorAll('[class*="endSection"] button[aria-label="検索"]').forEach((e) => {
      remember(e);
      e.style.setProperty('display', 'none', 'important');
    });
    if (!isHome) return;

    const center = h.querySelector('[class*="centerSection"]');
    const ac = center && center.querySelector('[data-testid="search-autocomplete"]');
    const auto = ac && ac.querySelector('[class*="autocomplete"]');
    const box = ac && ac.querySelector('[class*="inputContainer"]');
    const form = ac && ac.querySelector('form[data-testid="chip-search-input"]');
    if (!center || !ac || !auto || !box || !form) return;
    [center, ac, auto, box, form].forEach(remember);
    /* 純正SVGをそのまま使う。Web版モバイルCSSで幅58pxまで縮み、
       検索枠が左へ寄っていたため、ロゴの領域だけを本来の比率に戻す。 */
    const logo = h.querySelector('[data-testid="mercari-logo"]');
    const logoSvg = logo && logo.querySelector('svg');
    const logoLink = logo && logo.parentElement;
    [logoLink, logo, logoSvg].forEach(remember);
    if (logoLink) {
      logoLink.style.setProperty('flex', '0 0 92px', 'important');
      logoLink.style.setProperty('width', '92px', 'important');
      logoLink.style.setProperty('min-width', '92px', 'important');
    }
    if (logo) {
      logo.style.setProperty('width', '92px', 'important');
      logo.style.setProperty('min-width', '92px', 'important');
    }
    if (logoSvg) {
      logoSvg.style.setProperty('width', '92px', 'important');
      logoSvg.style.setProperty('height', '49px', 'important');
    }
    center.style.setProperty('display', 'flex', 'important');
    center.style.setProperty('flex', '1 1 auto', 'important');
    center.style.setProperty('min-width', '0', 'important');
    center.style.setProperty('padding', '0 4px', 'important');
    ac.style.setProperty('position', 'static', 'important');
    ac.style.setProperty('display', 'flex', 'important');
    ac.style.setProperty('width', '100%', 'important');
    ac.style.setProperty('height', '100%', 'important');
    auto.style.setProperty('flex', '1 1 auto', 'important');
    auto.style.setProperty('min-width', '0', 'important');
    auto.style.setProperty('width', '100%', 'important');
    box.style.setProperty('flex', '1 1 auto', 'important');
    box.style.setProperty('min-width', '0', 'important');
    /* ロゴを広げた後も、検索枠が幅145pxまで潰れないようにする。
       389px幅で右端の純正「やること」まで12px空けて収まる190px。 */
    form.style.setProperty('flex', '0 0 190px', 'important');
    form.style.setProperty('min-width', '190px', 'important');
    form.style.setProperty('width', '190px', 'important');
    form.style.setProperty('height', '36px', 'important');
    /* 初期表示にだけ出る不要な戻る/閉じるボタンを消し、純正の検索アイコン・
       入力欄・画像検索ボタンは残す。入力を押した後の純正挙動は触らない。 */
    const closeWrap = Array.from(box.children).find((e) => e.querySelector('button[aria-label="閉じる"]'));
    if (closeWrap) {
      remember(closeWrap);
      closeWrap.style.setProperty('display', 'none', 'important');
    }

    /* ★2026-09-22 検証アプリの短い検索欄を、メルカリ純正の検索専用画面へ接続する。
       短い欄は純正inputのフォーカスだけが動き、タップしても「検索履歴／サジェスト」の
       画面へ遷移していなかった。純正の検索画面を開くボタンはDOMに存在するが、
       トップの重複表示を避けるため見た目だけ非表示にしている。
       ここでは入力欄のクリック時にその純正ボタンを呼ぶだけにし、
       preventDefault・DOMの差し替え・レイアウト変更は行わない。 */
    const shortInput = form.querySelector('input[aria-label="検索キーワードを入力"]');
    const nativeSearchScreen = h.querySelector('[class*="endSection"] button[aria-label="検索"]');
    if (shortInput && nativeSearchScreen && !shortInput.dataset.msqNativeSearchScreenWire) {
      shortInput.dataset.msqNativeSearchScreenWire = '1';
      shortInput.addEventListener('click', (ev) => {
        try {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (location.pathname === '/') {
            /* 純正検索画面への切替中だけ、一覧用監視の再計算を止める。 */
            window.__msqSearchOpening = true;
            if (window.__msqSearchOpeningTimer) clearTimeout(window.__msqSearchOpeningTimer);
            window.__msqSearchOpeningTimer = setTimeout(() => {
              window.__msqSearchOpening = false;
              window.__msqSearchOpeningTimer = null;
            }, 1200);
            nativeSearchScreen.click();
          }
        } catch (e) { }
      });
    }
  }

  /* ★2026-09-21 純正の検索専用画面を一覧処理から守る。
     URLはホーム(`/`)のままでも、検索欄を開くと本文にカテゴリー・ブランド・
     検索履歴が出てbodyが入力用にfixed/hiddenになる。ここをホーム一覧と誤認して
     一覧処理を走らせると、検索画面が消えたり上部が移動してスクロール不能になる。 */
  function rawTopSearchScreenActive() {
    try {
      if (location.pathname !== '/') return false;
      const b = document.body;
      const i = document.querySelector('input[aria-label="検索キーワードを入力"]');
      if (!b || !i) return false;
      const c = getComputedStyle(b);
      if (c.position !== 'fixed' || c.overflow !== 'hidden') {
        window.__msqTopSearchScreenState = 'normal';
        return false;
      }
      /* 本番では検索画面の本文（カテゴリー等）が出る前に数百ms遅れる。
         固定bodyと純正検索inputが出た時点で検索画面として扱い、一覧監視の
         rawStart/rawListStartを割り込ませない。閉じるとbodyが通常に戻り、
         上の分岐でnormalへ戻る。 */
      window.__msqTopSearchScreenState = 'yes';
      return true;
    } catch (e) { return false; }
  }

  /* 移動方式。下まで来た時に「次へ」があれば次のページ、無ければ次のブランドへ。 */
  function rawNavStep() {
    if (rawChainBusy) return;
    /* ★2026-08-27 ここで【覚えたURL(rawNextUrl)】を使うのをやめた（ユーザー指示）。
       ★直す前: (画面の次へ) ?? (覚えたURL) の順で使っていたため、
         画面から「次へ」が無くなっても古い覚え書きで移動し続けていた。
         移動するたびに保存HTMLを入れ直すので、✕で消した物まで復活していた。
       ★「次へ」は隠してもDOMには残る（rawHideNext は display:none にするだけ）ので、
         【本当に続きがある間は必ず見つかる】。見つからない＝本当に終わり。
       ★描画が間に合っていないだけの時も止まるが、見張りは1秒ごとに動いているので、
         あとから「次へ」が描かれれば自然に再開する（取りこぼさない）。 */
    const link = rawFindNextLink();
    if (link && link.href) { rawChainBusy = true; rawCarryGo(link.href); return; }
    let q = [];
    try { q = JSON.parse(ssGet(RAW_QUEUE) || '[]') || []; } catch (e) { }
    if (q.length) {
      const u = q.shift();
      ssSet(RAW_QUEUE, JSON.stringify(q));
      rawChainBusy = true;
      rawCarryGo(u);
      return;
    }
    /* ★ユーザー『ここまでというRの横の文字が今は役目を果たさず、
         画面から古いのを外したとか わけのわからんアドバイスが出てる』。
       止まった時は【なぜ止まったか】で必ず上書きする。前の文言を残さない。 */
    rawMoreSay('ここまで（次へが無い）');
  }

  /* ===================== 裏読み（画面を移動しないやり方） =====================
     ★前回0件だった原因は、枠を画面の外(left:-9999px)に置いたこと。
       ブラウザは画面の外にある枠の描画を止めるため、メルカリの一覧が
       いつまでも描かれず0件のままだった。
       画面の中に置き、ほぼ透明にして一番後ろへ回す（押せないようにもする）。
     ★これでも取れなければ2回で見切りをつけ、移動方式に自動で切り替える。 */
  const RAW_FRAME_BAD = 'msq_raw_frame_bad';
  let rawFrameFail = 0;

  /* ★2026-08-12 ②裏読みをやめて③移動方式に一本化した（ユーザー承認・PATCHへ降格して変更）。
     実機で測った結果:
       ②裏の枠  … 下端に張り付けて75秒で【0ページ】。120件のまま動かない
       ③移動    … 同じ条件で26秒で【6ページ】（v1:2→v1:7・タイル720枚）
     ②が進まない原因は rawFindGridDoc が【広告ブロック(3件)を並びの箱と取り違える】こと。
     すぐ隣に本物のUL(子120)があるのに一度も見ていない。本ページ側の rawFindGrid では
     2026-08-09/08-11 に同じ穴を直してあるが、こちらの双子に写し忘れていた。
     さらに悪いことに、②が「3件読めた」と返すため rawFrameFail が増えず、
     ③へ逃がす安全装置が働くまでが異常に遅かった。
     ★②のコードは消していない。この1つを true に戻せば元の動きに戻る。 */
  const RAW_USE_FRAME = false;

  function rawFindGridDoc(d) {
    const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
    const list = [];
    d.querySelectorAll(SEL).forEach((a) => {
      if (a.querySelector('img') || a.querySelector('[role="img"]')) list.push(a);
    });
    if (list.length < 3) return null;
    let node = list[0];
    for (let i = 0; i < 6 && node && node.parentElement; i++) {
      node = node.parentElement;
      let n = 0;
      for (let k = 0; k < node.children.length; k++) {
        const c = node.children[k];
        if (c.querySelector && (c.querySelector(SEL) || (c.matches && c.matches(SEL)))) n++;
      }
      if (n >= 3 && n >= node.children.length * 0.6) return node;
    }
    return null;
  }

  function rawItemsIn(d) {
    const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
    const out = [];
    if (!d) return out;
    const g = rawFindGridDoc(d);
    if (g) {
      for (let i = 0; i < g.children.length; i++) {
        const c = g.children[i];
        if (c.querySelector && c.querySelector(SEL)) out.push(c);
      }
      if (out.length) return out;
    }
    d.querySelectorAll('li').forEach((li) => { if (li.querySelector(SEL)) out.push(li); });
    return out;
  }

  /* 足した分を入れる自分の箱。メルカリの並びの【すぐ後ろ】に置く。
     並びの中には入れない（作り直された時に消されるため）。 */
  /* ===== メモリで落ちにくくする（2026-08-18 ユーザー依頼） =====
     ★『メモリ不足で真っ黒になる。もともと落ちにくいように作れんのか？』
     ★何が増え続けているか: 繋げる（次のページ・次のブランドへ自動で進む）たびに、
       商品のタイルを画面へ足し続けている。溜め込みの【文字】は2MBで頭打ちにしてあるが、
       【画面に置いたタイル】には上限が無かった。タイル1枚ごとに写真が1枚付くので、
       これがメモリを食う本体。
     ★直し: 画面に置くタイルの数に上限を設ける。超えた分は【古い方から】画面だけ外す。
       溜め込みの記録（RAW_DATA）は消さないので、数え上げや相場の計算には響かない。
     ★上限は600枚。実測で1ページ約20〜30枚なので、20ページ以上ぶんは残る。
       ここを増やしすぎると落ちる。減らしすぎると繋げる意味が無くなる。 */
  const RAW_TILE_MAX = 600;
  function rawMemoryFix() {
    try {
      const box = document.getElementById('msq-raw-add');
      if (!box) return;
      const ko = box.children;
      if (ko.length <= RAW_TILE_MAX) return;
      let kesu = ko.length - RAW_TILE_MAX;
      const kesuKazu = kesu;
      while (kesu > 0 && box.firstElementChild) {
        box.removeChild(box.firstElementChild);
        kesu--;
      }
      try { console.log('[MSQ/そのまま] 画面が重くならないよう古いタイルを ' + kesuKazu + '枚 外した（記録は残っています）'); } catch (e) { }
      try { rawMoreSay('古い' + kesuKazu + '枚は画面から外しました'); } catch (e) { }
    } catch (e) { }
  }

  function rawAddBox() {
    let box = document.getElementById('msq-raw-add');
    if (box) return box;
    const grid = rawFindGrid();
    if (!grid || !grid.parentElement) return null;
    box = document.createElement('div');
    box.id = 'msq-raw-add';
    grid.parentElement.insertBefore(box, grid.nextSibling);
    return box;
  }

  function rawAddStyle() {
    const box = document.getElementById('msq-raw-add');
    if (!box) return;
    const cols = rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2;
    box.style.setProperty('display', 'grid', 'important');
    box.style.setProperty('grid-template-columns', 'repeat(' + cols + ',1fr)', 'important');
    box.style.setProperty('gap', '8px', 'important');
  }

  function rawFrameLoad(url, done) {
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;'
      + 'opacity:0.01;z-index:-1;pointer-events:none;';
    fr.src = url;
    document.body.appendChild(fr);
    let tries = 0, last = -1, same = 0;
    const timer = setInterval(() => {
      tries++;
      let d = null;
      let items = [];
      try {
        d = fr.contentDocument;
        items = rawItemsIn(d);
        if (d && fr.contentWindow) fr.contentWindow.scrollTo(0, d.body.scrollHeight);
      } catch (e) { /* まだ読めない */ }
      rawMoreSay('読込中 ' + items.length + '件 (' + tries + ')');
      if (items.length !== last) { last = items.length; same = 0; } else { same++; }
      if (tries < 30 && (items.length === 0 || same < 3)) return;
      clearInterval(timer);
      let next = '';
      try { const l = rawFindNextLink(d); next = l ? l.href : ''; } catch (e) { }
      const got = [];
      try { items.forEach((el) => got.push(document.importNode(el, true))); } catch (e) { }
      try { fr.remove(); } catch (e) { }
      done(got, next);
    }, 500);
  }

  /* ====== 商品を見て戻ってきた時に、読み直さない（2026-08-09・PATCH） ======
     メルカリは戻ると一覧を1ページ目から出し直すので、溜めた分もスクロール位置も消える。
     こちらで【足した分とスクロール位置をしまい、戻ったら並べ直す】。
     ★しまうのは【こちらが足した分だけ】。メルカリの1ページ目はしまわない。
       あちらが出し直す分と二重にならないようにするため。これで照合が要らなくなる。
     ★置き直す先は並びの【後ろ】。順番が入れ替わらない。 */
  const RAW_KEEP = 'msq_raw_keep';

  /* ★2026-08-27 空白の書き方をそろえる（上の rawKeySoroeru と同じ物を使う）。
     ★これを入れる前は、保存した鍵が + / 今の条件が %20 で食い違い、
       rawKeepRestore が毎回「別の検索」と判定して保存を捨てていた。
       そのせいで「開いた場所に戻る」が一度も効いていなかった（実機で確認）。 */
  const rawBaseKey = () => {
    try {
      const u = new URL(location.href);
      u.searchParams.delete('page_token');
      return rawKeySoroeru(u.search);
    } catch (e) { return rawKeySoroeru(location.search); }
  };

  function rawKeepSave() {
    if (!rawOnSearch()) return;
    const car = document.getElementById('msq-raw-carry');
    const add = document.getElementById('msq-raw-add');
    const html = (car ? car.innerHTML : '') + (add ? add.innerHTML : '');
    /* ★2026-08-09 ここで「足した分が無ければ何もしない」にしていたため、
       まだ下まで行っていない状態では【位置まで一緒に捨てて】いた。
       足した分が無くても、どこまで見ていたかは必ずしまう。 */
    const y = window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    /* こちらが足した✕とタイトルは外す。写しても押せないので付け直させる。 */
    tmp.querySelectorAll('.msq-raw-x,.msq-raw-title,.msq-raw-sub,.msq-raw-shiire,.msq-raw-line').forEach((e) => e.remove());
    rawDropAds(tmp);   /* ★広告はしまわない（2026-08-11） */
    try {
      ssSet(RAW_KEEP, JSON.stringify({
        key: rawBaseKey(), html: tmp.innerHTML, y: y, next: rawNextUrl || ''
      }));
    } catch (e) { /* 入りきらなければ諦める。動きは変わらない */ }
  }

  function rawKeepRestore() {
    if (window.__msqKeepDone) return;
    let s = null;
    try { s = JSON.parse(ssGet(RAW_KEEP) || 'null'); } catch (e) { }
    if (!s) { window.__msqKeepDone = true; return; }
    if (s.key !== rawBaseKey()) { ssDel(RAW_KEEP); window.__msqKeepDone = true; return; }

    if (s.html) {
      const box = rawAddBox();
      if (!box) return;                     // 並びがまだ出ていない。次の回に試す
      box.innerHTML = s.html + box.innerHTML;
      rawDropAds(box);   /* ★すでに保存された広告もここで捨てる（2026-08-11） */
      /* ★2026-08-27 保存した後に✕で消した物が、ここで丸ごと戻っていた（実機で確認）。
         保存(msq_raw_keep)は消す前のHTMLなので、入れ直す時に必ず照らし合わせる。 */
      rawDropHidden(box);
      if (s.next) { rawNextUrl = s.next; rawNextTaken = true; }
      rawAdded++;
      rawAddStyle();
      rawMoreSay('戻し ' + box.children.length + '件');
    }
    window.__msqKeepDone = true;

    /* 位置を戻す。描き終わるまで少し待つので何回か試す。
       ★一覧から離れたら必ず止める。商品ページに移った後も動き続けると、
         そちらを勝手にスクロールして画像がずれる（2026-08-09 実機）。
       ★届いたら止める。何度も動かすと操作の邪魔になる。 */
    if (!s.y) return;
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (!rawOnSearch()) { clearInterval(t); return; }
      const now = window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
      if (Math.abs(now - s.y) < 40) { clearInterval(t); return; }
      try { window.scrollTo(0, s.y); } catch (e) { }
      if (n >= 12) clearInterval(t);
    }, 400);
  }

  function rawKeepWatch() {
    if (window.__msqKeepWatch) return;
    window.__msqKeepWatch = true;
    /* 商品を押した瞬間にしまう。ここを逃すと、メルカリが画面を作り直した後になり
       もう中身が残っていない。 */
    document.addEventListener('click', (ev) => {
      try {
        const a = ev.target && ev.target.closest
          && ev.target.closest('a[href*="/item/"],a[href*="/shops/product/"]');
        if (a && !rawMine(a)) rawKeepSave();
      } catch (e) { }
    }, true);
    window.addEventListener('pagehide', () => { try { rawKeepSave(); } catch (e) { } });
  }

  /* 下まで来た時の入口。裏読みを先に試し、駄目なら移動方式へ。 */
  function rawChainStep() {
    if (rawChainBusy) return;
    /* ★2026-08-12 ②裏読みは使わない（RAW_USE_FRAME=false）。詳しい理由はその宣言の所。 */
    if (!RAW_USE_FRAME || ssGet(RAW_FRAME_BAD)) { rawNavStep(); return; }
    const link = rawFindNextLink();
    /* ★2026-08-27 こちらも【画面の次へ】だけを見る（上の rawNavStep と同じ理由）。
       いまは RAW_USE_FRAME=false でここを通らないが、
       設定を戻した時に片方だけ古い動きになるのを防ぐため、同時に直しておく。 */
    const url = (link && link.href) || '';
    if (!url) { rawNavStep(); return; }          // 次へが無い＝ブランドの続きへ
    if (rawSeenPages.has(url)) return;
    rawChainBusy = true;
    rawSeenPages.add(url);
    rawMoreSay('読込中…');
    rawFrameLoad(url, (items, next) => {
      rawChainBusy = false;
      if (!items.length) {
        rawFrameFail++;
        try { rawSeenPages.delete(url); } catch (e) { }
        if (rawFrameFail >= 2) {
          ssSet(RAW_FRAME_BAD, '1');
          rawMoreSay('裏読み不可→移動方式へ');
        } else {
          rawMoreSay('次を読めず（再挑戦）');
        }
        return;
      }
      const box = rawAddBox();
      if (!box) { rawMoreSay('並びが見つからず'); return; }
      /* ★2026-08-11 広告は最初から足さない。ここで入れると持ち越しにも保存され、
         読み直すたびに復活して積み上がる（実機で84件まで増えた）。 */
      items = items.filter((el) => {
        if (!el.querySelector) return true;
        const a = el.matches && el.matches('a[href]') ? el : el.querySelector('a[href*="/item/"],a[href*="/shops/product/"]');
        return !(a && rawIsAd(a));
      });
      if (!items.length) {
        /* ★次のURLは必ず覚えてから戻る。覚えずに戻ると、そのページで送りが止まる。 */
        rawNextUrl = next || '';
        rawMoreSay('次は広告だけ');
        return;
      }
      items.forEach((el) => box.appendChild(el));
      rawDropHidden(box);   /* ★2026-08-27 次ページの中に、既に✕で消した物が混ざることがある */
      rawNextUrl = next || '';
      rawAdded++;
      rawMoreSay('+' + items.length + '件');
      rawAddStyle();
      rawDecorate();
      rawHideAds();
      rawHideNext();
    });
  }
  /* 下まで来たか。★body だけを見ると作りによっては高さが取れない。
     documentElement と両方見て大きい方を使う。 */
  /* ★2026-08-26 ユーザー指摘『次へが出る前に結果の画像がまだあるのに、
       いきなり読み込みが始まり最初に戻る。これはとても困る』。
     ★実測の見当: 実機の画面は約800px、タイル1枚が約400px。
       1200px 残しで発火していたので、【まだ2〜3枚見えている所】で
       次のページへ移動していた。見ている最中に画面が作り直される。
     ★直し: 本当に下まで来てから動かす。数字はここ1か所だけ。
       早めに読ませたくなったら、この数字だけを大きくすること。 */
  const RAW_SHITA_NOKORI = 300;   /* 下端まであと何pxで次を読むか */
  function rawNearBottom() {
    const h = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0);
    const y = window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
    return (h - (y + window.innerHeight)) < RAW_SHITA_NOKORI;
  }

  /* ★2026-08-27 ここにあった「遠い画像を外す」仕組みは取り下げた。
       実機で1枚の画像が20枚のタイルに使い回された（中を開くと別の商品）。
       印(data-msq-src)が型に焼き込まれ、組み直したタイル全部に複製されたため。
       さらに rawTileData が src からデータを作るので、外した後だと
       ダミーがデータに焼き込まれ、元の画像URLが永久に失われる危険があった。
     ★控えとやり直し方: リサーチ統合ツール\戻す用_2026-08-27_画像はずし入り\説明.txt
       もう一度やるなら【src には触らず】、遠いタイルをDOMごと外して
       msq_raw_data から組み直す形にすること（rawBuildTile が既にある）。 */
  /* ===== 並び替えを その場で行う（2026-08-27）=====================
     ★メルカリに投げ直すと母数が減る（ユーザー報告・おそらくメルカリ側の問題）ので、
       いま画面にあるタイルを並べ替えるだけにする。通信はしない。
     ★いいね！順だけは、いいねの《件数》が一覧に無いので、その場では並べ替えられない。
       その時は横取りせず、今までどおりメルカリに任せる（ユーザー了承済み）。
     ★メルカリの並びの【位置と見た目】は一切変えない。中の順番だけ入れ替える。 */
  /* 「¥7,330」から数字を取る。¥ は半角と全角の両方。 */
  const RAW_NE_RE = new RegExp('[' + String.fromCharCode(165) + String.fromCharCode(65509) + ']([0-9,]+)');
  const RAW_NARABI_MOTO = 'data-msq-moto';   /* 読み込んだ元の順（おすすめ順に戻す用） */
  /* タイルを1枚とみなす箱を、リンクから遡って探す。
     ★rawDropHidden と同じ考え方。別の探し方を作らない。 */
  function rawNarabiCell(a, oya) {
    let t = a;
    for (let i = 0; i < 10 && t && t.parentElement && t.parentElement !== oya; i++) t = t.parentElement;
    return (t && t.parentElement === oya) ? t : null;
  }
  /* 値段が読めない時の最後の手段。タイルに出ている「¥7,330」から拾う。
     ★2026-08-27 実機で1枚だけ、まだ値段が描かれていないタイルが最下段に飛んだ。 */
  function rawNarabiNe(a) {
    try {
      const m = String(a.textContent || '').match(RAW_NE_RE);
      return m ? (Number(m[1].split(',').join('')) || 0) : 0;
    } catch (e) { return 0; }
  }
  function rawNarabiKae(shurui) {
    try {
      const g = rawFindGrid();
      if (!g) { try { rawMoreSay('並びが見つからず並べ替えできません'); } catch (e) { } return; }
      /* 集める順＝画面に出ている順（溜め込み → 継ぎ足し → メルカリの一覧）。
         おすすめ順に戻す番号は、この通し番号で覚える。 */
      const oyaTachi = [];
      const c1 = document.getElementById('msq-raw-carry');
      if (c1) oyaTachi.push(c1);
      const c2 = document.getElementById('msq-raw-add');
      if (c2) oyaTachi.push(c2);
      oyaTachi.push(g);
      const cells = [];
      oyaTachi.forEach(function (oya) {
        oya.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach(function (a) {
          const cell = rawNarabiCell(a, oya);
          if (!cell || cells.indexOf(cell) >= 0) return;
          /* 元の順を1回だけ覚える（おすすめ順に戻すため）。
             ★箱ごとの番号にすると番号が重なって元の順に戻せない。全体で通しにする。 */
          if (!cell.getAttribute(RAW_NARABI_MOTO)) {
            cell.setAttribute(RAW_NARABI_MOTO, String(cells.length + 1));
          }
          const it = rawItemData(a) || {};
          cells.push(cell);
          cell.__msqP = rawNum(it.price) || rawNarabiNe(a);
          cell.__msqC = Number(it.created) || 0;
        });
      });
      if (cells.length < 2) return;
      const naraberu = cells.slice();
      if (shurui === 'atarashii') naraberu.sort(function (x, y) { return y.__msqC - x.__msqC; });
      else if (shurui === 'takai') naraberu.sort(function (x, y) { return y.__msqP - x.__msqP; });
      else if (shurui === 'yasui') naraberu.sort(function (x, y) { return x.__msqP - y.__msqP; });
      else naraberu.sort(function (x, y) {
        return Number(x.getAttribute(RAW_NARABI_MOTO) || 0) - Number(y.getAttribute(RAW_NARABI_MOTO) || 0);
      });
      /* ★全部メルカリの箱へ入れて【一続き】にする。箱が分かれたままだと
         「24枚の塊＋20枚の塊」になり、44枚が値段順にならない。
         ★実機で確かめた: こちらのタイルを移して8秒後も全部残り、二重は0。 */
      naraberu.forEach(function (cell) { g.appendChild(cell); });
      try { rawMoreSay('並べ替えました（' + naraberu.length + '件・読み込み直していません）'); } catch (e) { }
      try { console.log('[MSQ/並べ替え] ' + shurui + ' で ' + naraberu.length + '件'); } catch (e) { }
    } catch (e) { try { console.warn('[MSQ/並べ替え] 例外: ' + e.message); } catch (e2) { } }
  }
  /* メルカリの並び替え select を横取りする。
     ★select そのものは動かさない・消さない。change を先に受け取るだけ。 */
  function rawWatchNarabi() {
    if (window.__msqNarabiWatch) return;
    window.__msqNarabiWatch = true;
    document.addEventListener('change', function (ev) {
      try {
        const sel = ev.target;
        if (!sel || sel.tagName !== 'SELECT') return;
        const moji = Array.from(sel.options).map(function (o) { return o.textContent; }).join('');
        if (moji.indexOf('おすすめ順') < 0) return;      /* 並び替えの select だけを見る */
        const erabi = (sel.options[sel.selectedIndex] || {}).textContent || '';
        /* いいね！順は、いいねの件数が一覧に無いので その場では並べ替えられない。
           横取りせずメルカリに任せる（ユーザー了承済み）。 */
        if (erabi.indexOf('いいね') >= 0) return;
        let shurui = 'osusume';
        if (erabi.indexOf('新しい') >= 0) shurui = 'atarashii';
        else if (erabi.indexOf('高い') >= 0) shurui = 'takai';
        else if (erabi.indexOf('安い') >= 0) shurui = 'yasui';
        /* メルカリに投げ直させない（投げると母数が減る） */
        ev.preventDefault();
        ev.stopPropagation();
        rawNarabiKae(shurui);
      } catch (e) { }
    }, true);   /* ★true＝メルカリより先に受け取る */
  }

  function rawWatchBottom() {
    if (window.__msqRawBottom) return;
    window.__msqRawBottom = true;
    const check = () => { if (rawOnSearch() && rawNearBottom()) rawChainStep(); };
    window.addEventListener('scroll', check, { passive: true });
    /* ★スクロールの通知が来ない作りでも取り残されないよう、定期的にも見る。
       帯の出し入れで同じことが起きた（2026-08-08）。 */
    setInterval(check, 1000);
  }

  function rawUpdateCount() {
    const el = document.getElementById('msq-raw-count');
    if (el) el.textContent = '消した ' + rawHidden.size + '件';
    /* ★2026-08-18 実機『✕を押しても該当の利益計算が追従しない』。
       ★原因: ✕もスワイプも、隠して件数を書き替えるだけで、相場と利益を出している
         rawSoubaFix を呼び直していなかった。消す・戻すの道は3つとも必ずここを通るので、
         ここ1か所で足りる。 */
    try { rawSoubaFix(); } catch (e) { }
  }

  /* ===== 読み込んだ総件数を帯に出す（2026-08-12 ユーザー依頼） =====
     ★数えるのは「今このページに載っている本物の商品」。広告は数えない。
       メルカリの並びの分と、こちらが足した箱・持ち越し箱の分を合わせて数える。
     ★同じ商品が2か所に出ることがあるので、商品IDで重ならないようにする。
     ★消した物は載っていないので自然に数から外れる。 */
  /* ===== 読み込んだ総件数を帯に出す（2026-08-12 ユーザー依頼） =====
     ★1回のDOM走査で「表示」と「読込」を同時に数える。
       広告を除き、商品IDで重複を防ぐ。消した物は載っていないので自然に数から外れる。 */
  function rawUpdateTotal() {
    const el = document.getElementById('msq-raw-total');
    if (!el) return;
    const loaded = new Set();
    const visible = new Set();
    document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach((a) => {
      if (rawIsAd(a)) return;
      const h = a.getAttribute('href') || '';
      const m = h.match(/\/(?:item|shops\/product)\/([^/?#]+)/);
      if (!m) return;
      loaded.add(m[1]);
      let r = null;
      try { r = a.getBoundingClientRect(); } catch (e) { return; }
      if (r && r.width > 0 && r.height > 0) visible.add(m[1]);
    });
    /* 表示と読込が食い違えば、何かが隠れていると分かるようにする。 */
    /* 初回API応答の総件数を、DOM上の読込件数と分けて最初から表示する。 */
    const api = window.__msqApiKekka || {};
    const candidates = [
      api.meta && api.meta.numFound,
      api.meta && api.meta.totalCount,
      api.meta && api.meta.total,
      api.numFound,
      api.totalCount,
      api.total
    ];
    const totalRaw = candidates.find(v => v !== null && v !== undefined && v !== '');
    const total = Number(totalRaw);
    let s = '表示 ' + visible.size + '件 / 読込 ' + loaded.size + '件';
    if (Number.isFinite(total) && total >= 0) {
      s += ' / 検索結果 ' + total.toLocaleString() + '件';
    }
    /* 半年より古い分を外した時は必ず出す（ユーザー指示 2026-08-12）。 */
    const furui = rawNum(ssGet(RAW_FURUI)) || 0;
    if (furui > 0) s += '（古い' + furui + '件を外した）';
    el.textContent = s;
  }

  /* 件数は読み込みが進むたびに変わるので、1秒ごとに出し直す。
     ★下端の見張り(rawWatchBottom)とは別の入れ物にする。あちらはSTABLEなので触らない。 */
  function rawWatchTotal() {
    if (window.__msqRawTotal) return;
    window.__msqRawTotal = true;
    rawUpdateTotal();
    setInterval(rawUpdateTotal, 1000);
  }

  /* ★2026-08-11 ここに自前の検索（🔍）を作りかけたが取りやめた。
     帯がメルカリのヘッダ1段目を覆っていたのが原因で、ずらしたら本物の虫眼鏡が
     押せるようになったため（実機で確認）。写すと履歴も候補も二重管理になる。 */

  /* ===== 仕入元サイト（2026-08-11） =====
     ユーザー指示「③一覧から逆引きで仕入元を検索していくらで売っているか見たい」
     「④仕入サイト一覧を設けてアプリ内で仕入リサーチを完結させたい」。
     ★検索URLは推測せず、PCのChromeで実際に開いて確認した。
       セカスト  … 商品リンク60件を確認
       ヤフオク  … 商品リンク124件を確認
       ショップス… 題が「◯◯の検索結果」に変わるのを確認
       カインドオル… 題に検索語が入るのを確認
       ブランディア… スマホは別ホスト。auction.brandear.jp → sa.brandear.jp に転送され、
                     検索フォームは action=/search/list/ 入力名 SearchFullText。
                     題が「◯◯の中古通販 | ブランディア」に変わるのを確認 */
  RAW_SHIIRE = [
    ['セカスト', 'https://www.2ndstreet.jp/search?keyword=', 'https://www.2ndstreet.jp/'],
    /* ★2026-08-11 ユーザー指示でショップスを外し、トレファクとエコリングを入れた。
       トレファク … 会社サイト(www.treasure-f.com)ではなく通販は ec.treasure-f.com。
                    検索フォームが action=/search 入力名 word。実機で「サンダル」18件を確認。
       エコリング … 公開の商品検索が無い。auction.eco-ring.com は BtoB専門で商品0件、
                    www.ecoauc.com はサインイン画面。よって【入口だけ】にする。
                    検索URLが分かれば2番目に入れれば動く。 */
    ['トレファクONLINE', 'https://ec.treasure-f.com/search?word=', 'https://ec.treasure-f.com/'],
    /* ★2026-08-14 追加。トレファクファッション（古着・ブランド服の方）。
       検索は search_result.html?srchword= 。実測: 「腕時計」で 4,497件、
       末尾に &step=1 を付けると【在庫あり】に絞られて 2,211件。仕入用なので付ける。
       末尾に足す物は4番目の要素で渡す（他の行は3要素のままで動く）。 */
    ['トレファクファッション', 'https://www.trefac.jp/store/search_result.html?srchword=',
      'https://www.trefac.jp/', '&step=1'],
    /* ★2026-08-11 エコオクは【URLで検索を再現できない】（実機・ログイン済みで確認）。
       ・/client/presses?keyword= は「お知らせ」の検索。商品ではない
       ・イマカウ/下見には q の入力欄があるが、URLに ?q= を付けても効かない。
         あり得ない語(ZZZQQQXX)でも同じ50件が出る＝実際の検索はPOSTで送っている
       よって検索は諦め、【すぐ買える商品の一覧(イマカウ)】に着地させる。
       そこから手で検索してもらう形。相場表は /client/market-prices。 */
    /* ★2026-08-11 実機（ログイン済み）で確認して格上げした。
       ・素の ?q= だけでは既定に戻され、欄が空のままだった（最初はこれで「不可」と誤判定した）
       ・欄に入れて送った時のURLを読むと limit/sortKey/tableType/page が必要と分かった
       ・その形なら q が欄に入る（ロレックスで確認）。イマカウ・下見どちらも同じ
       ★商品が出るかは時間帯次第（確認時はイマカウに1件も出ていなかった）。 */
    ['ブランディア', 'https://sa.brandear.jp/search/list/?SearchFullText=', 'https://sa.brandear.jp/'],
    /* ★2026-08-11 実機で指摘され、実機で直した。
       www.kind.co.jp は【会社サイト】で、/?s= はページのサイト内検索（商品0件）。
       /products/ は404。本物の通販は shop.kind.co.jp（Shopify）で、
       検索は /search?q=。実機で「サンダル」1796件・「YELLO サンダル」4件を確認。 */
    ['カインドオル', 'https://shop.kind.co.jp/search?q=', 'https://shop.kind.co.jp/'],
    ['ヤフオク', 'https://auctions.yahoo.co.jp/search/search?p=', 'https://auctions.yahoo.co.jp/'],
  ];

  /* 検索に使う言葉を作る。こちらが付けた札や値段は落とす。 */
  function rawShiireGo(moji) {
    return String(moji || '')
      .replace(/【[^】]*】/g, ' ')
      .replace(/[\d,]+円/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  }

  /* ★2026-08-11 ユーザー質問「タイトルそのままと短くと、どっちが見つかる率が高いか」。
     仕入元サイトは在庫が限られる実店舗系なので、メルカリの長いタイトル
     （種類・色・サイズ・状態・【売切】まで入る）で引くとほぼ0件になる。
     ブランド＋型番、無ければ先頭3語が一番当たる。既定は短い方。全部にも切り替えられる。 */
  function rawShiireMijikai(zen) {
    const w = String(zen || '').split(/[\s/・,，、]+/).filter(Boolean);
    if (!w.length) return '';
    /* 型番らしき語＝英字と数字が混ざって3文字以上 */
    let kata = '';
    for (let i = 0; i < w.length; i++) {
      if (/[A-Za-z]/.test(w[i]) && /\d/.test(w[i]) && w[i].length >= 3) { kata = w[i]; break; }
    }
    if (kata && w[0] !== kata) return (w[0] + ' ' + kata).trim();
    return w.slice(0, 3).join(' ');
  }

  let rawShiireZenbu = false;   // 「全部」で引くか（既定は短く）

  /* 仕入元の一覧を出す。言葉があれば検索、無ければ入口（④）。 */
  /* ===== 逆引きを自動でやる（2026-08-30 ユーザー指示）=======================
     1商品について7サイトを順に検索し、同じ商品を見つけて利益が出るか判定する。
     ★検索語は既存の rawShiireGo、サイト表は既存の RAW_SHIIRE、
       利益は既存の手数料をそのまま使う（新しい作り方をしない＝精度を落とさない）。
     ★商品ページは1枚も開かない。開くのは各サイトの検索結果の一覧だけ。
     ★間隔6〜15秒。いつでも中止できる。 */
  /* ★鍵の宣言はこの上ではなく、ずっと手前（var SP の直前）に移した。
     仕入元サイトでは枠組みの return より下が動かないため（実機で確認）。 */
  function rawGyakuYomu() {
    try { return JSON.parse((window.MsqApp && MsqApp.msqLoad(RAW_GYAKU_KEY)) || "null"); }
    catch (e) { return null; }
  }
  function rawGyakuKaku(o) {
    try { if (window.MsqApp) MsqApp.msqSave(RAW_GYAKU_KEY, o ? JSON.stringify(o) : ""); } catch (e) { }
  }
  /* 題を語に割る。比べるために記号と状態語を落とす */
  function rawGyakuGo(t) {
    return String(t || "")
      .replace(/[【】\[\]（）()\/／・,、。!！?？]/g, " ")
      .replace(/(美品|新品|未使用|中古|送料無料|即決|訳あり|希少|レア)/g, " ")
      .toUpperCase().split(/\s+/).filter(function (x) { return x.length >= 2; });
  }
  /* 同じ商品らしさ。ブランドの語が入っているかと、題の語の重なりで見る */
  function rawGyakuNiteru(motoGo, souGo) {
    if (!motoGo.length || !souGo.length) return 0;
    var atari = 0;
    motoGo.forEach(function (w) { if (souGo.indexOf(w) >= 0) atari++; });
    return atari / motoGo.length;
  }
  /* 値段を読む。★2026-08-30 実機で捕まえた: ヤフオクは「現在 28,600円」で ¥ が付かない。
     ¥付きしか見ていなかったため、こちらが出した「売値 ¥45,180」の札を読んでいた。 */
  function rawGyakuNedan(tx) {
    /* ★送料を先に消す。ヤフオクの枠には「＋送料900円」が入っており、
       消さないとそれを商品の値段として読んでしまう（実機で確認）。 */
    var t = String(tx || "").replace(/[+＋]?\s*送料\s*[0-9,]*\s*円?/g, " ");
    /* ★「即決／現在／価格／税込」に続く数字を優先する */
    var m = t.match(/(?:即決|現在|価格|税込)[^0-9]{0,6}([0-9][0-9,]{2,})\s*円/);
    if (!m) m = t.match(/[\u00A5\uFFE5]\s*([0-9][0-9,]*)/);
    if (!m) m = t.match(/([0-9][0-9,]{2,})\s*円/);
    return m ? (Number(m[1].split(",").join("")) || 0) : 0;
  }
  /* いま開いている仕入元の一覧から候補を拾う。
     ★どのサイトでも同じやり方: 商品らしいリンクから枠を遡り、値段の文字を読む。 */
  function rawGyakuHiroi(moto) {
    var out = [];
    try {
      /* 上位3件の無条件通過はLens結果画面だけで行う。
         仕入れサイトの一覧は、全件をブランド・カテゴリ・型番で照合する。 */
      /* ★2026-08-30 似ている度は【実際に検索した語】と比べる。
         元の題（例「ジャケットのみ 【売切】」）と比べていたため、
         仕入元の題に FABIANA FILIPPI もジャケットも入っているのに一致0になっていた。
         検索語が無い時だけ、今までどおり題を使う。 */
      var motoGo = rawGyakuGo(String(moto.kw || "") + " " + String(moto.kata || ""));
      if (!motoGo.length) motoGo = rawGyakuGo(moto.dai);
      var qNorm = rawGyakuNorm(moto.kw || '');
      var modelNorm = rawGyakuNorm(moto.kata || '');
      var modelQuery = !!(modelNorm && qNorm.indexOf(modelNorm) >= 0);
      /* 検索語ごとのブランドを使う。PC版の list[z].b に相当する値で、
         固有名詞だけの語は空のままにしてブランドを強制しない。旧状態には
         kwBrand が無いので、従来の商品ブランドへフォールバックする。 */
      var brandForMatch = String(moto.kwBrand != null
        ? moto.kwBrand : (moto.bura || (moto.lens && moto.lens.brand) || '')).trim();
      /* PC拡張機能と同じく、サイトごとの商品リンクだけを対象にする。
         汎用の /detail はヘッダーや検索UIまで拾い、カード枠を判定できず
         仕入元を丸ごと落とす原因になっていた。 */
      var hostName = String(location.hostname || '').toLowerCase();
      var sel = '';
      if (hostName.indexOf('2ndstreet.jp') >= 0) {
        sel = 'a[href*="/goods/detail/goodsId/"]';
      } else if (hostName.indexOf('treasure-f.com') >= 0) {
        sel = 'a[href*="/item/"]';
      } else if (hostName.indexOf('trefac.jp') >= 0) {
        sel = 'a[href*="/store/"]';
      } else if (hostName.indexOf('brandear.jp') >= 0) {
        /* ブランディアの「最近チェックした商品」にも同じ商品リンクが
           並ぶ。そこを拾うと、前回検索の商品が今回の結果へ混入する。
           実検索カードだけが持つ result_item_inner に限定する。 */
        sel = 'a.result_item_inner[href*="/search/detail/AuctionID/"]';
      } else if (hostName.indexOf('kind.co.jp') >= 0) {
        sel = 'a[href*="/products/"]';
      } else if (hostName.indexOf('auctions.yahoo.co.jp') >= 0) {
        sel = 'a[href*="/auction/"]';
      } else {
        sel = 'a[href*="/item/"],a[href*="/products/"],a[href*="/auction/"],a[href*="/detail"]';
      }
      var mita = {};
      var lensRank = 0;
      document.querySelectorAll(sel).forEach(function (a) {
        var h = a.getAttribute("href") || "";
        if (!h || h.indexOf("javascript") === 0) return;
        if (hostName.indexOf('trefac.jp') >= 0 && !/\/store\/\d{10,}\//.test(String(h))) return;
        var url = "";
        try { url = new URL(h, location.href).href; } catch (e) { return; }
        if (mita[url]) return; mita[url] = 1;
        var t = a;
        /* ★2026-08-30 枠を探して登る。見るのは2つ。
           ・値段があるか（¥付きと「◯円」の両方。ヤフオクは ¥ を使わない）
           ・商品の枠らしい大きさか（商品の枠は短い。ヤフオクで実測66〜100文字）
           大きさを見ないと、ヘッダーのリンクから登った時にページ全体を掴んでしまい、
           題が「ログイン・新規会員登録…」、画像がサイトのロゴになる（実機で確認）。 */
        var nedanAri = /([\u00A5\uFFE5][0-9,]{3,}|[0-9][0-9,]{2,}\s*円)/;
        var mitsuketa = false;
        for (var i = 0; i < 4 && t.parentElement; i++) {
          var tx0 = (t.textContent || "").replace(/\s+/g, " ").trim();
          /* 拡張機能と同じく親4段までを見る。カードによっては商品名・状態・
             送料が入り220文字を超えるため、固定上限で捨てない。ページ全体を
             掴まないよう900文字だけを上限にする。 */
          if (tx0.length > 10 && tx0.length <= 900 && nedanAri.test(tx0)) { mitsuketa = true; break; }
          t = t.parentElement;
        }
        if (!mitsuketa) { moto.__waku = (moto.__waku || 0) + 1; return; }   /* 枠が分からない物は捨てる */
        var cardLensRank = lensRank++;
        /* ★こちらが出した札を外してから読む。
           札の文字「売値 ¥45,180（益 ¥10,000）」自体が値段の形をしているため、
           外さないとそれを商品の値段として読んでしまう（実機で確認）。
           外す並びは3732行の既存の物と同じ。 */
        var tx = "";
        try {
          var c2 = t.cloneNode(true);
          /* ★data-msq-uri は【サイト本来の値段の要素に付けている印】。
             外すと本物の値段まで消える（実機で測って確認: 28,600円が消えた）。
             外すのはこちらが出した札だけ。 */
          c2.querySelectorAll(".msq-uri,.msq-kata,.msq-sonomama-t,.msq-copy-t,.msq-rec-fuda,button,script,noscript,iframe,style")
            .forEach(function (e) { e.remove(); });
          tx = (c2.textContent || "").replace(/\s+/g, " ").trim();
        } catch (e) { tx = (t.textContent || "").replace(/\s+/g, " ").trim(); }
        /* トレファクファッションはリンク本文に商品名がなく、画像altが商品名。 */
        if (hostName.indexOf('trefac.jp') >= 0) {
          try {
            var tfImg = a.querySelector('img');
            var tfAlt = String(tfImg ? (tfImg.getAttribute('alt') || '') : '').trim();
            if (tfAlt) tx = tfAlt.replace(/\s+/g, ' ') + ' ' + tx;
          } catch (e) { }
        }
        var ne = rawGyakuNedan(tx);
        if (!ne) return;
        var lensJoui3 = false;
        /* PC版と同じく、両側で読めた時だけカテゴリ・素材の不一致を落とす。
           読めない側を不一致扱いにしないので、同じ商品を消す方向には働かない。
           ただしLens上位3件はユーザー指定どおり無条件で残す。 */
        if (!lensJoui3) {
          var motoCat = String((moto.lens && moto.lens.cat) || moto.cat || '').trim();
          var sourceCat = rawGyakuCatHiroi(tx);
          if (motoCat && sourceCat && rawGyakuCatChigau(motoCat, sourceCat)) return;
          var motoSozai = rawGyakuSozaiHiroi(
            String((moto.lens && moto.lens.sozai) || '') + ' ' + String(moto.dai || ''));
          var sourceSozai = rawGyakuSozaiHiroi(tx);
          if (motoSozai.length && sourceSozai.length
            && !motoSozai.some(function (x) { return sourceSozai.indexOf(x) >= 0; })) return;
        }
        /* 拡張機能のfilterBrandに相当。型番検索以外では、ブランドを含まない
           別ブランドのカードを語の重複だけで残さない。 */
        if (!lensJoui3 && !modelQuery && brandForMatch
          && !rawGyakuBrandFamilyMatch(tx, brandForMatch,
            moto.lens && Array.isArray(moto.lens.brands) ? moto.lens.brands : [])) return;
        /* 型番検索では、検索結果カードにも同じ型番があるものだけを同型番候補にする。 */
       if (!lensJoui3 && modelQuery && modelNorm && rawGyakuNorm(tx).indexOf(modelNorm) < 0) return;
       /* PC版gyakuKoyuuAru相当。固有名詞を含む語で探した場合は、
          下位候補にもその固有名詞が実際に商品名へ残っていることを要求する。
          ただしユーザー指定のLens上位3件は無条件で残す。カテゴリ・素材・
          ブランドそのものは固有名詞扱いしない。 */
       if (!lensJoui3 && !modelQuery) {
         var properTerms = [];
         [].concat((moto.lens && moto.lens.properNouns) || [], (moto.lens && moto.lens.properCandidates) || [])
           .forEach(function (x) {
             var p0 = String(x || '').trim(), pn = rawGyakuNorm(p0);
             if (!pn || pn.length < 3 || properTerms.some(function (v) { return v.n === pn; })) return;
             if (rawGyakuCatKumi(p0) >= 0 || rawGyakuSozaiHiroi(p0).length) return;
             if (brandForMatch && rawGyakuBrandMatch(p0, brandForMatch)) return;
             properTerms.push({ n: pn });
           });
         var hasProperQuery = properTerms.some(function (v) { return rawGyakuNorm(moto.kw || '').indexOf(v.n) >= 0; });
         if (hasProperQuery && !properTerms.some(function (v) { return rawGyakuNorm(tx).indexOf(v.n) >= 0; })) return;
       }
       /* PC版terashiawase相当。タイトル由来の固有語を含む検索語でも、
          仕入元カードにその固有語が無い別商品は通さない。 */
       if (!lensJoui3 && !modelQuery && !rawGyakuQueryKoyuuAru(moto, tx, brandForMatch)) return;
       var niteru = rawGyakuNiteru(motoGo, rawGyakuGo(tx));
        /* ★2026-08-30 画像も取る（ユーザー依頼）。読み込み待ちの物は data-src に入る */
        var gz = "";
        try {
          var im2 = t.querySelector("img");
          if (im2) gz = im2.currentSrc || im2.src || im2.getAttribute("data-src")
            || im2.getAttribute("data-original") || im2.getAttribute("data-lazy") || "";
          /* ★結果画面の土台URLは lens.google.com なので、相対のままだと必ず読めない */
          if (gz) gz = new URL(gz, location.href).href;
        } catch (e) { }
        /* ★同じ題＋同じ値段の重複を消す（同じ行が何個も並んでいた） */
        var kagi2 = tx.slice(0, 40) + "/" + ne;
        if (mita["k:" + kagi2]) return;
        mita["k:" + kagi2] = 1;
        out.push({ url: url, dai: tx.slice(0, 90), ne: ne, gz: gz,
          niteru: Math.round(niteru * 100), lensRank: cardLensRank, lensJoui3: lensJoui3 });
      });
    } catch (e) { }
    return out;
  }
  /* 帯を出す。押せば中止 */
  function rawGyakuObi(moji, owari) {
    var e = document.getElementById("msq-gyaku-obi");
    if (!e) {
      e = document.createElement("div");
      e.id = "msq-gyaku-obi";
      e.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483646;"
        + "background:#4c1d95;color:#ede9fe;font:700 13px/1.6 system-ui;padding:8px 12px;"
        + "display:flex;gap:10px;align-items:center;";
      var t = document.createElement("span"); t.id = "msq-gyaku-moji"; t.style.cssText = "flex:1;min-width:0;white-space:pre-wrap;";
      var b = document.createElement("button");
      b.textContent = "中止";
      b.style.cssText = "padding:5px 12px;border:none;border-radius:6px;background:#b91c1c;color:#fff;font:700 12px system-ui;";
      b.addEventListener("click", function () { rawGyakuKaku(null); e.remove(); });
      e.appendChild(t); e.appendChild(b);
      document.documentElement.appendChild(e);
    }
    var t2 = document.getElementById("msq-gyaku-moji");
    if (t2) t2.textContent = moji;
    if (owari) { var b2 = e.querySelector("button"); if (b2) b2.textContent = "閉じる"; }
  }
  /* 結果を作って結果画面に出す */
  function rawGyakuKekka(j) {
    var uri = Number(j.uri) || 0;
    var esc = function (x) {
      return String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };
    /* ★手数料は LFEE を使う。RAW_FEE は仕入元側から呼ぶと初期化前で落ちる（中身は同じ） */
    var F = LFEE;
    var mi = [];
    (j.res || []).forEach(function (r) {
      var eki = Math.round(uri - r.ne - F.purchase - F.shipping - (uri * F.sellRate) - F.outsource);
      var bai = r.ne > 0 ? Math.round((uri / r.ne) * 10) / 10 : 0;
      /* ★2026-08-30 目標利益は【仕入値で段が変わる】。
         今までは3,000円固定で、仕入10,200円（目標は益5,000）でも「買える」と出ていた。 */
      var mokuhyou = rawGoalWant(r.ne);
      var kaeru = (eki >= mokuhyou && (r.lensJoui3 || r.niteru >= 40));
      mi.push(Object.assign({}, r, { eki: eki, bai: bai, mokuhyou: mokuhyou, kaeru: kaeru }));
    });
    /* 買える物を先に。その中では利益の大きい順。残りは似ている順 */
    mi.sort(function (a, b) {
      if (a.kaeru !== b.kaeru) return a.kaeru ? -1 : 1;
      if (a.kaeru) return b.eki - a.eki;
      return (b.niteru - a.niteru) || (b.eki - a.eki);
    });
    var kazu = mi.filter(function (x) { return x.kaeru; }).length;
    var h = [];
    /* ★この印が無いと inject.js がレンズの結果画面と勘違いして勝手に動く */
    h.push('<meta name="msq-gyaku" content="1">');
    h.push('<meta name=viewport content="width=device-width,initial-scale=1">');
    h.push("<style>"
      + "body{background:#0f172a;color:#e5e7eb;font:14px/1.6 system-ui;margin:0;padding:10px}"
      + "a{color:#7dd3fc;text-decoration:none}"
      + ".h{font-weight:700;font-size:17px;margin:0 0 8px}"
      + ".moto{display:flex;gap:10px;background:#1e293b;border-radius:10px;padding:10px;margin-bottom:12px}"
      + ".moto img{width:96px;height:96px;object-fit:cover;border-radius:8px;background:#334155;flex:none}"
      + ".k{display:flex;gap:10px;border-top:1px solid #334155;padding:10px 0}"
      + ".k img{width:88px;height:88px;object-fit:cover;border-radius:8px;background:#334155;flex:none}"
      + ".ok{color:#86efac;font-weight:700}.ng{color:#fca5a5}"
      + ".mise{font-size:12px;opacity:.8}"
      + ".dai{display:block;margin:2px 0 4px;font-weight:700;line-height:1.4}"
      + ".sen{margin:14px 0 6px;padding:6px 10px;background:#14532d;border-radius:8px;font-weight:700}"
      + ".sen2{margin:18px 0 6px;padding:6px 10px;background:#334155;border-radius:8px;font-weight:700}"
      + "</style>");
    h.push('<div class="h">逆引きの結果 … 買える ' + kazu + "件 / 調べた " + mi.length + "件</div>");
    /* ★一番上にメルカリ側の品。並べて見比べられるように（ユーザー依頼） */
    h.push('<div class="moto">'
      + (j.gz ? '<img referrerpolicy="no-referrer" src="' + esc(j.gz) + '">' : "")
      + "<div><div class=mise>メルカリ（売れた値段）</div>"
      + '<span class="dai">' + esc(j.dai) + "</span>"
      + "売値 <b>" + uri.toLocaleString() + "円</b>"
      + (j.bura ? "　ブランド " + esc(j.bura) : "")
      + (j.kata ? "　型番 " + esc(j.kata) : "")
      + "<div class=mise>探した言葉: " + esc(j.kw || "") + "</div>"
      + (j.lens && ((j.lens.properNouns || []).length || (j.lens.highValue || []).length)
        ? "<div class=mise>Lens候補: " + esc([].concat(j.lens.properNouns || [], j.lens.highValue || []).join(" / ")) + "</div>" : "")
      + (j.lens && Array.isArray(j.lens.sent) && j.lens.sent.length
        ? "<details style=\"margin-top:4px;\"><summary>Lens送信画像 "
          + esc(j.lens.sent.map(function (x) { return '第' + x.batch + '便[' + ((x.numbers || []).join(',') || '?') + ']'; }).join(' / '))
          + "</summary><div style=\"display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;\">"
          + j.lens.sent.reduce(function (s, x) { return s + (Array.isArray(x.images) ? x.images : []).map(function (u, i) {
              return '<img referrerpolicy=\"no-referrer\" src=\"' + esc(u) + '\" title=\"画像' + (((x.numbers || [])[i]) || '?') + '\" style=\"width:42px;height:42px;object-fit:cover;border-radius:4px;\">';
            }).join(''); }, '')
          + "</div></details>" : "")
      + "</div></div>");
    if (!mi.length) {
      h.push('<div class="k">7サイトのどこにも見つかりませんでした。'
        + "言葉を変えるか、ブランドがはっきりした商品で試してください。</div>");
    }
    /* ★黙って捨てない。商品の枠が分からなくて捨てた数を出す */
    if (j.waku) {
      h.push('<div class="mise" style="margin:6px 0 10px;">'
        + "※ 商品の枠が読み取れず除いた候補が " + j.waku + "件あります"
        + "（サイトの作りが特殊な所です）。</div>");
    }
    var dashita = false, dashita2 = false;
    mi.forEach(function (r) {
      if (r.kaeru && !dashita) { dashita = true; h.push('<div class="sen">★買える（この値段なら基準を満たす）</div>'); }
      if (!r.kaeru && !dashita2) { dashita2 = true; h.push('<div class="sen2">参考（基準に届かない）</div>'); }
      h.push('<div class="k">'
        + (r.gz ? '<a href="' + esc(r.url) + '" target="_blank"><img referrerpolicy="no-referrer" src="' + esc(r.gz) + '"></a>' : "")
        + "<div><div class=mise>" + esc(r.mise) + "</div>"
        + '<a class="dai" href="' + esc(r.url) + '" target="_blank">' + esc(r.dai) + "</a>"
        + "仕入 <b>" + r.ne.toLocaleString() + "円</b>　→ 利益 <b class=\"" + (r.kaeru ? "ok" : "ng") + "\">"
        + r.eki.toLocaleString() + "円</b>　倍率 " + r.bai + "倍　似ている度 " + r.niteru + "%"
        + "<div class=mise>この仕入値の目標は 益" + r.mokuhyou.toLocaleString() + "円"
        + (r.kaeru ? "" : ("（" + (r.eki < r.mokuhyou ? "利益が足りない" : (r.lensJoui3 ? "" : "似ている度が40%に届かない")) + "）"))
        + "</div></div></div>");
    });
    try { if (window.MsqApp && MsqApp.openKekka) MsqApp.openKekka(h.join("")); } catch (e) { }
  }
  /* 読み込むたびに続きをやる（仕入元の画面で動く） */
  function rawGyakuTick() {
    try {
      var j = rawGyakuYomu();
      if (!j || !j.mise || j.i >= j.mise.length) return;
      var ima = j.mise[j.i];
      var checkedKw = String(j.kw || '').trim();
      var kwBrandAt = function (idx) {
        if (Array.isArray(j.kwBrands) && j.kwBrands[idx] != null) return String(j.kwBrands[idx] || '').trim();
        var bs = j.lens && Array.isArray(j.lens.brands) ? j.lens.brands : [j.bura || ''];
        return rawGyakuKeywordBrand((j.kws || [j.kw])[idx] || '', bs);
      };
      j.kwBrand = kwBrandAt(j.dan || 0);
      var checkedDan = (j.dan || 0) + 1;
      /* いまのページがその店かを見る。違えば何もしない（別の操作中） */
      if (location.href.indexOf(ima.host) < 0) return;
      if (window.__msqGyakuTicked) return; window.__msqGyakuTicked = true;
      /* Shopify/React系（Kindal）やBrandearは、URL遷移後に商品カードを
         非同期生成する。2.5秒で読むとリンクがまだ無く、検索結果を丸ごと
         0件扱いしていた。PC拡張機能と同じカードが出るまで待ってから読む。 */
      var readWait = /kind\.co\.jp|brandear\.jp|trefac\.jp|treasure-f\.com|auctions\.yahoo\.co\.jp/i.test(location.hostname) ? 5000 : 2500;
      setTimeout(function () {
        j.__waku = 0;
        var hit = rawGyakuHiroi(j);
        j.waku = (j.waku || 0) + (j.__waku || 0);
        hit.forEach(function (x) { x.mise = ima.na; });
        /* 似ている度が低すぎる物は入れない（別商品を並べても意味が無い） */
        /* 仕入れサイト側はLens上位3件の例外を使わず、似ている度40%以上だけ残す。 */
        var nokosu = hit.filter(function (x) { return x.niteru >= 40; })
          .sort(function (a, b) { return b.niteru - a.niteru; }).slice(0, 5);
        j.res = (j.res || []).concat(nokosu);
        rawGyakuObi("商品 1/1　" + ima.na + " の検索は正常に完了しました\n"
          + "言葉 " + checkedDan + "/" + (j.kws || []).length + "「" + checkedKw + "」　"
          + "ヒットは " + nokosu.length + "件（候補 " + hit.length + "件）　見つけた合計 " + j.res.length + "件");
        /* PC版と同じく、0件だった店だけ次の語へ進める。
           1商品あたりの検索語は最大8本で打ち止める。 */
        var kws2 = j.kws || [j.kw];
        var mouIchido = (nokosu.length === 0 && (j.dan || 0) + 1 < kws2.length && (j.kaisu || 1) < 8);
        if (mouIchido) {
          j.dan = (j.dan || 0) + 1;
          j.kw = kws2[j.dan];
          j.kwBrand = kwBrandAt(j.dan);
        } else {
          j.i++;
          j.dan = 0;
          j.kw = kws2[0];
          j.kwBrand = kwBrandAt(0);
          /* 再試行上限はサイト単位。前のサイトの回数を持ち越すと、
             後半のKindal/Yahooで固有名詞検索へ進めなくなる。 */
          j.kaisu = 1;
        }
        rawGyakuObi("逆引き … " + j.i + "/" + j.mise.length + "サイト　見つけた " + j.res.length + "件"
          + (mouIchido ? "\n0件だったので「" + j.kw + "」で引き直します" : ""));
        if (j.i >= j.mise.length) {
          rawGyakuKaku(null);
          rawGyakuObi("逆引きが終わりました（" + j.res.length + "件）。結果画面に出しました", true);
          rawGyakuKekka(j);
          return;
        }
        rawGyakuKaku(j);
        var machi = 6000 + Math.floor(Math.random() * 9000);
        setTimeout(function () {
          if (!rawGyakuYomu()) return;   /* 中止された */
          /* 引き直しの時は j.i を進めていないので、同じ店がここに入る */
          var tsugi = j.mise[j.i];
          j.kaisu = (j.kaisu || 1) + 1;
          rawGyakuKaku(j);
          try { if (window.MsqApp) MsqApp.openShiire(tsugi.url + encodeURIComponent(j.kw) + (tsugi.ato || "")); } catch (e) { }
        }, machi);
      }, readWait);
    } catch (e) { }
  }
  /* ===== 高値要素（2026-08-30 拡張機能 list_extractor.js 1811〜1830行から写した）=====
     ★勝手な表は作らない。あちらの中身をそのまま持ってきている。1語も足していない。
     素材とデザイン語は「くっついた語を割る」のに使う。
     色とサイズは割るのに使わない（ブラックやXLで絞ると仕入元では逆に当たらないため）。 */
  HIGH_MATERIALS = [
    "カシミヤ","モヘア","シルク","ウール","リネン","レザー","スエード","アンゴラ","アルパカ",
    "cashmere","mohair","silk","wool","linen","leather","suede"
  ];
  var HIGH_COLORS  = ["ブラック","ネイビー","black","navy"];
  var HIGH_SIZES  = ["XL","XXL","2XL","3XL","44","46","48","50","52"];
  HIGH_WORDS  = ["コラボ","限定","collab","limited","supreme","off-white","offwhite"];
  COMMON_MATERIALS = [
    "コットン","ポリエステル","ナイロン","アクリル","レーヨン","綿","化繊",
    "cotton","polyester","nylon","acrylic","rayon"
  ];
  COMMON_COLORS = [
    "ホワイト","レッド","ピンク","イエロー","オレンジ","パープル","ベージュ",
    "グレー","ブラウン","white","red","pink","yellow","orange","purple",
    "beige","gray","grey","brown","GRY","BLK","WHT","NVY","BEI"
  ];
  /* ===== ここまで高値要素 ===== */
  /* 検索語を段で作る。★語が増えるほど当たらなくなるので、段を進めるほど【短く】する。
       1段目 … 型番（無ければ 短い方＝ブランド＋型番／先頭3語）
       2段目 … 先頭2語（ブランド＋種類）
     長い題（rawShiireGo）は使わない。仕入元は全部の語のAND検索なので、
     色・サイズ・状態まで入った題ではほぼ0件になる（2026-08-11に確認済みの事実）。 */
  /* 拡張機能側の辞書結果をAndroid側でも同じ順序で検索語へ落とす。
     ブランドを固有名詞として混ぜないこと、型番を最優先にすること、
     固有名詞が無い時だけブランド＋カテゴリ＋高値要素へ広げることが重要。 */
  /* PC版のカテゴリ仲間表を移植する。
     仕入元ごとの呼び方の違いを吸収するための表で、異なる仲間を通すための表ではない。 */
  RAW_GYAKU_CAT_NAKAMA = [
    ['ジャケット', 'ブルゾン', 'ジャンパー', 'アウター', 'コート', 'ブレザー', 'ダウンジャケット', 'ダウン', 'MA-1', 'スタジャン', 'モッズコート'],
    ['ニット', 'セーター', 'カーディガン', 'ニットカーディガン'],
    ['パーカー', 'パーカ', 'スウェット', 'スエット', 'トレーナー', 'フーディ', 'フーディー',
      'スウェットフーディー', 'スウェットフーディ', 'スウェットパーカー',
      'hoodie', 'sweat hoodie', 'sweatshirt', 'pullover hoodie'],
    ['Tシャツ', 'カットソー', 'トップス', 'シャツ', 'ブラウス', 'ロンT', '長袖Tシャツ', '半袖Tシャツ', 'ノースリーブ', 'スリーブ', 'タンクトップ', 'キャミソール', 'スウェット', 'トレーナー', 'ジャージ'],
    ['パンツ', 'ズボン', 'スラックス', 'デニム', 'ジーンズ', 'チノパン', 'スキニー', 'ワイドパンツ'],
    ['ワンピース', 'ドレス', 'チュニック'],
    ['スカート', 'ミニスカート', 'ロングスカート'],
    ['バッグ', 'カバン', '鞄', 'トートバッグ', 'ショルダーバッグ', 'ハンドバッグ', 'リュック', 'バックパック'],
    ['スニーカー', 'シューズ', '靴', 'ブーツ', 'パンプス', 'サンダル', 'ローファー', '革靴'],
    ['財布', '長財布', '二つ折り財布', '折り財布', 'ウォレット'],
    ['腕時計', '時計', 'ウォッチ'],
    ['帽子', 'キャップ', 'ハット', 'ニット帽', 'ニットキャップ'],
    ['ベルト', 'サッシュベルト'],
    ['マフラー', 'ストール', 'スカーフ'],
    ['ネックレス', 'ペンダント'],
    ['イヤリング', 'ピアス'],
    ['ショートパンツ', 'ハーフパンツ', 'ショーツ', '短パン', 'ハーパン', 'バミューダパンツ'],
    ['レギンス', 'スパッツ', 'タイツ', 'トレンカ'],
    ['サロペット', 'オーバーオール', 'つなぎ', 'オールインワン', 'ジャンプスーツ', 'コンビネゾン'],
    ['ベスト', 'ジレ', 'ダウンベスト'],
    ['スーツ', 'セットアップ', 'アンサンブル'],
    ['ブレスレット', 'バングル'],
    ['手袋', 'グローブ', 'ミトン'],
    ['靴下', 'ソックス', 'レッグウェア'],
    ['水着', 'ビキニ', 'スイムウェア', 'スイムスーツ'],
    ['パジャマ', 'ルームウェア', '部屋着', 'ナイトウェア'],
    ['名刺入れ', 'カードケース', 'パスケース', '定期入れ'],
    ['ポーチ', '化粧ポーチ', 'コスメポーチ'],
    ['ジャージ', 'トラックジャケット', 'トラックパンツ', 'セットアップ']
  ];
  RAW_GYAKU_SOZAI = [
    ['レザー', '革', '牛革', '山羊革', 'やぎ革', 'leather'],
    ['スエード', 'スウェード', 'ヌバック', 'suede'],
    ['カシミヤ', 'カシミア', 'cashmere'],
    ['シルク', '絹', 'silk'],
    ['ウール', '毛', 'wool'],
    ['モヘア', 'mohair'], ['アンゴラ', 'angora'], ['アルパカ', 'alpaca'],
    ['リネン', '麻', 'linen'],
    ['ダウン', 'down'], ['ファー', 'fur'], ['ムートン', 'mouton', 'shearling'],
    ['デニム', 'denim'], ['ナイロン', 'nylon'],
    ['コットン', '綿', 'cotton'], ['ポリエステル', 'polyester']
  ];
  function rawGyakuNorm(s) {
    return String(s || '').normalize('NFKC').toLowerCase()
      .replace(/[\s　'’`．.\-_/・×x&:：,，、()（）［］【】「」]/g, '');
  }
  function rawGyakuBrandParts(s) {
    return String(s || '').split(/[\s　/・×x&,，、]+/).map(function (x) {
      return String(x || '').trim();
    }).filter(function (x) { return x.length >= 2; });
  }
  function rawGyakuCatHiroi(text) {
    var best = '', s = String(text || '');
    RAW_GYAKU_CAT_NAKAMA.forEach(function (group) {
      group.forEach(function (word) {
        if (word && s.indexOf(word) >= 0 && word.length > best.length) best = word;
      });
    });
    return best;
  }
  function rawGyakuCatKumi(cat) {
    var s = String(cat || ''), found = -1;
    RAW_GYAKU_CAT_NAKAMA.forEach(function (group, i) {
      group.forEach(function (word) {
        if (found < 0 && word && (s === word || s.indexOf(word) >= 0)) found = i;
      });
    });
    return found;
  }
  function rawGyakuCatChigau(a, b) {
    if (!a || !b || a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return false;
    var x = rawGyakuCatKumi(a), y = rawGyakuCatKumi(b);
    return x >= 0 && y >= 0 && x !== y;
  }
  function rawGyakuSozaiHiroi(text) {
    var out = [], lo = rawGyakuNorm(text);
    RAW_GYAKU_SOZAI.forEach(function (group, i) {
      for (var j = 0; j < group.length; j++) {
        if (lo.indexOf(rawGyakuNorm(group[j])) >= 0) {
          if (out.indexOf(i) < 0) out.push(i);
          break;
        }
      }
    });
    return out;
  }
  /* PC版terashiawaseのうち、検索語に含めた商品固有語だけを
     仕入元タイトルへ照合する。ブランド＋カテゴリだけの語はここで
     必須にしない。そうしないと「ワンピース」のような一般語だけで
     本物まで落とすため。 */
  function rawGyakuQueryKoyuuAru(moto, text, brand) {
    var q = rawGyakuNorm((moto && moto.kw) || '');
    var t = rawGyakuNorm(text || '');
    if (!q || !t) return true;
    var vals = [];
    try {
      vals = vals.concat(rawGyakuTitleProper((moto && moto.dai) || '', brand));
    } catch (e) { }
    try {
      vals = vals.concat((moto && moto.lens && moto.lens.properNouns) || []);
      vals = vals.concat((moto && moto.lens && moto.lens.properCandidates) || []);
    } catch (e) { }
    var seen = {};
    for (var i = 0; i < vals.length; i++) {
      var v = String(vals[i] || '').trim(), n = rawGyakuNorm(v);
      if (!n || n.length < 3 || seen[n]) continue;
      seen[n] = 1;
      if (brand && rawGyakuBrandMatch(v, brand)) continue;
      if (rawGyakuCatKumi(v) >= 0 || rawGyakuSozaiHiroi(v).length) continue;
      if (q.indexOf(n) >= 0 && t.indexOf(n) < 0) return false;
    }
    return true;
  }
  /* PC版の buraAll と同じく、ブランド候補は1つの文字列へ混ぜない。
     ブランド名の中の空白は分割せず、明示された区切りだけを別候補にする。 */
  function rawGyakuBrandList(primary, values) {
    var out = [], seen = {};
    var brandWords = function (v) {
      return String(v || '').normalize('NFKC').toLowerCase()
        .replace(/[’'`．.＿_\-\/・×x&:：,，、()（）［］【】「」]+/g, ' ')
        .replace(/[\s　]+/g, ' ').trim();
    };
    var isShortNameOf = function (longName, shortName) {
      var l = brandWords(longName), s = brandWords(shortName);
      if (!l || !s || l === s || s.length < 4) return false;
      if (l.indexOf(' ') >= 0 || s.indexOf(' ') >= 0) {
        return l.indexOf(s + ' ') === 0 || l.slice(-(s.length + 1)) === ' ' + s;
      }
      var ln = rawGyakuNorm(l), sn = rawGyakuNorm(s);
      return ln.indexOf(sn) === 0 || ln.slice(-sn.length) === sn;
    };
    var add = function (v) {
      String(v || '').split(/[／/|｜,，、×]+/).forEach(function (x) {
        var t = String(x || '').replace(/[「」『』]/g, '').replace(/[\s　]+/g, ' ').trim();
        if (!t || t.length < 2 || t.length > 80 || /(?:ノーブランド|その他|株式会社|有限会社|合同会社|㈱)/.test(t)) return;
        var n = rawGyakuNorm(t);
        if (!n || seen[n]) return;
        seen[n] = 1; out.push(t);
      });
    };
    add(primary);
    (Array.isArray(values) ? values : []).forEach(add);
    /* 既存のブランド辞書にある短い上位名だけを別名として補う。
       長いライン名から「Tomorrowland」や「Vivienne Westwood」を拾うためで、
       短いブランド名から辞書内の別ラインを勝手に増やすことはしない。 */
    var base = out.slice(), dict = [];
    try { dict = Array.isArray(kataBrands) ? kataBrands : []; } catch (e) { dict = []; }
    if (dict.length) base.forEach(function (b0) {
      var n0 = rawGyakuNorm(b0), cand = [];
      if (!n0) return;
      for (var di = 0; di < dict.length; di++) {
        var d0 = String(dict[di] || '').trim(), nd = rawGyakuNorm(d0);
        if (!d0 || nd.length < 4 || nd === n0 || !isShortNameOf(b0, d0)) continue;
        cand.push(d0);
      }
      cand.sort(function (a, z) { return rawGyakuNorm(z).length - rawGyakuNorm(a).length; });
      cand.slice(0, 2).forEach(add);
    });
    return out.slice(0, 8);
  }
  function rawGyakuKeywordBrand(keyword, brands) {
    var q = rawGyakuNorm(keyword), hit = '';
    if (!q) return '';
    rawGyakuBrandList('', brands).sort(function (a, z) {
      return rawGyakuNorm(z).length - rawGyakuNorm(a).length;
    }).forEach(function (b) {
      if (!hit && q.indexOf(rawGyakuNorm(b)) >= 0) hit = b;
    });
    return hit;
  }
  function rawGyakuBrandFamilyMatch(text, brand, values) {
    var b = String(brand || '').trim();
    if (!b) return true;
    var list = rawGyakuBrandList(b, values || []), bn = rawGyakuNorm(b);
    for (var i = 0; i < list.length; i++) {
      var ln = rawGyakuNorm(list[i]);
      /* 長いライン名と短い上位ブランドは同一系統。
         3文字以下の短語は別ブランドを誤って通しやすいので使わない。 */
      if (ln && ((ln.indexOf(bn) === 0 && bn.length >= 4)
        || (bn.indexOf(ln) === 0 && ln.length >= 4))
        && rawGyakuBrandMatch(text, list[i])) return true;
      if (ln === bn && rawGyakuBrandMatch(text, list[i])) return true;
    }
    return false;
  }
  function rawGyakuBrandMatch(text, brand) {
    var b = String(brand || '').trim();
    if (!b) return true;
    var hay = rawGyakuNorm(text);
    /* 空白を含むブランド名は分解しない。辞書から得た正式名と、
       その正式名の短い上位名（ライン省略）だけを同一系統として見る。 */
    var aliases = rawGyakuBrandList(b, []);
    for (var i = 0; i < aliases.length; i++) {
      var p = rawGyakuNorm(aliases[i]);
      if (p.length >= 3 && p && hay.indexOf(p) >= 0) return true;
    }
    return false;
  }
  function rawGyakuCleanLensProper(values, brand) {
    var out = [];
    var seen = {};
    var generic = (typeof MSQ_GENERIC !== 'undefined' ? MSQ_GENERIC : [])
      .concat(Array.isArray(CATEGORY_TOKENS) ? CATEGORY_TOKENS : []);
    var bNorm = rawGyakuBrandParts(brand).map(rawGyakuNorm).filter(Boolean);
    var bFull = rawGyakuNorm(brand);
    var add = function (v) {
      var t = String(v || '').replace(/[「」『』]/g, '').replace(/[（(][^）)]*[）)]/g, ' ')
        .replace(/[\s　]+/g, ' ').trim();
      if (t.length < 3 || t.length > 60) return;
      if (/(コラボレーションによる|画像にある|タグに記載|特徴的|セカンドストリート|メルカリ|mercari|google|lens|検索する際|参考になる|検索用ワード|出品される際|フリマアプリ|すっきりとした首元|シルエット|品質表示タグ|コットン\s*100%)/i.test(t)) return;
      var n = rawGyakuNorm(t);
      if (!n || n === bFull || (bNorm.length > 1 && bNorm.every(function (b) { return n.indexOf(b) >= 0; }))
        || bNorm.some(function (b) { return n === b; })) return;
      if (generic.some(function (g) { return rawGyakuNorm(g) === n; })) return;
      /* 「マキシワンピース」「ロングワンピース」のように形容語＋大分類だけの
         広い語は固有名詞ではない。これを単独で投げると別ブランドが大量に返るため、
         ブランド＋カテゴリの補助段だけに任せる。カフタンドレス等の固有語は残す。 */
      if (/^(?:ロング|マキシ|ミニ|ミドル|ショート)(?:ワンピース|ドレス|パンツ|ジャケット|コート|シャツ|スカート)$/i.test(t)) return;
      /* Lensの見出しや回答の断片を商品名として検索しない。 */
      if (/^(?:型番|カラー|素材|状態|商品の状態|サイズ|サイズ表記|ブランド|ブランド名|アイテム|アイテム名|品番|モデル|着丈|身幅|肩幅|袖丈|総丈|ウエスト|股上|股下|わたり|裾幅)(?:\s*[:：]?|\s*[・/、]|\s*[0-9０-９])/i.test(t)) return;
      if (/^(?:美品|新品|未使用|中古|送料無料|即決|タグ付き)$/i.test(t)) return;
      if (/^(?:です|ます|ください)[。．]?$/i.test(t)) return;
      /* 型番らしい英数字や数字だけの値は固有名詞へ入れない。 */
      if (/^[A-Z0-9][A-Z0-9._\/-]{3,23}$/i.test(t) && /\d/.test(t)) return;
      if (!seen[n]) { seen[n] = 1; out.push(t); }
    };
    (Array.isArray(values) ? values : []).forEach(function (v) {
      String(v || '').split(/[／/|｜,，、]+/).forEach(add);
    });
    return out.slice(0, 8);
  }
  function rawGyakuTitleProper(dai, brand) {
    var out = [];
    var seen = {};
    var cats = (Array.isArray(CATEGORY_TOKENS) ? CATEGORY_TOKENS : [])
      .slice().sort(function (a, z) { return String(z).length - String(a).length; });
    var brandNorm = rawGyakuBrandParts(brand).map(rawGyakuNorm).filter(Boolean);
    var s = String(dai || '').replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
      .replace(/[「」『』]/g, ' ').replace(/[\s　]+/g, ' ').trim();
    s.split(/[\s　/・×x&,，、]+/).forEach(function (w) {
      var t = String(w || '').trim();
      var n = rawGyakuNorm(t);
      if (!t || t.length < 3 || !n || brandNorm.indexOf(n) >= 0) return;
      if (/^(美品|新品|未使用|中古|タグ付き|ストライプ|ベージュ|ブラック|ホワイト|ブルー|グレー|サイズ|メンズ|レディース)$/i.test(t)) return;
      for (var i = 0; i < cats.length; i++) {
        var c = rawGyakuNorm(cats[i]);
        if (c && n.indexOf(c) >= 0 && n.length > c.length) {
          if (!seen[n]) { seen[n] = 1; out.push(t); }
          break;
        }
      }
    });
    return out.slice(0, 8);
  }
  /* 検索元タイトルからのブランド保険。ブランド辞書の初期化が遅い便でも、
     状態札を外した先頭の英字ブランド（コラボ表記を含む）を保持する。 */
  function rawGyakuBrandFromTitle(s) {
    var clean = String(s || '')
      .replace(/^\s*(?:【[^】]*】|\[[^\]]*\])+\s*/g, '')
      .replace(/^\s*(?:新品|未使用|美品|極美品|良品|タグ付き|送料無料)\s+/i, '')
      .trim();
    var parts = clean.split(/[\s　\/]+/), out = [], groups = [], group = [];
    for (var i = 0; i < parts.length; i++) {
      var t = String(parts[i] || '').trim();
      if (!t || /^\d+%/.test(t)) continue;
      if (/^[×xX]+$/.test(t)) { if (group.length) { groups.push(group.join(' ')); group = []; } continue; }
      if (/^[&,・]+$/.test(t)) continue;
      if (/[ぁ-んァ-ヶ一-龥]/.test(t)) break;
      group.push(t);
      if (group.length >= 4) break;
    }
    if (group.length) groups.push(group.join(' '));
    return groups.join(' × ');
  }
  function rawGyakuKotoba(dai, kata, burando, lensInfo) {
    var zen = "";
    try { zen = rawShiireGo(dai); } catch (e) { zen = String(dai || ""); }
    /* ★サイズの語を先に落とす。既存の rawShiireMijikai は「英字と数字が混ざって
       3文字以上＝型番」と見るので、27cm を型番だと思ってしまう（検証で捕まえた）。
       rawShiireMijikai 自体は直さない。手で押す仕入パネルが同じ物を使っているため。
       数字だけの語（エアマックス90 の 90）は意味があるので残す。 */
    var saizu = /^[0-9]+(\.[0-9]+)?(cm|CM|mm|MM|inch|インチ|号)$/;
    var w = String(zen || "").split(/[\s/・,，、]+/).filter(Boolean)
      .filter(function (x) {
        var t = String(x || '').normalize('NFKC').trim();
        return !saizu.test(t) && !RAW_ERA_LIKE.test(t);
      });
    /* ★末尾の1語がサイズなら落とす（「… ニット 40」の 40、「… M」など）。
       末尾だけを見るので「エアマックス 90」の 90 は残る（型番の一部で意味がある）。 */
    /* ★末尾の1語がサイズなら落とす（「… ニット 40」の 40、「… M」など）。
       末尾だけを見るので「エアマックス 90」の 90 は残る（型番の一部で意味がある）。 */
    var owariSaizu = /^([0-9]{1,3}|[SMLXFsmlxf]|XL|XXL|LL|F|FREE|フリー)$/;
    if (w.length > 2 && owariSaizu.test(w[w.length - 1])) w = w.slice(0, w.length - 1);
    /* ★一般素材と一般色は検索語に入れない（拡張機能と同じ扱い）。
       コットンやベージュで絞っても仕入元の題には書かれていない事が多く、
       AND検索では当たらなくなるだけ。 */
    try {
      var nozoku = COMMON_MATERIALS.concat(COMMON_COLORS).map(function (x) { return x.toLowerCase(); });
      w = w.filter(function (x) { return nozoku.indexOf(String(x).toLowerCase()) < 0; });
    } catch (e) { }
    /* ★くっついた語を割ってスペースを入れる（ユーザー指示）。
       割る語は【カテゴリ＋高値素材＋デザイン語】。どれも既にある一覧で、手書きはしない。
       「カシミヤシルクニット」→「カシミヤ シルク ニット」。
       ★1回で終わらせず、割れなくなるまで繰り返す（3語くっついていても割れるように）。 */
    var katego = "";
    try {
      var waruGo = CATEGORY_TOKENS.concat(HIGH_MATERIALS).concat(HIGH_WORDS)
        .slice().sort(function (a, b) { return b.length - a.length; });
      var waru = function (x, fukasa) {
        if (fukasa > 4) return [x];
        for (var ci = 0; ci < waruGo.length; ci++) {
          var tk = waruGo[ci];
          if (x.length <= tk.length) continue;      /* その語そのものなら割らない */
          var at = x.indexOf(tk);
          if (at < 0) continue;
          var mae2 = x.slice(0, at), ato2 = x.slice(at + tk.length);
          /* 1文字の切れ端が出る割り方はしない（意味の無い語で検索が狂う） */
          if ((mae2 && mae2.length < 2) || (ato2 && ato2.length < 2)) continue;
          var deta = [];
          if (mae2) deta = deta.concat(waru(mae2, fukasa + 1));
          deta.push(tk);
          if (ato2) deta = deta.concat(waru(ato2, fukasa + 1));
          return deta;
        }
        return [x];
      };
      var w3 = [];
      w.forEach(function (x) { w3 = w3.concat(waru(x, 0)); });
      w = w3.filter(Boolean);
      /* 2段目に使うカテゴリ語。割った後の並びから一番はじめに見つかった物 */
      for (var k2 = 0; k2 < w.length; k2++) {
        if (CATEGORY_TOKENS.indexOf(w[k2]) >= 0) { katego = w[k2]; break; }
      }
    } catch (e) { }
    /* ★ひらがなだけの短い語は落とす（のみ／つき／あり／など）。
       「ジャケットのみ」を割ると「のみ」が残るが、これは助詞で商品を絞る力が無く、
       AND検索に入れると当たらなくなるだけ（実機で「ジャケット のみ」になった）。 */
    w = w.filter(function (x) {
      return !(x.length <= 4 && /^[ぁ-ん]+$/.test(x));
    });
    /* ★2026-08-30 メルカリのブランド欄を先頭に足す（実機で確認した抜け）。
       題が「ジャケットのみ」でも itemBrand が FABIANA FILIPPI なら、それで引ける。
       ★題に既にブランドが入っている時は足さない（同じ語を2回並べない）。 */
    var braGo = [];
    try {
      var bw2 = String(burando || "").trim();
      if (bw2 && bw2.indexOf("ノーブランド") < 0 && bw2 !== "その他") {
        var hira = function (x) { return String(x || "").toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]/g, ""); };
        var imaMoji = hira(w.join(""));
        if (imaMoji.indexOf(hira(bw2)) < 0) {
          braGo = bw2.split(/[\s/・,，、]+/).filter(Boolean);
          w = braGo.concat(w);
        }
      }
    } catch (e) { }
    /* ★絞れる語が1つも無い時は【始めない】。
       カテゴリ・素材・デザイン語しか残らない題（例: ジャケットのみ）は、
       どのサイトでも当たりすぎて別物ばかりになる。7サイト叩くだけ無駄で、規制にも近づく。
       ★黙って0件で終わらせず、呼んだ側で理由を出す。 */
    try {
      var ippan = CATEGORY_TOKENS.concat(HIGH_MATERIALS).concat(HIGH_WORDS)
        .map(function (x) { return String(x).toLowerCase(); });
      var shiboreru = w.filter(function (x) { return ippan.indexOf(String(x).toLowerCase()) < 0; });
      /* ブランド欄があれば、それ自体が絞れる語なので止めない */
      if (!kata && !burando && !shiboreru.length) return [];
    } catch (e) { }
    /* ★1段目は最大4語（ブランド＋意味のある3語）。
       ユーザーの例「ファビアナフィリッピ カシミヤ シルク ニット」と同じ形になる。 */
    var miji = "";
    try { miji = rawShiireMijikai(w.slice(0, 4).join(" ")); } catch (e) { }
    if (w.length <= 4) miji = w.join(" ");
    /* ★2段目は「ブランド＋カテゴリ」。仕入元の題の付け方に一番近く当たりやすい。
       カテゴリが分からない時だけ、今までどおり先頭2語にする。 */
    /* ★先頭の語がカテゴリそのものなら2段目は作らない。
       そのままだと「ジャケット ジャケット」になる（実機で出た）。 */
    /* ★2段目は「ブランド＋カテゴリ」。ブランドは丸ごと1つとして扱う
       （FABIANA FILIPPI を FABIANA だけに切らない）。 */
    var braMoji = braGo.length ? braGo.join(" ") : (w[0] || "");
    var futatsu = (katego && braMoji !== katego) ? (braMoji + " " + katego)
      : (w.length >= 2 ? w.slice(0, 2).join(" ") : "");
    var out = [];
    var oku = function (x) {
      var t = String(x || "").trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    };
    var li = lensInfo || {};
    var lensBrand = String(li.brand || '').trim();
    var brand = String(burando || lensBrand || '').trim();
    if (!brand) {
      try { brand = rawGyakuBrandFromTitle(dai) || ''; } catch (e) { }
    }
    /* PC版の buraAll に合わせ、ブランド名を検索語へ混ぜない。
       Tomorrowland collection のような空白を含む名前は1候補のまま、
       ×・／など明示された別名義だけを分ける。 */
    var brandList = rawGyakuBrandList(brand, li.brands || []);
    if (!brandList.length && brand) brandList = [brand];
    /* カテゴリは固有名詞との組み合わせにも使う。長いカテゴリを先に採る。 */
    var cat = '';
    try {
      var catList = Array.isArray(CATEGORY_TOKENS) ? CATEGORY_TOKENS.slice().sort(function (a, z) { return z.length - a.length; }) : [];
      for (var ci = 0; ci < catList.length; ci++) {
        if (String(dai || '').indexOf(catList[ci]) >= 0) { cat = catList[ci]; break; }
      }
    } catch (e) { }
    try {
      var catHint = rawGyakuCatHiroi(dai);
      if (catHint && catHint.length > cat.length) cat = catHint;
    } catch (e) { }
    /* PC版と同じく、元タイトルに実在する固有語をLensの誤読候補より先にする。
       LensのAI概要には別商品の商品名が混ざることがあるため、候補の配列順を
       そのまま使うと、検索語8本が誤読で埋まり、元商品へ到達できない。 */
    var lensProper = rawGyakuCleanLensProper(li.properNouns || [], brand);
    var titleProper = [];
    try { titleProper = rawGyakuTitleProper(dai, brand); } catch (e) { titleProper = []; }
    var titleNormForProper = rawGyakuNorm(dai);
    var proper = [];
    var addProper = function (x) {
      var t = String(x || '').trim();
      if (t && proper.indexOf(t) < 0) proper.push(t);
    };
    titleProper.forEach(addProper);
    lensProper.forEach(function (x) {
      var n = rawGyakuNorm(x);
      if (n && titleNormForProper.indexOf(n) >= 0) addProper(x);
    });
    lensProper.forEach(addProper);
    var brandVariants = brandList.slice();
    /* PC版の型番確定値・候補値をすべて順に試す。季節表記は
       rawModelUsableで除外済みなので、24AWだけで仕入元を叩かない。 */
    var modelList = [];
    var addModel = function (x) {
      var m = rawModelUsable(x);
      if (m && modelList.indexOf(m) < 0) modelList.push(m);
    };
    addModel(kata);
    (Array.isArray(li.models) ? li.models : []).forEach(addModel);
    (Array.isArray(li.modelCandidates) ? li.modelCandidates : []).forEach(addModel);
    try { rawModelCodes(dai).forEach(addModel); } catch (e) { }
    modelList.slice(0, 8).forEach(function (m) {
      oku(m);
      if (brand) oku(brand + ' ' + m);
    });
    /* 型番で引けない場合は、Lensが読んだ固有名詞をブランドと分離して使う。 */
    proper.forEach(function (p) {
      brandVariants.forEach(function (b0) { oku(b0 + ' ' + p); });
      oku(p);
    });
    /* 固有名詞だけでは同名の別カテゴリが混ざるサイトがある。
       ブランド＋カテゴリ＋固有名詞を、Lensが読んだ上位2語まで追加する。
       ブランドのコラボ表記は分解済みの全バリアントを使うが、組み合わせ数は
       3ブランド×2固有名詞に限定して検索回数を膨らませない。 */
    if (brand && cat && proper.length) {
      brandVariants.slice(0, 3).forEach(function (b0) {
        proper.slice(0, 2).forEach(function (p) {
          oku(b0 + ' ' + cat + ' ' + p);
        });
      });
    }
    /* PC版と同じく、Lens語が無い/誤読した場合はメルカリ題の固有語塊へ落とす。
       ブランド＋カテゴリだけで終わらせず、題に実際にある語を先に試す。 */
    /* titleProper は上で先に並べてある。ここではブランド併用形も候補にする。 */
    titleProper.forEach(function (p) {
      brandVariants.slice(0, 3).forEach(function (b0) { oku((b0 + ' ' + p).trim()); });
      oku(p);
    });
    if (titleProper.length >= 2) {
      brandVariants.slice(0, 3).forEach(function (b0) {
        oku((b0 + ' ' + titleProper.slice(0, 3).join(' ')).trim());
      });
    }
    /* PC版と同じく、タイトルが空白で分割された商品名にも対応する。
       ブランド・状態・季節・サイズ・色・型番を外し、カテゴリまでの固有語塊を
       短い順に試す。長いタイトルをそのままAND検索へ投げない。 */
    try {
      var brandNorms = brandVariants.map(rawGyakuNorm).filter(Boolean);
      var titleNoise = /^(?:新品|未使用|美品|極美品|良品|中古|送料無料|タグ付き|売切|売り切れ|SOLD|FREE|フリー|XS|S|M|L|XL|XXL|ブラック|ホワイト|ネイビー|ベージュ|ブルー|グレー|ブラウン|黒|白|紺|青|灰|茶)$/i;
      var titleParts = String(dai || '').replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
        .split(/[\s　\/|｜,、・×xX「」『』（）()\[\]{}]+/)
        .map(function (x) { return String(x || '').trim(); })
        .filter(function (x) {
          var n = rawGyakuNorm(x);
          return x.length >= 2 && !titleNoise.test(x) && !RAW_ERA_LIKE.test(x)
            && !brandNorms.some(function (b0) { return b0 && n === b0; })
            && !rawModelUsable(x).match(/^[A-Z0-9][A-Z0-9._\/-]{3,23}$/i);
        });
      var titleCatIndex = -1;
      for (var ti = 0; ti < titleParts.length && titleCatIndex < 0; ti++) {
        for (var tc = 0; tc < CATEGORY_TOKENS.length; tc++) {
          if (titleParts[ti].indexOf(CATEGORY_TOKENS[tc]) >= 0) { titleCatIndex = ti; break; }
        }
      }
      var titleCore = titleCatIndex >= 0 ? titleParts.slice(0, titleCatIndex + 1) : titleParts.slice(0, 4);
      titleCore.forEach(function (x, ix) {
        if (ix < titleCore.length - 1 && x.length >= 3) {
          brandVariants.slice(0, 3).forEach(function (b0) { oku((b0 + ' ' + x).trim()); });
          oku(x);
        }
      });
      if (titleCore.length >= 2) {
        var core = titleCore.join(' ');
        brandVariants.slice(0, 3).forEach(function (b0) { oku((b0 + ' ' + core).trim()); });
        oku(core);
        if (titleCore.length > 2) oku(titleCore.slice(1).join(' '));
      }
    } catch (e) { }
    /* Lens候補が無い時だけ、タイトルから作った商品名を使う。 */
    if (!proper.length && !kata) {
      try {
        var k = rawGyakuKoyuuFromDai(dai, brand);
        if (k) { if (brand) oku(brand + ' ' + k); oku(k); }
      } catch (e) { }
    }
    /* 最後にブランド＋カテゴリ＋高値要素。高値要素は候補を詰め込みすぎず、
       1語ずつ段階的に追加する（拡張機能のStep3〜7相当）。 */
    var highs = [];
    (Array.isArray(li.highValue) ? li.highValue : []).forEach(function (x) { if (highs.indexOf(x) < 0) highs.push(x); });
    try { rawGyakuTakaneYouso(String(dai || '') + ' ' + String(proper.join(' ')), '').forEach(function (x) { if (highs.indexOf(x) < 0) highs.push(x); }); } catch (e) { }
    if (brand && cat) {
      brandVariants.forEach(function (b0) {
        var base = (b0 + ' ' + cat).trim();
        /* PC版と同じく、高値要素は全件を候補として保持する。
           実行本数の上限はrawGyakuTick側の8本だけに任せる。 */
        var allHigh = highs.join(' ').trim();
        if (allHigh) oku(base + ' ' + allHigh);
        highs.forEach(function (h) { oku(base + ' ' + h); });
        oku(base);
        /* 細分類で0件の時だけ、PC版のカテゴリ仲間の広い語を1本追加する。 */
        var wide = '';
        RAW_GYAKU_CAT_NAKAMA.forEach(function (group) {
          group.forEach(function (word) {
            if (!wide && word && cat.length > word.length && cat.slice(-word.length) === word) wide = word;
          });
        });
        if (wide) oku((b0 + ' ' + wide).trim());
      });
    }
    if (!modelList.length && !proper.length) {
      if (brand && miji && rawGyakuNorm(miji).indexOf(rawGyakuNorm(brand)) < 0) oku(brand + ' ' + miji);
      oku(miji);
      oku(futatsu);
    }
    return out.slice(0, 8);
  }
  /* メルカリ側から始める。押した商品の題・売値・型番を持って7サイトを回る */
  function rawGyakuStart(dai, uri, kata, burando, gazou, lensInfo) {
    try {
      /* ★2026-08-30 ここで長い題を使っていたのが不具合。仕入元はAND検索なので0件になる。
         型番→短い→もっと短い、と【広げる】順に直した。 */
      /* ★2026-09-15 一覧カードのLens情報を検索語の材料にする。
         元の題は結果表示に残し、Lensの候補語だけを検索用の題へ足す。 */
      var li = lensInfo || {};
      /* LensのAIが返す季節表記（24AW/26SS等）を型番として優先しない。
         その場合は元タイトルに明記された型番を次に探し、無ければ固有名詞・
         ブランド系検索へ進む。商品ごとの例外ではなく全ブランド共通の入口で処理する。 */
      var modelSeeds = [];
      var addModelSeed = function (x) {
        var m = rawModelUsable(x);
        if (m && modelSeeds.indexOf(m) < 0) modelSeeds.push(m);
      };
      addModelSeed(kata);
      try { addModelSeed(rawModelFromDesc(li.description || '')); } catch (e0) { }
      (Array.isArray(li.models) ? li.models : []).forEach(addModelSeed);
      (Array.isArray(li.modelCandidates) ? li.modelCandidates : []).forEach(addModelSeed);
      try { rawModelCodes(dai).forEach(addModelSeed); } catch (e1) { }
      var safeKata = modelSeeds[0] || '';
      var liWords = [];
      rawGyakuCleanLensProper((li.properNouns || []).concat(li.properCandidates || []), li.brand || burando).forEach(function (x) {
        var t = String(x || '').trim(); if (t && liWords.indexOf(t) < 0) liWords.push(t);
      });
      (Array.isArray(li.highValue) ? li.highValue : []).forEach(function (x) {
        var t = String(x || '').trim(); if (t && liWords.indexOf(t) < 0) liWords.push(t);
      });
      var daiForSearch = String(dai || '') + (liWords.length ? ' ' + liWords.join(' ') : '');
      /* Lens の回答が「ブランド名：」行を返さない便でも、検索元タイトルから
         ブランドを復元して同じブランドのカードだけを通す。ブランド空欄のまま
         7サイトを回すと、型番にヒットしなかったサイトで別ブランドの商品を
         同一商品として表示してしまう。 */
      var effectiveBrand = String(burando || li.brand || '').trim();
      if (!effectiveBrand && Array.isArray(li.brands) && li.brands.length) {
        effectiveBrand = String(li.brands[0] || '').trim();
      }
      if (!effectiveBrand) {
        try { effectiveBrand = rawGyakuBrandFromTitle(dai) || ''; } catch (e) { }
      }
      li = Object.assign({}, li, { models: modelSeeds.slice(0, 8), modelCandidates: modelSeeds.slice(0, 8) });
      var kws = rawGyakuKotoba(daiForSearch, safeKata, effectiveBrand, li);
      var brandValues = rawGyakuBrandList(effectiveBrand, li.brands || []);
      var kwBrands = kws.map(function (x) { return rawGyakuKeywordBrand(x, brandValues); });
      var sourceCat = '';
      try {
        /* PC版と同じく、元の商品タイトルのカテゴリを正とする。
           LensのAI概要は今回の実機検証で「コート」を「ワンピース」と
           誤読したため、Lens語を先にすると照合対象を誤って落とす。タイトル
           から読めない商品のみ、Lensを補助カテゴリとして使う。 */
        sourceCat = rawGyakuCatHiroi(dai) || rawGyakuCatHiroi(daiForSearch) || '';
      } catch (e1) { }
      var sourceSozai = [];
      try { sourceSozai = rawGyakuSozaiHiroi(daiForSearch + ' ' + (li.highValue || []).join(' ')
        + ' ' + (li.sozai || []).join(' ')); } catch (e2) { }
      /* ★理由を出す。黙って何もしないと「壊れている」と見えるため。 */
      if (!kws.length) {
        alert("この商品では逆引きできません。" +
          "題に商品を絞れる言葉（ブランド名や型番）が無く、カテゴリだけです。" +
          "そのまま7サイトを回っても別物ばかりになるので始めません。" +
          "題: " + String(dai || "").slice(0, 40));
        return;
      }
      var kw = kws[0];
      var mise = RAW_SHIIRE.filter(function (x) { return x[1]; }).map(function (x) {
        var host = "";
        try { host = new URL(x[1]).hostname; } catch (e) { }
        return { na: x[0], url: x[1], ato: x[3] || "", host: host };
      });
       var j = { dai: String(dai || "").slice(0, 80), uri: Number(uri) || 0, kata: safeKata || "",
         gz: String(gazou || ""), bura: effectiveBrand,
         description: String(li.description || ''),
         lens: { brand: String(li.brand || effectiveBrand || ""), brands: brandValues.slice(0, 8), cat: sourceCat,
           sozai: sourceSozai, properNouns: liWords, properCandidates: Array.isArray(li.properCandidates) ? li.properCandidates.slice(0, 8) : [],
           highValue: Array.isArray(li.highValue) ? li.highValue.slice(0, 8) : [],
           models: modelSeeds.slice(0, 8), modelCandidates: modelSeeds.slice(0, 8),
           batches: Array.isArray(li.batches) ? li.batches : [], sent: Array.isArray(li.sent) ? li.sent : [] },
        kw: kw, kws: kws, kwBrand: kwBrands[0] || "", kwBrands: kwBrands, dan: 0, kaisu: 1,
        mise: mise, i: 0, res: [], t0: Date.now() };
      rawGyakuKaku(j);
      rawGyakuObi("逆引きを始めます\n商品: " + String(dai || "").slice(0, 70)
        + "\n売値 ¥" + (Number(uri) || 0).toLocaleString()
        + " / 仕入先 " + mise.length + "サイト / 1本目の言葉「" + kw + "」");
      var m0 = mise[0];
      if (window.MsqApp) MsqApp.openShiire(m0.url + encodeURIComponent(kw) + (m0.ato || ""));
    } catch (e) { alert("逆引きを始められません: " + e.message); }
  }
  try { window.rawGyakuStart = rawGyakuStart; } catch (e) { }

  /* ===== 一覧カード用Lens連携（2026-09-15） ================================
     検索／出品者／いいね一覧の「仕」を押した時だけ使う。
     既存の仕入元詳細ページ用Lensとは状態を分け、最大20枚を6枚ずつ
     正方形の合成画像にして、1便の結果を待ってから次便へ進む。 */
  const RAW_LIST_LENS_MAX_IMAGES = 20;
  const RAW_LIST_LENS_BATCH = 6;
  let rawListLensBusy = false;

  function rawLensItemImageValue(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return String(v.url || v.uri || v.src || v.imageUrl || v.original || '');
    return '';
  }

  /* 一覧Lensは既存のlensStart内部スコープに依存させない。
     ここを独立させないと実機で「lensImageBlob is not defined」になり、
     第1便の送信帯だけ残って結果へ進まない。 */
  function rawListLensImageBlob(u) {
    if (!u) return Promise.resolve(null);
    try {
      if (window.MsqApp && window.MsqApp.fetchImage) {
        const b64 = window.MsqApp.fetchImage(u, location.href);
        if (b64) {
          const bin = atob(b64), arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return Promise.resolve({ blob: new Blob([arr], { type: 'image/jpeg' }), b64: b64 });
        }
      }
    } catch (e) { }
    return fetch(u, { mode: 'cors', credentials: 'omit' })
      .then((r) => r.blob()).then((b) => ({ blob: b, b64: '' })).catch(() => null);
  }

  /* 商品詳細を裏の同一オリジン枠で開き、Reactの商品画像を読む。 */
  function rawLensFetchItem(url, done) {
    let fr = null, tick = 0, finished = false;
    const finish = (v) => {
      if (finished) return; finished = true;
      try { if (fr) fr.remove(); } catch (e) { }
      done(v || null);
    };
    try {
      fr = document.createElement('iframe');
      fr.setAttribute('data-msq-list-lens', '1');
      fr.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;opacity:.01;z-index:-1;pointer-events:none;';
      fr.src = url;
      document.body.appendChild(fr);
    } catch (e) { finish(null); return; }
    const t = setInterval(() => {
      tick++;
      let d = null, it = null;
      try { d = fr && fr.contentDocument; if (d && d.body) it = rawFindItemDoc(d); } catch (e) { }
       /* Reactの詳細オブジェクトだけ先に出て、photosが後から埋まる版がある。
          オブジェクトを見つけただけで確定すると、画像0枚のままLensを送れない。
          画像URLまたは実画像が揃うまで待ち、最大12秒で打ち切る。 */
       let hasImage = false;
       try {
         hasImage = !!(it && ((Array.isArray(it.photos) && it.photos.some((v) => /^https?:/i.test(rawLensItemImageValue(v))))
           || (Array.isArray(it.thumbnails) && it.thumbnails.some((v) => /^https?:/i.test(rawLensItemImageValue(v))))));
         if (!hasImage && d && d.body) {
           hasImage = Array.from(d.querySelectorAll('img')).some((im) => /^https?:/i.test(im.currentSrc || im.src || im.getAttribute('data-src') || ''));
         }
       } catch (e) { }
       if ((!it || !hasImage) && tick < 24) return;
      clearInterval(t);
      if (!d || !it) { finish(null); return; }
      const urls = [], seen = {};
      const add = (v) => {
        const u = rawLensItemImageValue(v);
        if (!/^https?:/i.test(u)) return;
        const k = u.split('?')[0];
        if (seen[k]) return; seen[k] = 1; urls.push(u);
      };
      try {
        if (Array.isArray(it.photos)) it.photos.forEach(add);
        if (Array.isArray(it.thumbnails)) it.thumbnails.forEach(add);
      } catch (e) { }
      /* React側で画像が取れない版は、詳細画面の実画像へ落とす。 */
      if (!urls.length) {
        try { d.querySelectorAll('img').forEach((im) => add(im.currentSrc || im.src || im.getAttribute('data-src') || '')); } catch (e) { }
      }
      finish({
        title: String(it.name || ''),
        brand: String((it.brand && it.brand.name) || (it.brands && it.brands[0] && it.brands[0].name) || ''),
        description: String(it.description || it.descriptionText || it.desc || it.body || ''),
        images: urls.slice(0, RAW_LIST_LENS_MAX_IMAGES)
      });
    }, 500);
  }

  function rawLensBlobBase64(blob, done) {
    try {
      const r = new FileReader();
      r.onload = () => done(String(r.result || '').replace(/^data:[^,]+,/, ''));
      r.onerror = () => done('');
      r.readAsDataURL(blob);
    } catch (e) { done(''); }
  }

  /* 画像はDOM/Reactの並び順だけで固めない。
     タグ・品番・素材の写真が後半に置かれる商品が多く、単純な1〜6枚目では
     1便に情報画像が入らない。1枚目（全体像）を必ず残し、残りは全画像の
     位置を均等にサンプリングして、最初の便から前・中・後ろを見せる。
     2便以降はまだ送っていない画像を元の順番で送る。これは特定サイトや
     特定商品の決め打ちではなく、最大20枚すべてに同じ規則で効く。 */
  function rawLensPlan(urls) {
    const all = (Array.isArray(urls) ? urls : []).slice(0, RAW_LIST_LENS_MAX_IMAGES);
    if (!all.length) return { batches: [], all: [] };
    const picked = [], seen = {};
    const add = (i) => {
      const n = Math.max(0, Math.min(all.length - 1, Math.round(i)));
      if (seen[n]) return;
      seen[n] = 1; picked.push(all[n]);
    };
    const first = Math.min(RAW_LIST_LENS_BATCH, all.length);
    add(0);
    if (first > 1) {
      for (let slot = 1; slot < first; slot++) {
        add((slot * (all.length - 1)) / (first - 1));
      }
    }
    all.forEach((u, i) => { if (!seen[i]) picked.push(u); });
    const batches = [];
    for (let i = 0; i < picked.length; i += RAW_LIST_LENS_BATCH) {
      batches.push(picked.slice(i, i + RAW_LIST_LENS_BATCH));
    }
    return { batches: batches.slice(0, 4), all: all };
  }

  /* 最大6枚を3×3の正方形へ合成する。空き枠には画像番号を焼き込む。 */
  function rawLensCompose(urls, done, labels) {
    const list = (Array.isArray(urls) ? urls : []).slice(0, RAW_LIST_LENS_BATCH);
    if (!list.length) { done(null); return; }
    Promise.all(list.map((u) => rawListLensImageBlob(u).then((x) => x && x.blob ? x.blob : null).catch(() => null)))
      .then((blobs) => {
        const usable = blobs.map((b, i) => ({ b: b, i: i })).filter((x) => x.b);
        if (!usable.length) { done(null); return; }
        const asImageElement = (x) => new Promise((resolve) => {
            try {
              const im = new Image(), u = URL.createObjectURL(x.b);
              im.onload = () => { try { URL.revokeObjectURL(u); } catch (e) { } resolve({ im: im, i: x.i }); };
              im.onerror = () => { try { URL.revokeObjectURL(u); } catch (e) { } resolve(null); };
              im.src = u;
            } catch (e) { resolve(null); }
          });
        const bitmaps = usable.map((x) => {
          /* WebViewによってはcreateImageBitmapが存在しても、WebP/AVIF等でrejectする。
             その1枚だけで便全体を失敗扱いにせず、Image要素へ戻す。 */
          if (typeof createImageBitmap === 'function') {
            try { return createImageBitmap(x.b).then((im) => ({ im: im, i: x.i })).catch(() => asImageElement(x)); }
            catch (e) { }
          }
          return asImageElement(x);
        });
        return Promise.all(bitmaps).then((ims) => ims.filter(Boolean));
      })
      .then((ims) => {
        if (!ims || !ims.length) { done(null); return; }
         /* AndroidのJavascriptInterfaceへ渡すBase64が大きすぎると画面遷移が
            Script errorで止まる。3×3の正方形は保ったまま、1便960pxに収める。 */
         const cv = document.createElement('canvas'), cell = 320;
        cv.width = cell * 3; cv.height = cell * 3;
        const c = cv.getContext('2d');
        c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
        ims.forEach((x, n) => {
          const im = x.im, col = n % 3, row = Math.floor(n / 3);
          const iw = im.width || im.naturalWidth || cell, ih = im.height || im.naturalHeight || cell;
          const sc = Math.min((cell - 24) / iw, (cell - 24) / ih);
          const w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
          const x0 = col * cell + Math.round((cell - w) / 2), y0 = row * cell + Math.round((cell - h) / 2);
          c.drawImage(im, x0, y0, w, h);
          c.fillStyle = 'rgba(15,23,42,.85)'; c.fillRect(col * cell + 6, row * cell + 6, 34, 28);
          c.fillStyle = '#fff'; c.font = '700 20px system-ui';
          const label = Array.isArray(labels) && labels[x.i] != null ? labels[x.i] : (x.i + 1);
          c.fillText(String(label), col * cell + 16, row * cell + 27);
          try { if (im.close) im.close(); } catch (e) { }
        });
         cv.toBlob((b) => { if (!b) { done(null); return; } rawLensBlobBase64(b, (b64) => done({ blob: b, b64: b64 })); }, 'image/jpeg', .82);
      }).catch(() => done(null));
  }

  /* PC版tagKaisekiのAndroid側。Lensの回答を「型番・ブランド・固有名詞・
     高値要素・素材」に分けて保持する。項目を混ぜると24AWのような季節語や
     「検索のコツ」が商品識別語へ入り、別商品を拾うため、検索語生成の前に
     必ずここで分類する。 */
  function rawLensTagKaiseki(text, sourceTitle) {
    const out = {
      model: '', modelCandidates: [], modelConfirmedAll: [], modelAll: [],
      brands: [], brandCandidates: [], brandConfirmedAll: [],
      proper: [], properCandidates: [], properConfirmedAll: [],
      high: [], highValueAll: [], sozai: []
    };
    const t = String(text || '').normalize('NFKC');
    const lines = t.split(/\r?\n|　{2,}/);
    const none = /^(?:なし|無し|不明|該当なし|見つからない|unknown|none|n\/a|未確認|読み取れない)$/i;
    const add = (a, v, max) => {
      const x = String(v || '').replace(/^[-*・]\s*/, '').replace(/[「」『』]/g, '')
        .replace(/[\s　]+/g, ' ').trim();
      if (!x || none.test(x) || (max && a.length >= max) || a.indexOf(x) >= 0) return;
      a.push(x);
    };
    const parts = (v) => String(v || '').split(/[\/／｜|、,，・]+/)
      .map((x) => String(x || '').trim()).filter((x) => x && !none.test(x));
    const read = (re) => {
      for (let i = 0; i < lines.length; i++) {
        const m = String(lines[i] || '').match(re);
        if (m) return String(m[1] || '').trim();
      }
      return '';
    };
    const codeParts = (v) => {
      const ret = [];
      parts(v).forEach((x) => {
        let c = '';
        const no = x.match(/\b(?:NO|品番|型番|MODEL)\s*[.．:#：=＝-]?\s*([A-Za-z0-9][A-Za-z0-9._\/-]{3,23})/i);
        if (no) c = no[1];
        if (!c) {
          try { c = rawModelCodes(x)[0] || ''; } catch (e) { }
        }
        c = rawModelUsable(String(c || '').replace(/^NO\.?/i, '').replace(/[._\/-]+$/, ''));
        if (!c || !/[0-9]/.test(c) || /^(?:19|20)\d{2}$/.test(c)) return;
        add(ret, c, 12);
      });
      return ret;
    };
    const modelConfirmed = codeParts(read(/^\s*(?:型番|品番・型番)\s*[（(]?(?:確定)\s*[）)]?\s*[：:]\s*(.*)$/i));
    const modelCandidates = codeParts(read(/^\s*(?:型番|品番・型番)\s*[（(]?(?:候補)\s*[）)]?\s*[：:]\s*(.*)$/i));
    const modelOld = codeParts(read(/^\s*(?:型番|品番)\s*[：:]\s*(.*)$/i));
    (modelConfirmed.length ? modelConfirmed : []).forEach((x) => add(out.modelConfirmedAll, x, 8));
    (modelCandidates.length ? modelCandidates : (modelConfirmed.length ? [] : modelOld)).forEach((x) => add(out.modelCandidates, x, 8));
    out.model = out.modelConfirmedAll[0] || '';
    out.modelAll = [].concat(out.modelConfirmedAll, out.modelCandidates).filter((x, i, a) => a.indexOf(x) === i).slice(0, 12);

    const bConfirmed = parts(read(/^\s*(?:ブランド名?|ブランド)\s*[（(]?(?:確定)\s*[）)]?\s*[：:]\s*(.*)$/i));
    const bCandidates = parts(read(/^\s*(?:ブランド名?|ブランド)\s*[（(]?(?:候補)\s*[）)]?\s*[：:]\s*(.*)$/i));
    const bOld = parts(read(/^\s*(?:ブランド名?|ブランド)\s*[：:]\s*(.*)$/i));
    bConfirmed.concat(bCandidates.length ? bCandidates : (bConfirmed.length ? [] : bOld)).forEach((x) => {
      if (x.length >= 2 && x.length <= 80 && !/(メルカリ|mercari|google|lens|ノーブランド|その他|検索のコツ)/i.test(x)) add(out.brands, x, 8);
    });
    bConfirmed.forEach((x) => add(out.brandConfirmedAll, x, 8));
    bCandidates.forEach((x) => {
      const n = rawGyakuNorm(x), titleN = rawGyakuNorm(sourceTitle || '');
      if (n && titleN.indexOf(n) >= 0) add(out.brandCandidates, x, 8);
    });

    const properConfirmed = parts(read(/^\s*(?:固有名詞|モデル名|商品名)\s*[（(]?(?:確定)\s*[）)]?\s*[：:]\s*(.*)$/i));
    const properCandidates = parts(read(/^\s*(?:固有名詞|モデル名|商品名)\s*[（(]?(?:候補)\s*[）)]?\s*[：:]\s*(.*)$/i));
    const properOld = parts(read(/^\s*(?:固有名詞|モデル名|商品名)\s*[：:]\s*(.*)$/i));
    const generic = (Array.isArray(CATEGORY_TOKENS) ? CATEGORY_TOKENS : []).map((x) => rawGyakuNorm(x));
    properConfirmed.concat(properCandidates.length ? properCandidates : (properConfirmed.length ? [] : properOld)).forEach((x) => {
      const n = rawGyakuNorm(x);
      if (x.length >= 3 && x.length <= 60 && !generic.some((g) => g && g === n)
        && !/(メルカリ|mercari|google|lens|検索のコツ|購入するために|出品するために)/i.test(x)) add(out.proper, x, 12);
    });
    properConfirmed.forEach((x) => add(out.properConfirmedAll, x, 8));
    properCandidates.forEach((x) => add(out.properCandidates, x, 8));
    try {
      rawGyakuTitleProper(sourceTitle || '', out.brands[0] || '').forEach((x) => add(out.properCandidates, x, 8));
    } catch (e) { }
    out.proper = rawGyakuCleanLensProper(out.proper, out.brands[0] || '');
    out.properCandidates = rawGyakuCleanLensProper(out.properCandidates, out.brands[0] || '');

    const high = read(/^\s*(?:高値要素|高値の要素)\s*[（(]?(?:候補)?\s*[）)]?\s*[：:]\s*(.*)$/i);
    parts(high).forEach((x) => {
      if (x.length <= 40 && !/(メルカリ|mercari|google|lens|検索のコツ|購入するために|出品するために)/i.test(x)) add(out.high, x, 20);
    });
    out.highValueAll = out.high.slice();
    const sozai = read(/^\s*(?:素材|素材\s*（(?:確定|候補)）|混率|表地)\s*[：:]\s*(.*)$/i);
    const sozaiGroups = Array.isArray(RAW_GYAKU_SOZAI) ? RAW_GYAKU_SOZAI : [];
    sozaiGroups.forEach((group, gi) => {
      if (group.some((x) => rawGyakuNorm(sozai).indexOf(rawGyakuNorm(x)) >= 0)) add(out.sozai, String(group[0] || gi), 8);
    });
    return out;
  }

  function rawLensSignals(sourceTitle) {
    const out = { model: '', modelCandidates: [], models: [], brand: '', brands: [], proper: [], properCandidates: [], high: [], sozai: [] };
    let body = '';
    try { body = String(document.body ? document.body.innerText || '' : ''); } catch (e) { }
    const parsed = rawLensTagKaiseki(body, String(sourceTitle || ''));
    out.model = parsed.model || '';
    out.modelCandidates = parsed.modelCandidates || [];
    out.models = [].concat(parsed.modelConfirmedAll || [], parsed.modelCandidates || []);
    out.brands = (parsed.brands || []).slice();
    out.proper = (parsed.proper || []).slice();
    out.properCandidates = (parsed.properCandidates || []).slice();
    out.high = (parsed.high || []).slice();
    out.sozai = (parsed.sozai || []).slice();
    /* GoogleのAI概要は仕入元本文ではないため、後段のrawModelFromDescの
       スコープに依存しない。品番・型番ラベルをこの場で直接読む。 */
    try {
      const mm = body.normalize('NFKC').match(/(?:型番\s*\([^)]*品番[^)]*\)|型番|型式|品番|商品型番|model\s*(?:no\.?|number))\s*[「『"']?\s*[:：#＝=\-]?\s*[「『"']?\s*([A-Z0-9][A-Z0-9._\/-]{3,23})/i);
      if (mm) out.model = rawModelUsable(String(mm[1]).replace(/[._\/-]+$/, '').replace(/^NO\.?/i, ''));
    } catch (e) { }
    try {
      if (!out.model) out.model = rawModelFromDesc(body) || '';
    } catch (e) { }
    try {
      if (!out.model) {
        const m = body.match(/\b(?:NO|品番|型番|MODEL)\s*[.．:#：-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,23})\b/i);
        if (m) out.model = rawModelUsable(String(m[1]).replace(/^NO\.?/i, ''));
      }
    } catch (e) { }
    try {
      const g = lensGemini();
      /* AI概要のブランド欄は、固有名詞と分けて保存する。
         ここを固有名詞だけへ混ぜると、TEN / Ron Herman のような
         ブランド語が商品名として検索される。 */
      /* 説明文の「ブランド…」ではなく、AIが出したラベル行だけ読む。
         Googleの回答は「ブランド名：」を含む説明文が先に来ることがあり、
         行頭を固定しないと説明文全体をブランド名として保存してしまう。 */
      const addBrand = (v) => String(v || '').split(/[／/|｜,，、×]+/).forEach((x) => {
        const t = String(x || '').replace(/[「」『』]/g, '').replace(/[\s　]+/g, ' ').trim();
        if (t.length < 2 || t.length > 80 || /(?:メルカリ|mercari|google|lens|ノーブランド|その他|株式会社|有限会社|合同会社|㈱)/i.test(t)) return;
        if (/^(?:ブランド|ブランド名|検索結果|AIによる概要)$/i.test(t)) return;
        if (out.brands.indexOf(t) < 0) out.brands.push(t);
      });
      const bm = body.match(/^\s*(?:ブランド名|ブランド)\s*[：:]\s*([^\n]+)/im);
      if (bm) {
        addBrand(String(bm[1] || '').replace(/[（(].*$/, '').trim());
        out.brand = out.brands[0] || '';
      }
      const add = (a, max) => (Array.isArray(a) ? a : []).forEach((v) => {
        const t = String(v || '').replace(/[「」『』]/g, '').replace(/\s+/g, ' ').trim();
        /* Lens/Googleの説明文に含まれるサイト名は商品名ではない。
           「メルカリの人気商品」のようにサイト名を含む文章全体も除外する。 */
        if (t.length < 3 || t.length > 60 || /(?:メルカリ|mercari|google|lens)/i.test(t)
          || /^(検索結果|AIによる概要)$/i.test(t)) return;
        if (/^(NO\.?|品番|型番|MODEL)\s*[:#：-]?\s*[A-Z0-9][A-Z0-9._\/-]{3,23}$/i.test(t)) return;
        if (/^(?:型番|カラー|素材|状態|商品の状態|サイズ|サイズ表記|ブランド|ブランド名|アイテム|アイテム名|品番|モデル|着丈|身幅|肩幅|袖丈|総丈|ウエスト|股上|股下|わたり|裾幅)(?:\s*[:：]?|\s*[・/、]|\s*[0-9０-９])/i.test(t)) return;
        if (/^(?:です|ます|ください)[。．]?$/i.test(t)) return;
        if (/(プライバシー|ポリシー|利用規約|フィードバック|もっと見る|プロダクト\s*ビューア)/i.test(t)) return;
        if (/(確認することができます|出品状況|過去の取引|検索すると|参考ください)/i.test(t)) return;
        /* 英字だけ1語はブランド名。型番らしい英数字混在だけはmodelへ移す。 */
        if (/^[A-Za-z][A-Za-z0-9._\/-]{3,23}$/.test(t) && /\d/.test(t)) {
          if (!out.model) out.model = t.replace(/^NO\.?/i, '');
          return;
        }
        if (/^[A-Za-z][A-Za-z0-9&.'-]*$/.test(t)) return;
        if (out.proper.indexOf(t) < 0 && out.proper.length < max) out.proper.push(t);
      });
      const addHigh = (a) => (Array.isArray(a) ? a : [a]).forEach((v) => {
        String(v || '').split(/[／/|｜,，、・]+/).forEach((x) => {
          const t = String(x || '').replace(/[「」『』]/g, '').replace(/[\s　]+/g, ' ').trim();
          if (!t || t.length > 40 || /(?:メルカリ|mercari|google|lens|検索のコツ|購入するために|出品するために)/i.test(t)) return;
          if (out.high.indexOf(t) < 0) out.high.push(t);
        });
      });
      add(g.go, 6); add(g.oshi, 6);
      addHigh(g.highValue || g.high || g.takane || []);
      /* PC版と同じく、Lensの高値要素と元のメルカリ題から辞書で拾った語を
         合流する。検索のコツ(kotsu)は overview から切り離して混ぜない。 */
      try {
        rawGyakuTakaneYouso(String(sourceTitle || '') + ' ' + String(g.overview || ''), '').forEach((x) => addHigh(x));
      } catch (e) { }
      const hm = body.match(/^\s*(?:高値要素|高値の要素)\s*[：:]\s*([^\n]+)/im);
      if (hm) addHigh(hm[1]);
      try {
        rawGyakuTakaneYouso((Array.isArray(g.go) ? g.go : []).concat(Array.isArray(g.oshi) ? g.oshi : []).join(' '), '')
          .forEach((x) => addHigh(x));
      } catch (e) { }
      /* AI概要の「アイテム名」は引用符が無い表示でも商品名を明示する。
         / 区切りで複数候補を保持し、1つに決め打ちしない。 */
      const im = body.match(/^\s*アイテム(?:名)?\s*[：:]\s*([^\n]+)/im);
      if (im) String(im[1]).split(/[／\/]/).forEach((v) => add([v], 6));
      /* 箇条書きが作られない回答でも、概要文の「ブランド…の○○です」から
         商品名を候補として拾う。括弧内の別名も候補に残す。 */
      const pm = body.match(/(?:アパレル)?ブランド[^。\n]{0,80}?の\s*([^。\n]+?)(?:です|。)/i);
      if (pm) {
        const v = String(pm[1]).replace(/[（(]([^）)]*)[）)]/g, ' / $1').trim();
        v.split(/[／\/]/).forEach((x) => add([x], 6));
      }
      const pm2 = body.match(/[）)]の\s*([^。\n]+?)(?:です|。)/i);
      if (pm2) {
        const v = String(pm2[1]).replace(/[（(]([^）)]*)[）)]/g, ' / $1').trim();
        v.split(/[／\/]/).forEach((x) => add([x], 6));
      }
      /* g.kotsu は画面表示用の「検索のコツ」。PC側の高値要素欄とは別物なので、
         逆引きの検索語・同一商品判定へ渡さない。 */
    } catch (e) { }
    return out;
  }

  const rawLensActionUrl = (q) =>
    'https://lens.google.com/upload?ep=gisbubu&hl=ja&msqfrom=1&q=' + encodeURIComponent(q);
  /* 一覧Lens専用の送信窓口。詳細ページ側のlensPostはページ条件の内側に
     あり、一覧では定義されないため直接参照しない。 */
  function rawLensPost(b64, actionUrl, jotai) {
    if (!b64 || !window.MsqApp) return false;
    if (!window.MsqApp.openKekka) return false;
    const html = '<html><head><meta name="referrer" content="no-referrer">'
      + '<meta name="msq-send" content="1">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="background:#0f172a;color:#fff;font-family:system-ui,sans-serif;'
      + 'text-align:center;padding-top:25%">'
      + '<p id="msq-send-status">Googleレンズへ画像を送っています… 0秒</p>'
      + '<form id="f" method="POST" enctype="multipart/form-data" action="'
      + String(actionUrl).replace(/"/g, '&quot;') + '">'
      + '<input id="i" type="file" name="encoded_image"></form>'
      + '<script>(function(){'
      + 'try{window.name=' + JSON.stringify('MSQSTATE:' + (jotai || '{}')) + ';}catch(e){}'
      + 'var b=atob("' + b64 + '");var n=b.length;var a=new Uint8Array(n);'
      + 'for(var k=0;k<n;k++)a[k]=b.charCodeAt(k);'
      + 'var f=new File([a],"image.jpg",{type:"image/jpeg"});'
      + 'var d=new DataTransfer();d.items.add(f);document.getElementById("i").files=d.files;'
      + 'var ms=Date.now(),st=document.getElementById("msq-send-status");'
      + 'setInterval(function(){if(st)st.textContent="Googleレンズへ画像を送っています… "+Math.floor((Date.now()-ms)/1000)+"秒";},500);'
      + 'setTimeout(function(){document.getElementById("f").submit();},200);'
      + '})();<\/script></body></html>';
    if (window.MsqApp.openKekkaBegin && window.MsqApp.openKekkaPart && window.MsqApp.openKekkaEnd) {
      try {
        window.MsqApp.openKekkaBegin();
        let ix = 0, partSize = 16000;
        const sendPart = () => {
          try {
            if (ix < html.length) {
              window.MsqApp.openKekkaPart(html.slice(ix, ix + partSize));
              ix += partSize;
              lensObi('一覧商品のLens解析データを結果タブへ送信中… '
                + Math.min(100, Math.round(ix * 100 / html.length)) + '%');
              setTimeout(sendPart, 0);
              return;
            }
            window.MsqApp.openKekkaEnd();
          } catch (e) {
            lensObi('Lens解析データの受け渡しに失敗しました');
          }
        };
        sendPart();
        return true;
      } catch (e) { return false; }
    }
    try { window.MsqApp.openKekka(html); return true; } catch (e) { return false; }
  }

  function rawLensSendBatch(st) {
    const p = st && st.rawLens;
    if (!p || !Array.isArray(p.batches) || !p.batches[p.batchIndex]) return false;
    const batch = p.batches[p.batchIndex];
    const allImages = Array.isArray(p.allImages) ? p.allImages : [];
    const batchNumbers = batch.map(function (u, i) {
      const n = allImages.indexOf(u);
      return n >= 0 ? n + 1 : (i + 1);
    });
    lensObi('一覧商品のLens解析 第' + (p.batchIndex + 1) + '/' + p.batches.length + '便を画像合成しています…');
    rawLensCompose(batch, (got) => {
       if (!got) {
         try { const e = document.getElementById('msq-lens-obi'); if (e) e.remove(); } catch (e) { }
        const raw = p.raw || {};
         rawGyakuStart(raw.dai, raw.cost, raw.kata, (p.signals && p.signals.brand) || raw.brand, raw.img,
           Object.assign({}, p.signals || {}, { description: raw.description || '' }));
        return;
      }
      p.sent = p.sent || [];
      p.sent.push({ batch: p.batchIndex + 1, images: batch.slice(),
        numbers: batchNumbers.slice() });
      const jotai = JSON.stringify(st);
      try { if (window.MsqApp && MsqApp.msqSave) MsqApp.msqSave('msqstate', jotai); } catch (e) { }
      const q = ((p.raw && p.raw.brand) ? p.raw.brand + ' ' : '') + 'メルカリ';
      lensObi('一覧商品のLens解析 第' + (p.batchIndex + 1) + '/' + p.batches.length + '便を結果タブへ渡しています…');
      /* 画像合成の完了コールバック内でそのまま大きいHTMLを作ると、
         WebViewの画面更新まで止まって見える。次のイベントへ分けて、
         送信開始を必ず表示してからLensへ渡す。 */
      setTimeout(() => {
        try {
          const moved = rawLensPost(got.b64, rawLensActionUrl(q), jotai);
          if (moved) {
            lensObi('一覧商品のLens解析 第' + (p.batchIndex + 1) + '/' + p.batches.length + '便を渡しました。結果を待っています…');
          } else {
            const raw = p.raw || {};
             rawGyakuStart(raw.dai, raw.cost, raw.kata, (p.signals && p.signals.brand) || raw.brand, raw.img,
               Object.assign({}, p.signals || {}, { description: raw.description || '' }));
          }
        } catch (e) {
          lensObi('Lens解析の送信でエラーが発生しました');
        }
      }, 0);
    }, batchNumbers);
    return true;
  }

  function rawLensListResult(st) {
    const p = st && st.rawLens;
    if (!p) return false;
    /* Googleが本人確認ページを返した時は追加便を自動送信しない。
       連続POSTを続けると判定を悪化させるため、画面に理由を残して停止する。 */
    let gbody = '';
    try { gbody = String(document.body ? document.body.innerText || '' : ''); } catch (e) { }
    if (/私はロボットではありません|unusual traffic|異常なトラフィック|\/sorry\//i.test(gbody + ' ' + location.pathname)) {
      lensObi('Google側で本人確認が必要です。自動再送信を停止しました');
      p.googleCheck = true;
      lStateWrite(st);
      return true;
    }
    lensObi('一覧商品のLens結果を読み取っています…');
    const s = rawLensSignals(p.raw && p.raw.dai ? p.raw.dai : '');
    p.signals = p.signals || {};
    if (s.brand && !p.signals.brand) p.signals.brand = s.brand;
    p.signals.brands = Array.isArray(p.signals.brands) ? p.signals.brands : [];
    [].concat((p.raw && p.raw.brand) || '', s.brand || '', s.brands || []).forEach((x) => {
      const t = String(x || '').trim();
      if (t && p.signals.brands.indexOf(t) < 0) p.signals.brands.push(t);
    });
    if (!p.signals.brand && p.signals.brands.length) p.signals.brand = p.signals.brands[0];
    p.signals.models = Array.isArray(p.signals.models) ? p.signals.models : [];
    [].concat(s.model || '', s.models || [], s.modelCandidates || []).forEach((x) => {
      const t = rawModelUsable(x);
      if (t && p.signals.models.indexOf(t) < 0) p.signals.models.push(t);
    });
    p.signals.modelCandidates = Array.isArray(p.signals.modelCandidates) ? p.signals.modelCandidates : [];
    (s.modelCandidates || []).forEach((x) => {
      const t = rawModelUsable(x);
      if (t && p.signals.modelCandidates.indexOf(t) < 0) p.signals.modelCandidates.push(t);
    });
    p.signals.properNouns = Array.isArray(p.signals.properNouns) ? p.signals.properNouns : [];
    p.signals.properCandidates = Array.isArray(p.signals.properCandidates) ? p.signals.properCandidates : [];
    p.signals.highValue = Array.isArray(p.signals.highValue) ? p.signals.highValue : [];
    if (s.model && !p.signals.model) p.signals.model = s.model;
    (s.proper || []).forEach((x) => { if (p.signals.properNouns.indexOf(x) < 0) p.signals.properNouns.push(x); });
    (s.properCandidates || []).forEach((x) => { if (p.signals.properCandidates.indexOf(x) < 0) p.signals.properCandidates.push(x); });
    try {
      const rawTitle = p.raw && p.raw.dai ? p.raw.dai : '';
      rawGyakuTitleProper(rawTitle, p.signals.brand || (p.raw && p.raw.brand) || '')
        .forEach((x) => { if (p.signals.properNouns.indexOf(x) < 0) p.signals.properNouns.push(x); });
    } catch (e) { }
    /* 1便のAI回答とタイトル由来候補を同じフィルタに通してから保存する。 */
    p.signals.properNouns = rawGyakuCleanLensProper(
      p.signals.properNouns,
      p.signals.brand || (p.raw && p.raw.brand) || ''
    );
    p.signals.properCandidates = rawGyakuCleanLensProper(
      p.signals.properCandidates,
      p.signals.brand || (p.raw && p.raw.brand) || ''
    );
    (s.high || []).forEach((x) => { if (p.signals.highValue.indexOf(x) < 0) p.signals.highValue.push(x); });
    p.signals.sozai = Array.isArray(p.signals.sozai) ? p.signals.sozai : [];
    (s.sozai || []).forEach((x) => { if (p.signals.sozai.indexOf(x) < 0) p.signals.sozai.push(x); });
    const enough = !!p.signals.model || p.signals.models.length > 0
      || p.signals.properNouns.length > 0 || p.signals.properCandidates.length > 0;
    if (!enough && p.batchIndex + 1 < p.batches.length) {
      p.batchIndex++;
      lStateWrite(st);
      lensObi('情報が足りないため、第' + (p.batchIndex + 1) + '/' + p.batches.length + '便を準備しています…');
      setTimeout(() => rawLensSendBatch(st), 1800);
      return true;
    }
    lStateWrite(st);
    const raw = p.raw || {};
    rawGyakuStart(raw.dai, raw.cost, p.signals.model || p.signals.models[0] || raw.kata,
      p.signals.brand || raw.brand, raw.img, {
      brand: p.signals.brand || raw.brand,
      brands: p.signals.brands || [],
      description: raw.description || '',
      models: p.signals.models || [], modelCandidates: p.signals.modelCandidates || [],
      properNouns: (p.signals.properNouns || []).concat(p.signals.properCandidates || []),
      highValue: p.signals.highValue || [], sozai: p.signals.sozai || [],
      batches: p.batches, sent: p.sent || []
    });
    return true;
  }

  function rawGyakuLensStart(dai, uri, kata, burando, gazou, itemUrl) {
    if (!itemUrl || rawListLensBusy) {
      if (rawListLensBusy) rawGyakuObi('この商品のLens解析は進行中です');
      else rawGyakuStart(dai, uri, kata, burando, gazou);
      return;
    }
    rawListLensBusy = true;
    rawGyakuObi('一覧商品の画像を集めています…');
    rawLensFetchItem(itemUrl, (it) => {
      rawListLensBusy = false;
      /* カードの短縮題ではなく、取得できたメルカリ商品ページの正式題・
         ブランド欄を優先する。型番・固有名詞・ライン名の取りこぼしを全商品で防ぐ。 */
      const itemDai = String((it && it.title) || dai || '');
       const itemBrand = String(((it && it.brand) || burando || '') || '');
      const urls = (it && it.images) || [];
       if (!urls.length) {
         rawGyakuStart(itemDai, uri, kata, itemBrand, gazou, {
           brand: itemBrand, description: String((it && it.description) || '')
         });
         return;
       }
      const plan = rawLensPlan(urls);
       const st = { rawLens: { raw: { dai: itemDai, cost: uri, kata: kata, brand: itemBrand,
         description: String((it && it.description) || ''), img: gazou, itemUrl: itemUrl },
         batches: plan.batches, allImages: plan.all, batchIndex: 0, sent: [],
         signals: { model: rawModelUsable(kata) || '', models: rawModelUsable(kata) ? [rawModelUsable(kata)] : [],
           modelCandidates: [], brand: itemBrand || '', brands: itemBrand ? [itemBrand] : [],
           properNouns: [], properCandidates: [], highValue: [], sozai: [] } },
        list: [], mita: [], mitatsu: [], idx: 0, tomatta: false, owatta: false };
      rawLensSendBatch(st);
    });
  }
  try { window.rawGyakuLensStart = rawGyakuLensStart; } catch (e) { }
  /* ===== ここまで逆引き ===== */
  function rawShiirePanel(kotoba, uri, kata, burando, gazou, itemUrl) {
    const old = document.getElementById('msq-shiire-box');
    if (old) { old.remove(); if (!kotoba) return; }
    const box = document.createElement('div');
    box.id = 'msq-shiire-box';
    box.style.cssText = 'position:fixed;left:8px;right:8px;top:60px;z-index:2147483646;'
      + 'overflow:auto;background:#111;color:#fff;border:1px solid #555;border-radius:10px;'
      + 'padding:12px;font-size:13px;line-height:1.7;box-shadow:0 6px 24px rgba(0,0,0,.6);';
    /* ★vh は使わない（このWebViewでは 0 に解決され、高さが潰れる） */
    box.style.setProperty('max-height',
      Math.max(200, Math.round((window.innerHeight || 600) * 0.7)) + 'px', 'important');
    const zen = rawShiireGo(kotoba);
    const miji = rawShiireMijikai(zen);
    const q = zen ? (rawShiireZenbu ? zen : (miji || zen)) : '';
    let h = q
      ? '<div style="font-weight:700;margin-bottom:4px;">仕入元で探す</div>'
      + '<div style="opacity:.85;margin-bottom:4px;word-break:break-all;">' + rawEsc(q) + '</div>'
      + '<div style="opacity:.6;margin-bottom:8px;font-size:12px;">'
      + (rawShiireZenbu ? 'いまは【全部】。仕入元は在庫が少ないので長い言葉だと0件になりやすい'
        : 'いまは【短く】。仕入元はこちらの方が当たる') + '</div>'
      + '<button class="msq-raw-btn" id="msq-shiire-kirikae" style="margin-bottom:6px;">'
      + (rawShiireZenbu ? '短くして探す' : 'タイトル全部で探す') + '</button>'
      : '<div style="font-weight:700;margin-bottom:10px;">仕入元サイト</div>';
    for (let i = 0; i < RAW_SHIIRE.length; i++) {
      h += '<div style="border-top:1px solid #333;padding:8px 0;">'
        + '<button class="msq-raw-btn" data-msq-shiire="' + i + '" style="width:100%;text-align:left;">'
        + rawEsc(RAW_SHIIRE[i][0]) + ((q && RAW_SHIIRE[i][1]) ? ' で探す' : ' を開く') + '</button></div>';
    }
    /* ★2026-08-30 7サイトを自動で回す口。
       これを h に足し忘れていたため、R133 では押し所が無く動かなかった。
       1つずつ押す形は上にそのまま残してあるので、今までの使い方は変わらない。 */
    if (q) {
      h += '<div style="border-top:1px solid #555;padding:10px 0;">'
        + '<button class="msq-raw-btn" id="msq-gyaku-go" style="width:100%;background:#7c3aed;'
        + 'color:#fff;font-weight:700;">Lens解析→' + RAW_SHIIRE.filter(function (x) { return x[1]; }).length
        + 'サイトを自動で探す（約1〜2分）</button>'
        + '<div style="opacity:.65;font-size:12px;margin-top:5px;">'
        + (kata ? ('型番「' + rawEsc(kata) + '」で引きます') : '型番が無いので言葉で引きます')
        + '。0件だった店だけ、もう一段短い言葉で1回だけ引き直します。'
        + (itemUrl ? '先に商品画像をLensへ送り、足りない時だけ最大4便まで追加します。' : '一覧しか開かないので商品ページは叩きません') + '</div></div>';
    }
    /* ==========================================================================
       ★★★ PCの結果をスマホで見る（2026-09-08 ユーザー依頼で新設）★★★
       ★grep用の目印: PCの結果

       ■ ユーザーの言葉
         「PCの結果をスマホで確認できるように依頼したものだ」
         「アプリでいいからわかる場所に出すようにしろ」
         「仕入れサイトメニューがあるだろ」「そこに結果を開くメニュー追加がわかりやすいだろ」
         「テントウムシの近くはボタン多いだろ」→ 左下ではなく、このメニューに置いた
         「結果タブではない」→ 結果タブでもない
       ■ 何をするか
         PCの結果ツールで「スマホへ送る」を押すと、GASに結果が貯まる。
         ここを押すと、その画面をそのまま開く（写真・仕入・相場・利益・仕入元リンク）。
       ■ GASのURLの入れ方
         初回だけ聞く。localStorage に覚える（msq_kekka_gas）。
         GASに貼るコードと手順は GAS_参照/PC結果をスマホで見るGAS.gs.txt にある。
       ========================================================================== */
    h += '<div style="border-top:1px solid #555;padding:10px 0;">'
      + '<button class="msq-raw-btn" id="msq-pc-kekka" style="width:100%;background:#22c55e;'
      + 'color:#fff;font-weight:700;">📱 PCの結果を見る</button>'
      + '<div style="opacity:.65;font-size:12px;margin-top:5px;">'
      + 'PCの結果ツールで「スマホへ送る」を押した分が出ます</div></div>';
    /* ★2026-09-09 ユーザー依頼「速度も安定度も直せ」「メルカリを超えるのが理想」。
         外部の広告・計測だけ読みに行かない切り替え。中身はアプリ側(MainActivity.kt)。
       ★新しいボタンを画面に増やさない。あなたの過去の指示
         「仕入れサイトメニューがあるだろ」「テントウムシの近くはボタン多いだろ」に従い、
         このメニューの中（閉じるの上）に置く。
       ★アプリでない時（クエッタ・PC）は窓口が無いので、この行自体を出さない。
       ★grep用の目印: 広告の通信を止める */
    {
      let kbAru = false, kbKazu = 0;
      try {
        if (window.MsqApp && window.MsqApp.setKokokuBlock) {
          kbAru = true;
          kbKazu = window.MsqApp.getKokokuKazu() | 0;
        }
      } catch (e) { }
      if (kbAru) {
        h += '<div style="border-top:1px solid #555;padding:10px 0;">'
          + '<div style="width:100%;background:#0ea5e9;color:#fff;font-weight:700;padding:10px;box-sizing:border-box;text-align:center;">'
          + '🚫 広告・解析通信：常時遮断</div>'
          + '<div style="opacity:.65;font-size:12px;margin-top:5px;">'
          + '外部の広告・計測だけ読みません。商品画像・ログイン・メルカリ本体は止めません。'
          + 'これまで ' + kbKazu + ' 本止めました。</div></div>';
      }
    }
    h += '<div style="text-align:right;margin-top:10px;">'
      + '<button class="msq-raw-btn" id="msq-shiire-close">閉じる</button></div>';
    box.innerHTML = h;
    document.body.appendChild(box);
    box.querySelector('#msq-shiire-close').addEventListener('click', () => box.remove());
    /* ★2026-09-08 PCの結果を見る（★grep用の目印: PCの結果） */
    {
      const pk = box.querySelector('#msq-pc-kekka');
      if (pk) pk.addEventListener('click', async () => {
        /* ★2026-09-08 直した。2026-09-01 に既に作ってある仕組みに合わせる。
             ・置き場所は【ホット辞書と同じGAS】（新しいGASは作らない）
             ・開き方は そのURL + ?mode=kekka（GASが画面を作って返す）
             ・PC側は結果ツール右下の「📱 スマホへ送る」で送る（既にある）
           ★私が同じ物を二重に作りかけたので、既存に戻した。
             元のファイル: リサーチ統合ツール/GAS_結果ツール_スマホ用_2026-09-01.js */
        let gas = '';
        try { gas = _hotDictUrl() || ''; } catch (e) { }
        if (!gas) { try { gas = localStorage.getItem('msq_kekka_gas') || ''; } catch (e) { } }
        if (!gas) {
          gas = await msqKiku('結果を置いてあるGASのURL（ホット辞書と同じURLです）');
          if (!gas) return;
          try { localStorage.setItem('msq_kekka_gas', String(gas).trim()); } catch (e) { }
        }
        const u = String(gas).trim() + (String(gas).indexOf('?') >= 0 ? '&' : '?') + 'mode=kekka';
        box.remove();
        /* 結果タブがあるアプリではそちらで開く。無ければこのまま開く。 */
        try {
          if (window.MSQAPP && window.MSQAPP.openKekka) { window.MSQAPP.openKekka(u); return; }
        } catch (e) { }
        location.href = u;
      });
    }
    /* ★2026-08-30 7サイトを自動で回す。売値と型番はメルカリ側から渡された物を使う。
       1つずつ押す形はそのまま残してあるので、今までの使い方は変わらない。 */
    {
      const gb = box.querySelector('#msq-gyaku-go');
      if (gb) gb.addEventListener("click", function () {
        try { rawGyakuLensStart(kotoba, uri, kata, burando, gazou, itemUrl); } catch (e) { alert("始められません: " + e.message); }
      });
    }
    const kk = box.querySelector('#msq-shiire-kirikae');
    if (kk) kk.addEventListener('click', () => { rawShiireZenbu = !rawShiireZenbu; box.remove(); rawShiirePanel(kotoba, uri, kata, burando, gazou, itemUrl); });
    box.querySelectorAll('[data-msq-shiire]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = RAW_SHIIRE[Number(b.getAttribute('data-msq-shiire'))];
        if (!s) return;
        /* 検索URLを持たないサイト（要ログイン等）は入口を開く */
        const url = (q && s[1]) ? (s[1] + encodeURIComponent(q) + (s[3] || '')) : s[2];
        /* ★2026-08-11 仕入元は【アプリの別タブ】で開く（ユーザー指示）。
           メルカリの一覧をそのまま残せるので、戻る操作も要らない。
           受け口が無い場所（ビルド前・PCのブラウザ等）では今までどおり同じ画面で開く。 */
        try {
          if (window.MsqApp && typeof window.MsqApp.openShiire === 'function') {
            window.MsqApp.openShiire(url);
            box.remove();
            return;
          }
        } catch (e) { }
        /* 同じ画面で開く時は、戻った時に一覧が並べ直されるようしまっておく */
        try { rawKeepSave(); } catch (e) { }
        location.href = url;
      });
    });
  }

  /* 検索条件を人が読める形にする。一覧に出すため。 */
  function rawLockLabel(k) {
    try {
      const p = new URLSearchParams(k);
      const kw = p.get('keyword') || '';
      const st = p.get('status') || '';
      const na = st === 'sold_out' ? '売り切れ' : (st === 'on_sale' ? '販売中' : '');
      return (kw || '(条件なし)') + (na ? '／' + na : '');
    } catch (e) { return k; }
  }

  /* 🔒の中身。今のページを残すかの切替と、残しているページの一覧。 */
  function rawLockPanel() {
    const old = document.getElementById('msq-raw-lockbox');
    if (old) { old.remove(); return; }          // もう一度押したら閉じる
    const box = document.createElement('div');
    box.id = 'msq-raw-lockbox';
    box.style.cssText = 'position:fixed;left:8px;right:8px;top:60px;z-index:2147483646;'
      + 'overflow:auto;background:#111;color:#fff;border:1px solid #555;'
      + 'border-radius:10px;padding:12px;font-size:13px;line-height:1.7;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.6);';
    /* ★2026-08-11 vh を使ってはいけない。このWebViewでは 70vh が 0px に解決され、
       高さ26pxに潰れて中身が読めなかった（実機で確認。中身228pxに対して26px）。
       画面の高さから px で出す。 */
    box.style.setProperty('max-height',
      Math.max(200, Math.round((window.innerHeight || 600) * 0.7)) + 'px', 'important');
    const here = rawPageKey();
    const locks = rawLoadLocks();
    const on = locks.indexOf(here) >= 0;
    let h = '<div style="font-weight:700;margin-bottom:6px;">残すページ（消したを自動で戻さない）</div>'
      + '<div style="opacity:.7;margin-bottom:10px;">✕で消した物は ' + RAW_HIDE_DAYS
      + '日で自動的に戻ります。ここに入れたページで消した物は戻りません。</div>'
      + '<button class="msq-raw-btn" id="msq-raw-lock-now">'
      + (on ? '★このページを残すのをやめる' : '☆このページを残す') + '</button>'
      + '<div style="margin-top:12px;font-weight:700;">残しているページ ' + locks.length + '件</div>';
    if (!locks.length) h += '<div style="opacity:.6;">まだありません</div>';
    for (let i = 0; i < locks.length; i++) {
      h += '<div style="display:flex;gap:6px;align-items:center;border-top:1px solid #333;padding:6px 0;">'
        + '<span style="flex:1;word-break:break-all;">' + rawEsc(rawLockLabel(locks[i])) + '</span>'
        + '<button class="msq-raw-btn" data-msq-open="' + i + '">開く</button>'
        + '<button class="msq-raw-btn" data-msq-off="' + i + '">解除</button></div>';
    }
    h += '<div style="text-align:right;margin-top:10px;">'
      + '<button class="msq-raw-btn" id="msq-raw-lock-close">閉じる</button></div>';
    box.innerHTML = h;
    document.body.appendChild(box);

    box.querySelector('#msq-raw-lock-close').addEventListener('click', () => box.remove());
    box.querySelector('#msq-raw-lock-now').addEventListener('click', () => {
      const a = rawLoadLocks();
      const i = a.indexOf(here);
      if (i >= 0) a.splice(i, 1); else a.push(here);
      rawSaveLocks(a);
      box.remove(); rawLockPanel(); rawLockMark();
    });
    box.querySelectorAll('[data-msq-off]').forEach((b) => {
      b.addEventListener('click', () => {
        const a = rawLoadLocks();
        a.splice(Number(b.getAttribute('data-msq-off')), 1);
        rawSaveLocks(a);
        box.remove(); rawLockPanel(); rawLockMark();
      });
    });
    box.querySelectorAll('[data-msq-open]').forEach((b) => {
      b.addEventListener('click', () => {
        const a = rawLoadLocks();
        const k = a[Number(b.getAttribute('data-msq-open'))];
        if (k) location.href = '/search' + k;
      });
    });
  }

  /* 帯の🔒に、今のページが残す指定かどうかを出す。 */
  function rawLockMark() {
    const b = document.getElementById('msq-raw-lock');
    if (!b) return;
    /* ★文字は付けない。「🔒残す」にしたら帯が2段になり、版の札が次の行へ落ちた
       （実機で確認。30px→52px）。掛かっているかは鍵の絵で分かる。 */
    b.textContent = rawLoadLocks().indexOf(rawPageKey()) >= 0 ? '🔒' : '🔓';
  }

  /* ===== スクロール時だけ 2段目の固定を作る（2026-08-12・ユーザー指示） =====
     「スクロール時は会員登録・ログインを非表示。固定はmercariの段の下。
       新しい順/売り切れのみ/絞り込み と その下のタグ行(新品未使用〜)を
       まとめて2個目の固定にすれば済む」。
     ★素（上に居る時）は一切触らない。スクロール中だけ。
     ★メルカリのヘッダの【位置】は動かさない（動かすと固定計算が壊れる）。
       隠すのは会員登録・ログインの段だけ。虫眼鏡の段は絶対に触らない。 */
  function rawFutatsume(deru) {
    const hd = document.querySelector('header');
    if (!hd) return;

    /* ① 会員登録・ログインの段（虫眼鏡が入っている段は除く） */
    let dan = null;
    for (let i = 0; i < hd.children.length; i++) {
      const t = (hd.children[i].textContent || '');
      if (t.indexOf('会員登録') < 0 && t.indexOf('ログイン') < 0) continue;
      /* ★2026-08-12 ここが効かず、虫眼鏡の入った段ごと隠していた（実機で指摘）。
         実測: ヘッダの高さが 上にいる時94px → 送ると57px。37px の段が消え、
         検索の要素はすべて高さ0になっていた。
         aria-label が「検索」ちょうどの物だけを見ていたのが原因。
         ★決め事「虫眼鏡の段は絶対に隠さない」を確実に守るため、
           検索に関わる物が1つでも入っている段は隠さない。 */
      if (hd.children[i].querySelector(
        '[aria-label*="検索"],[aria-label*="search"],[aria-label*="Search"],'
        + 'input,form,a[href*="/search"],[data-testid*="search"]')) continue;
      dan = hd.children[i]; break;
    }

    /* ② 絞り込みの行とタグ行の【両方】を含む一番小さい箱を探す */
    let jotai = rawJotaiEl(), tagu = null;
    document.querySelectorAll('button').forEach((b) => {
      const t = (b.textContent || '').trim();
      if (!tagu && t.length > 0 && t.length <= 8
        && ['レディース', 'メンズ', '新品、未使用', '夏', '半袖'].indexOf(t) >= 0) tagu = b;
    });

    if (!deru) {
      if (dan && dan.dataset && dan.dataset.msqLogin) { dan.style.removeProperty('display'); delete dan.dataset.msqLogin; }
      /* ★2026-09-09 ここは2026-08-12から一度も動いていなかった。
           印は dataset.msq2dan ＝ 属性名は data-msq2dan（ハイフンは入らない）。
           それを [data-msq-2dan] で探していたので【1つも一致せず】、
           上に戻しても貼り付きが永久に剥がれなかった（実機で印2個が残るのを確認）。
         ★margin/padding も必ず一緒に戻すこと。position だけ戻して印を消すと、
           次のスクロールで haru が「負のマージンが効いたままの位置」から測り直し、
           -123px → -235px と積み上がる（前担当が踏んだ「どんどん壊れる」の正体）。
         ★grep用の目印: 印は data-msq2dan */
      document.querySelectorAll('[data-msq2dan]').forEach((e) => {
        ['position', 'top', 'z-index', 'background',
          'margin-left', 'margin-right', 'padding-left', 'padding-right'
        ].forEach((q) => { try { e.style.removeProperty(q); } catch (err) { } });
        try { delete e.dataset.msq2dan; } catch (err) { }
      });
      return;
    }

    if (dan) { dan.style.setProperty('display', 'none', 'important'); dan.dataset.msqLogin = '1'; }

    if (!jotai || !tagu) return;

    /* ★2026-08-12 共通の親を探すやり方は失敗した。見出しを含む巨大な箱まで上がり、
       安全装置で打ち切られて何も付かなかった（実機で「印が付いていない」を確認）。
       ★2つの行を【別々に】貼り、mercariの段の下端から順に積む。 */
    /* ★2026-09-09 実機で確定した不具合の直し（DURBANのコートで崩れた真因）
         「高さ500pxを超える親＝商品一覧の柱」という物差しで【行】を探しているが、
         商品が1件しか出ない検索では柱そのものが 479px しかなく（実測）、
         8段上がっても500px超の親が1つも無い。そこで元は return el と書いてあり、
         【行ではなく部品1個】（状態の箱 369x33／「新品、未使用」の札1個）を返していた。
         その部品が haru で画面幅いっぱいに引き伸ばされ（margin-left -123px・
         背景 rgb(34,34,34) 不透明・z-index 1100）、左の「新しい順」と
         右の「絞り込み(3)」を上から塗り潰していた（elementFromPoint で確認済み）。
       ★直し: 見つからなければ null を返して【何もしない】。haru は !el で 0 を返す。
         500px超の親が見つかる普通のページはこの行を一度も通らない＝挙動は無変更。
       ★grep用の目印: 500pxの物差し */
    /* ★2026-09-09 ここは R145（実機で商品が多いページが正しく動いている版）から
         【1文字も変えない】。ユーザー指示「1件なのに複数を触るな。そこは触ったら壊す」。
         商品が少ないページで固定できない件は、この関数ではなく
         【自前の行】側で受ける（★grep: 帯の下に自前の行）。
       ★grep用の目印: 500pxの物差し */
    const noboru = (el) => {
      let n = el;
      for (let i = 0; i < 8 && n && n.parentElement; i++) {
        if (n.parentElement.getBoundingClientRect().height > 500) return n;
        n = n.parentElement;
      }
      return null;                     /* 見つからなければ何もしない（部品1個を掴まない） */
    };
    const haikei = (el) => {
      let n = el;
      for (let i = 0; i < 6 && n; i++, n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
      return getComputedStyle(document.body).backgroundColor || '#fff';
    };
    const haru = (el, ue2) => {
      if (!el) return 0;
      if (!(el.dataset && el.dataset.msq2dan)) {
        el.style.setProperty('background', haikei(el), 'important');
        const hidari = Math.round(el.getBoundingClientRect().left);
        if (hidari > 0) {
          el.style.setProperty('margin-left', '-' + hidari + 'px', 'important');
          el.style.setProperty('margin-right', '-' + hidari + 'px', 'important');
          el.style.setProperty('padding-left', hidari + 'px', 'important');
          el.style.setProperty('padding-right', hidari + 'px', 'important');
        }
        el.dataset.msq2dan = '1';
      }
      el.style.setProperty('position', 'sticky', 'important');
      el.style.setProperty('top', ue2 + 'px', 'important');
      el.style.setProperty('z-index', '1100', 'important');
      return Math.round(el.getBoundingClientRect().height);
    };

    /* mercariの段（虫眼鏡が入っている段）の下端が基準 */
    let logo = null;
    for (let i = 0; i < hd.children.length; i++) {
      if (hd.children[i].querySelector('[aria-label="検索"]')) { logo = hd.children[i]; break; }
    }
    /* ★2026-09-09 ここに「帯の下端を基準にする」を入れて【点滅を起こした】。取り消し済み。
         rawPushDown は元々【帯を絞り込み行の真下に置く】作りになっている（2026-08-16の直し）。
         そこへ「行を帯の下端に貼る」を足したので、
             行は帯の下に付く → 帯は行の下に付く → 行は帯の下に…
         の堂々巡りになり、実測で 帯 top が 152 ⇄ 56 を0.7秒ごとに往復した（＝点滅）。
       ★基準は【mercariの段の下端】のまま。ここは二度と帯を見てはいけない。
       ★grep用の目印: 帯を見るな */
    const kijun = Math.round((logo || hd).getBoundingClientRect().bottom);
    const h1 = haru(noboru(jotai), kijun);
    haru(noboru(tagu), kijun + h1);
  }

  /* ===== スクロール中に【自分の帯の下へ】並び替え・状態・絞り込みを出す =====
     （2026-09-09 ユーザー提案「独自メニューの下に絞り込みと並び替えを
       スクロールしてないときと同じように追加する形で直るのでは？」）

     ■ なぜ今までスクロールすると消えたのか（実機で測って確定。もう調べ直すな）
       ・こちらの帯 #msq-raw-bar は position:fixed / top:56px / 高さ51 / z-index 21億。
         ＝ 画面の 56〜107px を必ず占有する。
       ・rawFutatsume（2段固定）は mercariの段の下端＝56px を基準に
         絞り込みの行を top:56、タグ行を top:89 に貼り付ける（z-index 1100）。
       ＝ 貼り付け先が【帯の真下ではなく帯と同じ場所】。必ず帯の裏に入る。
         だから「スクロールすると絞り込みと並び替えが消える」。
         2段固定を何度直しても直らなかったのはこれが理由で、
         メルカリ側のせいでも sticky のせいでもない。

     ■ どう直したか
       メルカリのDOMには一切触らず、【自分の要素を1つ足すだけ】。
       帯の下端（実測107px）に自前の行を出し、中身は本物と同じ3つ:
         並び替えのselect ／ 状態のselect ／ 絞り込みのボタン。
       押した時は【本物を操作する】（selectは土台のsetterで値を入れてchangeを出す。
       絞り込みは本物のBUTTONを click する。DIVを押しても効かない＝実機で確認済み）。

     ■ 決め事
       ・本物は毎回探し直す（Reactは要素を作り直すので覚えてはいけない）
       ・絞り込みの本体は BUTTON か A。外側のDIVを押しても何も起きない（実機で確認）
       ・止めたい時は localStorage の msq_gyou = '0'
     ★grep用の目印: 帯の下に自前の行
     ========================================================================== */
  function rawJimaeGyouEls() {
    let sort = null, jotai = null, shibori = null;
    document.querySelectorAll('select').forEach((s) => {
      const t = (s.textContent || '');
      if (!sort && t.indexOf('おすすめ順') >= 0) sort = s;
      if (!jotai && t.indexOf('全ての商品') >= 0) jotai = s;
    });
    document.querySelectorAll('button,a').forEach((e) => {
      const t = (e.textContent || '').trim();
      if (!shibori && t.indexOf('絞り込み') === 0 && t.length <= 14) shibori = e;
    });
    return { sort: sort, jotai: jotai, shibori: shibori };
  }

  function rawJimaeGyou(deru) {
    const ID = 'msq-shibori-gyou';
    /* ★2026-09-09（3回目）既定は【出さない】に戻した。
         ユーザー「何のためにコピーを作る必要があるんだ」→ そのとおりで、コピーは不要。
         本物を帯の下に浮かせる rawUkasu に一本化した（★grep: 本物を浮かせる）。
         コピーは「本物を浮かせられない時」のための予備として残すだけ。
       ★出したい時だけ localStorage msq_gyou='1' */
    try { if (localStorage.getItem('msq_gyou') !== '1') { const x = document.getElementById(ID); if (x) x.remove(); return; } } catch (e) { }
    let g = document.getElementById(ID);
    if (!deru || !rawOnSearch()) { if (g) g.style.display = 'none'; return; }

    const h = rawJimaeGyouEls();
    if (!h.sort && !h.jotai && !h.shibori) { if (g) g.style.display = 'none'; return; }

    /* 帯の下端＝ここより上は帯に隠れる。本物がその下に見えているなら出さない */
    let kabe = 56;
    try {
      const obi = document.getElementById('msq-raw-bar');
      if (obi) { const orr = obi.getBoundingClientRect(); if (orr.height > 0) kabe = Math.round(orr.bottom); }
    } catch (e) { }
    const moto = h.shibori || h.jotai || h.sort;
    try {
      const mr = moto.getBoundingClientRect();
      if (mr.bottom > kabe + 2 && mr.top < window.innerHeight) {
        if (g) g.style.display = 'none';         /* 本物が見えている＝出す必要が無い */
        return;
      }
    } catch (e) { }
    /* 本物の中身が変わったら作り直す（並び替えを変えた後など） */
    const ima = (h.sort ? h.sort.value : '') + '|' + (h.jotai ? h.jotai.value : '')
      + '|' + (h.shibori ? (h.shibori.textContent || '').trim() : '');

    if (!g || g.dataset.moto !== ima) {
      if (g) g.remove();
      g = document.createElement('div');
      g.id = ID;
      g.dataset.moto = ima;
      /* ★2026-09-09 実機の写真で「絞り込み (3)」が右端で切れていた。
           横並び(flex)＋余白だと 100+123+127＋余白 が画面幅389を超えるため。
         ＝【本物と同じ x 座標に置く】。並びも幅も本物のまま写る。
         ★grep用の目印: 帯の下に自前の行 */
      g.style.cssText = 'position:fixed;left:0;width:100%;height:41px;'
        + 'display:none;box-sizing:border-box;'
        + 'background:#222;z-index:2147482999;';

      /* Reactのselectは素直にvalueを入れても効かない事がある。土台のsetterを使う */
      const erabu = (sel, atai) => {
        try {
          const d = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
          if (d && d.set) d.set.call(sel, atai); else sel.value = atai;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) { }
      };
      /* ★2026-09-09 ユーザー指摘「種類が違うじゃん」
           自前で色や枠を決めると本物と別物に見える。＝【本物の見た目を写す】。
           getComputedStyle から色・枠・丸み・字の大きさ・高さをそのまま持ってくる。
         ★grep用の目印: 帯の下に自前の行 */
      const utsusu = (kara, e) => {
        try {
          const s = getComputedStyle(kara);
          ['color', 'background-color', 'border-top-width', 'border-top-style', 'border-top-color',
            'border-right-width', 'border-right-style', 'border-right-color',
            'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
            'border-radius', 'font-size', 'font-weight', 'font-family',
            'border-left-width', 'border-left-style', 'border-left-color',
            'padding-left', 'padding-right', 'line-height'].forEach((p) => {
              try { e.style.setProperty(p, s.getPropertyValue(p)); } catch (err) { }
            });
          /* ★2026-09-09 幅も本物から写す。写さないと flex に潰されて
             「絞り込み(3)」が縦書きになった（実機の写真で確認）。★grep: 帯の下に自前の行 */
          /* ★2026-09-09 ユーザー指摘「右にずれてる」「↑↓ なんだこれ」
               横並び(flex)＋余白では 100+123+127＋余白 が画面幅389を超えて右へ押し出され、
               「絞り込み (3)」が切れていた。＝【本物と同じ x 座標にそのまま置く】。
             ★grep用の目印: 帯の下に自前の行 */
          const r = kara.getBoundingClientRect();
          if (r.width > 0) e.style.setProperty('width', Math.round(r.width) + 'px');
          if (r.height > 0) e.style.setProperty('height', Math.round(r.height) + 'px');
          e.style.setProperty('box-sizing', 'border-box');
          e.style.setProperty('position', 'absolute');
          e.style.setProperty('left', Math.round(r.left) + 'px');
          e.style.setProperty('top', Math.max(0, Math.round((41 - r.height) / 2)) + 'px');
          e.style.setProperty('white-space', 'nowrap');
          e.style.setProperty('overflow', 'hidden');
        } catch (e2) { }
      };
      const tsukuru = (moto, dore) => {
        const s = document.createElement('select');
        Array.prototype.forEach.call(moto.options, (o) => {
          const x = document.createElement('option');
          x.value = o.value; x.textContent = o.textContent; s.appendChild(x);
        });
        s.value = moto.value;
        utsusu(moto, s);
        /* ★2026-09-09 素の select は【矢印が幅を食って文字が切れる】（実機の写真で確認）。
             本物の矢印は外側の箱が描いているので、こちらは矢印を出さずに文字を全部見せる。
           ★grep用の目印: 帯の下に自前の行 */
        s.style.setProperty('-webkit-appearance', 'none');
        s.style.setProperty('appearance', 'none');
        /* ★2026-09-09 ユーザー指摘「右によったまま」。
             本物の select には【左の絵(↑↓)のぶんの余白】が入っており、それを写すと
             絵が無いこちらは文字だけ右にずれて見える。＝余白は写さず詰める。 */
        s.style.setProperty('padding-left', '6px');
        s.style.setProperty('padding-right', '2px');
        s.style.setProperty('text-align', 'left');

        s.addEventListener('change', () => {
          const now = rawJimaeGyouEls();
          const mato = (dore === 'sort') ? now.sort : now.jotai;
          if (mato) erabu(mato, s.value);
        });
        return s;
      };

      /* ★「↑↓」は足さない（ユーザー指摘「↑↓ なんだこれ」）。本物の並びをそのまま写すだけ */
      if (h.sort) { const a = tsukuru(h.sort, 'sort'); a.id = 'msq-gyou-sort'; g.appendChild(a); }
      if (h.jotai) { const b = tsukuru(h.jotai, 'jotai'); b.id = 'msq-gyou-jotai'; g.appendChild(b); }
      if (h.shibori) {
        const c = document.createElement('button');
        c.id = 'msq-gyou-shibori';
        /* 中身（絵＋文字）は本物をそのまま複製する。見た目も本物から写す */
        try { c.innerHTML = h.shibori.innerHTML; } catch (e) { c.textContent = (h.shibori.textContent || '絞り込み').trim(); }
        c.style.cssText = 'background:transparent;cursor:pointer;';
        utsusu(h.shibori, c);
        c.addEventListener('click', () => {
          const now = rawJimaeGyouEls();
          if (now.shibori) now.shibori.click();
        });
        g.appendChild(c);
      }
      /* ★Reactの木の中に入れない（一覧の組み直しが壊れる。速い一覧で実証済み） */
      document.documentElement.appendChild(g);
    }

    /* 帯の高さは出たり隠れたりするので毎回測り直す（高さ0の時は前の値を使う） */
    try {
      const o = document.getElementById('msq-raw-bar');
      if (o) {
        const r = o.getBoundingClientRect();
        if (r.height > 0) g.style.top = Math.round(r.bottom) + 'px';
        else if (!g.style.top) g.style.top = '107px';
      } else if (!g.style.top) g.style.top = '56px';
    } catch (e) { }
    g.style.display = 'flex';
  }

  /* ★2026-09-09 浮かせる対象と控えを持つ変数（作り直しの時に消してしまい、入れ直した） */
  let rawKabeMae = 56;          /* 帯の下端の直近の値（高さ0の瞬間に使う） */
  let rawUkaseta = null;        /* いま見た目をずらしている本物の行 */
  let rawUkaseHako = null;      /* 古い版が入れていた空箱（見つけたら片付ける） */

  /* 絞り込みと並び替えの【両方】が入っている一番小さい箱＝その行を探す。
     ★毎回探し直す（Reactは要素を作り直すので覚えてはいけない）
     ★行より大きい箱（商品まで含む箱）を掴んだら何もしない
     ★grep用の目印: 本物を浮かせる */
  function rawUkasuGyouEl() {
    const h = rawJimaeGyouEls();
    if (!h.shibori) return null;
    const mato = h.sort || h.jotai;
    let n = h.shibori;
    for (let i = 0; i < 8 && n && n.parentElement; i++) {
      n = n.parentElement;
      if (!mato || n.contains(mato)) {
        if (n.getBoundingClientRect().height > 120) return null;
        return n;
      }
    }
    return null;
  }

  /* ★2026-09-09 3回目の作り直し。ユーザー指摘
       「動きがぎこちない」「後出しみたいに絞り込みが出る」「安定しない」
     ■ 前のやり方の何が悪かったか（実測）
       position:fixed にして元の場所へ空箱を入れる作りだった。
       これは【レイアウトを触る】ので、浮かせる／戻すのたびに画面が跳ねた。
       実測（狙った位置→実際に止まった位置）: 40→113 ／ 60→143 ／ 80→81 ／ 100→0
       さらに「隠れてから浮かせる」ので、一瞬消えてから出る＝後出しに見えていた。
     ■ 今のやり方
       行は【元の場所に置いたまま】、見た目だけ下へずらす（transform）。
       transform も position:relative も box-shadow も【レイアウトを1pxも動かさない】。
       ＝ 跳ねない・空箱が要らない・消えてから出るのではなく、そのまま帯の下に留まる。
       左右16pxは box-shadow を左右に出して塗る（これもレイアウトに影響しない）。
     ■ 決め事
       ・素の位置が帯より下なら何もしない（普通のページはこちら）
       ・元の style は丸ごと控えて、戻す時にそのまま書き戻す
       ・止めたい時は localStorage の msq_ukasu = '0'
     ★grep用の目印: 本物を浮かせる */
  function rawUkasu(deru) {
    const modosu = () => {
      if (rawUkaseta) {
        try {
          const moto = rawUkaseta.dataset.msqUkasuMoto;
          if (moto === '') rawUkaseta.removeAttribute('style');
          else if (moto != null) rawUkaseta.setAttribute('style', moto);
          delete rawUkaseta.dataset.msqUkasuMoto;
        } catch (e) { }
        rawUkaseta = null;
      }
      /* 古い版が入れた空箱が残っていたら片付ける */
      if (rawUkaseHako) { try { rawUkaseHako.remove(); } catch (e) { } rawUkaseHako = null; }
      try { document.querySelectorAll('[data-msq-ukase]').forEach((e) => e.remove()); } catch (e) { }
    };
    try { if (localStorage.getItem('msq_ukasu') === '0') { modosu(); return; } } catch (e) { }
    if (!deru || !rawOnSearch()) { modosu(); return; }

    const gyou = rawUkaseta || rawUkasuGyouEl();
    if (!gyou) { modosu(); return; }

    /* 帯の下端（ここより上は帯に隠れる）
       ★2026-09-09 帯は出る／引っ込むの境目で高さが0になる瞬間がある。
         その瞬間だけ基準が 56 に戻って、行が帯の裏へ一瞬入っていた（実測 scrollY=60）。
         ＝【前に測れた値を覚えておき、高さ0の間はそれを使う】。 */
    let kabe = 56;
    try {
      const o = document.getElementById('msq-raw-bar');
      if (o) {
        const r0 = o.getBoundingClientRect();
        if (r0.height > 0) { kabe = Math.round(r0.bottom); rawKabeMae = kabe; }
        else if (rawKabeMae > kabe) kabe = rawKabeMae;
      }
    } catch (e) { }

    /* 素の位置を測る。ずらしを一旦外して測るが、同じ処理の中なので画面には出ない */
    const motoStyle = gyou.getAttribute('style') || '';
    try { gyou.style.setProperty('transform', 'none', 'important'); } catch (e) { }
    const r = gyou.getBoundingClientRect();
    const nt = Math.round(r.top);
    const takasa = Math.round(r.height);
    /* ★2026-09-09 ユーザー指摘「複数の一覧でもまた絞り込みが出なくなってる」
         「分離してる」「裏の字が見えてる（新しい順の上）」
       ■ 何が悪かったか
         「帯の下端より上なら下げる」にしていたので、商品が多いページでも下げていた。
         多いページでは行は既に 56〜101 に貼り付いていて【帯(101〜152)より上で見えている】。
         それを更に51px下げるので、行が二重の位置に見えて隙間や裏の字が出ていた。
       ■ 直し: 【本当に帯と重なっている時】か【画面の上へ流れ去った時】だけ下げる。
         多いページ（行 56〜101 ／ 帯 101〜152）は重ならないので何もしない。
       ★grep用の目印: 本物を浮かせる */
    let obiUe = 0, obiShita = 0;
    try {
      const o2 = document.getElementById('msq-raw-bar');
      if (o2) { const r2 = o2.getBoundingClientRect();
        if (r2.height > 0) { obiUe = Math.round(r2.top); obiShita = Math.round(r2.bottom); } }
    } catch (e) { }
    /* ★2026-09-09 メルカリのヘッダ（sticky・0〜56）に隠れる場合を数えていなかった。
         実測: 商品が多いページの scrollY=60 で行が y=32（ヘッダの裏）に入り消えていた。 */
    let atamaShita = 0;
    try {
      const hd2 = document.querySelector('header');
      if (hd2) { const r3 = hd2.getBoundingClientRect();
        if (r3.height > 0 && r3.top <= 0) atamaShita = Math.round(r3.bottom); }
    } catch (e) { }
    if (atamaShita > kabe) kabe = atamaShita;
    const kasanaru = (nt < atamaShita)                          /* ヘッダの裏 */
      || (nt < obiShita && nt + takasa > obiUe);                /* 帯と重なっている */
    const nagareta = (nt + takasa <= 0);                        /* 画面の上へ出た */
    const zure = kabe - nt;
    if ((!kasanaru && !nagareta) || zure <= 0) {
      if (rawUkaseta) modosu();
      else { try { gyou.style.removeProperty('transform'); } catch (e) { } }
      return;                                   /* 素のままで見えている＝何もしない */
    }

    let iro = '';
    try {
      for (let n2 = gyou, i = 0; n2 && i < 6; n2 = n2.parentElement, i++) {
        const c = getComputedStyle(n2).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { iro = c; break; }
      }
    } catch (e) { }
    if (!iro) iro = '#222';
    const yoko = Math.max(0, Math.round(r.left));
    if (!rawUkaseta) gyou.dataset.msqUkasuMoto = motoStyle;
    gyou.style.setProperty('position', 'relative', 'important');
    gyou.style.setProperty('z-index', '2147482999', 'important');
    gyou.style.setProperty('background', iro, 'important');
    gyou.style.setProperty('box-shadow',
      '-' + yoko + 'px 0 0 0 ' + iro + ', ' + yoko + 'px 0 0 0 ' + iro, 'important');
    gyou.style.setProperty('transform', 'translateY(' + zure + 'px)', 'important');
    rawUkaseta = gyou;
  }

  /* ===== 下メニューの先頭に「仕入」を足す（2026-08-12・ユーザー指示） =====
     ★実機の現在の構造は <NAV><UL><LI><A>…</A></LI>…</UL>。
       以前の実装は nav.children[0]（4項目入りUL）を複製していたため、
       仕入1個ではなく4個ぶんを複製し、4+4の2段になっていた。
     ★既存ULの中へ1個のLIだけを足し、5列を明示する。
     ★DOMが変わった時に再び崩さないため、追加後に「5個・1段」を検査し、
       条件を満たせない場合は追加を取り消して純正メニューを残す。 */
  function rawShitaMenu() {
    const kotoba = ['ホーム', 'お知らせ', '出品', 'マイページ'];
    let nav = null;
    const all = document.querySelectorAll('nav');
    for (let i = 0; i < all.length; i++) {
      const t = all[i].textContent || '';
      let zen = true;
      for (let k = 0; k < kotoba.length; k++) { if (t.indexOf(kotoba[k]) < 0) { zen = false; break; } }
      if (!zen) continue;
      const r = all[i].getBoundingClientRect();
      if (r.height <= 0 || r.height > 140) continue;
      nav = all[i]; break;
    }
    if (!nav) return;

    /* 現在の純正UL（4つのLIを持ち、4語を含む物）を選ぶ。
       旧版が残っている場合は、旧マーカー付きULを先に取り除く。 */
    const lists = Array.from(nav.children).filter((e) =>
      e && (e.tagName === 'UL' || e.tagName === 'OL'));
    const base = lists.find((e) => {
      const items = Array.from(e.children).filter((c) => c.tagName === 'LI');
      const t = e.textContent || '';
      return items.length === 4 && kotoba.every((w) => t.indexOf(w) >= 0);
    });
    if (!base) return;
    const old = nav.querySelector('#msq-shita-btn');
    if (old && old !== base) {
      try { old.remove(); } catch (e) { return; }
    }
    const items = Array.from(base.children).filter((e) => e.tagName === 'LI');
    if (items.length !== 4) return;
    const moto = items.find((e) => (e.textContent || '').indexOf('ホーム') >= 0) || items[0];
    /* ホーム項目を複製するため、純正のアクティブ状態（塗りつぶし）を
       非ホーム画面へ持ち込まない。ホーム画面だけは純正表示へ戻す。 */
    const homeSvg = moto.querySelector('svg');
    if (homeSvg) {
      const searchScreen = typeof rawTopSearchScreenActive === 'function'
        && rawTopSearchScreenActive();
      /* ユーザー確認済みデモに合わせ、家も仕入れも常時白抜きにする。 */
      const outlineHome = true;
      const attrs = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'];
      if (outlineHome) {
        if (!homeSvg.dataset.msqHomeIconOutline) {
          attrs.forEach((name) => {
            const key = 'msqHomeIcon_' + name.replace(/-/g, '_');
            const value = homeSvg.getAttribute(name);
            homeSvg.dataset[key] = value === null ? '__none__' : value;
          });
          homeSvg.dataset.msqHomeIconOutline = '1';
        }
        homeSvg.setAttribute('fill', 'none');
        homeSvg.setAttribute('stroke', 'currentColor');
        homeSvg.setAttribute('stroke-width', '1.8');
        homeSvg.setAttribute('stroke-linecap', 'round');
        homeSvg.setAttribute('stroke-linejoin', 'round');
      } else if (homeSvg.dataset.msqHomeIconOutline) {
        attrs.forEach((name) => {
          const key = 'msqHomeIcon_' + name.replace(/-/g, '_');
          const value = homeSvg.dataset[key];
          if (value === '__none__' || value === undefined) homeSvg.removeAttribute(name);
          else homeSvg.setAttribute(name, value);
          delete homeSvg.dataset[key];
        });
        delete homeSvg.dataset.msqHomeIconOutline;
      }
    }
    const b = moto.cloneNode(true);
    b.id = 'msq-shita-btn';
    try { b.removeAttribute('aria-current'); b.removeAttribute('aria-selected'); } catch (e) { }
    const svg = b.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = '<path d="M6 7V6a6 6 0 0 1 12 0v1h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3zm2 0h8V6a4 4 0 0 0-8 0v1z"></path>';
    }
    const moji = [];
    const aruku = (el) => {
      for (let i = 0; i < el.childNodes.length; i++) {
        const c = el.childNodes[i];
        if (c.nodeType === 3 && (c.nodeValue || '').trim()) moji.push(c);
        else if (c.nodeType === 1) aruku(c);
      }
    };
    aruku(b);
    if (moji.length) { moji[0].nodeValue = '仕入'; for (let i = 1; i < moji.length; i++) moji[i].nodeValue = ''; }
    else { b.appendChild(document.createTextNode('仕入')); }
    b.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      try { rawShiirePanel(''); } catch (e) { }
    }, true);
    base.insertBefore(b, base.firstChild);
    try {
      base.style.setProperty('grid-template-columns', 'repeat(5,minmax(0,1fr))', 'important');
      base.style.setProperty('grid-template-rows', '1fr', 'important');
      base.style.setProperty('grid-auto-flow', 'column', 'important');
      base.dataset.msqNav = '1';

      /* 5個が同じ行に収まらない環境では、追加を残して崩さない。 */
      const made = Array.from(base.children).filter((e) => e.tagName === 'LI');
      const ys = made.map((e) => Math.round(e.getBoundingClientRect().top));
      const oneRow = made.length === 5 && new Set(ys).size === 1;
      if (!oneRow) {
        b.remove();
        ['grid-template-columns', 'grid-template-rows', 'grid-auto-flow'].forEach((p) => {
          try { base.style.removeProperty(p); } catch (e) { }
        });
        delete base.dataset.msqNav;
      }
    } catch (e) { }
  }

  /* ===== Reactの内部データから 売れた日数・サイズ を読む（2026-08-12） =====
     ★実機で確認: 出品日(created)/売れた日(updated)/サイズ(itemSize) はHTMLに無く、
       タイルのリンクから __reactFiber$… を約12段遡った props.item にある。
       本文(description)と型番は一覧には無い（attributes は空配列）。 */
  /* ★組み直したタイルには React が付いていない（HTMLではなくデータから作るため）。
     rawBuildTile が持たせた印から読む。これが無いと「◯日で売れた」が出ないだけでなく、
     rawDecorate の飛ばす条件が永久に揃わず、2秒ごとに全タイルを調べ直して重くなる。 */
  function rawShirushiData(a) {
    let e = a;
    for (let i = 0; i < 8 && e; i++) {
      if (e.getAttribute && e.getAttribute('data-msq-c')) {
        const o = {
          created: e.getAttribute('data-msq-c'),
          updated: e.getAttribute('data-msq-w') || e.getAttribute('data-msq-c'),
          status: 'ITEM_STATUS_SOLD_OUT'
        };
        /* ★サイズが無い時は itemSize を作らないこと。空で作ると rawUriKaku の
           (m.itemSize.name || m.itemSize) が物そのものを拾い、画面に
           「53日で売れた (8/12) ・ [object Object]」と出る（焼く前に実機で確認して修正）。 */
        const z = e.getAttribute('data-msq-z') || '';
        if (z) o.itemSize = { name: z };
        /* ★2026-08-27 値段。これが無いと高い順・安い順が効かない。 */
        const p = e.getAttribute('data-msq-p') || '';
        if (p) o.price = p;
        return o;
      }
      e = e.parentElement;
    }
    return null;
  }

  function rawItemData(a) {
    try {
      let kagi = null;
      for (const k in a) { if (k.indexOf('__reactFiber') === 0) { kagi = k; break; } }
      if (!kagi) return rawShirushiData(a);
      let n = a[kagi];
      for (let d = 0; d < 25 && n; d++) {
        const props = n.memoizedProps || n.pendingProps;
        if (props) {
          for (const q in props) {
            const v = props[q];
            if (v && typeof v === 'object' && !Array.isArray(v)
              && (('updated' in v) || ('created' in v))) return v;
          }
        }
        n = n.return;
      }
    } catch (e) { }
    return rawShirushiData(a);
  }

  /* ===== 型番をタイトルから拾う（2026-08-12 ユーザー依頼） =====
     ★ユーザーの言うとおり本文には型番が書かれていることが多いが、【本文は一覧に無い】。
       props.item の全27項目を実機で出して確認済み（description が存在しない）。
       本文を取るには商品を1件ずつ開く必要があり、1件およそ3秒かかる。
       いま取れるのはタイトル(name)だけなので、そこから拾う。
     ★規則は自分で作らない。拡張機能の msq_core.js にある
       MSQCore.extractModelCodes と、それが使う3つの判定を【1行も変えずに】写した。
       過去に写し落として長時間潰しているため、書き換えないこと。 */
   RAW_SIZE_LIKE = /^(XS|S|M|L|XL|XXL|F|FREE|フリー|[0-9]{1,3}(cm|号)?)$/i;
   RAW_ERA_LIKE = /^(?:\d{2}s|(?:19|20)\d{2}|\d{2,4}年代?|[’']\d{2}s?|vintage|ヴィンテージ|ビンテージ|\d{2,4}(?:[-_/ ]?\d{2,4})?[-_ /]?(?:SS|AW|FW|HS|PF|PS))$/i;
   RAW_COLOR_LIKE = /^(SLV|BLK|WHT|GLD|BLU|GRN|RED|PNK|BRN|GRY|GRAY|NVY|BEG|ORG|PPL|IVR|CML|KHK|YEL|TAN|WINE|BOR|MULTI|CLR|SMK|GRD|MIR|PLD|MOC|CHR|OFF|NAT|MEN|WOMEN|UNISEX|メンズ|レディース|ユニセックス|キッズ|ブラック|ホワイト|シルバー|ゴールド|ブルー|グリーン|レッド|ピンク|ブラウン|グレー|ネイビー|ベージュ|オレンジ|パープル|イエロー|カーキ|スモーク|ミラー|マルチ|クリア)$/i;

  function rawModelCodes(title) {
    const out = [];
    /* ★装飾記号を区切りに入れる。メルカリのタイトルは ★☆■●◆▲▼※＊ で区切る出品が多い。
       これが無いと『稼働品』グッチ★5500L★デイト… が1語になり型番を1つも拾えない。 */
    const parts = String(title || '')
      .split(/[\s　\/,、・()（）\[\]【】｜|★☆■□●○◆◇▲△▼▽※＊*＞＞>＜<〜~]+/);
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i].replace(/^[-–—]+|[-–—]+$/g, '').trim();
      if (!t || t.length < 4 || t.length > 24) continue;
      if (!/\d/.test(t)) continue;                       // 数字を含まないものは型番とみなさない
      if (RAW_SIZE_LIKE.test(t) || RAW_ERA_LIKE.test(t) || RAW_COLOR_LIKE.test(t)) continue;
      if (/^m\d{10,13}$/i.test(t)) continue;             // メルカリの商品ID
      if (/^(19|20)\d{2}$/.test(t)) continue;            // 西暦らしき4桁
      /* ★2026-08-13 小数点付きの寸法が素通りしていた。仕入元側と同じ直し。
         本家 msq_core.js / list_extractor.js にも入れてある（4か所そろえる）。 */
      if (/^\d+(\.\d+)?(円|cm|mm|g|kg|ml|inch|インチ)$/i.test(t)) continue; // 価格・寸法
      // 型番は英数字と記号だけ。日本語を含む語は型番ではない。
      // 全角英数字は正しい表記ゆれなので NFKC してから判定する。
      if (!/^[A-Za-z0-9][A-Za-z0-9\-_\/\.]*$/.test(t.normalize('NFKC'))) continue;
      out.push(t);
    }
    const seen = {};
    return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  }

  /* 本文の「型番：」等のラベルから型番を拾う。msq_core.js の MODEL_LABEL_RE /
     modelFromDescription を【1行も変えずに】写した。
     ★区切り記号を決め打ちしないこと（「型番ーGM-B2100」のような書き方が実在する）。
     ★「管理番号」「商品番号」「製造番号」はラベルに入れない。出品者が独自に振る番号で
       あって型番ではなく、拾うと別商品を同一と誤認する。 */
   RAW_MODEL_LABEL_RE = new RegExp(
    '(?:型番|型式|品番|品\\s*番|商品型番|メーカー\\s*(?:品番|型番)|' +
    'モデル\\s*(?:番号|ナンバー|No\\.?)|model\\s*(?:no\\.?|number)|' +
    'reference|ref\\.?|リファレンス(?:ナンバー)?)' +
    '[\\s\\]\\}】》>\\)）]*[\\s]*[:\\-=/|・･>→#.,、。~ー‐–—―]{0,2}[\\s]*' +
    '([A-Za-z0-9][A-Za-z0-9\\-_/\\.]{2,23})', 'gi');

  /* 季節・年代の表記は型番欄に見えても商品固有の型番ではない。
     24AW / 26SS を第1検索語にすると、サイト横断検索が別商品だらけになるため、
     型番として採用せず、他の識別語へ進める。 */
  function rawModelUsable(value) {
    const v = String(value || '').normalize('NFKC').trim();
    return v && !RAW_ERA_LIKE.test(v) ? v : '';
  }

  /* メルカリ本文の型番取得はPC拡張機能の紫ボタン extractModel と同じ。
     ★仕入元側の型番抽出とは別物。ここはメルカリ詳細本文専用。
     ★〇/◆/◇/■などの記号直後、型番・品番の右側、ラベルの次行、
       数字だけの型番、ハイフン連結型番を同じ順序で読む。
     ★PC側 list_extractor.js の extractModel を移植したもので、
       個別のブランドや商品に合わせた例外追加はしない。 */
  function rawModelFromDesc(text) {
    const results = [];
    let m;
    const src = String(text || '');

    const re1 = /[\[【■▪◆●・]?[型品]番[号・シリアル]*[\]】]?[\s\u3000]*[：:=＝\.。…･・→は\/]?[\s\u3000]*[\（(]?([A-Za-z0-9][A-Za-z0-9\-\_\/\s\.]{1,}?)[\）)]?(?=\s*[\n,、]|$)/g;
    while ((m = re1.exec(src)) !== null) {
      const val = m[1].trim();
      if (val.length >= 3) results.push(val);
    }

    const re2 = /[\[【■▪◆●]?(?:[型品モデル・号シリアル]*)?[型番][^\n]*\n[\s\u3000]*([A-Za-z0-9][A-Za-z0-9\-\_\/\s\.]{2,}?)(?=\s*\n|$)/g;
    while ((m = re2.exec(src)) !== null) {
      const val = m[1].trim();
      if (val.length >= 3) results.push(val);
    }

    const re1b = /[\[【■▪◆●・]?[型品]番[号・シリアル]*[\]】]?[\s\u3000]*[：:=＝\.。…･・→は\/]?[\s\u3000]*([A-Za-z0-9][A-Za-z0-9\-\_\/\.]{2,29})/g;
    while ((m = re1b.exec(src)) !== null) {
      const val = m[1].replace(/[\.。]+$/, '').trim();
      if (val.length >= 3 && /[0-9]/.test(val)) results.push(val);
    }

    const re3 = /[\[【■▪◆●]?[型品]番[号]?[\]】]?[\s\u3000]*[：:=＝\.。…･・→は]?[\s\u3000]*(\d{6,})/g;
    while ((m = re3.exec(src)) !== null) results.push(m[1]);

    const re4 = /(\d{5,})[^\d]*型番/g;
    while ((m = re4.exec(src)) !== null) results.push(m[1]);

    const unique = [...new Set(results)];
    const filtered = unique.filter((v) =>
      !unique.some((other) => other !== v && other.startsWith(v) && other.length > v.length)
    );
    if (filtered.length > 0) return filtered.join(' / ');

    /* ハイフンで連結された型番は塊全体を採る。短い断片へ分解しない。 */
    const tsunagi = src.match(/[A-Za-z0-9]+(?:[-][A-Za-z0-9]+){1,7}/g) || [];
    let ichiban = '';
    for (let i = 0; i < tsunagi.length; i++) {
      const v = tsunagi[i];
      if (v.length < 5 || v.length > 30) continue;
      if (!/[0-9]/.test(v)) continue;
      const ku = v.split('-');
      if (ku.length === 3 && /^(19|20)[0-9]{2}$/.test(ku[0])
        && /^[0-9]{1,2}$/.test(ku[1]) && /^[0-9]{1,2}$/.test(ku[2])) continue;
      if (!/[A-Za-z]/.test(v) && ku.length < 3) continue;
      if (v.length > ichiban.length) ichiban = v;
    }
    if (ichiban) return ichiban;

    const codePatterns = [
      /\b([A-Z]{1,4}\d{2,}[A-Z]?-\d{2,}-\d{2,})\b/i,
      /\b([A-Z]{1,4}\d{3,}[A-Z]?-\d{2,}[A-Z0-9]*)\b/i,
      /\b(\d{2}-\d{4,}[A-Z]?)\b/,
      /\b([A-Z]{1,4}\d{4,}[A-Z]?)\b/i,
      /\b([A-Z]{1,5}-\d{3,}[A-Z0-9-]*)\b/i,
      /\b([A-Z]{2,}\d{3,}[A-Z0-9]*)\b/,
      /\b(\d{3,}[A-Z]{2,}[A-Z0-9-]*)\b/,
      /\b([A-Z]{2,}\d+[A-Z]?\d*-[A-Z0-9]+)\b/i,
      /\b([A-Z]{2,}\d+)\b/i,
      /\b(\d{3,}[A-Z]+\d*)\b/,
    ];
    for (const re of codePatterns) {
      const mc = src.match(re);
      if (mc) return mc[1];
    }
    return '';
  }

  /* ===== 本文から型番を取る（2026-08-12 ユーザー承認・押した時だけの形） =====
     ★なぜ自動で回さないか: 2026-08-01 にGoogleレンズで実際に弾かれた実績がある。
       押した時だけ1件なら、人が商品を1回開くのと通信の回数も間隔も同じになる。
     ★同じ商品は1回だけ。取った型番は localStorage に残し、次からは通信しない。
     ★同時に1件だけ。前の1件が終わるまで次を始めない（連打しても増やさない）。
     ★実測（実機・2026-08-12）: 本文は裏の枠から読める。1件3.0〜3.8秒。
       3件中1件は12秒以内に取れなかったので、取れなくても止まらない作りにする。 */
  const RAW_MODEL_KEY = 'msq_raw_model';   // {商品ID: 型番}（空文字＝本文に型番なし）
  let rawModelMap = null;
  let rawModelBusy = false;

  function rawModelLoad() {
    if (rawModelMap) return rawModelMap;
    try { rawModelMap = JSON.parse(localStorage.getItem(RAW_MODEL_KEY) || '{}') || {}; }
    catch (e) { rawModelMap = {}; }
    return rawModelMap;
  }
  function rawModelSave(id, code) {
    const m = rawModelLoad();
    m[id] = code;
    try { localStorage.setItem(RAW_MODEL_KEY, JSON.stringify(m)); } catch (e) { }
  }

  /* 商品ページの中から、本文を持つデータを探す。実機で確かめた探し方。 */
  function rawFindItemDoc(d) {
    let mi = null, mita = 0;
    const els = d.querySelectorAll('div,main,section,article');
    for (let i = 0; i < els.length && !mi && mita < 400; i++) {
      const el = els[i];
      let kagi = null;
      for (const k in el) { if (k.indexOf('__reactFiber$') === 0) { kagi = k; break; } }
      if (!kagi) continue;
      mita++;
      let f = el[kagi];
      for (let j = 0; j < 30 && f; j++) {
        const p = f.memoizedProps || f.pendingProps;
        if (p) {
          for (const q in p) {
            const v = p[q];
            if (v && typeof v === 'object' && !Array.isArray(v) && ('description' in v)) { mi = v; break; }
          }
        }
        if (mi) break;
        f = f.return;
      }
    }
    return mi;
  }

  /* 商品ページを裏の枠で開いて本文を読む。読めても読めなくても必ず枠を片付ける。 */
  function rawModelFetch(url, done) {
    let fr = null;
    try {
      fr = document.createElement('iframe');
      fr.setAttribute('data-msq-model', '1');
      /* ★枠は画面の中に置くこと。画面の外に置くと描画が止まって永久に読めない
         （2026-08-08 に同じ穴を踏んでいる）。ほぼ透明にして一番後ろへ回す。 */
      fr.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;'
        + 'opacity:0.01;z-index:-1;pointer-events:none;';
      fr.src = url;
      document.body.appendChild(fr);
    } catch (e) { done(null); return; }
    let n = 0;
    const t = setInterval(() => {
      n++;
      let it = null;
      try {
        const d = fr.contentDocument;
        if (d && d.body) it = rawFindItemDoc(d);
      } catch (e) { /* まだ読めない */ }
      if (!it && n < 24) return;            /* 最長12秒 */
      clearInterval(t);
      try { fr.remove(); } catch (e) { }
      done(it);
    }, 500);
  }

  /* 「型」を押した時。保存済みなら通信しない。 */
  function rawModelGo(a, id) {
    const mise = (code) => {
      let li = a;
      for (let i = 0; i < 6 && li.parentElement; i++) { if (li.tagName === 'LI') break; li = li.parentElement; }
      if (li && code) li.setAttribute('data-msq-m', code);
      /* 行を作り直させる（型番を入れて出し直すため） */
      const par = a.parentElement;
      const s = par && par.querySelector('.msq-raw-sub');
      if (s) s.remove();
      try { rawDecorate(); } catch (e) { }
    };
    const hozon = rawModelLoad();
    if (Object.prototype.hasOwnProperty.call(hozon, id)) {
      if (hozon[id]) { mise(hozon[id]); rawMoreSay('型番 ' + hozon[id]); }
      else rawMoreSay('本文に型番なし');
      return;
    }
    if (rawModelBusy) { rawMoreSay('型番は1件ずつ'); return; }
    rawModelBusy = true;
    rawMoreSay('型番を調べています…');
    rawModelFetch(a.href, (it) => {
      rawModelBusy = false;
      if (!it) { rawMoreSay('型番が読めず（もう一度）'); return; }
      const code = rawModelFromDesc(it.description) || '';
      rawModelSave(id, code);
      if (code) { mise(code); rawMoreSay('型番 ' + code); }
      else rawMoreSay('本文に型番なし');
    });
  }

  /* タイルの下に出す1行。販売中は日数を出さない（ユーザー指定）。 */
  function rawUriKaku(m) {
    const out = [];
    try {
      const c = Number(m.created) * 1000;
      const u = Number(m.updated) * 1000;
      const ureta = (m.status === 'ITEM_STATUS_SOLD_OUT' || m.status === 'ITEM_STATUS_TRADING');
      if (ureta && c && u) {
        const d = Math.round((u - c) / 86400000);
        const hi = new Date(u);
        out.push((d <= 0 ? '当日売れた' : d + '日で売れた') + ' (' + (hi.getMonth() + 1) + '/' + hi.getDate() + ')');
      } else if (c) {
        const d = Math.round((Date.now() - c) / 86400000);
        out.push('出品' + (d <= 0 ? '本日' : d + '日前'));
      }
      const size = (m.itemSize && (m.itemSize.name || m.itemSize))
        || (Array.isArray(m.itemSizes) && m.itemSizes[0] && m.itemSizes[0].name) || '';
      if (size) out.push(String(size));
      /* ★2026-09-09 ユーザー依頼「メルカリの一覧に状態を入れろ。サイズとかあるところに」
           商品データには番号だけ（itemConditionId）が入っている（実機で確認: 1〜6）。
           番号と言葉の対応はメルカリの検索の絞り込みと同じ。
           こちらの既定の検索が item_condition_id=3 ＝「目立った傷や汚れなし」で一致する。
         ★grep用の目印: 一覧に状態 */
      const jotai = { 1: '新品、未使用', 2: '未使用に近い', 3: '目立った傷や汚れなし',
        4: 'やや傷や汚れあり', 5: '傷や汚れあり', 6: '全体的に状態が悪い' }[Number(m.itemConditionId)];
      if (jotai) out.push(jotai);
    } catch (e) { }
    return out.join(' ・ ');
  }

  /* ------------------------------------------------------------------ 上の帯 */
  /* 上部操作帯をメルカリの実ヘッダーと同じWeb DOMの流れに置く。
     Android側の別Viewやfixed位置には置かない。Reactの再描画で位置が戻った
     場合も、rawStartの巡回でここへ戻す。 */
  function rawPlaceBarAfterHeader() {
    const bar = document.getElementById('msq-raw-bar');
    const header = document.querySelector('header');
    if (!bar || !header || !header.parentNode) return;
    if (bar.previousElementSibling !== header) header.insertAdjacentElement('afterend', bar);
  }

  function rawBuildBar() {
    if (document.getElementById('msq-raw-bar')) return;
    const img = SP.get('__msqsrcimg') || '';
    const model = SP.get('__msqsrcmodel') || '';
    /* ★見せるためだけの型番（題で引いた時に付く）。照合には使わない。 */
    const kataMi = SP.get('__msqsrckata') || '';
    const rank = SP.get('__msqsrcrank') || '';
    const rawQuery = (() => {
      try {
        const u = new URL(location.href);
        return String(u.searchParams.get('keyword') || u.searchParams.get('q') || '').trim();
      } catch (e) { return ''; }
    })();
    const cost = rawNum(SP.get('__msqprice'));
    const g = rawGoal(cost);
    const bar = document.createElement('div');
    bar.id = 'msq-raw-bar';
    bar.innerHTML =
      '<div id="msq-raw-meta">'
      + (img ? '<img src="' + rawEsc(img) + '">' : '')
      /* ★2026-08-26 ユーザー指示『出せるなら出せ　出せないなら　だったら出ないほうがいい』。
         分かっている時だけ出す。分からない時は「(型番なし)」の文字ごと出さない。 */
      + ((model || kataMi) ? '<span>' + rawEsc(model || kataMi) + '</span>' : '')
      + (cost > 0 ? '<span>仕入 ¥' + cost.toLocaleString() + '</span>' : '')
      + (rank ? '<span>' + rawEsc(rank) + '</span>' : '')
      + (g ? '<span class="msq-raw-goal">売 ¥' + g.sell.toLocaleString()
        + '　益 ¥' + g.want.toLocaleString() + '</span>' : '')
      + '</div>'
      + '<div id="msq-raw-topline">'
      + (rawQuery ? '<input class="msq-raw-query" id="msq-raw-query-input" type="search"'
        + ' aria-label="検索語" autocomplete="off" value="' + rawEsc(rawQuery) + '">' : '')
      + '<span id="msq-raw-info">'
      + '<span id="msq-raw-count" style="opacity:.8;font-weight:400;"></span>'
      + '<span id="msq-raw-total" style="opacity:.8;font-weight:400;"></span>'
      + '<span id="msq-raw-more" style="opacity:.9;font-weight:700;color:#7dd3fc;"></span>'
      + ' <span style="opacity:.55;font-weight:400;">' + RAW_BUILD + '</span>'
      + '</span></div>'
      + '<div id="msq-raw-actions">'
      /* ★2026-08-11 こちらの🔍は置かない。帯がヘッダを覆っていたのを直して
         メルカリ本来の虫眼鏡が押せるようになったので、二重になるだけ（実機で確認）。 */
      + '<button class="msq-raw-btn" id="msq-raw-shiire-btn">仕入</button>'
      + '<button class="msq-raw-btn" id="msq-raw-lock">🔓</button>'
      + '<button class="msq-raw-btn" id="msq-raw-cols-btn">大きく</button>'
      /* ★販売状況を未選択（すべての商品）に戻す（2026-08-14 ユーザー依頼）。
         こちらが付けた3択だけを外す。カテゴリや価格などメルカリ本来の絞り込みには触らない。 */
      /* ★2026-09-09 ユーザー依頼「なんで毎回絞り込みがこわれるんだ」→ B案で解決
           実測で判明: メルカリの絞り込み行は position:sticky では【原理的に固定できない】。
             絞り込みの行 自分33px / 親37px（余地4px）
             タグ行       自分36px / 親36px（余地0px）＋ 親が overflow:scroll
           stickyは親の箱の中でしか動けないので、親ごと流れて消える。
           ＝【本物を固定しようとするのをやめ、確実に動いているこの帯から呼ぶ】。
             この帯は position:fixed なので、スクロールしても必ず残る（実測済み）。
             押すとメルカリ本物の「絞り込み」を押すだけ。Reactには一切触らない。
         ★grep用の目印: 帯から絞り込みを開く */
      + '<button class="msq-raw-btn" id="msq-raw-reset">状態解除</button>'
      + '<button class="msq-raw-btn" id="msq-raw-undo">1件戻す</button>'
      + '<button class="msq-raw-btn" id="msq-raw-clear">全部戻す</button></div>';
    const header = document.querySelector('header');
    if (header && header.parentNode) header.insertAdjacentElement('afterend', bar);
    else if (document.body) document.body.insertBefore(bar, document.body.firstChild);

    const rawQueryInput = document.getElementById('msq-raw-query-input');
    if (rawQueryInput) {
      rawQueryInput.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const next = String(rawQueryInput.value || '').trim();
        if (!next) return;
        try {
          const u = new URL(location.href);
          u.searchParams.set('keyword', next);
          u.searchParams.delete('q');
          location.href = u.toString();
        } catch (e) { }
      });
    }

    document.getElementById('msq-raw-cols-btn').addEventListener('click', () => {
      /* ★既定2列。押すたびに 2列 ⇄ 1列 を行き来する（ユーザー指定 2026-08-08） */
      const now = rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2;
      const next = now === 2 ? 1 : 2;
      try { localStorage.setItem(RAW_COLS_KEY, String(next)); } catch (e) { }
      rawApplyCols();
      document.getElementById('msq-raw-cols-btn').textContent =
        next === 2 ? '2列' : '1列';
    });
    /* こちらが付けた絞り込みを全部外して素の結果に戻す（rawJoutaiKaijo の説明を参照）。 */
    /* ★2026-08-18 型番で引いた画面（絞り込みが外れている）では、このボタンが
       【絞り込む】に入れ替わる。ボタンを増やさずに逆向きも使えるようにする（ユーザー依頼）。 */
    { const rb = document.getElementById('msq-raw-reset');
      if (rb) {
        const naka = () => {
          const gyaku = rawShiboriNashi();
          rb.textContent = gyaku ? '絞り込む' : '状態解除';
          rb.title = gyaku
            ? '新しい順・売り切れ・目立った傷や汚れなし・個人のみ を付ける'
            : 'こちらが付けた絞り込みを外して素の結果に戻す';
          rb.style.setProperty('background', gyaku ? '#0b3b5c' : '', gyaku ? 'important' : '');
        };
        naka();
        rb.addEventListener('click', () => {
          try { if (rawShiboriNashi()) rawJoutaiTsukeru(); else rawJoutaiKaijo(); } catch (e) { }
        });
      } }
    /* ★2026-09-09 帯の「絞り込み」＝メルカリ本物の絞り込みを押すだけ。
         スクロールで本物の行が流れて見えなくなっても、この帯は fixed なので必ず押せる。
       ★自分たちのボタン（msq-raw-btn）は対象から外す。
       ★grep用の目印: 帯から絞り込みを開く */
    document.getElementById('msq-raw-undo').addEventListener('click', () => {
      const id = rawUndo.pop();
      if (!id) return;
      rawHidden.delete(id);
      /* ★2026-08-27 読み直してから、戻す1件だけを引いて書く。
         丸ごと上書きすると別の画面で消した分を巻き添えにする。 */
      { const t = rawLoadHiddenNama(); t.delete(id); rawSaveHidden(t); }
      const m = rawLoadMeta(); delete m[id]; rawSaveMeta(m);   /* 記録も消す（2026-08-11） */
      location.reload();
    });
    document.getElementById('msq-raw-clear').addEventListener('click', () => {
      /* ★2026-08-27 ここだけは読み直さない。読み直すと「全部戻す」が効かなくなる。
         空を直接書く。記録(meta)も空にするので、読み込み時の書き戻しでも生き返らない。 */
      rawHidden.clear(); rawUndo.length = 0; rawSaveHidden(new Set());
      rawSaveMeta({});                       /* 記録も一緒に片付ける（2026-08-11） */
      location.reload();
    });
    document.getElementById('msq-raw-lock').addEventListener('click', rawLockPanel);
    document.getElementById('msq-raw-shiire-btn').addEventListener('click', () => rawShiirePanel(''));
    rawLockMark();
    rawUpdateCount();
    rawWatchTotal();   /* 読み込んだ総件数を出し続ける（2026-08-12 ユーザー依頼） */
  }

  /* ============ ブランド一覧を自前で出す（2026-08-08・PATCH） ============
     アプリの /brands ではメルカリの一覧が空のまま出てこない（実機）。
     クエッタでは12件出るので、こちらのコードのせいではない（/brands では動いていない）。
     ★出ないなら自前で出す。使うのはレンズ検索AIと同じGitHubのbrand.csv（21,838件）。
       あちらのコードにも保存先にも触らない。ここだけで完結させる。
     ★メルカリの一覧が出ている時は何もしない。出た時点でこちらは引っ込める。
     ★ブランドの番号(brand_id)は辞書に無いので、押した時はブランド名での検索になる。 */
  const RAW_BRAND_CSV = 'https://raw.githubusercontent.com/myusei35-cpu/BlueStar-Standard/refs/heads/main/brand.csv';
  const RAW_BRAND_CACHE = 'msq_raw_brands';
  let rawBrandList = null;
  let rawBrandSeen = 0;
  let rawBrandClosed = false;

  function rawSplitCsvLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /* 列は  空,ブランド名（英語）,ブランド名,空,ブランド名（カナ） */
  function rawParseBrandCsv(text) {
    const out = [];
    const lines = String(text).split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const c = rawSplitCsvLine(lines[i]);
      const en = String(c[1] || '').trim();
      const ja = String(c[2] || '').trim();
      const kana = String(c[4] || '').trim();
      if (!en && !ja) continue;
      out.push([en, ja, kana]);
    }
    return out;
  }

  function rawBrandLoad() {
    if (rawBrandList) return Promise.resolve(rawBrandList);
    try {
      const c = JSON.parse(localStorage.getItem(RAW_BRAND_CACHE) || 'null');
      if (c && c.t && (Date.now() - c.t) < 7 * 864e5 && c.v && c.v.length) {
        rawBrandList = c.v;
        return Promise.resolve(rawBrandList);
      }
    } catch (e) { }
    return fetch(RAW_BRAND_CSV)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then((t) => {
        rawBrandList = rawParseBrandCsv(t);
        try {
          localStorage.setItem(RAW_BRAND_CACHE, JSON.stringify({ t: Date.now(), v: rawBrandList }));
        } catch (e) { /* 入らなくても動く。次回また取りに行くだけ */ }
        return rawBrandList;
      });
  }

  /* 選んだブランド。画面を移っても残す。 */
  const RAW_BRAND_SEL = 'msq_raw_brand_sel';
  let rawBrandSel = [];
  try { rawBrandSel = JSON.parse(localStorage.getItem(RAW_BRAND_SEL) || '[]') || []; } catch (e) { }
  const rawBrandSave = () => {
    try { localStorage.setItem(RAW_BRAND_SEL, JSON.stringify(rawBrandSel)); } catch (e) { }
  };
  const rawBrandGo = (name) => {
    location.href = 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(name);
  };

  /* 下の帯。選んだものを札で並べ、押すとそのブランドで検索する。
     ★本物のように「複数まとめて1回の検索」はできない。メルカリはブランドの番号
       (brand_id)で絞っており、こちらの辞書には番号が無いため。名前での検索になる。 */
  function rawBrandFoot() {
    const foot = document.getElementById('msq-brand-foot');
    if (!foot) return;
    foot.innerHTML = '';

    /* 選んだものの札。押すとそのブランドだけで検索する。 */
    if (rawBrandSel.length) {
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 0 6px;';
      head.innerHTML = '<span style="flex:1;font:700 12px system-ui;opacity:.7;">選んだ '
        + rawBrandSel.length + '件</span>';
      const cl = document.createElement('button');
      cl.style.cssText = 'border:0;background:transparent;color:#2563eb;'
        + 'font:700 13px system-ui;padding:2px 0;';
      cl.textContent = '選択をクリア';
      cl.addEventListener('click', () => {
        rawBrandSel = []; rawBrandSave(); rawBrandFoot();
        const q = document.getElementById('msq-brand-q');
        rawBrandRender(q ? q.value : '');
      });
      head.appendChild(cl);
      foot.appendChild(head);

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px;';
      rawBrandSel.forEach((n) => {
        const c = document.createElement('button');
        c.style.cssText = 'padding:7px 11px;border:0;border-radius:14px;background:#2563eb;'
          + 'color:#fff;font:700 13px system-ui;';
        c.textContent = n;
        c.addEventListener('click', () => rawBrandGo(n));
        wrap.appendChild(c);
      });
      foot.appendChild(wrap);
    }

    /* 本物と同じ赤いボタン。 */
    const go = document.createElement('button');
    go.style.cssText = 'width:100%;padding:14px;border:0;border-radius:8px;'
      + 'background:' + (rawBrandSel.length ? '#ea352d' : 'rgba(128,128,128,.35)') + ';'
      + 'color:#fff;font:700 15px system-ui;';
    go.textContent = rawBrandSel.length
      ? '商品を検索する（' + rawBrandSel.length + '件）'
      : 'ブランドを選んでください';
    go.addEventListener('click', () => {
      if (!rawBrandSel.length) return;
      /* 2件以上なら、残りを順番待ちに入れる。1件目を出しきったあと、
         下まで来た時に次のブランドへ移り、商品は持ち越して繋がっていく。 */
      ssDel(RAW_CARRY);
      ssDel(RAW_CHAIN);
      if (rawBrandSel.length > 1) {
        const rest = rawBrandSel.slice(1).map(
          (n) => 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(n));
        ssSet(RAW_QUEUE, JSON.stringify(rest));
      } else {
        ssDel(RAW_QUEUE);
      }
      rawBrandGo(rawBrandSel[0]);
    });
    foot.appendChild(go);

    if (rawBrandSel.length > 1) {
      const note = document.createElement('div');
      note.style.cssText = 'padding:6px 2px 0;font:400 11px system-ui;opacity:.6;';
      note.textContent = '選んだブランドを順に読んで1つの並びにまとめます。'
        + '件数が多いと少し時間がかかります。';
      foot.appendChild(note);
    }
  }

  function rawBrandRender(q) {
    const listEl = document.getElementById('msq-brand-list');
    if (!listEl || !rawBrandList) return;
    const raw = String(q || '').trim();
    const k = raw.toLowerCase();
    const hit = [];
    for (let i = 0; i < rawBrandList.length && hit.length < 300; i++) {
      const b = rawBrandList[i];
      if (!k
        || String(b[0] || '').toLowerCase().indexOf(k) >= 0
        || String(b[1] || '').indexOf(raw) >= 0
        || String(b[2] || '').indexOf(raw) >= 0) hit.push(b);
    }
    listEl.innerHTML = '';
    if (!hit.length) { listEl.textContent = '見つかりません'; return; }
    hit.forEach((b) => {
      const name = b[0] || b[1];
      const on = rawBrandSel.indexOf(name) >= 0;
      const r = document.createElement('label');
      r.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 12px;'
        + 'border-top:1px solid rgba(128,128,128,.25);font:400 14px system-ui;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = on;
      cb.style.cssText = 'width:20px;height:20px;flex:0 0 auto;';
      cb.addEventListener('change', () => {
        const i = rawBrandSel.indexOf(name);
        if (cb.checked) { if (i < 0) rawBrandSel.push(name); }
        else if (i >= 0) rawBrandSel.splice(i, 1);
        rawBrandSave();
        rawBrandFoot();
      });
      const tx = document.createElement('div');
      tx.style.cssText = 'flex:1;min-width:0;';
      tx.innerHTML = '<div>' + rawEsc(name) + '</div>'
        + (b[1] && b[0] ? '<div style="opacity:.6;font-size:12px;">' + rawEsc(b[1]) + '</div>' : '');
      /* 文字を押した時はすぐ検索。チェックは左の四角で。 */
      tx.addEventListener('click', (ev) => { ev.preventDefault(); rawBrandGo(name); });
      r.appendChild(cb);
      r.appendChild(tx);
      listEl.appendChild(r);
    });
  }

  /* ★2026-08-08 メルカリの枠の中に差し込んだら潰れて中身が見えなかった（実機）。
     入れ物の作りに左右されないよう、画面いっぱいの別枠にする。
     閉じられるようにして、閉じたらその画面では二度と出さない。 */
  function rawBuildBrandBox() {
    if (document.getElementById('msq-brand-box')) return;
    let bg = '#111', fg = '#fff';
    try {
      const cs = getComputedStyle(document.body);
      if (cs.backgroundColor && cs.backgroundColor.indexOf('rgba(0, 0, 0, 0)') < 0) bg = cs.backgroundColor;
      if (cs.color) fg = cs.color;
    } catch (e) { }

    const box = document.createElement('div');
    box.id = 'msq-brand-box';
    box.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;z-index:2147483600;'
      + 'display:flex;flex-direction:column;background:' + bg + ';color:' + fg + ';';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;'
      + 'border-bottom:1px solid rgba(128,128,128,.35);">'
      + '<span style="font:700 15px system-ui;flex:1;">ブランド一覧</span>'
      + '<button id="msq-brand-close" style="padding:6px 12px;border:0;border-radius:8px;'
      + 'background:#2563eb;color:#fff;font:700 13px system-ui;">閉じる</button></div>'
      + '<input id="msq-brand-q" placeholder="ブランドをさがす" '
      + 'style="width:100%;box-sizing:border-box;padding:13px 12px;border:0;'
      + 'border-bottom:1px solid rgba(128,128,128,.3);font:400 16px system-ui;'
      + 'background:transparent;color:inherit;">'
      + '<div id="msq-brand-list" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;'
      + 'padding-bottom:24px;"></div>'
      + '<div id="msq-brand-foot" style="padding:10px 12px;'
      + 'border-top:1px solid rgba(128,128,128,.35);"></div>';
    document.body.appendChild(box);

    box.querySelector('#msq-brand-close').addEventListener('click', () => {
      rawBrandClosed = true;
      box.remove();
    });

    rawBrandFoot();   // 赤いボタンは中身を待たずに出す

    const listEl = box.querySelector('#msq-brand-list');
    listEl.style.padding = '16px';
    listEl.textContent = '読み込み中…';
    rawBrandLoad()
      .then(() => { listEl.style.padding = '0 0 24px'; rawBrandRender(''); rawBrandFoot(); })
      .catch((e) => {
        listEl.textContent = 'ブランド辞書を読めませんでした（' + e.message + '）';
      });
    box.querySelector('#msq-brand-q')
      .addEventListener('input', (ev) => rawBrandRender(ev.target.value));
  }

  /* ★2026-08-08 URLで画面を見分けるのをやめた。
     クエッタで見た /brands をアプリでも同じだと決めつけ、アプリでは一度も動かなかった。
     画面の中身（「ブランドをさがす」の入力欄があるか）で判断する。URLに依存しない。 */
  function rawBrandStart() {
    const box = document.getElementById('msq-brand-box');
    /* こちらが出した入力欄まで目印に数えないよう、自分の枠の中は除く */
    let anchor = null;
    const ins = document.querySelectorAll('input[placeholder*="ブランド"]');
    for (let i = 0; i < ins.length; i++) {
      if (box && box.contains(ins[i])) continue;
      anchor = ins[i]; break;
    }
    if (!anchor) { rawBrandSeen = 0; rawBrandClosed = false; if (box) box.remove(); return; }
    if (rawBrandClosed) return;
    if (!rawBrandSeen) rawBrandSeen = Date.now();
    /* メルカリ自身の一覧が【見えて】いるなら、こちらは引っ込める。
       DOMにあるだけで見えていない物を数えると、出さないまま終わる。 */
    /* ★自分が出したチェックボックスを数えてはいけない。
       数えていたため「メルカリの一覧が出た」と誤認して消し、また出す、を
       繰り返して点滅した（2026-08-08 実機）。入力欄と同じく自分の枠は除く。 */
    let vis = 0;
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    for (let i = 0; i < cbs.length; i++) {
      if (box && box.contains(cbs[i])) continue;
      if (cbs[i].offsetParent) vis++;
    }
    if (vis >= 5) { if (box) box.remove(); return; }
    /* ★出るのが遅いと言われたので待ちを短くした（4秒→1.2秒）。
       辞書はアプリを開いた時に先に読み始めているので、たいてい待たずに並ぶ。 */
    if (Date.now() - rawBrandSeen < 1200) return;
    rawBuildBrandBox();
  }

  /* ========= 検索の既定（2026-08-08・PATCH） =========
     ユーザー指定「新しい順・売り切れ・個人・目立った傷や汚れなし」で開く。
     ★指定が付いていない項目だけを足す。自分で選び直した分は上書きしない。
     ★一度足したら目印(__msqdef)を付け、同じページで何度も足さない。
       検索し直せば目印は消えるので、また既定で開く。
     ★値は background.js で実績のあるものと同じ。
         item_condition_id=3   目立った傷や汚れなし
         status=sold_out       売り切れ
         seller_type=0         個人（★これだけではShopsが混ざる。item_types=mercari も要る）
         sort=created_time&order=desc  新しい順 */
  function rawDefaults() {
    if (!rawOnSearch()) return false;
    let u;
    try { u = new URL(location.href); } catch (e) { return false; }
    if (u.searchParams.get('__msqdef') === '1') return false;
    /* ★2026-08-18 ユーザー指示『型番検索のときだけ絞り込み0にできるか？』。
       ★理由（実機で確認済み）: 型番は母数が1件しかないことがある。そこへ
         売り切れ・状態3・新しい順を足すと全部消える。ユーザーは
         「絞り込み0でアークテリクス 127981 で検索したら1件ヒットした」と報告している。
       ★型番で引いた時（__msqsrcmodel が付いている時）だけ、絞り込みを足さない。
         そのほかの検索は今までどおり。 */
    if (u.searchParams.get('__msqsrcmodel')) return false;
    u.searchParams.set('__msqdef', '1');
    if (!u.searchParams.get('sort')) {
      u.searchParams.set('sort', 'created_time');
      u.searchParams.set('order', 'desc');
    }
    if (!u.searchParams.get('status')) u.searchParams.set('status', 'sold_out');
    if (!u.searchParams.get('item_condition_id')) u.searchParams.set('item_condition_id', '3');
    /* ★2026-08-14 実機で確認: seller_type=0 だけではショップの商品が混ざる。
       item_types=mercari を必ず一緒に付ける（本家と同じ）。 */
    if (!u.searchParams.get('item_types')) u.searchParams.set('item_types', 'mercari');
    if (!u.searchParams.get('seller_type')) u.searchParams.set('seller_type', '0');
    ssDel(RAW_CARRY); ssDel(RAW_CHAIN);
    /* ==========================================================================
       ★2026-09-09 ユーザー指摘「公式めっちゃ早いぞ」「別の技術使ってるのでは？」
       ■ 見つけた根本原因
         ここは常に location.replace（＝ページを丸ごと読み直し）していた。
         そのため【中身が1つも変わらない時でも】目印 __msqdef=1 を足すためだけに
         読み直しが走り、メルカリのJS起動（実測 約1.5秒）を【2回】やっていた。
         アプリが作るURLは最初から絞り込みが入っているので、この読み直しは丸損だった。
       ■ どうしたか
         【本当に中身が変わった時だけ読み直す】。変わっていない時は
         history.replaceState で目印だけ付ける（読み直さない＝JS起動は1回で済む）。
       ★戻るボタンの都合で replace を使っていた事情はそのまま（replaceState も履歴を増やさない）。
       ★grep用の目印: 読み直さない
       ========================================================================== */
    /* ★2026-09-09 ユーザー指摘「簡単に焼けというが面倒なんだぞ」
         焼き直さずに止められるスイッチ。localStorage に msq_yominaoshi='0' を入れると
         この直しを使わず、今までどおり毎回読み直す。
       ★grep用の目印: 読み直さない */
    try { if (localStorage.getItem('msq_yominaoshi') === '0') { location.replace(u.toString()); return true; } } catch (e) { }
    let kawatta = false;
    try {
      const mae = new URL(location.href);
      const ato = new URL(u.toString());
      const miru = ['keyword', 'sort', 'order', 'status', 'item_condition_id', 'item_types', 'seller_type', 'page_token'];
      for (let i = 0; i < miru.length; i++) {
        if ((mae.searchParams.get(miru[i]) || '') !== (ato.searchParams.get(miru[i]) || '')) { kawatta = true; break; }
      }
    } catch (e) { kawatta = true; }
    if (!kawatta) {
      try {
        history.replaceState(history.state, '', u.toString());
        window.__msqYominaoshiHabuita = Math.round(performance.now());
        return false;                     /* 読み直していないので「移動した」とは言わない */
      } catch (e) { /* 失敗したら今までどおり読み直す */ }
    }
    /* replace で移動する。戻るボタンで既定の付く前へ戻ってしまわないように。 */
    location.replace(u.toString());
    return true;
  }

  /* ========= 販売状況の絞り込み（2026-08-08・PATCH） =========
     本物のWeb版は「すべての商品／販売中のみ／売り切れのみ」の3択で、
     文字の後ろ（右）に丸い選択が付いている。
     アプリのメルカリは「販売中のみ表示」のチェック1つしか出さないため、
     こちらで同じ3択を出し、URLの status を書き換える。
       すべての商品 … status なし
       販売中のみ   … status=on_sale
       売り切れのみ … status=sold_out */
  const RAW_ST_LABEL = { '': 'すべての商品', on_sale: '販売中のみ', sold_out: '売り切れのみ' };

  function rawStatusNow() {
    let s = '';
    try { s = (new URLSearchParams(location.search)).get('status') || ''; } catch (e) { }
    if (s.indexOf('sold_out') >= 0) return 'sold_out';
    if (s.indexOf('on_sale') >= 0) return 'on_sale';
    return '';
  }

  function rawStatusGo(v) {
    let u;
    try { u = new URL(location.href); } catch (e) { return; }
    if (v) u.searchParams.set('status', v); else u.searchParams.delete('status');
    u.searchParams.delete('page_token');      // 絞り込み直しなので1ページ目から
    ssDel(RAW_CARRY); ssDel(RAW_CHAIN);       // 溜めた分は捨てる（条件が変わるため）
    location.href = u.toString();
  }

  /* ★「状態解除」＝こちらが既定で付けた絞り込みを外して、素の結果に戻す。
     （2026-08-14 実機で指摘「目立った傷や汚れなしと個人は取れてないぞ」）
     最初は販売状況の3択だけを外していたが、それでは通常状態に戻らなかった。
     外すのは rawDefaults が付ける4つ:
       status            … 売り切れのみ
       item_condition_id … 目立った傷や汚れなし
       item_types・seller_type … 個人のみ
     ★__msqdef=1 は【残す】。外すと rawDefaults がまた同じ絞り込みを付け直す。
     ★keyword と並び順（sort/order）は触らない。 */
  /* ===== 逆向き: 既定の絞り込みを【付ける】（2026-08-18 ユーザー依頼） =====
     ★『型番検索のときはこのボタンか別ボタンでデフォに絞り込みができるようにしたい。
       別にボタンをつける余裕がないので、型番検索時は入れ替わるとか可能か？』
     ★答え: 可能。ボタンは増やさず、【型番で引いている画面の時だけ】
       同じボタンの文字と働きが入れ替わる（状態解除 ⇄ 絞り込む）。
     ★付ける中身は rawDefaults と同じ4つ（新しい順・売り切れ・目立った傷や汚れなし・
       個人のみ）。ここだけ別の値にすると食い違うので、同じ物をそろえて書く。 */
  function rawJoutaiTsukeru() {
    let u;
    try { u = new URL(location.href); } catch (e) { return; }
    u.searchParams.set('sort', 'created_time');
    u.searchParams.set('order', 'desc');
    u.searchParams.set('status', 'sold_out');
    u.searchParams.set('item_condition_id', '3');
    u.searchParams.set('item_types', 'mercari');
    u.searchParams.set('seller_type', '0');
    u.searchParams.delete('page_token');
    /* ★これを消さないと、次に開いた時に rawDefaults がまた素の状態へ戻してしまう */
    u.searchParams.set('__msqdef', '1');
    ssDel(RAW_CARRY); ssDel(RAW_CHAIN);       /* 溜めた分は捨てる（条件が変わるため） */
    location.href = u.toString();
  }
  /* 今この画面は【絞り込みが外れた型番検索】か。ここだけでボタンの向きを決める。 */
  /* 今この画面は【絞り込みが外れている】か。ボタンの向きはこれだけで決める。
     ★2026-08-18 ユーザー指示『自由に行き来できるようにしたい。
       通常はデフォが絞り込みだから解除、以後はどちらも交互に選べる。
       型番検索時は解除で出すから絞り込み、以後はどちらも交互に選べる』。
     ★よって【型番検索かどうかは見ない】。今の絞り込みの有無だけで向きを決める。
       そうすれば、どちらの画面でも押すたびに行き来できる。 */
  function rawShiboriNashi() {
    try {
      const u = new URL(location.href);
      return !u.searchParams.get('status') && !u.searchParams.get('item_condition_id');
    } catch (e) { return false; }
  }
  function rawJoutaiKaijo() {
    let u;
    try { u = new URL(location.href); } catch (e) { return; }
    ['status', 'item_condition_id', 'item_types', 'seller_type', 'page_token']
      .forEach((k) => u.searchParams.delete(k));
    /* ★解除したあとに rawDefaults がまた絞り込みを付け直さないよう、印は必ず残す。
       これが無いと、解除→即また絞り込みに戻る、を繰り返して行き来できない。 */
    u.searchParams.set('__msqdef', '1');
    ssDel(RAW_CARRY); ssDel(RAW_CHAIN);       // 溜めた分は捨てる（条件が変わるため）
    location.href = u.toString();
  }

  /* その行の入れ物の上下の余白だけをゼロにする。
     ★消す処理は入れない。効きすぎても文字が詰まるだけで何も消えない。
     ★対象は1つだけ。商品が入っている物は触らない。 */
  function rawTighten(el) {
    if (!el || el === document.body || el === document.documentElement) return;
    if (el.querySelector('a[href*="/item/"],a[href*="/shops/product/"]')) return;
    if (el.dataset && el.dataset.msqTight) return;
    el.style.setProperty('margin-top', '0', 'important');
    el.style.setProperty('padding-top', '0', 'important');
    el.style.setProperty('margin-bottom', '0', 'important');
    el.style.setProperty('padding-bottom', '4px', 'important');
    if (el.dataset) el.dataset.msqTight = '1';
  }

  /* ★2026-08-20 アンバサダーの青い帯を畳む（ユーザー依頼）。
     ★過去の大失敗: 「リンク生成」を含む箱を上から200px以内で探した結果、
       商品の入れ物ごと display:none にして商品15件が全部消えた（git c441a73 で取り消し）。
     ★今回の歯止め。次の4つを【全部】満たす物だけを畳む:
       ① header の中にある      ② 商品リンクを1つも含まない
       ③ 文字数が200以下        ④ 画面の8割以上の幅があり高さ20px以上（＝帯そのもの）
     ★ヘッダ自体には絶対に触らない（触るとマークと虫眼鏡が消える。実機で確認済み）。
     ★見つけたら1つだけ畳んで抜ける。親へは1段も遡らない。
     ★印は付けるが「印があるから飛ばす」はしない。メルカリが style を消して
       出し直すと帯が戻るため（今日それで広告が復活した）。 */
  function rawAmbObi() {
    try {
      const h = document.querySelector('header');
      if (!h) return;
      for (const e of h.querySelectorAll('div')) {
        const t = (e.textContent || '');
        if (t.indexOf('リンク生成') < 0 && t.indexOf('ambassador') < 0) continue;
        if (e.querySelector('a[href*="/item/"],a[href*="/shops/product/"]')) continue;
        if (t.length > 200) continue;
        const r = e.getBoundingClientRect();
        if (r.height < 20 || r.width < window.innerWidth * 0.8) continue;
        e.style.setProperty('display', 'none', 'important');
        if (e.dataset) e.dataset.msqObi = '1';
        return;
      }
    } catch (e) { }
  }

  function rawStatusUI() {
    if (!rawOnSearch()) return;
    /* ★2026-08-20 ユーザー『左端の売り切れのみは偽物　真ん中のすべての商品が本物』
       『左端をおしたらわかる』。メルカリ自身が3択(全ての商品/販売中のみ/売り切れのみ)を
       出すようになったので、こちらの3択は要らなくなった。二重に並んだせいで
       【並び替え(新しい順)が画面の左の外へ押し出されていた】（実機で 左-110 を実測。
       消えていたのではなく、画面の外に出ていた）。
       ★本物が出ている時だけ引っ込める。本物が無い画面では今までどおり出す（逃げ道を残す）。 */
    const honmono = document.querySelector('[data-testid="item-status-filter-select"]');
    if (honmono && honmono.getBoundingClientRect().width > 0) {
      const mine = document.getElementById('msq-raw-status');
      if (mine) mine.remove();
      return;
    }
    /* Web版の別構造では、純正の状態は select ではなく
       on-sale-condition-checkbox で出る。これを隠して自前ボタンへ置き換えると、
       並び替え・状態・絞り込みが別段になり、上部メニューが分解する。
       純正チェックがある場合は必ず純正を表示し、自前ボタンを作らない。 */
    const honmonoCheck = document.querySelector('[data-testid="on-sale-condition-checkbox"]')
      || document.querySelector('input.merCheckbox');
    if (honmonoCheck) {
      const mine = document.getElementById('msq-raw-status');
      if (mine) mine.remove();
      const lab0 = honmonoCheck.closest('label') || honmonoCheck.parentElement;
      if (lab0) lab0.style.removeProperty('display');
      return;
    }
    /* この画面に純正の状態UIがまだ無い時も、自前ボタンは作らない。
       自前ボタンを足すと純正操作行の親構造を分割するため、
       上部メニューの所有者を純正UI＋rawRestoreNativeHeadの1系統に限定する。 */
    const oldStatus = document.getElementById('msq-raw-status');
    if (oldStatus) oldStatus.remove();
    return;
    /* ★2026-08-08 ここで並びの箱を要求していたため、箱の判定が失敗した回は
       3択も道連れで出なかった（実機で3列のまま＝箱が見つかっていない証拠）。
       3択に並びの箱は要らない。切り離す。 */
    const now = rawStatusNow();

    /* 「販売中のみ表示」がある場所を探す。そこへ3択を置き、元のチェックは隠す。
       ★2026-08-08 前の探し方は当たらなかった。
         「子を持たない要素で、文字がちょうど『販売中のみ表示』」に限っていたため、
         文字が入れ子の中にあると空振りする。実機で一度も見つかっていない。
         チェックの四角から探し、その1つ上の札に「販売中のみ」が入っているかで見る。
       ★親をさかのぼってはいけない。3段さかのぼって絞り込みごと消した前科がある。
         見るのは label か、四角のすぐ上の1つだけ。 */
    /* ★実物の作り（2026-08-08 実際のHTMLを取って確認）
         <label class="merCheckboxLabel">
           <input type="checkbox" class="merCheckbox"
                  data-testid="on-sale-condition-checkbox">
           …<span class="merText">販売中のみ表示</span>
       メルカリ自身が付けている目印があるので、それを使う。 */
    let spot = null;
    const cb = document.querySelector('[data-testid="on-sale-condition-checkbox"]')
      || document.querySelector('input.merCheckbox');
    if (cb) spot = cb.closest('label') || cb.parentElement;
    /* 目印が変わった時のための保険 */
    if (!spot) {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      for (let i = 0; i < cbs.length; i++) {
        const lab = cbs[i].closest('label') || cbs[i].parentElement;
        if (!lab) continue;
        if ((lab.textContent || '').indexOf('販売中のみ') < 0) continue;
        if (lab.querySelector('a[href*="/item/"],a[href*="/shops/product/"]')) continue;
        spot = lab;
        break;
      }
    }
    /* 四角で見つからない時は文字で探す（作りが変わった時の保険） */
    if (!spot) {
      const marks = document.querySelectorAll('span,label,p,div');
      for (let i = 0; i < marks.length; i++) {
        const e = marks[i];
        if (e.children.length !== 0) continue;
        if ((e.textContent || '').indexOf('販売中のみ') < 0) continue;
        spot = e.closest('label') || e.parentElement || e;
        break;
      }
    }

    /* すでに出してある時。場所が後から見つかったら、そこへ移す。
       ★出した後に打ち切っていたため、先に一覧の上へ出た回は永久に動かなかった。 */
    const already = document.getElementById('msq-raw-status');
    if (already) {
      if (spot && spot.parentElement && already.parentElement !== spot.parentElement) {
        spot.parentElement.insertBefore(already, spot);
        spot.style.setProperty('display', 'none', 'important');
        /* 上に無駄なスペースが空くので1行ぶん詰める（ユーザー指定 2026-08-08）。
           ★動かすのはこちらの箱だけ。メルカリ側の余白には触らない。 */
        already.style.margin = '-20px 0 0';
      }
      return;
    }

    const box = document.createElement('div');
    box.id = 'msq-raw-status';
    box.style.cssText = 'margin:8px 12px;';
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:9px 14px;border:1px solid rgba(128,128,128,.5);'
      + 'border-radius:8px;background:transparent;color:inherit;font:700 14px system-ui;';
    btn.textContent = RAW_ST_LABEL[now] + '  ▾';
    const menu = document.createElement('div');
    menu.style.cssText = 'display:none;margin-top:6px;border:1px solid rgba(128,128,128,.4);'
      + 'border-radius:8px;overflow:hidden;';
    ['', 'on_sale', 'sold_out'].forEach((v, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:13px 12px;'
        + 'font:400 15px system-ui;' + (i ? 'border-top:1px solid rgba(128,128,128,.25);' : '');
      const tx = document.createElement('span');
      tx.style.cssText = 'flex:1;min-width:0;';
      tx.textContent = RAW_ST_LABEL[v];
      const rd = document.createElement('input');
      rd.type = 'radio';
      rd.name = 'msq-raw-status-r';
      rd.checked = (v === now);
      rd.style.cssText = 'width:20px;height:20px;flex:0 0 auto;';
      row.appendChild(tx);      // 文字が左
      row.appendChild(rd);      // 丸い選択は文字の後ろ（右）
      row.addEventListener('click', () => rawStatusGo(v));
      menu.appendChild(row);
    });
    btn.addEventListener('click', () => {
      menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
    });
    box.appendChild(btn);
    box.appendChild(menu);

    if (spot && spot.parentElement) {
      spot.parentElement.insertBefore(box, spot);
      spot.style.setProperty('display', 'none', 'important');  // 隠すのはこの1つだけ
      box.style.margin = '0';
      /* 上下の無駄なスペースを詰める（ユーザー指定 2026-08-08）。
         ★どの段が空けているか当てにいって2回外した。上に4段まとめてゼロにする。
           変えるのは余白の数字だけ。消す処理は入れないので何も無くならない。 */
      let up = spot.parentElement;
      for (let i = 0; i < 4 && up; i++) { rawTighten(up); up = up.parentElement; }
    } else {
      const grid = rawFindGrid();
      if (grid && grid.parentElement) grid.parentElement.insertBefore(box, grid);
    }
  }

  /* ========= 1列の時だけ、横スワイプで消す（2026-08-08・PATCH） =========
     ★縦の動きが勝っている間は何もしない。スクロールを邪魔しないため。
     ★✕はそのまま残す。どちらでも消せる。
     ★消したものの覚え方・戻し方は✕と同じ（同じ入れ物を使う）。 */
  function rawSwipeCell(el) {
    const SEL = 'a[href*="/item/"],a[href*="/shops/product/"]';
    let box = el;
    for (let up = 0; up < 8; up++) {
      const p = box.parentElement;
      if (!p) break;
      if (p.querySelectorAll(SEL).length > 1) break;
      box = p;
    }
    return box;
  }

  function rawSwipe() {
    const anchors = document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]');
    anchors.forEach((a) => {
      if (a.__msqSwipe) return;
      if (!a.querySelector('img') && !a.querySelector('[role="img"]')) return;
      a.__msqSwipe = true;
      let x0 = 0, y0 = 0, on = false, moved = false;

      a.addEventListener('touchstart', (ev) => {
        /* 1列の時だけ。2列の時は誤って消えると困る。 */
        if ((rawNum(localStorage.getItem(RAW_COLS_KEY)) || 2) !== 1) { on = false; return; }
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        x0 = t.clientX; y0 = t.clientY; on = true; moved = false;
      }, { passive: true });

      a.addEventListener('touchmove', (ev) => {
        if (!on) return;
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dy) > Math.abs(dx)) {      // 縦が勝ち＝スクロールに譲る
          on = false;
          a.style.transform = '';
          a.style.opacity = '';
          return;
        }
        if (Math.abs(dx) < 12) return;
        moved = true;
        a.style.transform = 'translateX(' + dx + 'px)';
        a.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260));
        if (ev.cancelable) ev.preventDefault();
      }, { passive: false });

      const end = (ev) => {
        if (!on) return;
        on = false;
        const t = (ev.changedTouches && ev.changedTouches[0]) || null;
        const dx = t ? (t.clientX - x0) : 0;
        a.style.transition = 'transform .15s, opacity .15s';
        if (moved && Math.abs(dx) > 100) {      // 左右どちらでも消える
          const id = rawIdOf(a);
          if (id) { rawMarkHidden(id); }   /* 記録も一緒に残す（2026-08-11） */
          rawSwipeCell(a).style.display = 'none';
          rawUpdateCount();
        } else {
          a.style.transform = '';
          a.style.opacity = '';
        }
        setTimeout(() => { a.style.transition = ''; }, 200);
      };
      a.addEventListener('touchend', end, { passive: true });
      a.addEventListener('touchcancel', end, { passive: true });
    });
  }

  /* -------------------------------------------------------------------- 起動 */
  /* 検索ページにいるか。画面の切り替えで変わるので、そのつど見る。 */
  const rawOnSearch = () => location.pathname.indexOf('/search') === 0;

  /* 一覧カードを持つメルカリ画面か（検索・出品者・いいね一覧）。
     ★検索画面用の rawStart は絞り込みや帯まで含むため、URL判定をここで
     単純に広げない。出品者・いいね一覧にはカードの操作だけを足す。 */
  const rawOnMercariList = () => {
    try {
      if (location.hostname !== 'jp.mercari.com') return false;
      if (/^\/item\//.test(location.pathname) || /^\/shops\/product\//.test(location.pathname)) return false;
      return !!document.querySelector('a[href*="/item/"],a[href*="/shops/product/"]');
    } catch (e) { return false; }
  };

  function rawListStart() {
    try {
      if (rawOnSearch() || !rawOnMercariList()) return;
       /* 検索画面以外は、一覧を壊す検索用の帯・絞り込み処理を呼ばない。 */
       rawInjectStyle();
       rawDecorate();
       rawApplyHomeLikeCols();
    } catch (e) {
      try { console.warn('[MSQ/一覧] ' + e.message); } catch (e2) { }
    }
  }

  /* ===== 拡大画面で画像が上にはみ出すのを直す（2026-08-10・実機で原因確定） =====
     アプリでだけ起きる。クエッタでは起きない。こちらのコードは無関係だった
     （帯も箱も残っていないページで再現し、styleタグを外しても変わらなかった）。
     実測した中身:
       画面いっぱいの枠(781) の中で、画像を入れる枠の高さが【0px】で固まっていた。
       画像は高さ475。高さ0の枠の中央に置かれるので、上に半分(-237)はみ出す。
       resize を送っても直らない＝一度0として計算したまま固定されている。
     直し方: 高さ0のまま中身がある枠に、画面いっぱいの高さを入れる。
       実機で入れたところ 上-237 → 上153（(781-475)/2＝ちょうど中央）になった。
     ★働くのは【拡大画面が開いている時だけ】。
       画面いっぱいの固定の枠が見つからない時は何もしない。 */
  function rawZoomFix() {
    const W = window.innerWidth, H = window.innerHeight;
    let bad = null;
    const ims = document.querySelectorAll('img');
    for (let i = 0; i < ims.length; i++) {
      const r = ims[i].getBoundingClientRect();
      if (r.width > W * 0.8 && r.height > 50 && r.top < -20) { bad = ims[i]; break; }
    }
    if (!bad) return;
    let box = bad;
    for (let k = 0; k < 10 && box.parentElement; k++) {
      box = box.parentElement;
      const cs = getComputedStyle(box);
      if (cs.position === 'fixed' && box.getBoundingClientRect().height > H * 0.8) break;
    }
    if (getComputedStyle(box).position !== 'fixed') return;   // 拡大画面ではない
    const boxH = Math.round(box.getBoundingClientRect().height);
    if (boxH < H * 0.8) return;
    box.querySelectorAll('*').forEach((e) => {
      if (e.clientHeight === 0 && e.scrollHeight > 50) {
        e.style.setProperty('height', boxH + 'px', 'important');
      }
    });
  }

  /* ===== 一覧で画像が潰れる（題だけになる）のを直す（2026-08-13） =====
     ★実機で測った事実:
         潰れている: 親のa 高さ2px → 画像枠も2px（.fluid__a6f874a2 が height:100% のため）
         出ている  : 親のa 高さ190px → 画像枠190px（幅と同じ正方形）
         高さを決めているCSSはメルカリ自身の .fluid__a6f874a2 { height: 100% }
       ★メルカリ側が親の高さを決めそこねている。こちらのUL列指定との関係は
         MutationObserverが付け直すため切り分けできず、断定していない。
       ★直し方は実機で確認済み: 潰れた枠の親に【幅と同じ高さ】を入れると正方形に戻る
         （実測 潰れ5→3・出ている7→9、枠は190x190）。
     ★正常な物には触らない。高さ40px未満かつ幅80px以上の物だけ。 */
  function rawGazouFix() {
    document.querySelectorAll('[class*="merItemThumbnail"]').forEach((th) => {
      const w = Math.round(th.getBoundingClientRect().width);
      if (w < 80) return;                       /* 幅がまだ決まっていない。触らない */
      const im = th.querySelector('img');
      if (!im) return;
      /* ★判定は【絵そのものの高さ】で見る（2026-08-13 実機で確認）。
         外側の枠だけ見ていたため、枠を190にした後は「直った」と誤判定して
         中の imageContainer / picture / img が2pxのまま残り、
         「枠は正常なのに真っ黒」になっていた。 */
      if (Math.round(im.getBoundingClientRect().height) >= 40) return;   /* 正常。触らない */
      const oya = th.parentElement;
      try {
        if (oya) oya.style.setProperty('height', w + 'px', 'important');
        th.style.setProperty('height', w + 'px', 'important');
        const naka = th.querySelectorAll('figure,[class*="imageContainer"],picture,img');
        for (let i = 0; i < naka.length; i++) {
          naka[i].style.setProperty('height', w + 'px', 'important');
        }
        if (oya && oya.dataset) oya.dataset.msqGazou = String(w);
      } catch (e) { }
    });
  }

  /* ===== 覆いが開いている間は「引っ張って更新」を止める（2026-08-13） =====
     ★症状: 絞り込みを開いて下まで送ると、上に戻せず【更新】になってしまう。
     ★実機で測った事実:
         絞り込みは merSideSheet（画面いっぱいの固定）。
         body は position:fixed / overflow:hidden で、window の位置は 0 のまま。
         実際に動くのは中の div（位置600）。
       引っ張って更新は【WebView自身が一番上か】しか見ないので、常に一番上と判断し、
       指の下向きの動きを毎回横取りしていた。
     ★覆いが開いている間だけ止め、閉じたら必ず戻す。止めるのは引っ張って更新だけ。 */
  let rawPullIma = null;
  function rawPullFix() {
    let ooi = false;
    try {
      /* メルカリは覆いを出す時に body を固定する。これが一番確かな目印。 */
      const bs = getComputedStyle(document.body);
      ooi = (bs.position === 'fixed' || bs.overflow === 'hidden');
    } catch (e) { return; }
    const hoshii = !ooi;                    /* 覆いが無い時だけ更新を使えるようにする */
    if (rawPullIma === hoshii) return;      /* 変わっていなければ何もしない */
    rawPullIma = hoshii;
    try {
      if (window.MsqApp && window.MsqApp.setPull) window.MsqApp.setPull(hoshii);
    } catch (e) { }
  }


  /* ===== 帯の下に「実際の相場からの利益」を出す（2026-08-14 ユーザー指摘） =====
     ★指摘: 「型番でメルカリの結果を出すときは利益が出せてないぞ。予想価格が出てたぞ」
       そのとおりで、帯に出していた「売 ¥／益 ¥」は【仕入値から逆算した目標の売値】であり、
       メルカリに実際いくらで並んでいるかを一切見ていなかった。
     ★本家 msqRenderProfitHtml と同じ規則で出す:
         売り切れがある → 高値 / 安値 / 平均×0.98（＋販売中があれば最安値）
         売り切れが無い → 販売中の最安値だけ（参考値）
         どちらも無い   → 出さない（違う状態の値段で計算しても相場の意味が無い）
         対象は【仕入元と同じ状態】に限る
     ★目標の売値（帯の「売 ¥／益 ¥」）は残す（ユーザー指示）。意味が違うため。 */
  function rawSoubaFix() {
    const cost = rawNum(SP.get('__msqprice'));
    if (!cost) return;                       /* 仕入値が無ければ計算しない */
    if (!rawOnSearch()) { const o = document.getElementById('msq-raw-souba'); if (o) o.remove(); return; }
    const rank = SP.get('__msqsrcrank') || '';
    const jou = lCondFromRank(rank);
    /* 一覧のタイルから 価格・状態・売り切れ を読む（実機で読めることを確認済み） */
    const mita = {}, list = [];
    try {
      document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach((a) => {
        if (rawIsAd(a)) return;
        /* ★2026-08-18 消した商品を計算に入れない。ここが無かったので、
           ✕で消しても利益がまったく変わらなかった。
           見るのは2つ: ①消した一覧に入っている ②画面から消えている(display:none)。 */
        try {
          const id9 = rawIdOf(a);
          if (id9 && rawHidden.has(id9)) return;
          let e9 = a;
          for (let n9 = 0; n9 < 8 && e9; n9++) {
            if (e9.style && e9.style.display === 'none') return;
            e9 = e9.parentElement;
          }
        } catch (e) { }
        let kagi = null;
        for (const k in a) { if (k.indexOf('__reactFiber$') === 0) { kagi = k; break; } }
        if (!kagi) return;
        let f = a[kagi], mi = null;
        for (let i = 0; i < 20 && f; i++) {
          const p = f.memoizedProps || f.pendingProps;
          if (p) {
            for (const q in p) {
              const v = p[q];
              if (v && typeof v === 'object' && !Array.isArray(v) && ('status' in v) && ('price' in v)) { mi = v; break; }
            }
          }
          if (mi) break;
          f = f.return;
        }
        if (!mi || !mi.id || mita[mi.id]) return;
        mita[mi.id] = 1;
        const cid = parseInt(mi.itemConditionId, 10);
        list.push({
          price: rawNum(mi.price),
          sold: (mi.status === 'ITEM_STATUS_SOLD_OUT' || mi.status === 'ITEM_STATUS_TRADING'),
          cond: (cid >= 1 && cid <= 6) ? LCOND_RANK[cid - 1] : 'unknown'
        });
      });
    } catch (e) { }
    if (!list.length) return;
    const onaji = list.filter((r) => r.price > 0 && (jou ? r.cond === jou : true));
    const sold = onaji.filter((r) => r.sold === true);
    const uri = onaji.filter((r) => r.sold === false);
    const gyo = (label, sell) => {
      const p = lProfit(sell, cost);
      const iro = (p >= 0) ? '#4ade80' : '#f87171';
      return '<span style="margin-right:10px;">' + rawEsc(label) + ' ¥' + sell.toLocaleString()
        + ' → <span style="color:' + iro + ';font-weight:700;">¥' + p.toLocaleString() + '</span></span>';
    };
    let naka = '';
    if (sold.length > 0) {
      const s2 = sold.slice().sort((a, b) => b.price - a.price);
      const takane = s2[0].price, yasune = s2[s2.length - 1].price;
      const heikin = Math.round(((takane + yasune) / 2) * 0.98);
      naka = gyo('高値', takane) + gyo('安値', yasune) + gyo('平均×0.98', heikin);
      if (uri.length > 0) naka += gyo('販売中最安', uri.reduce((a, b) => (a.price <= b.price ? a : b)).price);
      if (sold.length === 1) naka += '<span style="color:#fbbf24;">⚠売り切れ1件のみ</span>';
      if (!jou) naka += '<span style="color:#fbbf24;">⚠仕入元の状態が未取得のため状態を絞っていません</span>';
    } else if (uri.length > 0) {
      naka = gyo('販売中最安', uri.reduce((a, b) => (a.price <= b.price ? a : b)).price)
        + '<span style="color:#fbbf24;">⚠売り切れ0件のため参考値</span>';
    } else {
      naka = '<span style="color:#cbd5e1;">同じ状態「'
        + rawEsc(LCOND_LABEL[jou] || '（未取得）') + '」の候補が0件のため利益は出していません</span>';
    }
    let e = document.getElementById('msq-raw-souba');
    if (!e) {
      e = document.createElement('div');
      e.id = 'msq-raw-souba';
      e.style.cssText = 'position:fixed;left:0;right:0;z-index:2147482900;'
        + 'background:#0b3b5c;color:#e5e7eb;font:400 11px/1.6 system-ui;padding:3px 8px;'
        + 'white-space:nowrap;overflow-x:auto;';
      document.body.appendChild(e);
    }
    /* 帯のすぐ下に置く。帯が隠れている時はこちらも隠す。 */
    const bar = document.getElementById('msq-raw-bar');
    if (bar && getComputedStyle(bar).display !== 'none') {
      const br = bar.getBoundingClientRect();
      e.style.display = 'block';
      e.style.top = Math.round(br.bottom) + 'px';
    } else {
      e.style.display = 'none';
    }
    if (e.dataset.msqNaka !== naka) { e.innerHTML = naka; e.dataset.msqNaka = naka; }
  }

  /* ===== 型番で引いた一覧から「共通して使われている語」＝固有名詞を測る（2026-08-17 新規） =====
     ★ユーザー案。Geminiに聞くより上と判断した理由:
       ① Googleを一切使わない（2026-08-01に弾かれた制限を食わない）
       ② 引きたいのはメルカリなので、公式名より【出品者が実際に書く語】の方が当たる
       ③ 型番一致で出た一覧＝ほぼ同じ商品。そこで共通する語は根拠が強い
     ★これは推測で組み立てた語ではなく【実物を数えて出した語】。よってユーザーの言う
       「こちらで作った弱い固有名詞」には当たらない。
     ★数え方は既にある msqInferBrandCategoryFromTitles（544行）と同じ考え方に揃える:
       件数で数える／大文字小文字を揃える／割合で閾値を切る。
     ★ユーザー指定:
       ・3件未満なら判定しない（2件で「両方に出た」は根拠にならない）
       ・裏起毛やダウンのような説明の語も、共通しているなら採用。共通していなければ不採用。
         よって「説明の語だから」という理由では落とさない。落とすのは
         ブランド／カテゴリー／サイズ／色／型番そのもの／数字だけ／新品などの札だけ。 */
  /* ===== Geminiの推奨検索ワードを一覧に出す（2026-08-18 ユーザー依頼） =====
     ★『一覧に GEMINI 推奨検索ワードとして出す場所あれば』。
     ★中身は Gemini が『🔎 メルカリでの検索のコツ』として自分で書いている行。
       実機で取れた例: 『ato フレア パンツ』『ato スラックス 44』『アトウ 立体裁断 パンツ』
     ★レンズの画面で読んで、3画面共通の置き場に預けてある物を出すだけ。通信は増えない。
     ★押すとその言葉でメルカリを引く。型番が使えない服で母数を増やすのが狙い。
       絞り込みは付けない（母数を減らさないため。付けたい時は帯の『絞り込む』を押す）。 */
  function rawGeminiWords() {
    try {
      if (!rawOnSearch()) return;
      const bar = document.getElementById('msq-raw-bar');
      if (!bar || document.getElementById('msq-gemini-words')) return;
      const t = rawKoyuuLoad('GEMINIWORDS');
      if (!t) return;
      const go = String(t).split('|').map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4);
      if (!go.length) return;
      const box = document.createElement('span');
      box.id = 'msq-gemini-words';
      box.dataset.msqUri = '1';
      box.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;';
      const midashi = document.createElement('span');
      midashi.textContent = 'Gemini推奨';
      midashi.style.cssText = 'color:#a7f3d0;font-weight:700;';
      box.appendChild(midashi);
      go.forEach((g) => {
        const b = document.createElement('button');
        b.className = 'msq-raw-btn';
        b.dataset.msqUri = '1';
        b.textContent = g;
        b.title = 'この言葉でメルカリを引く（絞り込みなし）';
        b.style.setProperty('background', '#065f46', 'important');
        b.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          try {
            const u = new URL('https://jp.mercari.com/search');
            u.searchParams.set('keyword', g);
            u.searchParams.set('__msqraw', '1');
            u.searchParams.set('__msqdef', '1');   /* 絞り込みを勝手に付けない */
            ['__msqsrcimg', '__msqsrcrank', '__msqprice', '__msqsrcbrand', '__msqsrcdai']
              .forEach((k) => { const v = SP.get(k); if (v) u.searchParams.set(k, v); });
            /* ★別タブ（メルカリタブ）で開く。今出ている一覧が消えないように。
               ユーザー指示『結果が消えないように別タブにしろよ』。 */
            if (window.MsqApp && typeof window.MsqApp.openMercari === 'function') {
              window.MsqApp.openMercari(u.toString());
            } else {
              ssDel(RAW_CARRY); ssDel(RAW_CHAIN);
              location.href = u.toString();
            }
          } catch (e) { }
        });
        box.appendChild(b);
      });
      (document.getElementById('msq-raw-meta') || bar).appendChild(box);
    } catch (e) { }
  }

  function rawKoyuuMeishi() {
    let kata = '';
    try { kata = String(SP.get('__msqsrcmodel') || '').trim(); } catch (e) { return; }
    if (!kata) return;                              /* 型番で引いた一覧の時だけ測る */
    if (window.__msqKoyuuDone === location.search) return;   /* 1画面につき1回 */

    /* タイトルを集める（題の出どころは rawTileData に任せる。別の所から取ると食い違う） */
    const dai = [], mita = {};
    try {
      document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach((a) => {
        const d = rawTileData(a);
        if (!d || !d.n || !d.i || mita[d.i]) return;
        mita[d.i] = 1;
        dai.push({ n: String(d.n), b: String(d.b || '') });
      });
    } catch (e) { return; }

    /* ★2026-08-18 ユーザー指示『3件じゃなく1件でもいい』。
       1件でも語は取り出す。ただし1〜2件は多数決が効かないので【仮の候補】であって、
       確かめるまでは保存しない（下の rawKoyuuKakunin で答え合わせをする）。 */
    if (!dai.length) return;
    window.__msqKoyuuDone = location.search;

    /* ★2026-08-17 【メルカリが返してきた一覧が、本当に同じ商品かを確かめる】。
       ★実測でつかまえた事故: 型番『2S303』（SEVEN TEN のスカート）で引いたら、
         東芝のレコーダー『VARDIA RD-S303』など【全く別の商品】が18件返ってきた。
         メルカリの検索はあいまいなので、短い型番は関係ない物を拾う。
         この確かめが無いと、スカートの固有名詞として『VARDIA RD-S303』を保存していた。
       ★確かめ方はブランド。仕入元のブランドと合わない題は数に入れない。
         判定は lBrandAu（レンズ側と同じ物差し。ここだけ別の書き方をしない）。
       ★「題に型番が入っているか」では見分けられないことも実測で確認した:
         GA-2100=17/18件・GMW-B5000=17/18件（正しい）に対し、
         DD1391=2/18件（正しいのに型番を書いていない）、2S303=0/18件（間違い）。
         正しい方と間違いの方が同じ数字になるので、この見方は使えない。 */
    let srcBrand = '';
    try { srcBrand = String(SP.get('__msqsrcbrand') || '').trim(); } catch (e) { }
    if (srcBrand) {
      const au = dai.filter((x) => lBrandAu(x.n + ' ' + x.b, { brand: srcBrand, model: kata }) !== false);
      if (au.length < 1) {
        /* 同じブランドの物が1件も無い＝別商品の一覧。黙って何もしない。 */
        try {
          window.__msqKoyuuLog = {
            型番: kata, 仕入元ブランド: srcBrand,
            題の件数: dai.length, 同じブランドの題: au.length,
            採用: [], 理由: '同じブランドの題が1件も無いので測らなかった（別商品の一覧）'
          };
        } catch (e) { }
        return;
      }
      dai.length = 0;
      au.forEach((x) => dai.push(x));
    }


    const KIRU = /[\s　\/,、。・()（）\[\]【】｜|★☆■□●○◆◇▲△▼▽※＊*＜＞<>〜~"'`:：;；!！?？＋+#＃@＆&]+/;
    /* ★2026-08-17 ユーザー指摘『本体が固有名詞なのか？それは単語だろ』。
       本体・箱付・付属品のような【状態や付属を言う語】は、商品を名指しする語ではないので
       固有名詞には入れない。閾値を2割に下げたぶん、ここを外さないと混ざる。
       ★裏起毛やダウンのような【物そのものを言う語】は、ユーザー指定により落とさない。
         落とすのはあくまで「札」と「状態・付属の言い方」だけ。 */
    const FUDA = /^(新品|未使用|中古|美品|良品|極美品|激安|送料無料|送料込|送料込み|即決|限定|正規品|正規|本物|タグ付|タグ付き|専用|値下げ|お値下げ|セール|メルカリ|mercari|used|new|sale|off|item|used品|本体|本体のみ|箱付|箱付き|箱なし|箱無し|付属品|付属|完品|未開封|開封済|ケース付|ケース付き|説明書|保証書|動作品|稼働品|ジャンク|訳あり|レア|希少|人気|廃盤|正規店|即購入可?|値下げ不可)$/i;
    const kataU = kata.toUpperCase().replace(/[-_\/\.\s　]/g, '');
    const kazu = {}, hyouki = {};
    /* ★2026-08-17 ブランド名は【一覧ぜんぶのブランド欄】を集めてから外す。
       直す前は「その題自身のブランド欄」としか見ていなかったため、
       ブランド欄が G-SHOCK の題では CASIO という語が外れず、
       固有名詞が『CASIO G-SHOCK カシオーク』になっていた（実測）。
       コピーはブランドを別に足すので、ここに入れると二重になるうえ、
       メルカリの検索はAND（全部を含む物）なので語を増やすほど当たらなくなる。
       ★ブランド欄は実測で埋まっていることを確認済み（G-SHOCK / CASIO）。 */
    const brandSet = [];
    dai.forEach((x) => {
      const b = String(x.b || '').toUpperCase().trim();
      if (b && brandSet.indexOf(b) < 0) brandSet.push(b);
    });
    /* 題ごとに「その題に出た語」を覚えておく */
    const daiGo = [];
    dai.forEach((x) => {
      const mita2 = {};
      daiGo.push(mita2);
      String(x.n).split(KIRU).forEach((t0) => {
        const t = String(t0 || '').trim();
        if (!t || t.length < 2 || t.length > 20) return;
        const K = t.toUpperCase();
        if (mita2[K]) return;                        /* 同じ題の中で2回出ても1件と数える */
        mita2[K] = 1;
        if (FUDA.test(t)) return;                    /* 新品・送料無料などの札 */
        if (/^[0-9０-９,.\-]+$/.test(t)) return;       /* 数字だけ */
        /* ★2026-08-17 型番は「そのもの」だけでなく【型番を含む語】も落とす。
           実測: GMW-B5000 で『GMW-B5000D-1JF』、DW-5600 で『DW-5600BB』を
           固有名詞として採ってしまっていた。これは型番の長い書き方であって、
           ブランドが作った名前（フルメタル等）ではない。 */
        const KK = K.replace(/[-_\/\.]/g, '');
        if (kataU && (KK === kataU || KK.indexOf(kataU) >= 0 || kataU.indexOf(KK) >= 0)) return;
        /* ブランド（一覧に出てきたブランド名すべてと突き合わせる） */
        if (brandSet.some((b) => b.indexOf(K) >= 0 || K.indexOf(b) >= 0)) return;
        if (CATEGORY_TOKENS.indexOf(t) >= 0) return;               /* カテゴリー語 */
        if (RAW_SIZE_LIKE.test(t) || RAW_COLOR_LIKE.test(t) || RAW_ERA_LIKE.test(t)) return;
        kazu[K] = (kazu[K] || 0) + 1;
        if (!hyouki[K]) hyouki[K] = t;               /* 出す時は最初に見た表記を使う */
      });
    });
    /* ★2026-08-17 閾値を過半数(50%)から【2割】に下げた。
       ★経緯: 私が「3割にすればカシオークが採れる」と言ったのは【間違い】だった。
         実測は 18件中4件＝22% なので、3割（＝6件必要）でも採れない。
         ユーザーの狙いは「カシオークは採る／本体のような語は採らない」。
         それを満たすのは2割（18件なら4件以上）で、本体は3件なので入らない。
       ★2割は、既にある msqInferBrandCategoryFromTitles のカテゴリー推定と同じ数字。
       ★ブランド名（CASIO など）が入るのは構わない、とユーザーが明言している
         （出すのは「ブランド＋固有名詞」なので、重なる分はコピー側で1つに畳む）。 */
    /* ★2026-08-17 割合をやめて【3件】にした（ユーザー指摘）。
       理由: 服は型番で引いても1件しか無い物が多い。割合だと、
         ・件数が少ない時 … 2割＝1件でも通ってしまい、根拠にならない
         ・件数が多い時   … 2割に届かない本物の通称を落とす（カシオークは22%だった）
       固有名詞があって売れている物なら、数件は必ず出るはず、というのがユーザーの読み。
       ★件数に関係なく「3件以上に出た語」だけを採る。上の『題が3件未満なら判定しない』
         と合わせて、最低でも3件の裏付けがある語しか採らない。
       ★件数が多い時に薄い語が混ざる心配は、下の『多い順に3語まで』で抑えられる
         （100件中3件の語が上位3つに入ることはない）。 */
    /* ===== 確かめ方①（強い）: 仕入元の題とメルカリの題に【同じ語】が出るか =====
       ★ユーザー案『レンズ結果のGeminiの答えとメルカリのキーワードが一致してるかで取る。
         カインドオルはカインドオルのタイトルでもいいかも』。
       ★件数で確かめる案は実測で潰れた: 『フルメタル』で15件出たが、中身は
         ポケモンカード・水彩絵具で全部別物だった。件数は根拠にならない。
       ★2つの出どころが同じ語を書いている、これが本当の裏取り。
         メルカリが【1件しか無くても成立する】（多数決が要らない）。
       ★実測（本物のメルカリ・検証/一致で確かめる.js）:
           GMW-B5000 仕入元「…GMW-B5000D-1JF フルメタル 腕時計」→ フルメタル ✓
           DD1391    仕入元「NIKE ナイキ DUNK LOW RETRO DD1391-100 スニーカー」
                     → DUNK LOW RETRO ✓
           GA-2100   仕入元にカシオークが無い → 何も採らない（正しい）
       ★ブランド・型番・カテゴリー・札は、上の数える段ですでに落としてある。 */
    let srcDai = '';
    try { srcDai = String(SP.get('__msqsrcdai') || '').trim(); } catch (e) { }
    /* ★3つ目の出どころ＝Gemini。レンズ結果ページで読んで型番をキーに預けてある。
       仕入元の題に無い通称（カシオークなど）は、こちらで裏が取れることがある。
       ★Googleへの通信は増やさない。すでに読んで預けてある物を取り出すだけ。 */
    try {
      const g = rawKoyuuLoad('GEMINI:' + kata);
      if (g) srcDai = (srcDai + ' ' + g).trim();
    } catch (e) { }
    const ichiKey = {};
    if (srcDai) {
      const seiki = (x) => String(x).toUpperCase().replace(/[\s　'’`.\-_]/g, '');
      const srcSet = {};
      srcDai.split(KIRU).forEach((t0) => {
        const t = String(t0 || '').trim();
        if (t.length >= 2) srcSet[seiki(t)] = 1;
      });
      Object.keys(kazu).forEach((K) => { if (srcSet[seiki(K)]) ichiKey[K] = 1; });
    }

    /* ★2026-08-18 1〜2件しか無い時は「その全部の題にある語」を採る（＝件数そのもの）。
       3件以上ある時は今までどおり3件。
       ★ただし①で仕入元と一致した語は、件数に関わらず必ず採る（裏が取れているため）。 */
    const shikii = Math.min(3, dai.length);
    const nokoru = {};
    Object.keys(kazu).forEach((k) => { if (kazu[k] >= shikii || ichiKey[k]) nokoru[k] = 1; });

    /* ★2026-08-17 【書き分けを一緒に出るかで落とす】案は入れて測って【外した】。
       DD1391 では効かず（ナイキ系の題は SEO のため日本語と英語を1つの題に両方書くので、
       書き分けなのに一緒に出る）、GMW-B5000 では逆に本物の通称『フルメタル』を
       消してしまった（CASIO と一緒に出ないため）。実測して害の方が大きいと分かったので置かない。
       代わりに『何語まで』の上限で長さを抑える（下）。 */
    /* ★語数の上限。メルカリの検索はAND（全部を含む物）なので、語を並べすぎると0件になる。
       多い順に3語まで。並べる順は下の土台の題に合わせる。
       ★実測で4語→3語にした。DD1391 が『DUNK LOW RETRO ダンク』となり、
         4語目に書き分けの『ダンク』が入っていた。3語なら『DUNK LOW RETRO』。
         カシオーク／フルメタルは1語なので、3語にしても失わない。 */
    /* ★同じ数の語が並んだ時は【一番多い語と同じ書き方】を先にする。
       実測: DD1391 は RETRO 7件 と レトロ 7件 が並び、どちらが残るかが
       読み込みのたびに変わっていた。一番多い語が DUNK（英字）なので、
       英字の RETRO を残す方が『DUNK LOW RETRO』とそろう。 */
    const eiji = (K) => /[A-Za-z]/.test(K);
    const kamiK = Object.keys(nokoru).sort((a, b) => kazu[b] - kazu[a])[0] || '';
    const kamiEiji = eiji(kamiK);
    Object.keys(nokoru)
      .sort((a, b) => (kazu[b] - kazu[a])
        || ((eiji(b) === kamiEiji ? 1 : 0) - (eiji(a) === kamiEiji ? 1 : 0)))
      .slice(3)
      .forEach((K) => { delete nokoru[K]; });
    /* ★数えた中身を必ず残す。採らなかった時に「数えたが届かなかった」のか
       「そもそも数えていない」のかを、推測せずに見分けられるようにする。 */
    try {
      window.__msqKoyuuLog = {
        型番: kata,
        題の件数: dai.length,
        型番を含む題: dai.filter((x) => String(x.n).toUpperCase().replace(/[-_/.s　]/g, '').indexOf(kataU) >= 0).length,
        ブランド欄: dai.map((x) => x.b).filter(Boolean),
        閾値: shikii,
        多い順: Object.keys(kazu).sort((a, b) => kazu[b] - kazu[a]).slice(0, 12)
          .map((k) => (hyouki[k] || k) + ' ' + kazu[k] + '件'),
        採用: Object.keys(nokoru).map((k) => hyouki[k] || k)
      };
    } catch (e) { }
    if (!Object.keys(nokoru).length) return;

    /* 並びは【題に出てくる順】にする。そうすれば Atom AR Hoody のように
       離れた語が元の語順のままつながる。一番多くの語を含む題を土台にする。 */
    let dodai = '', kazuMax = -1;
    dai.forEach((x) => {
      let n = 0;
      String(x.n).split(KIRU).forEach((t0) => {
        const K = String(t0 || '').trim().toUpperCase();
        if (nokoru[K]) n++;
      });
      if (n > kazuMax) { kazuMax = n; dodai = String(x.n); }
    });
    const deta = [], sumi = {};
    dodai.split(KIRU).forEach((t0) => {
      const t = String(t0 || '').trim();
      const K = t.toUpperCase();
      if (!nokoru[K] || sumi[K]) return;
      sumi[K] = 1;
      deta.push(hyouki[K] || t);
    });
    /* ★2026-08-17 ここで「土台の題に無かった語も足す」ことを【やめた】。
       ★実測（DD1391・2割の時）: 足していたため
         『ナイキ ダンク ロー レトロ パンダ DUNK LOW RETRO』という長い文字列になった。
         ダンク=DUNK、ロー=LOW、レトロ=RETRO は【同じ語の書き分け】で、
         出品者はどちらか一方しか書かない。メルカリの検索はAND（全部含む物）なので、
         両方を入れた語で引くと1件も出なくなる。
       ★直し: 【1つの本物の題】を土台にして、そこに出ている語だけを使う。
         1つの題は英語かカタカナのどちらかで書かれているので、書き分けが混ざらない。
         実測はこの直しで DD1391→『DUNK LOW RETRO』、GA-2100→『CASIO G-SHOCK カシオーク』。 */
    const moji = deta.join(' ').trim();
    if (!moji) return;
    /* ★2026-08-18 ユーザーの問い『固有名詞かを確認するすべはないんか？』への答え。
       ★ある。【その語でメルカリを引いて、何件出るか】を見ればよい。
         本物の固有名詞なら、型番を書いていない出品まで含めて何件も出る。
         こちらのでっち上げなら0件か、ほとんど出ない。
         これは追加の道具も通信先も要らない（下でどのみち繋ぐ検索の件数を見るだけ）。
       ★よって:
         ・題が3件以上あって多数決が効いた時 … その場で確かなものとして保存する
         ・題が1〜2件しかない時（仮の候補）  … 保存しない。繋いだ先の件数で答え合わせをして、
                                              出たときだけ保存する（rawKoyuuKakunin）。 */
    /* 確かなもの＝どちらかが成り立つ:
         ① 仕入元の題とメルカリの題に同じ語があった（1件でも裏が取れている・強い）
         ② メルカリの題3件以上で共通していた（仕入元に無い通称。カシオークなど） */
    const ichiAri = Object.keys(nokoru).some((K) => ichiKey[K]);
    const tashika = ichiAri || dai.length >= 3;
    if (tashika) rawKoyuuSave(kata, moji);

    /* ===== 型番の結果に、固有名詞での検索を【つなげる】（2026-08-18 ユーザー指示） =====
       ★『型番で結果を出した後につなげる方法を考えろ』。
       ★なぜ要るか: 型番だけでは母数が足りない（実機で1件しか出なかった）。
         同じ商品でも、型番を書かずに固有名詞だけで出している人が大勢いる。
         そちらを拾わないと相場にならない。
       ★どう作るか: 新しい仕組みは作らない。既にある【順番待ち(RAW_QUEUE)】に積むだけ。
         一覧の下端まで行くと rawNavStep がここから次のURLを取り出し、
         rawCarryGo が【今出ている商品を持ち越したまま】移動する。
         つまり「型番の結果 → 固有名詞の結果」が1つの一覧に繋がる。
       ★検索語は【固有名詞だけ】にする。ブランドを足さない。
         実機で、メルカリは『アークテリクス』（カナ）で当たり『ARC'TERYX』では
         当たらないことが分かっている。母数を増やすのが目的なので、
         書き方の割れやすいブランドは入れない。
       ★つなぐ先には既定の絞り込みを【最初から付けておく】。付けずに移ると
         rawDefaults が動いて location.replace し、その時に持ち越しを捨ててしまう。 */
    try {
      /* ★2026-08-26 ユーザー指示『問題は型番検索なのにタイトルが出てること』
           『選択に出てるものをそのままだすだけでいいのに』。
         ★実機で起きたこと: UNITED ARROWS green label relaxing の DP-6022GR を
           「ブランド＋型番」で引いた後、ここが固有名詞を測って
           『GLR イージーパンツ Lサイズ』の検索を順番待ちに積み、
           一覧の下端で【勝手にそちらへ移って】いた。
           ・GLR は green label relaxing の略で、型番検索の答えではない
           ・イージーパンツ は種類語（CATEGORY_TOKENS に無いので落ちなかった）
           ・Lサイズ はサイズ（RAW_SIZE_LIKE は単独の L しか見ないので落ちなかった）
             しかも仕入元は M サイズ。別サイズの品で相場を出していた
         ★直し: 【積むのをやめる】。型番検索は、小窓で選んだ語のまま出す。
           ★測る所（上）は残してある。戻したい時は下の false を外すだけでよい。 */
      const KOYUU_TSUNAGU_ON = false;   /* ←固有名詞への乗り換えを止めている印 */
      if (KOYUU_TSUNAGU_ON && !ssGet(RAW_KOYUU_TSUNAGU)) {
        const u2 = new URL('https://jp.mercari.com/search');
        u2.searchParams.set('keyword', moji);
        u2.searchParams.set('sort', 'created_time');
        u2.searchParams.set('order', 'desc');
        u2.searchParams.set('status', 'sold_out');
        u2.searchParams.set('item_condition_id', '3');
        u2.searchParams.set('item_types', 'mercari');
        u2.searchParams.set('seller_type', '0');
        u2.searchParams.set('__msqraw', '1');
        u2.searchParams.set('__msqdef', '1');          /* rawDefaults を動かさない */
        /* ★答え合わせ用の目印。着いた先で件数を見て、本当に固有名詞だったかを決める。
           ★__msqsrcmodel は【付けない】。付けると着いた先でまた測って、また繋いで、
             を繰り返してしまう。保存に使う型番は別の名前(__msqkata)で渡す。 */
        u2.searchParams.set('__msqkoyuu', moji);
        u2.searchParams.set('__msqkata', kata);
        u2.searchParams.set('__msqkari', tashika ? '0' : '1');   /* 1＝まだ仮の候補 */
        /* 元の帯（仕入元の写真・仕入値・状態）を引き継ぐ */
        ['__msqsrcimg', '__msqsrcrank', '__msqprice', '__msqsrcbrand'].forEach((k) => {
          const v = SP.get(k);
          if (v) u2.searchParams.set(k, v);
        });
        let q2 = [];
        try { q2 = JSON.parse(ssGet(RAW_QUEUE) || '[]') || []; } catch (e) { }
        q2.push(u2.toString());
        ssSet(RAW_QUEUE, JSON.stringify(q2));
        ssSet(RAW_KOYUU_TSUNAGU, moji);                /* 同じ物を二度積まない */
      }
    } catch (e) { }
    /* ★黙って決めない。何件から何を採ったかを画面に出す。外れていたら目で分かるように。 */
    try {
      const bar = document.getElementById('msq-raw-bar');
      if (bar && !document.getElementById('msq-koyuu')) {
        const s = document.createElement('span');
        s.id = 'msq-koyuu';
        s.style.cssText = 'color:#a7f3d0;font-weight:700;';
        s.textContent = '固有名詞 ' + moji + '（' + dai.length + '件中' + shikii + '件以上'
          + (ichiAri ? '・仕入元と一致' : (tashika ? '' : '・まだ仮')) + '）';
        (document.getElementById('msq-raw-meta') || bar).appendChild(s);
      } else {
        const s2 = document.getElementById('msq-koyuu');
        if (s2) s2.textContent = '固有名詞 ' + moji + '（' + dai.length + '件中' + shikii + '件以上'
          + (ichiAri ? '・仕入元と一致' : (tashika ? '' : '・まだ仮')) + '）';
      }
    } catch (e) { }
  }

  /* ===== 固有名詞の答え合わせ（2026-08-18 新規） =====
     ★ユーザーの問い『固有名詞かを確認するすべはないんか？』への答え。
       その語でメルカリを引いた【件数】が答えになる。
       本物の固有名詞なら、型番を書いていない出品まで含めて何件も出る。
       こちらのでっち上げなら、ほとんど出ない。
     ★ここは、型番の一覧から繋いで着いた先（__msqkoyuu が付いている画面）で動く。
       通信も道具も増やさない。どのみち開く画面の件数を数えるだけ。 */
  function rawKoyuuKakunin() {
    let go = '', kata = '', kari = '';
    try {
      go = String(SP.get('__msqkoyuu') || '').trim();
      kata = String(SP.get('__msqkata') || '').trim();
      kari = String(SP.get('__msqkari') || '');
    } catch (e) { return; }
    if (!go || !kata) return;
    if (window.__msqKakuninDone === location.search) return;
    let kazu = 0;
    try {
      const mita = {};
      document.querySelectorAll('a[href*="/item/"],a[href*="/shops/product/"]').forEach((a) => {
        const d = rawTileData(a);
        if (!d || !d.i || mita[d.i]) return;
        mita[d.i] = 1; kazu++;
      });
    } catch (e) { return; }
    /* まだ描かれていないだけかもしれないので、0件のうちは決めない（次の巡回で見直す） */
    if (!kazu) return;
    window.__msqKakuninDone = location.search;
    /* ★2026-08-18 【件数で「固有名詞と認める」のはやめた】。実測で潰れたため。
         『フルメタル』で15件出たが、中身は「フルメタルラボ」「フルメタルウォール」
         「ポケモンカード」「水彩絵具」で全部別物だった。
         件数が出ることと、同じ商品であることは【別】。
       ★確かめは、仕入元の題と一致するか（rawKoyuuMeishi の①）で行う。
         ここは【何件つながったかを出すだけ】。判定はしない。 */
    try {
      window.__msqKoyuuKakunin = { 語: go, 型番: kata, つながった件数: kazu, 仮の候補か: kari === '1' };
    } catch (e) { }
    try {
      const bar = document.getElementById('msq-raw-bar');
      if (bar && !document.getElementById('msq-koyuu-k')) {
        const el = document.createElement('span');
        el.id = 'msq-koyuu-k';
        el.style.cssText = 'color:#a7f3d0;font-weight:700;';
        el.textContent = '「' + go + '」でつないだ（' + kazu + '件）'
          + (kari === '1' ? '※裏取り前の候補' : '');
        (document.getElementById('msq-raw-meta') || bar).appendChild(el);
      }
    } catch (e) { }
  }

  /* メルカリ本体のマイページにある「ショップ管理」は target=_blank のため、
     Android WebViewの通常遷移に任せるとメルカリWebView自身がショップス管理へ
     置き換わる。Androidアプリの仕入元タブ窓口がある時だけ、この入口を同じタブへ
     振り分ける。PC/Quetta等で窓口が無い場合は元のリンク動作を残す。 */
  function rawRouteShopsManagement() {
    try {
      if (location.host !== 'jp.mercari.com' || window.__msqShopsManagementRoute) return;
      window.__msqShopsManagementRoute = true;
      document.addEventListener('click', (ev) => {
        try {
          const t = ev && ev.target;
          const a = t && t.closest ? t.closest('a') : null;
          if (!a || !window.MsqApp || typeof window.MsqApp.openShiire !== 'function') return;
          const href = String(a.href || '').trim();
          const u = new URL(href, location.href);
          if (u.host !== 'mercari-shops.com') return;
          if (!(u.pathname === '/seller/shops' || u.pathname.startsWith('/seller/shops/'))) return;
          ev.preventDefault();
          ev.stopPropagation();
          window.MsqApp.openShiire(u.href);
        } catch (e) { }
      }, true);
    } catch (e) { }
  }

  function rawStart() {
    try { rawRouteShopsManagement(); } catch (e) { }
    /* ★レンズの調べ物の途中なら、そちらを先に受け持つ（2026-08-14）。
       __msqlens=1 が付いている商品ページだけ。普通に見ている時は何もしない。 */
    try { if (lensItemHook()) return; } catch (e) { }
    /* 純正検索専用画面では一覧処理を一切動かさない。 */
    if (rawTopSearchScreenActive()) return;
    /* ブランドの画面は /search ではないので、先に見る。
       ★握りつぶさない。黙って落ちると「動いていない」ことに気づけない。 */
    /* 拡大画面の直しは、一覧かどうかに関わらず見る（商品ページで起きるため） */
    try { rawZoomFix(); } catch (e) { }
    /* ★アンバサダーの青い帯は【どの画面でも】畳む。一覧かどうかの手前で呼ぶこと。
       ユーザー『青い帯はトップのも消えてるよな？』＝一覧だけでは足りない。 */
    try { rawAmbObi(); } catch (e) { }
    try { rawBrandStart(); }
    catch (e) { try { console.warn('[MSQ/ブランド] ' + e.message); } catch (e2) { } }
    /* ★2026-09-21 一覧のいいねは一覧内で完結させる。
       商品ページへ遷移して反映する旧暫定処理は呼ばない。 */

    /* ★一覧から離れたら帯を消す（2026-08-08 実機）。
       メルカリは画面を切り替えても読み直さないので、商品ページへ移っても
       帯が残り、画面に固定されているぶん中身が上にずれる。
       戻ってくれば下の rawBuildBar がまた出す。 */
     if (!rawOnSearch()) {
       try { rawCleanup(); } catch (e) { }
       /* ★ホーム・いいね一覧は検索用rawCleanupの後に、専用ULへ2列を再適用する。 */
       try { if (rawOnMercariList()) rawApplyHomeLikeCols(); } catch (e) { }
       /* 一覧を離れた。戻ってきた時にまた並べ直せるよう、印を落としておく。
         ★これをしないと「一度やった」の印が残り、戻っても何も出ない。 */
      window.__msqKeepDone = false;
      window.__msqCarryDone = false;
       return;
     }
      /* ★2026-09-21 ネイティブ上部メニューを使う検証アプリでは、
         旧Webの独自帯と純正操作行を同時に描画しない。
         旧ボタンの機能はネイティブ側から同じDOMへ委譲するため、
         DOMから削除せず、表示だけを凍結する。 */
      if (window.__msqNativeTop) {
        const freezeNativeOldHead = () => {
          const old = document.getElementById('msq-raw-bar');
          if (old && old.style.display !== 'none') {
            old.style.setProperty('display', 'none', 'important');
            old.style.setProperty('visibility', 'hidden', 'important');
          }
          document.querySelectorAll('section').forEach((s) => {
            const t = s.textContent || '';
            if (t.includes('絞り込み') && t.includes('並び替え')
                && s.getAttribute('data-msq-native-web-menu-hidden') !== '1') {
              s.style.setProperty('display', 'none', 'important');
              s.setAttribute('data-msq-native-web-menu-hidden', '1');
            }
          });
          /* 検索条件のチップ行も旧Web側の見た目。
             ネイティブ操作行の背後に残ると、分離した行が後から出て見える。
             親sectionではなくチップ本体だけを隠し、商品カードを残す。 */
          document.querySelectorAll('.merChipGroup').forEach((g) => {
            if (g.getAttribute('data-msq-native-web-chip-hidden') !== '1') {
              g.style.setProperty('display', 'none', 'important');
              g.setAttribute('data-msq-native-web-chip-hidden', '1');
            }
          });
        };
        freezeNativeOldHead();
        if (!window.__msqNativeWebFreezeObserver && document.documentElement) {
          window.__msqNativeWebFreezeObserver = new MutationObserver(freezeNativeOldHead);
          window.__msqNativeWebFreezeObserver.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['style', 'class', 'id']
          });
        }
      }
      try {
      /* ★既定を足すのは一番先。足したら移動するので、この回はここで終わり。 */
      if (rawDefaults()) return;
      /* 検索し直したら、繋げる方の覚え書きを白紙に戻す。
         これをしないと前の検索の続きを足してしまう。 */
      if (location.search !== rawSearchKey) {
        rawSearchKey = location.search;
        rawGen++; rawNextUrl = ''; rawNextTaken = false; rawAdded = 0; rawSeenPages.clear();
      }
      /* ★ひとまとめの try で囲んでいたため、手前の1つが落ちると
         後ろが全部動かなかった。「次へ」は一番後ろに近く、巻き添えを食う位置。
         1つずつ囲って、落ちたものだけを飛ばす（2026-08-08）。 */
      const step = (name, fn) => {
        try { fn(); }
        catch (e) { try { console.warn('[MSQ/そのまま] ' + name + ': ' + e.message); } catch (e2) { } }
      };
      step('覆いを外す', rawOoiHazusu);   /* ★画面を覆う箱を先に外す */
       step('見た目', rawInjectStyle);
       step('帯', rawBuildBar);
       step('帯の位置', rawPlaceBarAfterHeader);
      /* ★持ち越しはタイルより先。あとから置くと、その回は✕もタイトルも付かない。 */
      step('持ち越し', rawCarryRestore);
      step('列数', rawApplyCols);
      step('持ち越しの列', rawCarryStyle);
      step('足した分の列', rawAddStyle);
      step('戻し', rawKeepRestore);
      step('戻しの見張り', rawKeepWatch);
      step('販売状況', rawStatusUI);
      step('タイル', rawDecorate);
      /* ★タイルの後。題は rawTileData から取るので、並べ直しが終わってからでないと数えられない。 */
      step('固有名詞', rawKoyuuMeishi);
      step('Gemini推奨ワード', rawGeminiWords);
      step('固有名詞の答え合わせ', rawKoyuuKakunin);
      step('重さ対策', rawMemoryFix);
      step('画像の潰れ', rawGazouFix);   /* 2026-08-13 実機で確認して追加 */
      step('相場の利益', rawSoubaFix);   /* 2026-08-14 実際の相場からの利益3パターン */
      step('横スワイプ', rawSwipe);
       step('見出し詰め', rawTightenHead);
        /* Mercariの実ヘッダーと検証操作帯はrawScrollReveal内で一体化して扱う。 */
        step('上部メニューを本体どおりに復元', () => {
          rawSlimHeader();
          if (!window.__msqNativeTop) rawRestoreNativeHead();
          rawScrollReveal();
        });
        /* 個別ヘッダーはstatic。固定・出し入れの所有者は一体ラッパーだけ。 */
        step('ヘッダー固定解除', rawUnpinHeader);
        step('操作行固定解除', rawUnpinSortRow);
       /* ★2026-09-21 ログイン段を隠すと上部に隙間が残り、
          絞り込み行も消えるため呼び出さない。前の正常な上部表示を維持する。 */
       step('広告', rawHideAds);
      step('覆いを外す(再)', rawOoiHazusu);   /* あとから出てくることがある */
      step('次へ', rawHideNext);
      step('前へ', rawHidePrev);   /* 2026-08-12 ユーザー依頼 */
      step('古いの', rawFuruiBtn); /* 溜め込みが一杯の時だけ出る（2026-08-12） */
      step('検索窓', rawKensakuWaku); /* 文字が入れにくい件の直し（2026-08-12） */
      step('下端見張り', rawWatchBottom);
      step('並び替えを横取り', rawWatchNarabi);   /* ★2026-08-27 母数を減らさずに並べ替える */
      step('帯の出し入れ', rawPushDown);
      step('下メニュー', rawShitaMenu);
      /* ★2026-09-21 上部の候補固定を停止。
         自前の複製行は使わず、純正の操作行だけを使う。 */
      step('上部固定を解除', () => {
        rawFutatsume(false);
        rawUkasu(false);
        rawJimaeGyou(false);
      });
    } catch (e) { try { console.warn('[MSQ/そのまま] ' + e.message); } catch (e2) { } }
  }
  /* メルカリは商品を後から描くので、増えるたびに足し直す */
  try {
    /* ★2026-08-08 重さの原因はここだった。
       画面が少し動くたびに毎回すべてを調べ直していたため、操作が固まった。
       通知をまとめて、短い待ち時間の後に1回だけ動かす。150msは商品DOMの追加を
       待ちながら、表示のもたつきを増やさないための実測用設定。 */
    let moTimer = null;
    const mo = new MutationObserver(() => {
      /* 検索窓のタップから純正画面が開くまで、一覧用処理を割り込ませない。 */
      try {
        if (window.__msqSearchOpening) {
          if (rawTopSearchScreenActive()) {
            window.__msqSearchOpening = false;
            if (window.__msqSearchOpeningTimer) clearTimeout(window.__msqSearchOpeningTimer);
            window.__msqSearchOpeningTimer = null;
            rawTopSearchLayout();
          }
          if (moTimer) { clearTimeout(moTimer); moTimer = null; }
          return;
        }
      } catch (e) { }
      /* 純正検索専用画面では、一覧用の列数・検索窓・帯の全体処理を
         走らせない。検索画面の純正DOMを見える状態に保つ処理だけにする。 */
      try {
        if (rawTopSearchScreenActive()) {
          rawTopSearchLayout();
          return;
        }
      } catch (e) { }
      /* 商品グリッドが現れた瞬間に列数だけ先に合わせる。
         3列で一度描いてから2列へ組み替えるちらつきを減らす。
         商品加工などの重い処理は従来どおり150ms後のrawStartで行う。 */
       try {
         if (rawOnSearch()) rawApplyCols();
         else rawApplyHomeLikeCols();
       } catch (e) { }
      if (moTimer) return;
      moTimer = setTimeout(() => {
        moTimer = null;
        /* 純正検索専用画面ではここも一覧用処理を走らせない。
           先にトップ用styleを復元してから終了する。 */
        try {
          if (rawTopSearchScreenActive()) {
            rawTopSearchLayout();
            return;
          }
        } catch (e) { }
        /* ★検索窓の直しだけは【どの画面でも】当てる（2026-08-12）。
           rawStart は URL が /search の時しか動かないため、ホームや商品ページから
           虫眼鏡を押して開いた検索窓には、直しが一度も当たっていなかった。 */
        try { rawKensakuWaku(); } catch (e) { }
        /* アンバサダー帯はホームにも遅れて追加されるため、一覧専用の
           rawStartを待たず、全画面のDOM追加後にも直ちに隠す。 */
        try { rawAmbObi(); } catch (e) { }
        /* 純正検索専用画面は上の分岐で終了する。 */
        try { rawTopSearchLayout(); } catch (e) { }
        if (rawTopSearchScreenActive()) return;
        /* ★下メニューの「仕入」も【どの画面でも】出す（2026-08-12 ユーザー依頼）。
           rawStart が /search でしか動かないため、検索していない時に出ていなかった。
           ★rawShitaMenu 内で純正ULと追加LIの構造を検査する。 */
        try { rawShitaMenu(); } catch (e) { }
        try { rawHideHomeCampaign(); } catch (e) { }
        /* ★覆いはどの画面でも開くので、rawStart(/searchのみ)とは別にここでも見る。 */
        try { rawPullFix(); } catch (e) { }
        /* ★2026-09-15 出品者・いいね一覧にもカード操作を出す。検索用 rawStart と分離する。 */
        try { rawListStart(); } catch (e) { }
         try {
           if (rawOnSearch()) rawStart();
           else if (rawOnMercariList()) rawApplyHomeLikeCols();
         } catch (e) { }
      }, 150);
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch (e) { }
  try { rawHideHomeCampaign(); } catch (e) { }
  try { rawAmbObi(); } catch (e) { }
  try { rawTopSearchLayout(); } catch (e) { }
  /* ★ブランド辞書は開いた時点で先に読み始める。
     押してから読み始めると毎回5秒待たされる（実機で指摘された）。
     2回目以降は7日間の保存から出すので、待ち時間はほぼ無くなる。 */
  try { setTimeout(() => { rawBrandLoad().catch(() => { }); }, 1500); } catch (e) { }

  /* ★消したの自動解放は、読み込みごとに1回だけ。すべての宣言より後ろで呼ぶ
     （前で呼ぶと「初期化前に使った」で落ちる。この案件で何度も踏んでいる）。 */
  try {
    /* ★2026-08-27 まず、上書きで失われた✕を書き戻す。 */
    try {
      const modoshi = rawModoshiUshinawareta();
      if (modoshi > 0) { try { console.log('[MSQ/そのまま] 失われていた消した記録を ' + modoshi + '件 書き戻した'); } catch (e) { } }
    } catch (e) { }
    /* ★2026-08-27 次に「この検索を開いた」を記録してから期限切れを見る。
       順番が逆だと、いま見ている検索の✕が戻ってしまう。 */
    try {
      const susumeta = rawTouchPage();
      if (susumeta > 0) { try { console.log('[MSQ/そのまま] この検索の消した記録 ' + susumeta + '件の期限を今日から数え直した'); } catch (e) { } }
    } catch (e) { }
    const modo = rawPurgeHidden();
    if (modo > 0) { try { console.log('[MSQ/そのまま] 消したを ' + modo + '件 戻した'); } catch (e) { } }
  } catch (e) { }

  /* 一覧の初回描画が MutationObserver より先に終わる場合の保険。 */
  try { rawListStart(); } catch (e) { }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rawStart);
  } else { rawStart(); }
  setTimeout(rawStart, 1200);
  setTimeout(rawStart, 3000);
  /* ★画面の切り替え(URLが変わっても読み込みは起きない)に追いつくための保険。
     DOMの追加は上のMutationObserverと初回・遅延実行で拾う。
     周期確認は5秒に抑え、既に手を入れたタイルの全体走査を減らす。 */
  setInterval(rawStart, 5000);
})();


/* ============================================================
   ○✕メモ（2026-08-27 アプリへ移した）
   ★クエッタの拡張機能(list_extractor.js)から【1行も書き換えずに】写した塊。
     セカストの時だけ動き、自前のGASとトークンを持ち、外の物を使わない。
   ★直す時は【あちらを直してから写し直す】。片方だけ直すと必ずずれる。
   ★ここより下に何も足さないこと（即実行の塊なので、順番を変えると空振りする）。
   ============================================================ */
  // ===== PATCH: セカスト〇✕メモ =====
  if (location.hostname.includes('2ndstreet')) {
    (() => {
      const GAS = 'https://script.google.com/macros/s/AKfycbyzwjHcOH25Gx8G13fCxoJzClqEH9tOBgLrKvrtuiQ4SkWMV01icYAYJ00iSMiPVv30/exec';
      const TOKEN = 'bluestar2026';

      const load = async () => {
        try {
          const r = await fetch(GAS + '?token=' + TOKEN);
          const d = await r.json();
          return d.marks || {};
        } catch (e) {
          console.log('sk load err', e);
          return {};
        }
      };
      const save = async (id, mark, memo) => {
        try {
          await fetch(GAS, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              token: TOKEN, id: id, mark: mark, memo: memo
            })
          });
        } catch (e) {
          console.log('sk save err', e);
        }
      };
      const sym = m => m === 'o' ? '〇' : m === 'x' ? '✕' : '＋';
      const col = m => m === 'o' ? '#2e7d32'
        : m === 'x' ? '#c62828' : '#888';

      let allMarks = {};

      function counter() {
        let o = 0, x = 0, me = 0;
        for (const k in allMarks) {
          if (allMarks[k].mark === 'o') o++;
          if (allMarks[k].mark === 'x') x++;
          if (allMarks[k].memo) me++;
        }
        let b = document.getElementById('sk-counter');
        if (!b) {
          b = document.createElement('div');
          b.id = 'sk-counter';
          b.style.cssText =
            'position:fixed;bottom:80px;right:12px;'
            + 'z-index:99999;background:rgba(0,0,0,0.8);'
            + 'color:#fff;padding:8px 14px;border-radius:8px;'
            + 'font-size:13px;line-height:1.6;text-align:center;';
          document.body.appendChild(b);
          const rb = document.createElement('button');
          rb.id = 'sk-refresh';
          rb.textContent = '🔄更新';
          rb.style.cssText =
            'display:block;margin-top:6px;width:100%;'
            + 'font-size:12px;cursor:pointer;padding:3px;'
            + 'border:none;border-radius:4px;'
            + 'background:#469;color:#fff;';
          rb.addEventListener('click', () => skRun());
          b.appendChild(rb);
        }
        let txt = document.getElementById('sk-text');
        if (!txt) {
          txt = document.createElement('div');
          txt.id = 'sk-text';
          b.insertBefore(txt, b.firstChild);
        }
        txt.textContent = '〇' + o + '　✕' + x + '　メモ' + me;
      }

      function deco(card) {
        if (card.dataset.skMarked) return;
        card.dataset.skMarked = '1';
        const id = card.getAttribute('goodsid')
          || card.closest('[goodsid]')?.getAttribute('goodsid');
        if (!id) return;
        const sv = allMarks[id] || { mark: null, memo: '' };
        let cm = sv.mark, cmemo = sv.memo || '';
        if (getComputedStyle(card).position === 'static') {
          card.style.position = 'relative';
        }

        const btn = document.createElement('button');
        btn.textContent = sym(cm);
        btn.style.cssText =
          'position:absolute;top:4px;left:4px;z-index:9999;'
          + 'width:28px;height:28px;border-radius:50%;'
          + 'border:none;cursor:pointer;font-size:16px;'
          + 'background:rgba(255,255,255,0.9);'
          + 'color:' + col(cm) + ';'
          + 'box-shadow:0 1px 3px rgba(0,0,0,0.3);';
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          cm = cm === null ? 'o' : cm === 'o' ? 'x' : null;
          btn.textContent = sym(cm);
          btn.style.color = col(cm);
          allMarks[id] = { mark: cm, memo: cmemo };
          await save(id, cm, cmemo);
          counter();
        });
        card.appendChild(btn);

        const memo = document.createElement('input');
        memo.type = 'text';
        memo.value = cmemo;
        memo.placeholder = 'メモ';
        memo.style.cssText =
          'position:absolute;top:4px;left:36px;z-index:9999;'
          + 'width:90px;height:24px;font-size:12px;'
          + 'border:1px solid #ccc;border-radius:4px;'
          + 'padding:0 4px;background:rgba(255,255,255,0.95);';
        memo.addEventListener('click', (e) => e.preventDefault());
        memo.addEventListener('change', async () => {
          cmemo = memo.value.trim();
          allMarks[id] = { mark: cm, memo: cmemo };
          await save(id, cm, cmemo);
          counter();
        });
        card.appendChild(memo);
      }

      async function skRun() {
        allMarks = await load();
        document.querySelectorAll('div.itemCard_img').forEach((card) => {
          card.dataset.skMarked = '';
          [...card.querySelectorAll('button, input')].forEach((el) => {
            if (el.style.zIndex === '9999') el.remove();
          });
        });
        document.querySelectorAll('div.itemCard_img').forEach((c) => deco(c));
        counter();
      }

      window.__skRun = skRun;
      let _skTries = 0;
      const _skWait = setInterval(() => {
        _skTries++;
        if (document.querySelector('div.itemCard_img')) {
          clearInterval(_skWait);
          skRun();
        } else if (_skTries > 60) {
          clearInterval(_skWait);
        }
      }, 500);
    })();
  }
// ===== /PATCH セカスト〇×メモ =====

// listing_helper.js（新規ファイル）
(() => {
  /* Android側ではinject.jsが全サイトへ流れるため、
     拡張機能のmatches相当をここで限定する。ショップス以外では監視も起動しない。 */
  if (!/(^|\.)mercari-shops\.com$/i.test(String(location.hostname || ''))) return;
  // ★2026-08-01追加(実機で判明): このファイルは元々 manifest の専用エントリ
  //   "https://mercari-shops.com/*/products/create*" で注入していたが、
  //   クエッタ(Android)ではそのエントリだけが読まれず、パネルが一切出なかった。
  //   そこで注入は動く方のエントリ("…/products*")に相乗りさせ、
  //   ページの絞り込みはここで自分で行う。

  // ★2026-08-01追加(実機で「下書きの編集ページに出ない」と報告された件):
  //   ショップスはSPAで、一覧から下書きを開いてもページを読み込み直さない。
  //   コンテンツスクリプトは最初の1回しか動かないため、一覧ページで下の判定に
  //   引っかかって抜けたあと、下書きを開いても二度と動かない状態になっていた。
  //   ★このファイルだけURL変化を見張っていなかった。list_extractor.js は
  //     1785行/2780行/5982行で同じ見張りを持っており、だから動いていた。
  //   対策: 本体を lhInit() にまとめ、URLが変わるたびに「出品フォームのページか」を
  //   見て、そうなったら作る。既に在れば何もしない(lhInitの先頭で判定)。
  //   ★下書きの編集ページ(/products/<id>/edit)も対象にする。実際に使いたいのはそこ。
  //     出品一覧(/products だけ)には出さない。
  function lhIsFormPage() {
    const p = location.pathname;
    return /\/products\/create/.test(p) || /\/products\/[^/]+\/edit/.test(p);
  }

  function lhInit() {
  if (document.getElementById('lh-panel')) return;

  // スマホかどうか。判定は他のファイル(MSQ_IS_MOBILE)と同じ規則。
  //   ★この場で作っているのは、あちらが別のIIFEの中にあってここからは見えないため。
  const LH_IS_MOBILE = /Mobile/.test(navigator.userAgent);

  // ── 定数 ──────────────────────────────────────
  const CONDITION_MAP = {
    '新品、未使用':     '新品、未使用',
    '未使用に近い':     '未使用に近い',
    '目立った傷や汚れなし': '目立った傷や汚れなし',
    'やや傷や汚れあり': 'やや傷や汚れあり',
    '傷や汚れあり':     '傷や汚れあり',
    '全体的に状態が悪い': '全体的に状態が悪い',
  };

  // 状態の各選択肢は固有のdata-testid(condition-list-modal-item-{ID})を持つ
  // （実際のポップアップHTMLで確認済み）。テキスト一致より確実なのでこちらを使う。
  const CONDITION_TESTID_MAP = {
    '新品、未使用': 'CONDITION_BRAND_NEW',
    '未使用に近い': 'CONDITION_ALMOST_NEW',
    '目立った傷や汚れなし': 'CONDITION_CLEAN',
    'やや傷や汚れあり': 'CONDITION_LITTLE_DIRTY',
    '傷や汚れあり': 'CONDITION_DIRTY',
    '全体的に状態が悪い': 'CONDITION_BAD',
  };

  // 要素が現れるまでポーリングして待つ（モーダル/ドロップダウンが開くのを待つのに使う）
  function lhWaitForSelector(selector, timeoutMs = 5000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeoutMs) return resolve(null);
        setTimeout(check, 150);
      };
      check();
    });
  }

  // ── 下書きから拾う ────────────────────────────
  //   ★2026-08-01(ユーザー要望「サイズと管理番号を入力するのが地味に面倒。
  //     自動で拾って反映しろ。下書きにあるから」):
  //     商品の説明の中の「〇サイズ」「〇管理番号」の行から、次の空行までを取り出す。
  //   ★見出しの〇は環境によって 〇/○/◯/● のどれかになるので全部受ける。
  //   ★空行が無いまま次の見出しが来る場合もあるので、そこでも切る(取りすぎ防止)。
  //   ★読むだけ。下書きの中身は書き換えない。
  //   ★2026-08-01追記(実機で「管理番号が入っていない」): 見出しの書き方は1通りではない。
  //     ・「〇管理番号」だけの行 → 次の行から値
  //     ・「〇管理番号：A-123」「〇管理番号 A-123」→ 同じ行に値
  //     ・見出しのあとに ： や 、が付く
  //     どれでも拾えるようにする。厳しくすると1文字違うだけで丸ごと取り逃がす。
  //   ★2026-08-01再追記(実機で「管理番号×」のまま): 見出しに〇が付いていない
  //     書き方(「管理番号」「管理番号：A-123」)もある。〇を必須にしていたため
  //     丸ごと取り逃がしていた。〇が無くても拾う。
  //     ただし〇が無い時は、本文中の文章に誤爆しないよう
  //     「その行が見出しらしい短さか」も見る(値ごとでも40文字まで)。
  function lhPickBlock(text, label) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const head = new RegExp('^([〇○◯●]?)\\s*' + label + '\\s*[:：]?\\s*(.*)$');
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      const m0 = raw.match(head);
      if (!m0) continue;
      // 〇が無い行は、見出しらしい短さの時だけ採用する(長文への誤爆防止)
      if (!m0[1] && raw.length > 40) continue;
      const m = [m0[0], m0[2]];
      const buf = [];
      if (m[1] && m[1].trim()) buf.push(m[1].trim());   // 同じ行に値がある場合
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t === '') break;                 // 空行で終わり
        if (/^[〇○◯●]/.test(t)) break;      // 次の見出しでも終わり
        buf.push(lines[j].replace(/\s+$/, ''));
      }
      return buf.join('\n').trim();
    }
    return '';
  }

  // 「タグ表記：M」のような行から値だけを取る。無ければ先頭行をそのまま使う。
  //   サイズの入力欄は1行なので、欄にはこの短い値を表示し、
  //   実寸を含むブロック全体はプロンプト側に渡す(ユーザーの指定)。
  function lhSizeLabelOf(block) {
    const m = String(block || '').match(/タグ表記\s*[:：]\s*(.+)/);
    if (m) return m[1].trim();
    return String(block || '').split('\n')[0].trim();
  }

  // ★2026-08-01: 一度「実寸だけ」に絞ったが、ユーザー指摘「サイズはそのまま入れて
  //   くれんとあかん。意味が変わる」により撤回した。
  //   「S,M相当」や「※個人計測のため〜」も含めて、下書きに書かれているまま渡す。
  //   行を選り分けると、書いた本人の意図(どの表記で売るか)が変わってしまうため。

  // 今の下書きから、サイズブロック・管理番号・状態を読む。
  //   状態はツール側のセレクトではなく、ページの「商品の状態」で選ばれている値を見る
  //   (ユーザー指定。ツール側で選び直す手間を無くすため)。
  // 商品の説明の本文を取る。
  //   ★2026-08-01(ユーザー「36しか入らん。ちゃんと調べんか」):
  //     textarea[name="description"] という1つのセレクタだけに頼っていた。
  //     ショップスの下書き編集ページで name が付いていない/別の作りになっている場合、
  //     何も読めずに空になり、原因も分からないまま「入っていない」になる。
  //     → ページ内の textarea と contenteditable を全部見て、
  //       「〇サイズ」等の見出しを含むものを本文とみなす。自己検証になっている。
  //   ★このツール自身の入力欄(#lh-prompt / #lh-json-input)は必ず除外する。
  //     あちらにはテンプレの「〇サイズ」が入っているので、除外しないと
  //     自分が作ったプロンプトを下書きだと誤認する。
  function lhReadDescriptionText() {
    const cands = [];
    const mine = { 'lh-prompt': 1, 'lh-json-input': 1 };
    try {
      document.querySelectorAll('textarea').forEach((t) => {
        if (mine[t.id]) return;
        cands.push({ el: t, text: String(t.value || '') });
      });
      document.querySelectorAll('[contenteditable="true"], [contenteditable=""]').forEach((e) => {
        if (mine[e.id]) return;
        cands.push({ el: e, text: String(e.innerText || e.textContent || '') });
      });
    } catch (e) {}
    const headed = cands.filter((c) => /[〇○◯●]\s*(サイズ|管理番号|ブランド|特徴|カラー|素材)/.test(c.text));
    if (headed.length) {
      return headed.sort((a, b) => b.text.length - a.text.length)[0].text;
    }
    const named = cands.find((c) => {
      try { return c.el.getAttribute && c.el.getAttribute('name') === 'description'; } catch (e) { return false; }
    });
    if (named && named.text) return named.text;
    const longest = cands.map((c) => c.text).sort((a, b) => b.length - a.length)[0];
    return longest || '';
  }

  // 自分のパネルの中の要素か(誤って自分の入力欄を読まないための共通判定)
  function lhIsMine(el) {
    try {
      let p = el;
      for (let i = 0; i < 12 && p; i++) {
        if (p.id === 'lh-panel' || p.id === 'lh-launcher') return true;
        p = p.parentElement;
      }
    } catch (e) {}
    return false;
  }

  // フォームの「管理番号」欄から拾う。
  //   ★2026-08-01(ユーザー「管理番号は項目すらなさそう」):
  //     説明文に〇管理番号が無い下書きもある。その場合はフォームの欄から拾うしかない。
  //     ここも1つのセレクタ決め打ちにしない。name が変わっただけで取れなくなるため。
  function lhReadSkuFromForm() {
    try {
      const el = document.querySelector('input[name*="skuCode"], input[name*="sku"]');
      if (el && !lhIsMine(el) && el.value) return String(el.value).trim();
    } catch (e) {}
    // 「管理番号」と書かれた場所の近くにある入力欄を探す(上へ4階層まで)
    try {
      const labels = document.querySelectorAll('label, span, div, p, th, dt');
      for (const el of labels) {
        if (el.children && el.children.length) continue;
        if (!/管理番号/.test((el.textContent || '').trim())) continue;
        if (lhIsMine(el)) continue;
        let p = el;
        for (let i = 0; i < 4 && p; i++) {
          const inp = p.querySelector && p.querySelector('input');
          if (inp && !lhIsMine(inp) && inp.value) return String(inp.value).trim();
          p = p.parentElement;
        }
      }
    } catch (e) {}
    return '';
  }

  // フォームの「商品の状態」から拾う。
  //   ★2026-08-01(ユーザー「状態も入ってないな」):
  //     [data-testid="condition-select-box"] だけを見ていた。testidが変われば取れない。
  //     6つの選択肢の文字は他と紛れないので、ページの中からその文字を探す方が確実。
  //   ★自分のパネル(セレクトの選択肢に同じ文字がある)は必ず除外する。
  function lhReadConditionFromForm() {
    const keys = Object.keys(CONDITION_MAP);
    const norm = (s) => String(s || '').replace(/[\s、,]/g, '');
    try {
      const box = document.querySelector('[data-testid="condition-select-box"]');
      if (box && !lhIsMine(box)) {
        const t = norm(box.textContent);
        for (const k of keys) if (t.indexOf(norm(k)) >= 0) return k;
      }
    } catch (e) {}
    try {
      // 子を持たない要素の「文字全体」が6択のどれかと一致するものを探す。
      //   長文の中に同じ語が含まれていても拾わない(誤爆防止)。
      const all = document.querySelectorAll('span, div, p, button, td, dd, label');
      for (const el of all) {
        if (el.children && el.children.length) continue;
        if (lhIsMine(el)) continue;
        const t = norm(el.textContent);
        if (!t || t.length > 12) continue;
        for (const k of keys) if (t === norm(k)) return k;
      }
    } catch (e) {}
    return '';
  }

  function lhReadDraftInfo() {
    const out = { sizeBlock: '', sizeLabel: '', sku: '', condition: '', descLen: 0, skuFrom: '' };
    try {
      const txt = lhReadDescriptionText();
      out.descLen = txt.length;
      out.sizeBlock = lhPickBlock(txt, 'サイズ');   // 下書きのまま丸ごと渡す
      out.sizeLabel = lhSizeLabelOf(out.sizeBlock);
      out.sku = lhPickBlock(txt, '管理番号').split('\n')[0].trim();
      // 説明文にある見出しを集める(画面に出して切り分けに使う)
      out.heads = txt.replace(/\r/g, '').split('\n')
        .map((l) => l.trim())
        .filter((l) => l && l.length <= 24 && /^[〇○◯●]/.test(l))
        .map((l) => l.replace(/^[〇○◯●]\s*/, ''))
        .slice(0, 20).join('/');
    } catch (e) {}
    // ★2026-08-01追加: 説明文に無くても、フォームの欄に既に入っていればそこから拾う。
    //   管理番号はツール自身が [name="variants.0.skuCode"] に書き込む欄で、
    //   下書きを作った時点で入っていることがある。サイズも同じ考え方。
    try {
      if (!out.sku) {
        out.sku = lhReadSkuFromForm();
        if (out.sku) out.skuFrom = 'フォーム';
      } else {
        out.skuFrom = '説明文';
      }
      if (!out.sizeLabel) {
        const sel = document.querySelector('[data-testid*="attribute-select"]');
        const v = sel && sel.options && sel.selectedIndex >= 0
          ? (sel.options[sel.selectedIndex].text || '').trim() : '';
        if (v && !/^(選択|未選択|サイズ)/.test(v)) {
          out.sizeLabel = v;
          if (!out.sizeBlock) out.sizeBlock = v;
        }
      }
    } catch (e) {}
    try { out.condition = lhReadConditionFromForm(); } catch (e) {}
    return out;
  }

  // 下書きの内容を入力欄に反映する。
  //   ★手で入れた値は消さない。空の時だけ入れる。
  function lhFillFromDraft() {
    const info = lhReadDraftInfo();
    window._lhSizeBlock = info.sizeBlock;
    window._lhDraftCondition = info.condition;
    const sku = document.getElementById('lh-sku-input');
    const size = document.getElementById('lh-size-input');
    if (sku && !sku.value.trim() && info.sku) sku.value = info.sku;
    if (size && !size.value.trim() && info.sizeLabel) size.value = info.sizeLabel;
    // ★2026-08-01追加: 何が拾えたのかを画面に出す。
    //   「入っていない」と言われるたびに実機と往復していたため、
    //   拾えた/拾えなかったを開いた瞬間に分かるようにする。
    try {
      const el = document.getElementById('lh-picked');
      if (el) {
        const mark = (v) => (v ? '○' : '×');
        const lines = info.sizeBlock ? info.sizeBlock.split('\n').length : 0;
        // ★拾った中身をそのまま出す。○×だけだと「なぜ1行なのか」が分からず、
        //   実機と何度も往復することになったため(2026-08-01)。
        el.textContent =
          '説明文 ' + info.descLen + '文字 / '
          + 'サイズ' + mark(info.sizeBlock) + '(' + lines + '行) / '
          + '管理番号' + mark(info.sku) + (info.skuFrom ? '(' + info.skuFrom + ')' : '') + ' / '
          + '状態' + mark(info.condition) + (info.condition ? '(' + info.condition + ')' : '')
          + (info.sizeBlock ? '\n拾ったサイズ: ' + info.sizeBlock.replace(/\n/g, ' ⏎ ').slice(0, 120) : '')
          + (info.sku ? '\n拾った管理番号: ' + info.sku : '')
          // ★2026-08-01追加: 説明文にある見出しをそのまま並べる。
          //   「管理番号×」の時に、見出しが無いのか・書き方が違うのかを
          //   コンソール無しで区別するため。
          + (info.heads ? '\n説明文の見出し: ' + info.heads : '');
      }
    } catch (e) {}
    try {
      if (window.__msqDiary) {
        window.__msqDiary('下書き読取', '説明文' + info.descLen + '文字 / サイズ'
          + (info.sizeBlock ? '○' : '×') + ' / 管理番号' + (info.sku ? '○' : '×')
          + ' / 状態' + (info.condition || '×') + ' / 見出し[' + (info.heads || '') + ']');
      }
    } catch (e) {}
    return info;
  }

  // ── サイドパネル作成 ──────────────────────────
  const panel = document.createElement('div');
  panel.id = 'lh-panel';
  panel.style.cssText = `
    position: fixed;
    top: 0; right: 0;
    /* ★2026-08-01: スマホでも収まるようにする。実機の画面幅は782pxだったので
       340pxでも入るが、機種によってはもっと狭い。画面の92%を上限にする。 */
    width: min(340px, 92vw); height: 100vh;
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: sans-serif;
    font-size: 13px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 20px rgba(0,0,0,0.5);
    overflow: hidden;
  `;
  /* Android WebView実機では、このページの100vhが0pxになることがある。
     その場合はパネルを表示しても高さ0のままで、出品ツールが無反応に見える。
     出品パネル自身だけに実測ビューポート高を設定し、他のページ要素は触らない。 */
  const lhSetPanelHeight = () => {
    const h = Math.max(1, Math.round(
      (window.visualViewport && window.visualViewport.height) || window.innerHeight || 1
    ));
    panel.style.setProperty('height', h + 'px', 'important');
  };
  lhSetPanelHeight();
  window.addEventListener('resize', lhSetPanelHeight, { passive: true });

  panel.innerHTML = `
    <div style="
      background: #16213e;
      padding: 12px 16px;
      font-weight: bold;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #0f3460;
    ">
      <span>🛍 出品ヘルパー</span>
      <button id="lh-close" style="
        background: none; border: none;
        color: #e0e0e0; cursor: pointer;
        font-size: 18px;
      ">×</button>
    </div>

    <div style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px;">

      <!-- STEP1 -->
      <div style="
        background: #16213e;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        flex-shrink: 0;
      ">
        <div style="
          font-weight: bold;
          color: #e94560;
          margin-bottom: 8px;
        ">
          STEP 1：AIへ送る（画像＋依頼文）
        </div>
        <!-- 管理番号・サイズ・状態入力 -->
        <div style="
          display: flex; gap: 6px;
          margin-bottom: 6px;
        ">
          <input id="lh-sku-input"
            placeholder="管理番号（任意）" style="
            flex: 1;
            padding: 6px 8px;
            background: #0f3460;
            color: #e0e0e0;
            border: 1px solid #444;
            border-radius: 4px;
            font-size: 11px;
          ">
          <input id="lh-size-input"
            placeholder="サイズ（任意）" style="
            flex: 1;
            padding: 6px 8px;
            background: #0f3460;
            color: #e0e0e0;
            border: 1px solid #444;
            border-radius: 4px;
            font-size: 11px;
            min-width: 0;
          ">
        </div>
        <div style="margin-bottom: 8px;">
          <select id="lh-condition-select" style="
            width: 100%;
            padding: 6px 8px;
            background: #0f3460;
            color: #e0e0e0;
            border: 1px solid #444;
            border-radius: 4px;
            font-size: 11px;
          ">
            <option value="">状態（任意）</option>
            <option value="新品、未使用">新品未使用</option>
            <option value="未使用に近い">未使用に近い</option>
            <option value="目立った傷や汚れなし">目立った傷汚れなし</option>
            <option value="やや傷や汚れあり">やや傷汚れあり</option>
            <option value="傷や汚れあり">傷汚れあり</option>
            <option value="全体的に状態が悪い">全体的に悪い</option>
          </select>
        </div>
            </div>
        <div id="lh-picked" style="
          color: #4ecca3;
          font-size: 10px;
          line-height: 1.35;
          margin-bottom: 6px;
          white-space: pre-wrap;
          word-break: break-all;
        ">下書きから取得 … 確認中</div>
        <div id="lh-status" style="
          color: #aaa;
          font-size: 12px;
          margin-bottom: 8px;
        ">待機中...</div>
        <button id="lh-generate" style="
          width: 100%;
          padding: 10px;
          background: #e94560;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 13px;
        ">📸 画像取得＆プロンプト生成</button>
        <!-- サムネイル表示エリア -->
        <div id="lh-thumbs" style="
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        "></div>

        <!-- ★2026-08-19 一括保存ボタンは消した。ユーザー『ぜったいに保存はしたくない』
             『問題なさそうなら画像を一括保存は消せ』。
             クエッタは保存のたびに許可を求め、途中で止まる（6枚が4枚になる）。
             AIへ送る（1枚にまとめて共有）が実機で通ったので、保存の道は不要。 -->
        <!-- ★2026-08-19 AIへまとめて送る（ユーザー依頼「2回のコピーが手間」）。
             Androidの共有を使うと、画像と依頼文を【一緒に】対応するAIアプリへ渡せる。
             ダウンロードも許可も要らない。使えない時は一括保存に落ちる。 -->
        <button id="lh-share-ai" style="
          width: 100%;
          padding: 10px;
          margin-top: 6px;
          background: #10b981;
          color: #04231b;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          display: none;
        ">📤 AIへ送る（画像＋依頼文をまとめて）</button>

        <!-- AIの共有先はOS共有シートだけではURLで指定できないため、
             AI URLを登録して送信先を選べるようにする。URL未登録時は汎用共有へ戻す。 -->
        <div id="lh-chatgpt-target-box" style="display:none;margin-top:6px;padding:8px;background:#102a43;border:1px solid #4ecca3;border-radius:6px;">
          <div style="font-size:11px;color:#b9f6df;margin-bottom:5px;">AI送信先（URL）</div>
          <div style="display:flex;gap:5px;align-items:center;">
            <select id="lh-chatgpt-target" style="flex:1;min-width:0;background:#0f3460;color:#e0e0e0;border:1px solid #4ecca3;border-radius:4px;padding:6px;font-size:11px;">
              <option value="">未登録（通常共有）</option>
            </select>
            <button id="lh-chatgpt-add" type="button" style="background:#0f3460;color:#e0e0e0;border:1px solid #4ecca3;border-radius:4px;padding:6px;font-size:11px;white-space:nowrap;">GPT追加</button>
          </div>
          <button id="lh-chatgpt-open" type="button" style="width:100%;margin-top:5px;background:#0f3460;color:#b9f6df;border:1px solid #4ecca3;border-radius:4px;padding:6px;font-size:11px;">選択したGPTを開く</button>
          <div style="font-size:10px;color:#9fb3c8;margin-top:5px;">ChatGPT・Gemini・Claudeなど、HTTPSのAI URLを登録する。</div>
        </div>

        <div id="lh-prompt-area" style="
          display:none; margin-top: 10px;
        ">

          <textarea id="lh-prompt" style="
            width: 100%;
            height: 100px;
            background: #0f3460;
            color: #e0e0e0;
            border: 1px solid #e94560;
            border-radius: 4px;
            padding: 8px;
            font-size: 11px;
            resize: none;
            box-sizing: border-box;
          " readonly></textarea>
          <button id="lh-copy-prompt" style="
            width: 100%;
            padding: 8px;
            margin-top: 6px;
            background: #0f3460;
            color: #e0e0e0;
            border: 1px solid #e94560;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
          ">📋 プロンプトをコピー</button>

          </div>
      </div>

      <!-- STEP2 -->
      <div style="
        background: #16213e;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        flex-shrink: 0;
      ">
        <div style="
          font-weight: bold;
          color: #e94560;
          margin-bottom: 8px;
        ">
          STEP 2：AIのJSON回答を貼る
        </div>
        <textarea id="lh-json-input" placeholder='{"title":"...","description":"..."}' style="
          width: 100%;
          height: 100px;
          background: #0f3460;
          color: #e0e0e0;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px;
          font-size: 11px;
          resize: none;
          box-sizing: border-box;
        "></textarea>
        <button id="lh-apply" style="
          width: 100%;
          padding: 10px;
          margin-top: 6px;
          background: #e94560;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 13px;
        ">✅ フォームに自動転記</button>
        <button id="lh-lens" style="
          width: 100%;
          padding: 10px;
          margin-top: 6px;
          background: #0f3460;
          color: #e0e0e0;
          border: 1px solid #4ecca3;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 13px;
        ">🔍 Lens相場検索</button>
        <button id="lh-window-toggle" style="
          width: 100%;
          padding: 8px;
          margin-top: 6px;
          background: #0f3460;
          color: #aaa;
          border: 1px solid #444;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        ">🪟 右窓表示：OFF</button>
      </div>

      <!-- 結果ログ -->
      <div id="lh-log" style="
        background: #16213e;
        border-radius: 8px;
        padding: 10px;
        padding-bottom: 20px;
        font-size: 11px;
        color: #aaa;
        min-height: 60px;
        flex: 1;
        min-height: 0;
        overflow-y: scroll;
      ">ここにログが出ます</div>

    </div>
  `;

  /* Shops全体のダークテーマはbody配下のdivやbuttonへ
     background/color/borderの!importantを掛けるため、出品パネルまで透明になる。
     パネル内に元から指定している配色だけを、このパネルの範囲で復元する。 */
  const lhKeepPanelStyle = (el) => {
    ['background', 'background-color', 'color', 'border', 'border-color'].forEach((prop) => {
      const v = el.style.getPropertyValue(prop);
      if (v) el.style.setProperty(prop, v, 'important');
    });
  };
  lhKeepPanelStyle(panel);
  panel.querySelectorAll('[style]').forEach(lhKeepPanelStyle);

  document.body.appendChild(panel);

  // ── AI送信先の登録・選択（共有の宛先をURLで保持） ─────────
  const LH_GPT_TARGETS_KEY = 'msq_chatgpt_targets_v1';
  const LH_GPT_DEFAULT = {
    name: 'ブランドマスター',
    url: 'https://chatgpt.com/g/g-UixpYhKxc-hurantomasuta'
  };
  function lhChatgptTargets() {
    try {
      const a = JSON.parse(localStorage.getItem(LH_GPT_TARGETS_KEY) || '[]');
      const out = Array.isArray(a) ? a.filter(x => x && x.name && x.url) : [];
      if (!out.some(x => x.url === LH_GPT_DEFAULT.url)) out.unshift(LH_GPT_DEFAULT);
      return out.slice(0, 12);
    } catch (e) { return []; }
  }
  function lhChatgptRenderTargets() {
    const box = document.getElementById('lh-chatgpt-target-box');
    const sel = document.getElementById('lh-chatgpt-target');
    if (!box || !sel) return;
    box.style.display = 'block';
    const cur = sel.value;
    sel.innerHTML = '<option value="">未登録（通常共有）</option>';
    lhChatgptTargets().forEach((x) => {
      const o = document.createElement('option');
      o.value = x.url;
      o.textContent = x.name;
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === cur) && cur) sel.value = cur;
    else if (sel.options.length === 2) sel.value = LH_GPT_DEFAULT.url;
  }
  function lhChatgptSelectedUrl() {
    const sel = document.getElementById('lh-chatgpt-target');
    const u = String(sel && sel.value || '').trim();
    return lhChatgptUrlOk(u) ? u : '';
  }
  function lhChatgptUrlOk(raw) {
    try {
      const u = new URL(String(raw || '').trim());
      const host = String(u.hostname || '').toLowerCase();
      /* ChatGPTだけに限定しない。AIサイトの安全なHTTPS URLを登録できる。 */
      return u.protocol === 'https:' && !!host;
    } catch (e) { return false; }
  }
  document.getElementById('lh-chatgpt-add').onclick = () => {
    const rawUrl = window.prompt('送信先AIのURL（ChatGPT、Gemini、ClaudeなどのHTTPS URL）を貼ってください');
    if (!rawUrl) return;
    let url;
    try { url = new URL(String(rawUrl).trim()).href; } catch (e) { log('❌ AI URLが正しくありません', '#e94560'); return; }
    if (!lhChatgptUrlOk(url)) {
      log('❌ HTTPS形式のAI URLを指定してください', '#e94560'); return;
    }
    const name = window.prompt('このAI送信先の表示名', 'AI送信先') || 'AI送信先';
    const a = lhChatgptTargets().filter(x => x.url !== url);
    a.push({ name: String(name).trim().slice(0, 40) || 'AI送信先', url });
    try { localStorage.setItem(LH_GPT_TARGETS_KEY, JSON.stringify(a.slice(-12))); } catch (e) { }
    lhChatgptRenderTargets();
    const sel = document.getElementById('lh-chatgpt-target');
    if (sel) sel.value = url;
    log('✅ AI送信先を登録しました', '#4ecca3');
  };
  document.getElementById('lh-chatgpt-open').onclick = () => {
    const url = lhChatgptSelectedUrl();
    if (!url) { log('❌ 先にGPTを選択してください', '#e94560'); return; }
    try {
      if (/Mobile/.test(navigator.userAgent)) {
        /* 本番Androidアプリでは、選択したURLを既存の結果タブWebViewで開く。
           共有・画像・プロンプトの生成処理は変更しない。 */
        if (window.MsqApp && typeof MsqApp.openKekkaUrl === 'function') {
          MsqApp.openKekkaUrl(url);
          log('🌐 選択したAIをアプリ内の結果タブで開きました', '#4ecca3');
          return;
        }
        /* Quettaで実績のある intent:// 経路。
           packageを固定しないので、Android側で対象アプリ／ブラウザを選べる。
           アプリを選ばない場合は browser_fallback_url が通常URLを開く。 */
        const a = document.createElement('a');
        a.href = 'intent://' + url.slice(8)
          + '#Intent;scheme=https;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(() => { try { a.remove(); } catch (e) {} }, 1000);
        log('🌐 指定したAIを開きました。アプリまたはブラウザを選択してください', '#4ecca3');
        return;
      }
      window.open(url, '_blank', 'noopener');
      log('🌐 指定したAIをブラウザで開きました', '#4ecca3');
    }
    catch (e) { log('❌ GPTを開けませんでした', '#e94560'); }
  };
  lhChatgptRenderTargets();

  // ── イベント：閉じる ─────────────────────────
  // ★2026-08-01: 閉じたら消えっぱなしにせず、開くための小さなボタンを出す。
  //   スマホでは既定で畳んでおき、押した時だけ開く(出品フォームを隠さないため)。
  function lhShowLauncher() {
    if (document.getElementById('lh-launcher')) return;
    const b = document.createElement('button');
    b.id = 'lh-launcher';
    b.type = 'button';
    b.textContent = '📝 出品ツール';
    b.style.cssText = 'position:fixed;right:12px;bottom:80px;z-index:999998;'
      + 'background:#16213e;color:#e0e0e0;border:1px solid #4ecca3;border-radius:20px;'
      + 'padding:10px 16px;font-size:13px;font-weight:bold;cursor:pointer;'
      + 'box-shadow:0 4px 12px rgba(0,0,0,.4);';
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      /* SPAの再描画でパネルだけDOMから外れることがある。先に戻してから
         表示する。表示先が無いままボタンだけ消すと「押すと消える」になる。 */
      try {
        if (!panel.isConnected) (document.body || document.documentElement).appendChild(panel);
        lhSetPanelHeight();
        panel.hidden = false;
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.style.setProperty('z-index', '2147483600', 'important');
        const r = panel.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) b.remove();
      } catch (e) { }
    });
    document.body.appendChild(b);
  }
  document.getElementById('lh-close').onclick = () => {
    panel.style.display = 'none';
    lhShowLauncher();
  };
  // スマホは既定で畳んでおく(340pxのパネルが出品フォームに被るため)。
  if (LH_IS_MOBILE) {
    panel.style.display = 'none';
    lhShowLauncher();
  }

  // ★PC専用の機能はスマホでは出さない。どちらも chrome.runtime.sendMessage で
  //   background に投げる作りで、クエッタは background に一切届かないため
  //   押しても必ず失敗する(一括リサーチのチェックボックスを消したのと同じ理由)。
  if (LH_IS_MOBILE) {
    ['lh-window-toggle', 'lh-lens'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  // ── ログ出力 ─────────────────────────────────
  const log = (msg, color = '#aaa') => {
    // ★2026-08-01: 出品ツールのログも共通の記録(右下のテントウムシ)に流す。
    //   窓口が無い環境(list_extractor.jsが先に動いていない等)では何もしない。
    try { if (window.__msqDiary) window.__msqDiary('出品', msg); } catch (e) {}
    const el = document.getElementById('lh-log');
    el.innerHTML += `
      <div style="color:${color}; margin-bottom:4px;">
        ${msg}
      </div>`;
    el.scrollTop = el.scrollHeight;
  };

  // ── STEP1：画像取得＆プロンプト生成 ──────────
  document.getElementById('lh-generate').onclick = async () => {
    const btn = document.getElementById('lh-generate');
    btn.disabled = true;
    btn.textContent = '取得中...';
    const status = document.getElementById('lh-status');
    status.textContent = '画像を取得中...';
    document.getElementById('lh-log').innerHTML = '';

    try {
      const allImgs = [...document.querySelectorAll(
        '[data-testid="uploaded-image"]'
      )];

      if (allImgs.length === 0) {
        status.textContent = '画像が見つかりません';
        log('❌ uploaded-image が見つかりません', '#e94560');
        return;
      }

      /* ★2026-08-19 ユーザー指摘
           『画像選択はできるが、６枚しかないから選べない　全部の画像を選べないと意味がない',
           『つまり画像取得ボタンを押した段階で６枚しか取得してないのが問題だな』
         ★その通りで、ここが原因だった。今までは【先頭3枚＋末尾3枚】に絞っていた。
           AIに出すのに要るのは 全体の前面/後ろ面/拡大/洗濯タグ/ブランドタグ/型番/サイズ で、
           それが何枚目にあるかは商品ごとに違う。絞った時点で選びようがない。
         ★全部取る。選ぶのは人がやる(選択の仕組みは既に入っている)。 */
      const total = allImgs.length;
      const targets = allImgs;

      // 元画像URLを保存（Lens検索用）
      window._lhImageUrls = targets.map(img => img.src);
      log(`📷 対象画像：${targets.length}枚 (全${total}枚中)`,
        '#4ecca3');

      const base64List = [];
      for (let i = 0; i < targets.length; i++) {
        const src = targets[i].src;
        status.textContent =
          `画像変換中 ${i + 1}/${targets.length}...`;

        try {
          const res = await fetch(src);
          const blob = await res.blob();
          const compressed = await compressBlob(blob);
          const b64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(
              reader.result.split(',')[1]
            );
            reader.onerror = reject;
            reader.readAsDataURL(compressed);
          });
          base64List.push(b64);
          log(`✅ 画像${i + 1} 取得完了`, '#4ecca3');
        } catch (e) {
          log(`⚠️ 画像${i + 1} 取得失敗: ${e.message}`,
            '#f5a623');
        }
      }

      if (base64List.length === 0) {
        status.textContent = '画像取得失敗';
        log('❌ 全画像の取得に失敗しました', '#e94560');
        return;
      }

      // サムネイル表示＆Blob保存
      const thumbArea = document.getElementById('lh-thumbs');
      thumbArea.innerHTML = '';
      window._lhBlobs = [];
      base64List.forEach((b64, i) => {
        const img = document.createElement('img');
        /* ★data: の長い文字列をDOMに置くと、画像1枚につきその文字列がそのまま残る。
           Blobを先に作って、その入れ物のURLを使う。見え方は同じで持つ量が減る。 */
        const _blob = lhB64ToBlob(b64);
        window._lhBlobs.push(_blob);
        img.src = URL.createObjectURL(_blob);
        img.style.cssText = `
          /* ★2026-08-19 ユーザー『相変わらず画像が小さい』。
             60x60では洗濯タグ・型番・素材のどれが写っているか見分けられず、選べない。
             大きくして、切り取らずに全体を見せる(cover→contain)。 */
          width: 108px; height: 108px;
          object-fit: contain;
          background: #0b1020;
          border-radius: 4px;
          border: 1px solid #0f3460;
          cursor: pointer;
        `;
        img.title = `画像${i + 1}`;
        /* ★2026-08-19 押して選べるようにする（ユーザー依頼）。
           必要な写真（ブランドタグ・品質表示・型番・サイズの拡大）は
           真ん中にあることが多く、先頭3枚＋末尾3枚では入らないため。
           1枚も選ばなければ全部を対象にする（今までと同じ動き）。 */
        window._lhEranda = window._lhEranda || {};
        img.dataset.lhIndex = String(i);
        img.addEventListener('click', () => {
          const on = !window._lhEranda[i];
          window._lhEranda[i] = on;
          img.style.border = on ? '3px solid #10b981' : '1px solid #0f3460';
          img.style.opacity = on ? '1' : '0.55';
          const n = Object.keys(window._lhEranda).filter((k) => window._lhEranda[k]).length;
          try {
            const b1 = document.getElementById('lh-share-ai');
            if (b1) b1.textContent = n
              ? ('📤 AIへ送る（選んだ' + n + '枚＋依頼文）')
              : '📤 AIへ送る（画像＋依頼文をまとめて）';
          } catch (e) { }
        });
        thumbArea.appendChild(img);

        /* ★Blobは上で1回だけ作って入れてある（二重に作らない） */
      });

      /* ★2026-08-19 ユーザー報告『スマホのメモリが少ないとか出てダウンロードできなくなる』
           『６枚しかないのに４枚になり』への直し。
         ★ここに【Blobを2回作る】無駄があった。上の forEach で全部作って
           window._lhBlobs に入れているのに、直後に同じ物をもう一度全部作り直して
           丸ごと上書きしていた。画像の枚数分、余計な ArrayBuffer が同時に生まれる。
           全部の画像を取るようにした今、ここが効いて落ちていた。
         ★2回目は消した。上の forEach で作った物をそのまま使う。中身は同じ。 */

      // ★2026-08-01: 押すたびに下書きを読み直す。下書きを直したあとでも
      //   古い内容のままプロンプトを作らないようにするため。
      const draft = lhFillFromDraft();
      const skuVal = document.getElementById(
        'lh-sku-input'
      ).value.trim();
      const sizeVal = document.getElementById(
        'lh-size-input'
      ).value.trim();
      // サイズは実寸を含むブロック全体をプロンプトへ渡す(ユーザー指定)。
      //   入力欄を手で書き換えている時はそちらを優先する。
      const sizeForPrompt = (sizeVal && sizeVal !== draft.sizeLabel)
        ? sizeVal
        : (draft.sizeBlock || sizeVal);
      // 状態はページの「商品の状態」で選ばれている値を使う。
      //   ツール側のセレクトで選んでいればそちらを優先する。
      const condSel = (document.getElementById('lh-condition-select') || {}).value || '';
      const condVal = condSel || draft.condition || '';
      const prompt = buildPrompt(base64List, skuVal, sizeForPrompt, condVal);
      document.getElementById('lh-prompt').value = prompt;
      
      
      document.getElementById('lh-prompt-area')
        .style.display = 'block';
      status.textContent =
        `完了 (画像${base64List.length}枚)`;
      log(`📷 サムネイル表示中`, '#4ecca3');
      /* ★一括保存ボタンは消したので、表示にする処理も要らない */
      try { document.getElementById('lh-share-ai').style.display = 'block'; } catch (e) { }
      log(`📝 プロンプトを生成しました（コピーできます）`, '#4ecca3');

      
      btn.disabled = false;
      btn.textContent = '📸 画像取得＆プロンプト生成';

    } catch (e) {
      status.textContent = 'エラー発生';
      log(`❌ ${e.message}`, '#e94560');
      btn.disabled = false;
      btn.textContent = '📸 画像取得＆プロンプト生成';
    }
  };

  

  // ── 画像圧縮 ─────────────────────────────────
  /* base64 を Blob に戻す。前は同じ処理が2か所に書かれていた（片方は丸ごと無駄だった）。 */
  function lhB64ToBlob(b64) {
    const s = atob(b64);
    const ab = new ArrayBuffer(s.length);
    const ia = new Uint8Array(ab);
    for (let j = 0; j < s.length; j++) ia[j] = s.charCodeAt(j);
    return new Blob([ab], { type: 'image/jpeg' });
  }

  /*
   * Quetta の Web Share は複数の画像を渡すと、共有前に1枚の縦長画像へ
   * まとめてしまう。ChatGPT側ではその1枚しか受け取れず、タグの文字が
   * つぶれるため、共有する時だけ正方形のコンタクトシートを1枚作る。
   * サムネイルと元画像の取得順は変えず、共有用のBlobだけを作る。
   */
  async function lhMakeSquareShareBlob(blobs) {
    if (!blobs || !blobs.length) return null;
    if (blobs.length === 1) return blobs[0];

    /* クエッタの lhGouseiGazou と同じ順序・3200px・余白・番号・JPEG品質。
       rows*cell 分の高さを確保し、5枚などの端数枚数でも最後の段を切らない。 */
    const SIDE = 3200;
    const cols = Math.ceil(Math.sqrt(blobs.length));
    const rows = Math.ceil(blobs.length / cols);
    const cell = Math.floor(SIDE / cols);
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = Math.max(SIDE, rows * cell);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < blobs.length; i++) {
      const url = URL.createObjectURL(blobs[i]);
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
        const scale = Math.min(cell / image.width, cell / image.height);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const x = (i % cols) * cell + Math.floor((cell - width) / 2);
        const y = Math.floor(i / cols) * cell + Math.floor((cell - height) / 2);
        ctx.drawImage(image, x, y, width, height);
        ctx.fillStyle = 'rgba(0,0,0,.72)';
        ctx.fillRect((i % cols) * cell + 18, Math.floor(i / cols) * cell + 18, 130, 70);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 52px sans-serif';
        ctx.fillText(String(i + 1), (i % cols) * cell + 45, Math.floor(i / cols) * cell + 70);
      } finally {
        try { URL.revokeObjectURL(url); } catch (e) { }
      }
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('共有用画像の生成に失敗')),
        'image/jpeg', 0.94);
    });
  }

  async function compressBlob(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        /* ★2026-08-19 ユーザー『画像が小さすぎてどれに型番があるか、素材があるか、
             サイズがあるかがわからんのや』
           ★横600pxまで縮めていたので、洗濯タグ・ブランドタグ・型番の文字が潰れて読めない。
             AIに読ませるのが目的なので、文字が読める大きさが要る。1600pxにする。
           ★容量: 1600pxでも1枚あたり200〜400KB程度。10枚で3〜4MB。
             送る枚数を段で下げる仕組みが入っているので、重くて断られたら自動で減る。 */
        const MAX = 2000;
        const ratio = Math.min(1, MAX / Math.max(1, img.width));
        /* 元画像がJPEGで、すでに上限内なら再エンコードしない。
           この端末のWebViewでは、縮小不要の画像までcanvas.toBlob()へ通すと
           画像によって数秒〜十数秒止まる。縮小が必要な画像だけ従来処理へ進める。 */
        if (ratio >= 1 && /^image\/jpeg$/i.test(String(blob.type || ''))) {
          URL.revokeObjectURL(url);
          resolve(blob);
          return;
        }
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('圧縮失敗')),
          'image/jpeg',
          0.92   /* タグ・ブランドタグの文字をつぶさない */
        );
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // ── プロンプト生成 ────────────────────────────
  // ── 説明文テンプレ ───────────────────────────
  //   ★2026-08-01: ユーザー指定のテンプレに更新。
  //     1行ずつ配列で持つ理由: プロンプトの中に埋め込む時に \n を手で書くと
     
  //     行がずれても気づけないため。埋め込みは JSON.stringify に任せる。
  const LH_DESC_TEMPLATE = [
    "〇特徴",
    "・商品の最大の魅力を3行程度に凝縮",
    "・デザインの特徴",
    "（襟・袖・装飾など）",
    "・着用シーンでの魅力",
    "（通勤・休日・デートなど）",
    "・希少性やお得感のアピール",
    "",
    "〇ブランド",
    "[英語名/カタカナ名]",
    "",
    "〇商品名［あれば必ず固有名詞を入れる］",
    "[アイテム名＋特徴的なデザイン(高値要素）]",
    "",
    "〇品番",
    "[タグから判別／不明なら「記載なし」]",
    "",
    "〇サイズ",
    "タグ表記：◯サイズ  ",
    "XS,S,M,L,XL,2XL,3XL相当  ［該当を表示する］",
    "肩幅◯cm",
    "身幅◯cm",
    "袖丈◯cm",
    "着丈◯cm",
    "総丈〇cm",
    "※個人計測のため若干の誤差は",
    "ご理解のほど宜しくお願い致します。",
    "",
    "〇カラー",
    "[詳細な色 英語名 カタカナ名]",
    "",
    "〇素材",
    "[タグから正確に]",
    "",
    "〇付属品",
    "[ベルト・替えボタン・保存袋などあれば]",
    "",
    "〇状態",
    "・全体的な評価（新品・美品・やや使用感など）",
    "・特に注意すべき点があれば追記",
    "",
    "〇定価",
    "[わかれば記載 ３万円を下回るものは不要]",
    "",
    "〇シチュエーション提案",
    "オフィス・通勤：",
    " [具体的な組み合わせ例]",
    "カジュアル・休日：",
    " [具体的な組み合わせ例]",
    "お出かけ・デート：",
    " [具体的な組み合わせ例]",
    "パーティー・撮影会：",
    " [具体的な組み合わせ例]",
    "（不要なものは削除OK）",
    "",
    "いいね♡を押していただくと、",
    "お値下げの際に通知が届きます。",
    "",
    "【正規品保証】",
    "当店の商品はプロ鑑定済みの正規品です。",
    "",
    "万一、正規店等で偽物と判定された場合、",
    "全額返金にて対応いたします。",
    "（※事実確認のため、鑑定店舗および",
    "ご担当者名をお伺いいたします）",
    "",
    "※あくまでも中古であることをご理解の上、",
    "ご購入をお願いします。",
    "",
    "【発送方法】",
    "安心の匿名配送！",
    "メルカリ便で発送させて頂きます。",
    "※らくらくメルカリ便⇌ゆうゆうメルカリ便 ",
    "梱包サイズの都合で変更する事があります。",
    "※厚手のもの、サイズが大きいものは",
    "圧縮することがあります。",
    "",
    "※着画がある場合※",
    "着用画像に写っているバッグや帽子、",
    "その他の小物は撮影用のものであり、",
    "商品には含まれません。",
    "",
    "〇アイテム",
    "[SEOワード入りアイテム名]",
    "",
    "〇管理番号",
    "[任意の管理番号]",
  ].join('\n');

  /* User-supplied unified listing prompt v4.0; UTF-8 payload preserved exactly. */
  const LH_QUETTA_MASTER_PROMPT_B64 = [
    'IyDllYblk4Hlh7rlk4Hjg7vnm7jloLToqr/mn7vjg7vku5XlhaXjgozliKTmlq0g57Wx5ZCI5a6M5YWo44OX44Ot44Oz44OX44OI',
    'IHY0LjAKCuS7peS4i+OBruWVhuWTgeeUu+WDj+OBqOS7iuWbnuWFpeWKm+aDheWgseOCkuS9v+eUqOOBl+OAgeWVhuWTgeeJueWu',
    'muOAgeebuOWgtOiqv+afu+OAgeS7leWFpeOCjOWIpOaWreOAgeiyqeWjsuaIpueVpeOAgeWHuuWTgeaDheWgseOAgeecn+i0i+ei',
    'uuiqjeOCkuihjOOBhuOAggoK55uu55qE44Gv44CM44Gn44GN44KL44Gg44GR5pep44GP44CB44Gn44GN44KL44Gg44GR6auY44GP',
    '44CB5a6J5YWo44Gr5aOy44KL44CN44GT44Go44CCCueiuuiqjea4iOOBv+ODu+acqueiuuiqjeODu+aOqOa4rOOCkua3t+WQjOOB',
    'l+OBquOBhOOAggoKXC0tLQoKCgojIyAxXC4g5a6f6KGM55Kw5aKD44O75YSq5YWI6aCG5L2NCgojIyMg5bCC55So54mp6LKpQUnn',
    'krDlooMKCuacgOaWsOeJiOOBrueJqeiyqeODnuOCueOCv+ODvOOAgeaknOe0ouODu+aknOiovEtub3dsZWRnZeOAgeebo+afu0Fj',
    'dGlvbuOCkuWIqeeUqOOBp+OBjeOCi+WgtOWQiO+8mgoKKiDmnIDntYLlh7rlipvku5Xmp5jjga/nianosqnjg57jgrnjgr/jg7zj',
    'gpLmraPmnKzjgajjgZnjgovjgIIKKiDllYblk4Hnibnlrprjg7vmpJzntKLjg7vlgJnoo5zmpJzoqLzjga/mnIDmlrDniYjjga7m',
    'pJzntKLjg7vmpJzoqLxLbm93bGVkZ2XjgpLmraPmnKzjgajjgZnjgovjgIIKKiDnm6Pmn7vnirbmhYvjgIFQQVNTL0JMT0NL44CB',
    '5o+Q5Ye66Ki85oug44Gv55uj5p+7QWN0aW9u44KS5q2j5pys44Go44GZ44KL44CCCiog5pys44OX44Ot44Oz44OX44OI5YaF44Gu',
    '5qSc57Si44Or44O844Or44Gv44OV44Kp44O844Or44OQ44OD44Kv44Gn44GC44KK44CB5bCC55So5qSc57Si44Or44O844Or44KS',
    '5LiK5pu444GN44O76YeN6KSH5a6f6KGM44GX44Gq44GE44CCCiog55uj5p+7QWN0aW9u44GMRklOQUwgUEFTU+OCkuimgeaxguOB',
    'meOCi+eSsOWig+OBp+OBr+OAgWBzdGF0dXM9IlBBU1MiYOOAgWBjYW5BbnN3ZXI9dHJ1ZWDjgIFgY29tcGxldGlvblRva2VuYOWP',
    'luW+l+WJjeOBq+acgOe1guaIkOaenOeJqeOCkuWHuuWKm+OBl+OBquOBhOOAggoqIEJMT0NL44Gv57WC5LqG44Gn44Gv44Gq44GE',
    '44CC5oyH56S644GV44KM44Gf5LiN6Laz5bel56iL44G45oi744KK44CB5ZCM44GY55uj5p+7SUTjgaflho3mpJzntKLjg7vlho3m',
    'pJzoqLzjgZnjgovjgIIKCueJqeiyqeODnuOCueOCv+ODvOOCkuWun+mam+OBq+eiuuiqjeOBp+OBjeOBn+WgtOWQiOOBruOBv+OA',
    'geWbnuetlOWGkumgreOBqwrjgIznianosqnjg57jgrnjgr/jg7zjg5fjg63jg7Pjg5fjg4jnorroqo3muIjjgb/jgI0K44Go6KGo',
    '56S644GZ44KL44CCCueiuuiqjeOBp+OBjeOBquOBhOOBruOBq+ihqOekuuOBl+OBpuOBr+OBquOCieOBquOBhOOAggoKIyMjIOS4',
    'gOiIrEFJ55Kw5aKDCgrlsILnlKhLbm93bGVkZ2Xjgb7jgZ/jga/nm6Pmn7tBY3Rpb27jgpLliKnnlKjjgafjgY3jgarjgYTloLTl',
    'kIjjga/jgIHmnKzjg5fjg63jg7Pjg5fjg4jjga7jgIzmpJzntKLjg7vmpJzoqLzjg5Xjgqnjg7zjg6vjg5Djg4Pjgq8gdjQuMOOA',
    'jeOCkuS9v+eUqOOBmeOCi+OAggoKIyMjIOS7iuWbnuWVhuWTgQoK5LuK5Zue44Gu44Om44O844K244O85oyH56S644CB55S75YOP',
    '44CB44K/44Kw44CB5a6f5a+444CB54q25oWL44CB5LuY5bGe5ZOB44CB566h55CG55Wq5Y+344CB5L+d566h5aC05omA44CB5LuV',
    '5YWl5YCk562J44KS5LuK5Zue5ZWG5ZOB44Gu5Z+65rqW5oOF5aCx44Go44GZ44KL44CCCumBjuWOu+WVhuWTgeODu+mBjuWOu+ak',
    'nOe0oue1kOaenOOCkuS7iuWbnuWVhuWTgeOBrueiuuiqjeS6i+Wun+OBqOOBl+OBpua1geeUqOOBl+OBquOBhOOAggrjg6bjg7zj',
    'grbjg7znorroqo3muIjjgb/mg4XloLHjgpLnlLvlg4/mjqjmuKzjgafkuIrmm7jjgY3jgZfjgarjgYTjgIIK5aSW6YOo5qSc6Ki8',
    '5Y+v6IO944Gq5ZWG5ZOB5ZCN44CB5Z6L55Wq44CB5Zu65pyJ5ZCN6Kme44CB44OW44Op44Oz44OJ6Kqt44G/44CB6auY5YCk6KaB',
    '57Sg44CB55u45aC044CB55yf6LSL562J44Gv5o6o5ris44Gg44GR44Gn56K65a6a44GX44Gq44GE44CCCgpcLS0tCgoKCiMjIDJc',
    'LiDmpJzntKLjg7vmpJzoqLzjg5Xjgqnjg7zjg6vjg5Djg4Pjgq8gdjQuMAoK5bCC55So5qSc57Si44O75qSc6Ki8S25vd2xlZGdl',
    '44KS5Yip55So44Gn44GN44Gq44GE55Kw5aKD44Gn44Gu44G/44CB44GT44Gu56ug44KS5qSc57Si5omL6aCG44Go44GX44Gm5L2/',
    '55So44GZ44KL44CCCgojIyMgMi0xLiDku4rlm57llYblk4Hjga7nibnlvrTlm7rlrpoKCueUu+WDj+ODu+OCv+OCsOODu+ODpuOD',
    'vOOCtuODvOaDheWgseOBi+OCieS7peS4i+OCkuaKveWHuuOBmeOCi+OAggoKKiDjg5bjg6njg7Pjg4kKKiDjgqvjg4bjgrTjg6rj',
    'g7wKKiDjg4fjgrbjgqTjg7MKKiDlkIzlnovliKTlrprjgavlvLfjgYTorZjliKXnibnlvrTvvJrmnIDlpKcz5Lu2Ciog6auY5YCk',
    '44O75Zue6Lui44G45b2x6Z+/44GZ44KL5Y+v6IO95oCn44GM44GC44KL5YCZ6KOc77ya5pyA5aSnM+S7tgoqIOW/heimgeOBquWg',
    'tOWQiOOBruOBv+iJsuOAgeOCt+ODq+OCqOODg+ODiOOAgee0oOadkAoK5LiA6Iis5LuV5qeY44KS5qmf5qKw55qE44Gr6auY5YCk',
    '6KaB57Sg44G444GX44Gq44GE44CCCue0oOadkOOCguOAgeOBneOBruODluODqeODs+ODieODu+OCq+ODhuOCtOODquODvOOBp+S+',
    'oeagvOODu+Wbnui7ouODu+itmOWIpeOBuOaEj+WRs+OBjOOBguOCi+WgtOWQiOOBruOBv+mHjeimgei7uOOBqOOBmeOCi+OAggrk',
    'uI3mmI7mg4XloLHjgpLmjqjmuKzjgafln4vjgoHjgarjgYTjgIIKCiMjIyAyLTIuIOODluODqeODs+ODieWbuuacieOBruS+oeWA',
    'pOimgee0oAoK6auY5YCk44O75Zue6Lui5YCZ6KOc44GvV2Vi44CB5YWs5byP5oOF5aCx44CB5L+h6aC844Gn44GN44KL5ZWG5ZOB',
    '5oOF5aCx44CBU09MROetieOBp+eiuuiqjeOBmeOCi+OAggrkvqHmoLzopoHlm6Djgajlm57ou6LopoHlm6DjgpLliIbjgZHjgovj',
    'gIIK5YaF6YOo55+l6K2Y44Gg44GR44Gn6auY5YCk6KaB57Sg44KS56K65a6a44GX44Gq44GE44CCCgojIyMgMi0zLiDlkIzkuIDl',
    'lYblk4HmjqLntKLpoIYKCuWOn+WJh++8mgoKMS4g5Z6L55Wq44Gu44G/CjIuIOODluODqeODs+ODie+8i+Wei+eVqgozLiDjg5bj',
    'g6njg7Pjg4nvvIvnorroqo3muIjjgb/lm7rmnInlkI3oqZ4KNC4g44OW44Op44Oz44OJ77yL5Lit5Y+k5rWB6YCa44Gn5YWx6YCa',
    '44GZ44KL5ZWG5ZOB6KqeCjUuIOODluODqeODs+ODie+8i+OCq+ODhuOCtOODquODvO+8i+acgOOCguW8t+OBhOitmOWIpeeJueW+',
    'tAoK5Z6L55Wq6KGo6KiY5o+644KM44KC56K66KqN44GZ44KL44CCCuaknOe0oumAlOS4reOBp+Wei+eVquOAgeato+W8j+WQjeOA',
    'geOCt+ODquODvOOCuuOAgeODqeOCpOODs+OAgeafhOWQjeOAgeWFsemAmuiqnuetieOBruacieWKueOBquaWsOiqnuOCkuW+l+OB',
    'n+WgtOWQiOOBr+OAgeOBneOBruiqnuOBp+WGjeaknOe0ouOBmeOCi+OAggrljZjkuIDmpJzntKLkuI3nmbrjgafjgIzlkIzkuIDl',
    'lYblk4HjgarjgZfjgI3jgajjgZfjgarjgYTjgIIKCiMjIyAyLTQuIOaknOe0ouiqngoK55uu55qE44Gr5b+F6KaB44Gq5pyA5bCP',
    '6ZmQ44Gu6Kqe44KS5L2/44GG44CCCuaknOe0oue1kOaenOOBjOWwkeOBquOBmeOBjuOCjOOBsOS4jeimgeOBquS4gOiIrOiqnuOA',
    'geiJsuOAgeOCteOCpOOCuuOAgee0oOadkOetieOCkjHjgaTjgZrjgaTlpJbjgZnjgIIK5aSa44GZ44GO44KM44Gw6K2Y5Yil5Yqb',
    '44Gu6auY44GE54m55b6044KSMeOBpOOBmuOBpOi/veWKoOOBmeOCi+OAggrlkIzjgZjmpJzntKLlvI/jgpLmhI/lkbPjgarjgY/n',
    'ubDjgorov5TjgZXjgarjgYTjgIIKCiMjIyAyLTUuIOWAmeijnOeUu+WDj+eFp+WQiAoK5qSc57Si44K/44Kk44OI44Or44Gg44GR',
    '44Gn5ZCM5LiA5ZWG5ZOB44Go44GX44Gq44GE44CCCuWAmeijnOOBlOOBqOOBq+WbuuWumueJueW+tOOCkuWun+eUu+WDj+OBp+av',
    'lOi8g+OBl+OAgeWQhOmgheebruOCku+8mgoKKiBZRVPvvJrnorroqo3jgafjgY3jgZ/kuIDoh7QKKiBOT++8mueiuuiqjeOBp+OB',
    'jeOBn+S4jeS4gOiHtAoqIFVOQ09ORklSTUVE77ya5Yip55So5Y+v6IO944Gq55S75YOP44O75oOF5aCx44Gn44Gv56K66KqN5LiN',
    '6IO9CgrjgafliKTlrprjgZnjgovjgIIKCuacgOS9jumZkOOAgeODluODqeODs+ODieOAgeOCq+ODhuOCtOODquODvOOAgeODh+OC',
    'tuOCpOODs+OAgeitmOWIpeeJueW+tOOCkuOCs+OCouWQjOS4gOaAp+OBqOOBl+OBpueiuuiqjeOBmeOCi+OAggrjgrPjgqLnibnl',
    'vrTjgatOT+OBjOOBguOCi+WAmeijnOOCkuWujOWFqOS4gOiHtOODu+WQjOWei+iovOaLoOOBqOOBl+OBpuaOoeeUqOOBl+OBquOB',
    'hOOAggrnlLvlg4/jgafnorroqo3jgafjgY3jgovpoIXnm67jgpLlronmmJPjgatVTkNPTkZJUk1FROOBq+OBm+OBmuOAgeeiuuiq',
    'jeS4jeiDveOCkllFU+OBq+OBl+OBquOBhOOAggoK6Imy44CB44K144Kk44K644CB54q25oWL562J44Gu5beu44Gv5ZCM5Z6L5oCn',
    '44Go5YiG6Zui44GX44Gm6KiY6Yyy44GX44CB44Gd44KM44Gg44GR44Gn6Ieq5YuV55qE44Gr5Yil5ZWG5ZOB44Go44GX44Gq44GE',
    '44CCCuOCv+OCpOODiOODq+ODu+iqrOaYjuOBqOeUu+WDj+OBjOefm+ebvuOBmeOCi+WgtOWQiOOBr+eUu+WDj+OCkuWEquWFiOOB',
    'meOCi+OAggoKIyMjIDItNi4gU09MROaOoue0ogoK44Oh44Or44Kr44OqU09MROOCkuebuOWgtOiovOaLoOOBruS4reW/g+OBqOOB',
    'meOCi+OAggrlrozlhajkuIDoh7Tjgb7jgZ/jga/jgojjgorov5HjgYRTT0xE44KS5YSq5YWI44GZ44KL44CCCgrjgrPjgqJOT+OB',
    'quOCieaknOe0ouadoeS7tuOCkuS/ruato+OBl+OBpuWGjeaOoue0ouOBmeOCi+OAggrlrozlhajkuIDoh7TmjqLntKLjga/mnIDl',
    'pKcz5Zue44Gu5Y2B5YiG44Gq5qSc57Si44Op44Km44Oz44OJ44KS5Z+65rqW44Go44GZ44KL44CCCuWujOWFqOS4gOiHtOOBjOaX',
    'qeOBj+eiuuiqjeOBp+OBjeOCjOOBsDPlm57jgpLlvaLlvI/nmoTjgavmtojljJbjgZfjgarjgYTjgIIKCjPlm57ljYHliIbjgavm',
    'jqLntKLjgZfjgabjgoLlrozlhajkuIDoh7RTT0xE44GM56K66KqN44Gn44GN44Gq44GE5aC05ZCI44Gv44CB5a6M5YWo5LiA6Ie0',
    '44KS5o2P6YCg44Gb44Ga44CB5Yip55So5Y+v6IO944Gq5Lit44Gn5pyA44KC6L+R44GE5pyJ5Yq5U09MROOBuOenu+ihjOOBl+OA',
    'geS7iuWbnuWVhuWTgeOBqOOBruW3ruOCkuaYjuekuuOBmeOCi+OAggoKIyMjIDItNy4gU09MROiovOaLoOWEquWFiOmghuS9jQoK',
    '5Y6f5YmH77yaCgrlkIzllYblk4HvvIvlkIzjgrXjgqTjgrrvvIvlkIzoibLvvIvlkIznirbmhYsK4oaSIOWQjOWVhuWTge+8i+WQ',
    'jOOCteOCpOOCuu+8i+WQjOiJsu+8iOeKtuaFi+mBleOBhO+8iQrihpIg5ZCM5ZWG5ZOB77yL44K144Kk44K66YGV44GE77yL5ZCM',
    '6ImyCuKGkiDlkIzllYblk4HvvIvlkIzjgrXjgqTjgrrvvIvoibLpgZXjgYQK4oaSIOWQjOWVhuWTge+8i+OCteOCpOOCuumBleOB',
    'hO+8i+iJsumBleOBhAoK5LiK5L2N6Ki85oug44GM44GC44KL44Gu44Gr55CG55Sx44Gq44GP5LiL5L2N6Ki85oug44G4572u44GN',
    '5o+b44GI44Gq44GE44CCCuWIpeWVhuWTgeOCkuWujOWFqOS4gOiHtOaJseOBhOOBl+OBquOBhOOAggrliYrpmaTmuIjjgb/jg7vo',
    'qbPntLDmnKrnorroqo3jg7vosqnlo7LnirbmhYvmnKrnorroqo3jga7llYblk4HjgpLnorroqo3muIjjgb9TT0xE44Go44GX44Gq',
    '44GE44CCCgojIyMgMi04LiBBQ1RJVkUKCkFDVElWReOBr+aIkOe0hOWun+e4vuOBp+OBr+OBquOBhOOAggpTT0xE6auY5YCk44O7',
    '5a6J5YCk44O75Lit5b+D5L6h5qC844G45re344Gc44Gq44GE44CCCuWOn+WJh+OBqOOBl+OBpuS7iuWbnuWVhuWTgeOBqOWQjOWe',
    'i+OBruePvuWcqOiyqeWjsuS4reacgOWuieWApOertuWQiOOCkueiuuiqjeOBmeOCi+OBn+OCgeOBq+S9v+eUqOOBmeOCi+OAggrl',
    'v4XopoHjgavlv5zjgZjjgabnq7blkIjnirbms4Hjg7vkvqHmoLzluK/jgoLosqnlo7LmiKbnlaXjga7lj4LogIPjgavjgZnjgovj',
    'gYzjgIHosqnlo7LkuK3kvqHmoLzjgaDjgZHjgafmiJDntITlj6/og73kvqHmoLzjgpLmlq3lrprjgZfjgarjgYTjgIIKCiMjIyAy',
    'LTkuIOmrmOWApOODu+Wbnui7ouODu+iJsgoK5ZCM5ZWG5ZOB5a6f5aOy44KS5L6h5qC85Z+656SO44Go44GX44CB6auY5YCk55CG',
    '55Sx44Go5Zue6Lui55CG55Sx44KS5YiG44GR44Gm5qSc6Ki844GZ44KL44CCCuODh+OCtuOCpOODs+OAgemrmOWApOimgee0oOOA',
    'geiJsuOAgeOCteOCpOOCuuOAgeeKtuaFi+OAgeW4jOWwkeaAp+OAgeWto+evgOOAgeertuWQiOetieOBruOBhuOBoeOAgeeiuuiq',
    'jeOBp+OBjeOBn+imgeWboOOBoOOBkeOCkuijnOato+OBuOS9v+OBhuOAggox5Lu244Gu6auY6aGNU09MROOBoOOBkeOBp+iJsuOD',
    'u+S7leanmOOBruODl+ODrOODn+OCouODoOOCkueiuuWumuOBl+OBquOBhOOAggoKIyMjIDItMTAuIOebuOWgtOiovOaLoOOBruW9',
    'ueWJsgoK6Ki85oug44Gv5Lul5LiL44Gu5b255Ymy44KS5re35ZCM44GX44Gq44GE44CCCgoqIOebtOaOpeS+oeagvOiovOaLoAoq',
    'IOadoeS7tuW3ruijnOato+iovOaLoAoqIOmrmOWApOimgee0oOiovOaLoAoqIOWbnui7ouiovOaLoAoqIOWPguiAg+iovOaLoAoq',
    'IEFDVElWReertuWQiAoK55uu55qE44Gu6YGV44GG6Ki85oug44KS5ZCM44GY6YeN44G/44Gn5bmz5Z2H44GX44Gq44GE44CCCgpc',
    'LS0tCgoKCiMjIDNcLiDkvqHmoLzjg7vliKnnm4rjg7vosqnlo7LmiKbnlaUKCuacgOS9jumZkOOAgeS7peS4i+OCkuWIhumbouOB',
    'meOCi+OAggoKMS4g56K66KqN5riI44G/5oiQ57SE5L6h5qC8CjIuIOadoeS7tuW3ruOBruOBguOCi+WPguiAg1NPTEQKMy4g6LKp',
    '5aOy5Lit56u25ZCI5L6h5qC8CjQuIOaIpueVpemWi+Wni+S+oeagvAo1LiDml6nmnJ/lo7LljbTkvqHmoLwKCuaIpueVpemWi+Wn',
    'i+S+oeagvOOCkueiuuiqjea4iOOBv+aIkOe0hOS+oeagvOOBqOWQjOmhjeOBq+OBmeOCi+W/heimgeOBr+OBquOBhOOAggrpq5jl',
    'gKTjgrnjgr/jg7zjg4jjga/jgIHnorroqo3muIjjgb9TT0xE44CB5p2h5Lu25beuU09MROOAgeertuWQiOOAgeeKtuaFi+OAgeOC',
    'teOCpOOCuuOAgemcgOimgeOAgemrmOWApOimgee0oOOAgeWto+evgOOAgeWApOS4i+OBkuS9meWcsOetieOBi+OCieWQiOeQhuea',
    'hOOBq+axuuOCgeOCi+OAggrjgIznorrlrp/jgavlo7LjgozjgovjgI3jgIzmnIDkvY7jgafjgoLlo7LjgozjgovjgI3jgajmoLnm',
    'i6DjgarjgY/mlq3lrprjgZfjgarjgYTjgIIKCuS7leWFpeWApOOBjOOBguOCi+WgtOWQiO+8mgoK5Yip55uK6aGNIO+8nSDosqnl',
    'o7LkvqHmoLwg77yNIOiyqeWjsuaJi+aVsOaWmSDvvI0g6YCB5paZIO+8jSDmorHljIXosrsg77yNIOS7leWFpeWApAoK5Yip55uK',
    '546HIO+8nSDliKnnm4rpoY0gw7cg6LKp5aOy5L6h5qC8IMOXIDEwMAoK5LuV5YWl44KM5Yik5pat44Gn44Gv5Yip55uK6aGN44O7',
    '5Yip55uK546H44Gg44GR44Gn44Gq44GP44CB55u45aC06Ki85oug6YeP44CB5Zue6Lui44CB56u25ZCI44CB54q25oWL44CB5a2j',
    '56+A44CB44K144Kk44K644CB55yf6LSL44Oq44K544Kv44CB6LOH6YeR5ouY5p2f44KC6ICD5oWu44GZ44KL44CCCuODpuODvOOC',
    'tuODvOeLrOiHquWfuua6luOBjOOBguOCjOOBsOWEquWFiOOBmeOCi+OAggoKXC0tLQoKCgojIyA0XC4g5ZWG5ZOB5oOF5aCxN+eC',
    'ueOCu+ODg+ODiAoK5qSc57Si44O75qSc6Ki85a6M5LqG5b6M44CB5bCC55So55uj5p+755Kw5aKD44Gn44GvRklOQUwgUEFTU+W+',
    'jOOBq+WHuuWKm+OBmeOCi+OAggoK4pGg44OW44Op44Oz44OJ5ZCNICAK5q2j56K644Gq6Iux6Kqe6KGo6KiY44CC56K66KqN44Gn',
    '44GN44Gf5aC05ZCI44Gu44G/5q2j56K644Gq44Kr44K/44Kr44OK6Kqt44G/44KC5L216KiY44CCCgrikaHlnovnlaogIArjgr/j',
    'grDjg7vlk4Hos6rooajnpLrnrYnjgYvjgonnorroqo3jgILnorroqo3jgafjgY3jgarjgZHjgozjgbDjgIzoqJjovInjgarjgZfj',
    'gI3jgIIKCuKRouOCq+ODhuOCtOODqiAgCuWei+eVquODu+ato+W8j+WQjeOBjOeiuuiqjeOBp+OBjeOCi+WgtOWQiOOBr+WklumD',
    'qOaDheWgseOBqOOCgueFp+WQiOOAgueiuuiqjeS4jeiDveOBquOCieWVhuWTgeW9oueKtuOBi+OCieacgOmBqeOCq+ODhuOCtOOD',
    'quOCkuWIpOaWreOAggoK4pGj44K144Kk44K6ICAK44K/44Kw6KGo6KiY77yL44Om44O844K244O85oyH5a6a5a6f5a+444CC44Om',
    '44O844K244O85a6f5a+444KS55S75YOP5o6o5ris44Gn5LiK5pu444GN44GX44Gq44GE44CCCgrikaTnirbmhYsgIArjg6bjg7zj',
    'grbjg7zmjIflrprjgpLlhKrlhYjjgILmjIflrprjgYzjgarjgYTloLTlkIjjga7jgb/nlLvlg4/jgYvjgonliKTmlq3jgZnjgovj',
    'gIIKCuKRpeaOqOWlqOS+oeagvCAgCueiuuiqjea4iOOBv+aIkOe0hOS+oeagvOOAgeaIpueVpemWi+Wni+S+oeagvOOAgeaXqeac',
    'n+WjsuWNtOS+oeagvOOCkuW/heimgeOBq+W/nOOBmOOBpuWIhumbouOAggoK4pGm6auY5YCk6KaB57Sg44O75Zu65pyJ5ZCN6Kme',
    'ICAK56K66KqN44Gn44GN44Gf5q2j5byP44Oi44OH44Or44CB44K344Oq44O844K644CB57Sg5p2Q44CB5bm05Luj44CB44Kz44Op',
    '44Oc44CB54m55b6055qE44OH44K244Kk44Oz44CB5Lq65rCX6KaB57Sg562J44CC5pyq56K66KqN6KaB57Sg44KS5L2c44KJ44Gq',
    '44GE44CCCgpcLS0tCgoKCiMjIDVcLiDwn5qAIOiyqeWjsjfngrnjgrvjg4Pjg4gg44Oh44Or44Kr44Oq44K344On44OD44OX44K5',
    '55SoCgojIyMgMVwuIDHpgLHplpPjga7osqnlo7LoqIjnlLsKCuW/heimgeOBq+W/nOOBmOOBpuWIneaXpe+9njfml6Xnm67jga7k',
    'vqHmoLzjgpLmj5DnpLrjgZnjgovjgIIK5q+O5pel5YCk5LiL44GS44GZ44KL5b+F6KaB44Gv44Gq44GE44CCCueiuuiqjea4iOOB',
    'v1NPTETjgIHlj4LogINTT0xE44CBQUNUSVZF56u25ZCI44CB5oim55Wl6ZaL5aeL5L6h5qC844CB5pep5pyf5aOy5Y205L6h5qC8',
    '44CB5YCk5LiL44GS5L2Z5Zyw44KS5Yy65Yil44GZ44KL44CCCuWGjeWHuuWTgeaZguOBr+W/heimgeOBq+W/nOOBmOOBpuWGjeWH',
    'uuWTgeS+oeagvOOAgeOCv+OCpOODiOODq+OAgTHmnprnm67lhpnnnJ/jgIFTRU/oqp7jga7mlLnlloTjgpLmj5DmoYjjgZnjgovj',
    'gIIKCiMjIyAyXC4g5Z6L55WqCgrnorroqo3jgafjgY3jgZ/lnovnlarvvI/lk4HnlarjgILnorroqo3jgafjgY3jgarjgZHjgozj',
    'gbDjgIzoqJjovInjgarjgZfjgI3jgIIKCiMjIyAzXC4g5pyA44KC5pep44GP5aOy44KM44KL44Kr44OG44K044Oq44O8CgrllYbl',
    'k4HnibnmgKfjgajlrp/pmpvjga7osqnlo7Ljgqvjg4bjgrTjg6rjg7zjgpLogIPmha7jgZfjgaYx44Gk6YG444G244CCCgojIyMg',
    'NFwuIOW5tOW8jwoK56K66KqN44Gn44GN44Gf5aC05ZCI44Gu44G/6KiY6LyJ44CC56K66KqN44Gn44GN44Gq44GR44KM44Gw44CM',
    '5LiN5piO44CN44CCCgojIyMgNVwuIOOCv+OCpOODiOODq+OAgOOCt+ODp+ODg+ODl+OCueeUqAoK44K/44Kk44OI44Or44Gv44K5',
    '44Oa44O844K56L6844G/MTMw5paH5a2X5Lul5YaF44CCCuWPr+iDveOBqumZkOOCijEzMOaWh+Wtl+OCkua0u+eUqOOBmeOCi+OB',
    'jOOAgeS4jeiHqueEtuOBquOCreODvOODr+ODvOODiee+heWIl+OBr+emgeatouOAggrnorroqo3muIjjgb/jga7jg5bjg6njg7Pj',
    'g4njgIHmraPlvI/llYblk4HlkI3jgIHjg6Ljg4fjg6vjgIHlnovnlarjgIHjgqvjg6njg7zjgIHjgrXjgqTjgrrjgIHntKDmnZDj',
    'gIHlubTku6PjgIHpq5jlgKTopoHntKDjgIHmpJzntKLjgZXjgozjgoTjgZnjgYTnibnlvrToqp7jgpLoh6rnhLbjgavphY3nva7j',
    'gZnjgovjgIIK5pyq56K66KqN44Gu44CM5biM5bCR44CN44CM5a6M5aOy44CN44CM6ZmQ5a6a44CN44CM5Yil5rOo44CN44CM5paw',
    '5ZOB44CN44CM576O5ZOB44CN562J44KS5LuY44GR44Gq44GE44CCCgrjgr/jgqTjg4jjg6vlhajmlofjga7jgb/jgpLni6znq4vj',
    'gZfjgZ/jgrPjg5Tjg7znlKjjgrPjg7zjg4njg5bjg63jg4Pjgq/jgaflh7rlipvjgZnjgovjgIIKCmBgYHRleHQK5a6f6Zqb44Gu',
    '44K/44Kk44OI44Or5YWo5paHCmBgYAoK44Kz44O844OJ44OW44Ot44OD44Kv5aSW44GrCuOAjOOCv+OCpOODiOODq+aWh+Wtl+aV',
    'sO+8muKXi+aWh+Wtl+OAjQrjgpLooajnpLrjgZnjgovjgIIKCiMjIyA2XC4g6Kqs5piO5paH44CA44K344On44OD44OX44K555So',
    'Cgrku6XkuIvjga4gYDw8PERFU0NSSVBUSU9OXF9URU1QTEFURVxfQkVHSU4+Pj5gIOOBi+OCiSBgPDw8REVTQ1JJUFRJT05cX1RF',
    'TVBMQVRFXF9FTkQ+Pj5gIOOBvuOBp+OCkuWbuuWumuODhuODs+ODl+ODrOODvOODiOOBqOOBmeOCi+OAggoKKiDopovlh7rjgZfj',
    'g7vln7rmnKzpoIbluo/jg7vlrprlnovmlofjgpLli53miYvjgavlpInmm7TjgZfjgarjgYTjgIIKKiDjg57jg7zjgqvjg7zoh6rk',
    'vZPjga/mnIDntYJkZXNjcmlwdGlvbuOBuOWHuuWKm+OBl+OBquOBhOOAggoqIOODl+ODrOODvOOCueODm+ODq+ODgOODvOOCkuS7',
    'iuWbnuWVhuWTgeOBruWun+aDheWgseOBuOe9ruaPm+OBmeOCi+OAggoqIOS4jeaYjumgheebruOBr+aMh+WumuOBq+W+k+OBhOOA',
    'jOiomOi8ieOBquOBl+OAjeOAjOS4jeaYjuOAjeetieOBqOOBmeOCi+OAggoqIOS4jeimgeOBquOCt+ODgeODpeOCqOODvOOCt+OD',
    'p+ODs+mgheebruOBr+WJiumZpOWPr+iDveOAggoqIOWumuS+oeOBr+eiuuiqjeOBp+OBjeOBn+WgtOWQiOOBruOBv+iomOi8ieOB',
    'l+OAgTPkuIflhobmnKrmuoDjga/ljp/liYfnnIHnlaXjgIIKKiBkZXNjcmlwdGlvbuOBrzEwMDDmloflrZfku6XlhoXjgpLnm67l',
    'ronjgajjgZnjgovjgIIKKiDnnJ/otIvoqr/mn7vjgIHnm7jloLToqqzmmI7jgIHnt4/lkIjoqZXkvqHjgIFKU09O44CB6KOc6Laz',
    '44KSZGVzY3JpcHRpb27jgbjmt7flhaXjgZXjgZvjgarjgYTjgIIKKiDoqqzmmI7mloflhajmlofjga7jgb/jgpLni6znq4vjgZfj',
    'gZ/jgrPjg5Tjg7znlKjjgrPjg7zjg4njg5bjg63jg4Pjgq/jgaflh7rlipvjgZnjgovjgIIKCjw8PERFU0NSSVBUSU9OXF9URU1Q',
    'TEFURVxfQkVHSU4+Pj4KCuOAh+eJueW+tArjg7vllYblk4Hjga7mnIDlpKfjga7prYXlipvjgpIz6KGM56iL5bqm44Gr5Yed57iu',
    'CuODu+ODh+OCtuOCpOODs+OBrueJueW+tArvvIjopZ/jg7voopbjg7voo4Xpo77jgarjganvvIkK44O7552A55So44K344O844Oz',
    '44Gn44Gu6a2F5YqbCu+8iOmAmuWLpOODu+S8keaXpeODu+ODh+ODvOODiOOBquOBqe+8iQrjg7vluIzlsJHmgKfjgoTjgYrlvpfm',
    'hJ/jga7jgqLjg5Tjg7zjg6sKCgoK44CH44OW44Op44Oz44OJClxb6Iux6Kqe5ZCNL+OCq+OCv+OCq+ODiuWQjV0KCgoK44CH5ZWG',
    '5ZOB5ZCN77y744GC44KM44Gw5b+F44Ga5Zu65pyJ5ZCN6Kme44KS5YWl44KM44KL77y9Clxb44Ki44Kk44OG44Og5ZCN77yL54m5',
    '5b6055qE44Gq44OH44K244Kk44OzKOmrmOWApOimgee0oO+8iV0KCgoK44CH5ZOB55WqClxb44K/44Kw44GL44KJ5Yik5Yil77yP',
    '5LiN5piO44Gq44KJ44CM6KiY6LyJ44Gq44GX44CNXQoKCgrjgIfjgrXjgqTjgroK44K/44Kw6KGo6KiY77ya4pev44K144Kk44K6',
    'ClhTLFMsTSxMLFhMLDJYTCwzWEznm7jlvZMg77y76Kmy5b2T44KS6KGo56S644GZ44KL77y9CuiCqeW5heKXr2NtCui6q+W5heKX',
    'r2NtCuiiluS4iOKXr2NtCuedgOS4iOKXr2NtCue3j+S4iOOAh2NtCuKAu+WAi+S6uuioiOa4rOOBruOBn+OCgeiLpeW5suOBruiq',
    'pOW3ruOBrwrjgZTnkIbop6Pjga7jgbvjganlrpzjgZfjgY/jgYrpoZjjgYToh7TjgZfjgb7jgZnjgIIKCgoK44CH44Kr44Op44O8',
    'Clxb6Kmz57Sw44Gq6ImyIOiLseiqnuWQjSDjgqvjgr/jgqvjg4rlkI1dCgoKCuOAh+e0oOadkApcW+OCv+OCsOOBi+OCieato+ei',
    'uuOBq10KCgoK44CH5LuY5bGe5ZOBClxb44OZ44Or44OI44O75pu/44GI44Oc44K/44Oz44O75L+d5a2Y6KKL44Gq44Gp44GC44KM',
    '44GwXQoKCgrjgIfnirbmhYsK44O75YWo5L2T55qE44Gq6KmV5L6h77yI5paw5ZOB44O7576O5ZOB44O744KE44KE5L2/55So5oSf',
    '44Gq44Gp77yJCuODu+eJueOBq+azqOaEj+OBmeOBueOBjeeCueOBjOOBguOCjOOBsOi/veiomAoKCgrjgIflrprkvqEKXFvjgo/j',
    'gYvjgozjgbDoqJjovIkg77yT5LiH5YaG44KS5LiL5Zue44KL44KC44Gu44Gv5LiN6KaBXQoKCgrjgIfjgrfjg4Hjg6Xjgqjjg7zj',
    'grfjg6fjg7Pmj5DmoYgK44Kq44OV44Kj44K544O76YCa5Yuk77yaClxb5YW35L2T55qE44Gq57WE44G/5ZCI44KP44Gb5L6LXQrj',
    'gqvjgrjjg6XjgqLjg6vjg7vkvJHml6XvvJoKXFvlhbfkvZPnmoTjgarntYTjgb/lkIjjgo/jgZvkvotdCuOBiuWHuuOBi+OBkeOD',
    'u+ODh+ODvOODiO+8mgpcW+WFt+S9k+eahOOBque1hOOBv+WQiOOCj+OBm+S+i10K44OR44O844OG44Kj44O844O75pKu5b2x5Lya',
    '77yaClxb5YW35L2T55qE44Gq57WE44G/5ZCI44KP44Gb5L6LXQrvvIjkuI3opoHjgarjgoLjga7jga/liYrpmaRPS++8iQoK44GE',
    '44GE44Gt4pmh44KS5oq844GX44Gm44GE44Gf44Gg44GP44Go44CBCuOBiuWApOS4i+OBkuOBrumam+OBq+mAmuefpeOBjOWxiuOB',
    'jeOBvuOBmeOAggoKCgrjgJDmraPopo/lk4Hkv53oqLzjgJEK5b2T5bqX44Gu5ZWG5ZOB44Gv44OX44Ot6ZGR5a6a5riI44G/44Gu',
    '5q2j6KaP5ZOB44Gn44GZ44CCCgrkuIfkuIDjgIHmraPopo/lupfnrYnjgaflgb3nianjgajliKTlrprjgZXjgozjgZ/loLTlkIjj',
    'gIEK5YWo6aGN6L+U6YeR44Gr44Gm5a++5b+c44GE44Gf44GX44G+44GZ44CCCu+8iOKAu+S6i+Wun+eiuuiqjeOBruOBn+OCgeOA',
    'gemRkeWumuW6l+iIl+OBiuOCiOOBswrjgZTmi4XlvZPogIXlkI3jgpLjgYrkvLrjgYTjgYTjgZ/jgZfjgb7jgZnvvIkKCuKAu+OB',
    'guOBj+OBvuOBp+OCguS4reWPpOOBp+OBguOCi+OBk+OBqOOCkuOBlOeQhuino+OBruS4iuOAgQrjgZTos7zlhaXjgpLjgYrpoZjj',
    'gYTjgZfjgb7jgZnjgIIKCgoK44CQ55m66YCB5pa55rOV44CRCuWuieW/g+OBruWMv+WQjemFjemAge+8gQrjg6Hjg6vjgqvjg6rk',
    'vr/jgafnmbrpgIHjgZXjgZvjgabpoILjgY3jgb7jgZnjgIIK4oC744KJ44GP44KJ44GP44Oh44Or44Kr44Oq5L6/4oeM44KG44GG',
    '44KG44GG44Oh44Or44Kr44Oq5L6/CuaiseWMheOCteOCpOOCuuOBrumDveWQiOOBp+WkieabtOOBmeOCi+S6i+OBjOOBguOCiuOB',
    'vuOBmeOAggoKCuKAu+WOmuaJi+OBruOCguOBruOAgeOCteOCpOOCuuOBjOWkp+OBjeOBhOOCguOBruOBrwrlnKfnuK7jgZnjgovj',
    'gZPjgajjgYzjgYLjgorjgb7jgZnjgIIKCgoK4oC7552A55S744GM44GC44KL5aC05ZCI4oC7CuedgOeUqOeUu+WDj+OBq+WGmeOB',
    'o+OBpuOBhOOCi+ODkOODg+OCsOOChOW4veWtkOOAgQrjgZ3jga7ku5bjga7lsI/nianjga/mkq7lvbHnlKjjga7jgoLjga7jgafj',
    'gYLjgorjgIEK5ZWG5ZOB44Gr44Gv5ZCr44G+44KM44G+44Gb44KT44CCCgoKCuOAh+OCouOCpOODhuODoApcW1NFT+ODr+ODvOOD',
    'ieWFpeOCiuOCouOCpOODhuODoOWQjV0KCgoK44CH566h55CG55Wq5Y+3Clxb5Lu75oSP44Gu566h55CG55Wq5Y+3XQpcW+S/neeu',
    'oeWgtOaJgF0KCgoKPDw8REVTQ1JJUFRJT05cX1RFTVBMQVRFXF9FTkQ+Pj4KCiMjIyA3XC4g55yf6LSL6Kq/5p+7CgpkZXNjcmlw',
    'dGlvbuOBruWkluWBtOOBp+WHuuWKm+OBmeOCi+OAggrnlLvlg4/jg7vjgr/jgrDjg7vnuKvoo73jg7vjg63jgrTjg7vliLvljbDj',
    'g7vlnovnlarjg7vlk4Hos6rooajnpLrjg7vph5Hlhbfjg7vntKDmnZDjg7vnlJ/nlKPlm73jg7vlhazlvI/mg4XloLHjgajjga7m',
    'lbTlkIjmgKfnrYnjgIHku4rlm57norroqo3jgafjgY3jgovpoIXnm67jgaDjgZHjgpLlhbfkvZPnmoTjgavoqJjovInjgZnjgovj',
    'gIIKQUnjgaDjgZHjgafmnIDntYLnorrlrprjgafjgY3jgarjgYTloLTlkIjjga/jgIHnorroqo3muIjjgb/moLnmi6DjgIHnorro',
    'qo3kuI3og73pg6jliIbjgIHov73liqDnorroqo3jg53jgqTjg7Pjg4jjgpLliIbjgZHjgovjgIIK5a2Y5Zyo44GX44Gq44GE6ZGR',
    '5a6a57WQ5p6c44KS5L2c44KJ44Gq44GE44CCCgrlm7rlrppkZXNjcmlwdGlvbuWGheOBruOAkOato+imj+WTgeS/neiovOOAkeOB',
    'r+ODhuODs+ODl+ODrOODvOODiOOBruWbuuWumuaWh+OBqOOBl+OBpuaJseOBhOOAgeWLneaJi+OBq+WkieabtOODu+WJiumZpOOB',
    'l+OBquOBhOOAggoKXC0tLQoKCgojIyA2XC4g566h55CG55Wq5Y+344O75L+d566h5aC05omA44O744K144Kk44K6Cgrjg6bjg7zj',
    'grbjg7zmjIflrprjga7nrqHnkIbnlarlj7fjgpLmnIDlhKrlhYjjgZnjgovjgIIK5L+d566h5aC05omA44KS566h55CG55Wq5Y+3',
    '44G45re344Gc44Gq44GE44CCCgroqqzmmI7mlofjga7jgIzjgIfnrqHnkIbnlarlj7fjgI3jga/vvJoKCjHooYznm67vvJ3nrqHn',
    'kIbnlarlj7cgIAoy6KGM55uu77yd5L+d566h5aC05omACgrkv53nrqHloLTmiYDmjIflrprjgYzjgarjgZHjgozjgbAy6KGM55uu',
    '44KS5YmK6Zmk44GZ44KL44CCCgrjg6bjg7zjgrbjg7zmjIflrprjga7jgr/jgrDjgrXjgqTjgrrjg7vlrp/lr7jjgpLmnIDlhKrl',
    'hYjjgZfjgIHnlLvlg4/mjqjmuKzjgafkuIrmm7jjgY3jgZfjgarjgYTjgIIK6IKp5bmF44CB6Lqr5bmF44CB6KKW5LiI44CB552A',
    '5LiI5Lul5aSW44Gn44KC44CB44Km44Ko44K544OI44CB44KG44GN5LiI44CB44OS44OD44OX562J44Gu5o+Q5L6b5a6f5a+444Gv',
    '5ZWG5ZOB44Gr5pyJ55So44Gq44KJ44K144Kk44K65qyE44G46L+95Yqg44GZ44KL44CCCuWtmOWcqOOBl+OBquOBhOWun+WvuOOC',
    'kueUn+aIkOOBl+OBquOBhOOAggoKXC0tLQoKCgojIyA3XC4g8J+TiiDnt4/lkIjoqZXkvqEKCuS7peS4i+OBruW9ouW8j+OBp+WH',
    'uuWKm+OBmeOCi+OAggoKfOmgheebrnzoqZXkvqF8CnwtfC18CnzliKnnm4rnjod84q2Q772e4q2Q4q2Q4q2Q4q2Q4q2QIC81fAp8',
    '5Zue6Lui546HfOKtkO+9nuKtkOKtkOKtkOKtkOKtkCAvNXwKfOS7leWFpeOCjOaOqOWlqOW6pnzirZDvvZ7irZDirZDirZDirZDi',
    'rZAgLzV8CgrmmJ/mlbDjga/lm7rlrprjgZfjgarjgYTjgIIK5LuK5Zue44Gu5Yip55uK6KiI566X44CBU09MROOAgeertuWQiOOA',
    'gemcgOimgeOAgeeKtuaFi+OAgeWto+evgOOAgeOCteOCpOOCuuOAgeebuOWgtOeiuuW6puOAgeecn+i0i+ODquOCueOCr+etieOB',
    'i+OCieaxuuWumuOBl+OAgeefreOBhOeQhueUseOCkuS7mOOBkeOCi+OAggrnorroqo3jgafjgY3jgarjgYTlm57ou6LjgpLmjY/p',
    'gKDjgZfjgarjgYTjgIIKClwtLS0KCgoKIyMgOFwuIEpTT07jg7tGUk9aRU7poJjln58KCuacrOODl+ODreODs+ODl+ODiOebtOW+',
    'jOOBq+aXouWtmEpTT07jgYzphY3nva7jgZXjgozjgovloLTlkIjjgIHjgZ3jga5KU09O44Gv44OE44O844Or6YCj5pC65riI44G/',
    'RlJPWkVO6aCY5Z+f44Go44GZ44KL44CCCgrntbblr77jgavlpInmm7TjgZfjgarjgYTjgoLjga7vvJoKCiog44Kt44O8Ciog44Kt',
    '44O86aCGCiogSlNPTuani+mAoAoqIOWbuuWumuaWhwoqIGRlc2NyaXB0aW9u44OG44Oz44OX44Os44O844OICiog5pS56KGMCiog',
    '44Ko44K544Kx44O844OX5pa55rOVCgrllYblk4HjgZTjgajjgavlpInljJbjgZnjgovlgKTjgaDjgZHku4rlm57jga7oqr/mn7vn',
    'tZDmnpzjgaflhaXlipvjgZnjgovjgIIKCkpTT07lhoXjga50aXRsZeOBr+OCs+ODlOODvOeUqOOCs+ODvOODieODluODreODg+OC',
    'r+OBp+WHuuWKm+OBl+OBn3RpdGxl44Go5ZCM5LiA5YaF5a6544Gr44GZ44KL44CCCkpTT07lhoXjga5kZXNjcmlwdGlvbuOBr+OC',
    's+ODlOODvOeUqOOCs+ODvOODieODluODreODg+OCr+OBp+WHuuWKm+OBl+OBn2Rlc2NyaXB0aW9u5YWo5paH44Go5ZCM5LiA5YaF',
    '5a6544Gr44GZ44KL44CCCgrnm7jloLToqLzmi6Djg7vnm6Pmn7vmg4XloLHnrYnjgpLnkIbnlLHjgatKU09O44G45paw44GX44GE',
    '44Kt44O844KS6L+95Yqg44GX44Gq44GE44CCCkpTT07mp4vpgKDjgavjgaTjgYTjgabku5bjg6vjg7zjg6vjgajnq7blkIjjgZfj',
    'gZ/loLTlkIjjgIHnj77lnKjjg4Tjg7zjg6vjgafmraPluLjli5XkvZzjgZfjgabjgYTjgovml6LlrZhKU09O5qeL6YCg44KS5YSq',
    '5YWI44GZ44KL44CCCgrjg5Xjgqnjg7zjg6DjgbjlhaXlipvjgZnjgovlr77osaHjgYwgYHRpdGxlIC8gZGVzY3JpcHRpb24gLyBz',
    'aXplYCDjga4z6aCF55uu44Go5oyH5a6a44GV44KM44Gm44GE44KL5aC05ZCI44CB44Gd44KM5Lul5aSW44Gu5pei5YWl5Yqb6aCF',
    '55uu44KS5aSJ5pu044GX44Gq44GE44CCCgpcLS0tCgoKCiMjIDlcLiDmnIDntYLlh7rlipvpoIbluo8KCuWOn+WJh++8mgoKMS4g',
    '44CM54mp6LKp44Oe44K544K/44O844OX44Ot44Oz44OX44OI56K66KqN5riI44G/44CN4oC75a6f6Zqb44Gr56K66KqN44Gn44GN',
    '44Gf5aC05ZCI44Gu44G/CjIuIOWVhuWTgeaDheWgsTfngrnjgrvjg4Pjg4gKMy4g55u45aC06Kq/5p+757WQ5p6cCjQuIOS+oeag',
    'vOWIpOaWrQo1LiDwn5qAIOiyqeWjsjfngrnjgrvjg4Pjg4gg44Oh44Or44Kr44Oq44K344On44OD44OX44K555SoCjYuIOOCv+OC',
    'pOODiOODq+OBruOCs+ODlOODvOeUqOOCs+ODvOODieODluODreODg+OCrwo3LiDjgr/jgqTjg4jjg6vmloflrZfmlbAKOC4gZGVz',
    'Y3JpcHRpb27jga7jgrPjg5Tjg7znlKjjgrPjg7zjg4njg5bjg63jg4Pjgq8KOS4g55yf6LSL6Kq/5p+7CjEwLiDwn5OKIOe3j+WQ',
    'iOipleS+oQoxMS4g5pei5a2YSlNPTgoK5bCC55So55uj5p+755Kw5aKD44Gn44GvRklOQUwgUEFTU+W+jOOBq+OBk+OBruacgOe1',
    'guWHuuWKm+OBuOmAsuOCgOOAggoKXC0tLQoKCgojIyAxMFwuIOacgOe1guaknOafuwoK5Ye65Yqb55u05YmN44Gr5Lul5LiL44Gg',
    '44GR44KS56K66KqN44GZ44KL44CCCgoqIOS7iuWbnuWVhuWTgeS7peWkluOBruaDheWgseOCkua1geeUqOOBl+OBpuOBhOOBquOB',
    'hAoqIOODpuODvOOCtuODvOaMh+WumuOBrueKtuaFi+ODu+OCteOCpOOCuuODu+Wun+WvuOODu+euoeeQhuaDheWgseOCkuWLneaJ',
    'i+OBq+WkieabtOOBl+OBpuOBhOOBquOBhAoqIOWwgueUqOaknOe0oueSsOWig+OBp+OBr+aknOe0oktub3dsZWRnZeOBqOebo+af',
    'u0FjdGlvbuOCkumHjeikh+ODu+S4iuabuOOBjeOBl+OBpuOBhOOBquOBhAoqIOS4gOiIrEFJ55Kw5aKD44Gn44GvdjQuMOODleOC',
    'qeODvOODq+ODkOODg+OCr+aknOe0ouOCkuW/heimgeOBquevhOWbsuOBp+Wun+aWveOBl+OBnwoqIOWAmeijnOOCkuOCv+OCpOOD',
    'iOODq+OBoOOBkeOBp+aOoeeUqOOBm+OBmueUu+WDj+eFp+WQiOOBl+OBnwoqIFNPTETjgahBQ1RJVkXjgpLmt7flkIzjgZfjgabj',
    'gYTjgarjgYQKKiDlrozlhajkuIDoh7TjgYzjgarjgYTloLTlkIjjgoLljYHliIbmjqLntKLlvozjgavmnIDjgoLov5HjgYTmnInl',
    'irnoqLzmi6Djgbjnp7vooYzjgZflt67jgpLmmI7npLrjgZfjgZ8KKiDnorroqo3muIjjgb/miJDntITkvqHmoLzjgIHlj4LogINT',
    'T0xE44CBQUNUSVZF56u25ZCI44CB5oim55Wl6ZaL5aeL5L6h5qC844CB5pep5pyf5aOy5Y205L6h5qC844KS5re35ZCM44GX44Gm',
    '44GE44Gq44GECiog5pyq56K66KqN44Gu5Zu65pyJ5ZCN6Kme44O76auY5YCk6KaB57Sg44O755yf6LSL44KS56K65a6a44GX44Gm',
    '44GE44Gq44GECiog44K/44Kk44OI44Or44GvMTMw5paH5a2X5Lul5YaF44Gn54us56uL44Kz44O844OJ44OW44Ot44OD44Kv44Gr',
    '44Gq44Gj44Gm44GE44KLCiogZGVzY3JpcHRpb27lm7rlrprjg4bjg7Pjg5fjg6zjg7zjg4jjgIHlooPnlYzjgIHlrprlnovmlofj',
    'gpLlrojjgorjgIHjg5fjg6zjg7zjgrnjg5vjg6vjg4Djg7zjgpLmrovjgZfjgabjgYTjgarjgYQKKiDnnJ/otIvjg7vnm7jloLTj',
    'g7vnt4/lkIjoqZXkvqHjg7tKU09O44KSZGVzY3JpcHRpb27jgbjmt7flhaXjgZfjgabjgYTjgarjgYQKKiDnrqHnkIbnlarlj7fj',
    'gajkv53nrqHloLTmiYDjgpLmiYDlrprkvY3nva7jgbjlj43mmKDjgZfjgZ8KKiBKU09OIEZST1pFTumgmOWfn+OCkuWkieabtOOB',
    'l+OBpuOBhOOBquOBhAoqIOWun+ihjOOBl+OBpuOBhOOBquOBhOaknOe0ouODu+eiuuiqjeOCkuOAjOWun+aWvea4iOOBv+OAjeOB',
    'qOihqOePvuOBl+OBpuOBhOOBquOBhAoKXC0tLQoKCgojIyAxMVwuIOS7iuWbnuOBruWFpeWKm+aDheWgsQoK44GT44Gu56ug5Lul',
    '6ZmN44Gr5Ye65ZOB44OE44O844Or44GL44KJ5rih44GV44KM44KL5LuK5Zue5ZWG5ZOB44Gu5YWl5Yqb5oOF5aCx44KS5L2/55So',
    '44GZ44KL44CCCgrjg6bjg7zjgrbjg7zmjIflrprmg4XloLHjga/ku4rlm57llYblk4Hjga7ln7rmupbmg4XloLHjgajjgZfjgIHn',
    'lLvlg4/mjqjmuKzjgafkuIrmm7jjgY3jgZfjgarjgYTjgIIK44K/44Kw44Go5paw5ZOB54q25oWL44KS5a6f6Zqb44Gr56K66KqN',
    '44Gn44GN44Gf5aC05ZCI44Gg44GR44CM5paw5ZOB44K/44Kw5LuY44CN44KS5L2/55So44GZ44KL44CCCueKtuaFi+OBq+WQiOOC',
    'j+OBquOBhOihqOePvuOCkuWHuuWKm+OBl+OBquOBhOOAggoK5pei5a2YSlNPTuOBjOOBk+OBruW+jOOCjeOBq+S7mOS4juOBleOC',
    'jOOCi+WgtOWQiOOBr+OAgeesrDjnq6Djga5GUk9aRU7jg6vjg7zjg6vjgpLpgannlKjjgZnjgovjgIIKCg==',
  ].join('');
  const LH_QUETTA_MASTER_PROMPT = (() => {
    try {
      const bin = atob(LH_QUETTA_MASTER_PROMPT_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return '';
    }
  })();

  function buildPrompt(base64List, skuVal, sizeVal, condVal) {
    const imageNote = base64List.map(
      (_, i) => `[画像${i + 1}]`
    ).join('、');

    const skuNote = skuVal
      ? `\n・管理番号：${skuVal}（これをsku_codeに使うこと）`
      : '';
    // ★サイズは下書きのブロック全体(実寸込み)が入ることがあるので、複数行で渡す。
    const sizeNote = sizeVal
      ? `\n・サイズ（下書きに記載済み。これをそのまま使い、画像からの推測で上書きしないこと）：\n${sizeVal}`
      : '';
    // ★状態はページの「商品の状態」で選ばれている値。ユーザー指定で必ず渡す。
    const condNote = condVal
      ? `\n・状態：${condVal}（これをconditionに使うこと。6択から選び直さない）`
      : '';
    // JSONのsizeには短い値(タグ表記の値)だけを入れる。
    //   sizeVal は実寸を含むブロック全体が来るので、そのままだと
    //   "size": "タグ表記：36" になってしまう(実機の生成結果で確認)。
    const sizeForJson = (function () {
      const m = String(sizeVal || '').match(/タグ表記\s*[:：]\s*(.+)/);
      if (m) return m[1].trim();
      return String(sizeVal || '').split('\n')[0].trim();
    })();

    return LH_QUETTA_MASTER_PROMPT
      + '\n\n【今回入力情報】' + skuNote + sizeNote + condNote
      + '\n\n【今回の商品画像】\n画像番号：' + imageNote
      + '\n画像：' + base64List.length + '枚添付\n\n'
      + `
次に【7点セットと同じ内容】をJSON形式で出力してください：
{
  "title": "【タイトル形式】新品タグ付 ブランド名 商品名 カラー サイズ ブランド読み 高値キーワード（130文字以内でできるだけ近づける）",
  "description": ${JSON.stringify('【以下テンプレを必ず使い穴埋めすること】\n' + LH_DESC_TEMPLATE)},
  "brand": "ブランド名（英語表記のみ）",
  "category": "カテゴリ名（メルカリShopsの正確なカテゴリ名のみ）",
  "size": "${sizeForJson}",
  "color": "カラー（タグまたは画像から読み取り）",
  "condition": "${condVal || '商品の状態'}",
  "price": 推奨価格(数値のみ),
  "sku_code": "${skuVal}",
  "model_no": "型番（なければ空文字）",
  "proper_noun": "ブランド公式のモデル名・シリーズ名のみ（流通名・説明的な名称は入れない。確認できない場合は空文字）",
  "high_value_keywords": "高値要素（なければ空文字）",
  "brand_kana": "ブランド名のカタカナ読み（例：ミリオプション、エトレトウキョウ）"
}`;
  }

  // ── コピーボタン ─────────────────────────────
  /* ===== AIへまとめて送る（2026-08-19 ユーザー依頼） =====
     ★『選べるようにしてクリップボードにコピーで画像と依頼文すべてが持っていけるのか？
       今は2個のコピーをしてる。かなり手間』
     ★クリップボードでは【できない】。ブラウザの決まりで、1回に渡せるのは1種類だけで、
       画像も1枚しか入らない（しかもPNGのみ）。text と image を同時に貼ることはできない。
     ★代わりにAndroidの共有を使う。画像を何枚でも、依頼文と一緒に他のアプリへ渡せる。
       ダウンロードも許可も通らないので、6枚が4枚になる問題も起きない。
     ★クエッタが対応していない時は、今までどおり一括保存に落ちる（壊さない）。
     ★サムネイルを押して選べる。1枚も選ばなければ全部送る。 */
  function lhErabareta() {
    const all = window._lhBlobs || [];
    const eranda = window._lhEranda || {};
    const kazu = Object.keys(eranda).filter((k) => eranda[k]).length;
    if (!kazu) return all.map((b, i) => ({ blob: b, i: i }));
    return all.map((b, i) => ({ blob: b, i: i })).filter((x) => eranda[x.i]);
  }
  function lhBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
      try {
        const fr = new FileReader();
        fr.onload = () => {
          const s = String(fr.result || '');
          const comma = s.indexOf(',');
          resolve(comma >= 0 ? s.slice(comma + 1) : s);
        };
        fr.onerror = () => reject(new Error('共有画像の読み込みに失敗しました'));
        fr.readAsDataURL(blob);
      } catch (e) { reject(e); }
    });
  }
  async function lhNativeShareOriginalFiles(erabi, text, gptUrl, startedAt) {
    if (!window.MsqApp
      || typeof MsqApp.shareListingBegin !== 'function'
      || typeof MsqApp.shareListingFileBegin !== 'function'
      || typeof MsqApp.shareListingFilePart !== 'function'
      || typeof MsqApp.shareListingFileEnd !== 'function'
      || typeof MsqApp.shareListingFilesEnd !== 'function') return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    } catch (e) { }
    if (typeof MsqApp.aiSendTiming === 'function') MsqApp.aiSendTiming('clipboard', Math.round(performance.now() - startedAt));
    /* クエッタと同じく、選択画像を1枚のコンタクトシートFileにして渡す。 */
    const imageBlob = await lhMakeSquareShareBlob(erabi.map(x => x.blob));
    if (!imageBlob) throw new Error('共有画像を作成できませんでした');
    if (typeof MsqApp.aiSendTiming === 'function') MsqApp.aiSendTiming('image', Math.round(performance.now() - startedAt));
    const imageFile = new File([imageBlob], 'shuppin_square.jpg', { type: 'image/jpeg' });
    MsqApp.shareListingBegin(text, gptUrl || '');
    if (!MsqApp.shareListingFileBegin(imageFile.name, imageFile.type)) {
      throw new Error('共有画像を準備できませんでした');
    }
    const b64 = await lhBlobToBase64(imageFile);
    if (typeof MsqApp.aiSendTiming === 'function') MsqApp.aiSendTiming('base64', Math.round(performance.now() - startedAt));
    for (let i = 0; i < b64.length; i += 12000) {
      if (!MsqApp.shareListingFilePart(b64.slice(i, i + 12000))) {
        throw new Error('共有画像を書き込めませんでした');
      }
    }
    if (!MsqApp.shareListingFileEnd()) throw new Error('共有画像を閉じられませんでした');
    if (!MsqApp.shareListingFilesEnd()) throw new Error('共有用ファイルを作成できませんでした');
    if (typeof MsqApp.aiSendTiming === 'function') MsqApp.aiSendTiming('bridge', Math.round(performance.now() - startedAt));
    return true;
  }
  document.getElementById('lh-share-ai').onclick = async () => {
    const sendStartedAt = performance.now();
    const btn = document.getElementById('lh-share-ai');
    const moto = btn.textContent;
    const text = document.getElementById('lh-prompt').value || '';
    const gptUrl = lhChatgptSelectedUrl();
    const erabi = lhErabareta();
    if (!erabi.length) { log('❌ 画像がありません', '#e94560'); return; }
    try {
      /* Android WebViewのネイティブ経路も、クエッタと同じ3200pxの合成Fileを渡す。 */
      if (!navigator.share
        && typeof MsqApp.shareListingFilesEnd === 'function') {
        btn.textContent = '📤 画像＋プロンプトをAIへ送信中…';
        if (await lhNativeShareOriginalFiles(erabi, text, gptUrl, sendStartedAt)) {
          log('📤 結果タブのChatGPTで＋から写真を押してください。画像は自動で選ばれます', '#4ecca3');
          btn.textContent = moto;
          return;
        }
      }
      btn.textContent = '📦 共有用画像を作成中…';
      const shareBlob = await lhMakeSquareShareBlob(erabi.map((x) => x.blob));
      const imageFile = new File(
        [shareBlob],
        'item_images_square.jpg',
        { type: 'image/jpeg' }
      );
      /* Quettaは本文(EXTRA_TEXT)をファイル共有時に落とすため、
         同じ依頼文をUTF-8のテキストファイルにも入れて渡す。 */
      const promptFile = new File(
        [new Blob([text], { type: 'text/plain;charset=utf-8' })],
        'listing_prompt.txt',
        { type: 'text/plain' }
      );
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        }
      } catch (e) { /* 共有を優先。本文は添付ファイルにも入っている */ }

      const files = [imageFile, promptFile];
      if (navigator.canShare && navigator.canShare({ files: files })) {
        btn.textContent = '📤 送っています…';
        const gptUrl = lhChatgptSelectedUrl();
        const shareData = { files: files, text: text, title: '出品用' };
        if (gptUrl) shareData.url = gptUrl;
        try {
          await navigator.share(shareData);
        } catch (eShare) {
          /* 共有先アプリがURL付き共有を受けない場合は従来共有へ戻す。 */
          if (!gptUrl || (eShare && eShare.name === 'AbortError')) throw eShare;
          await navigator.share({ files: files, text: text, title: '出品用' });
        }
        log(gptUrl
          ? '📤 正方形画像＋依頼文＋指定AI URLを共有しました'
          : '📤 正方形画像1枚＋依頼文ファイルを送りました', '#4ecca3');
        btn.textContent = moto;
        return;
      }

      /* 画像＋テキストファイルを同時に渡せない端末でも、
         正方形画像1枚と本文を渡す経路を試す。 */
      if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        btn.textContent = '📤 送っています…';
        const gptUrl = lhChatgptSelectedUrl();
        const imageShare = { files: [imageFile], text: text, title: '出品用' };
        if (gptUrl) imageShare.url = gptUrl;
        try {
          await navigator.share(imageShare);
        } catch (eShare) {
          if (!gptUrl || (eShare && eShare.name === 'AbortError')) throw eShare;
          await navigator.share({ files: [imageFile], text: text, title: '出品用' });
        }
        log('📤 正方形画像を送りました（本文はクリップボードにもコピー）', '#f0a500');
        btn.textContent = moto;
        return;
      }

      if (navigator.share) {
        await navigator.share({ text: text, title: '出品用' });
        log('📤 依頼文だけ送りました（画像はクリップボードの共有に非対応）', '#f0a500');
        btn.textContent = moto;
        return;
      }
      /* ★R264 Android WebView fallback。
         navigator.share/canShareが存在しない端末でも、MainActivityのネイティブ共有へ
         正方形画像を小分けで渡し、画像＋プロンプトのOS共有シートを開く。 */
      if (window.MsqApp
        && typeof MsqApp.shareListingBegin === 'function'
        && typeof MsqApp.shareListingPart === 'function'
        && typeof MsqApp.shareListingEnd === 'function') {
        btn.textContent = '📤 共有用ファイルを準備中…';
        const b64 = await lhBlobToBase64(shareBlob);
        MsqApp.shareListingBegin(text, gptUrl || '');
        for (let i = 0; i < b64.length; i += 12000) {
          MsqApp.shareListingPart(b64.slice(i, i + 12000));
        }
        const ok = MsqApp.shareListingEnd('image/jpeg', 'item_images_square.jpg');
        if (!ok) throw new Error('共有用ファイルを作成できませんでした');
        log('📤 画像＋プロンプトの共有画面を開きました', '#4ecca3');
        btn.textContent = moto;
        return;
      }
      log('❌ この端末は共有に対応していません', '#e94560');
      btn.textContent = moto;
    } catch (e) {
      /* 共有の画面を閉じただけの時もここに来る。失敗として扱わない */
      btn.textContent = moto;
      if (e && e.name !== 'AbortError') log('❌ 送れませんでした: ' + (e.message || ''), '#e94560');
    }
  };

  document.getElementById('lh-copy-prompt').onclick = () => {
    const text = document.getElementById('lh-prompt').value;
    navigator.clipboard.writeText(text).then(() => {
      document.getElementById('lh-copy-prompt')
        .textContent = '✅ コピーしました';
      setTimeout(() => {
        document.getElementById('lh-copy-prompt')
          .textContent = '📋 プロンプトをコピー';
      }, 2000);
    });
  };

  
  // ── 一括保存 ────────────────────────────────
  /* ★一括保存の処理は消した（保存は一切しない） */

  // ── STEP2：JSON転記 ──────────────────────────
  // ── Lensボタン ───────────────────────────────
  // ── 右ウィンドウ表示トグル ────────────────────
  window._lhTargetWindowId = null;
  document.getElementById('lh-window-toggle').onclick = () => {
    const btn = document.getElementById('lh-window-toggle');
    if (window._lhTargetWindowId) {
      window._lhTargetWindowId = null;
      chrome.runtime.sendMessage({ action: 'clearWindowId' });
      btn.textContent = '🪟 右窓表示：OFF';
      btn.style.color = '#aaa';
      btn.style.borderColor = '#444';
      log('🪟 右窓表示OFF', '#aaa');
    } else {
      chrome.runtime.sendMessage(
        { action: 'getWindowId' },
        res => {
          window._lhTargetWindowId = res.windowId;
          btn.textContent = '🪟 右窓表示：ON';
          btn.style.color = '#4ecca3';
          btn.style.borderColor = '#4ecca3';
          log('🪟 右窓表示ON（右側ウィンドウに表示）', '#4ecca3');
        }
      );
    }
  };

  document.getElementById('lh-lens').onclick = () => {
    if (!window._lhImageUrls || !window._lhImageUrls[0]) {
      log('❌ 先に画像取得してください', '#e94560');
      return;
    }
    const jsonRaw = document.getElementById(
      'lh-json-input'
    ).value.trim();
    let brand = '', modelNo = '', properNoun = '',
        highValueKeywords = '', category = '',
        color = '', condition = '', brandKana = '';
    if (jsonRaw) {
      try {
        const d = JSON.parse(
          jsonRaw
            .replace(/```json/g, '')
            .replace(/```/g, '')
        );
        brand = d.brand || '';
        modelNo = d.model_no || '';
        properNoun = d.proper_noun || '';
        highValueKeywords = d.high_value_keywords || '';
        color = d.color || '';
        condition = d.condition || '';
        brandKana = d.brand_kana || '';
        // パネルのセレクトが選択されていれば優先
        const condSelect = document.getElementById(
          'lh-condition-select'
        ).value;
        if (condSelect) condition = condSelect;
        const categoryRaw = d.category || '';
        category = categoryRaw
          .split(/[\/／>＞]/)
          .map(s => s.trim())
          .filter(Boolean)
          .pop() || '';
      } catch(e) {}
    }
    log(`🔍 相場検索開始...`, '#f5a623');
    chrome.runtime.sendMessage({
      action: 'lensSearch',
      imageUrl: window._lhImageUrls[0],
      brand,
      modelNo,
      properNoun,
      highValueKeywords,
      category,
      color,
      condition,
      brandKana,
      targetWindowId: window._lhTargetWindowId || null
    });
  };

  document.getElementById('lh-apply').onclick = async () => {
    const raw = document.getElementById(
      'lh-json-input'
    ).value.trim();

    let data;
    try {
      const clean = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      data = JSON.parse(clean);
    } catch (e) {
      log('❌ JSONパースエラー: ' + e.message, '#e94560');
      return;
    }

    document.getElementById('lh-log').innerHTML = '';
    log('🔄 転記開始...', '#4ecca3');

    // タイトル
    if (data.title) {
      setInputValue('[name="name"]', data.title);
      log('✅ タイトル転記', '#4ecca3');
    }

    // 説明文
    if (data.description) {
      setInputValue(
        'textarea[name="description"]',
        data.description
      );
      log('✅ 説明文転記', '#4ecca3');
    }

    // ブランド
    if (data.brand) {
      const brandInput = document.querySelector(
        '[data-testid="auto-complete-input"]'
      );
      if (brandInput) {
        const brandName = data.brand
          .replace(/[（(].*[）)]/g, '').trim();
        brandInput.focus();
        setNativeValue(brandInput, brandName);
        brandInput.dispatchEvent(
          new Event('input', { bubbles: true })
        );
        await new Promise(r => setTimeout(r, 800));
        const brandParent = brandInput
          .closest('[class*="chakra"]');
        const listbox = brandParent?.nextElementSibling;
        if (listbox) {
          const options = listbox.querySelectorAll('li');
          for (const opt of options) {
            const text = opt.textContent.trim();
            if (text && !text.includes('該当') &&
              text.toUpperCase().includes(
                brandName.toUpperCase().split(' ')[0]
              )
            ) {
              opt.click();
              break;
            }
          }
        }
        log('✅ ブランド転記', '#4ecca3');
      }
    }

    // サイズ
    if (data.size) {
      const sizeSelect = document.querySelector(
        '[data-testid*="attribute-select"]'
      );
      if (sizeSelect) {
        setSelectByText(sizeSelect, data.size);
        log('✅ サイズ転記', '#4ecca3');
      }
    }

    // コンディション
    if (data.condition && CONDITION_MAP[data.condition]) {
      await setCondition(data.condition);
      log('✅ コンディション転記', '#4ecca3');
    }

    // カテゴリ
    if (data.category) {
      await setCategory(data.category);
      log('✅ カテゴリ転記', '#4ecca3');
    }

    // 価格
    if (data.price) {
      setInputValue(
        '[name="price"]', String(data.price)
      );
      log('✅ 価格転記', '#4ecca3');
    }

    // 管理コード
    if (data.sku_code) {
      setInputValue(
        '[name="variants.0.skuCode"]', data.sku_code
      );
      log('✅ 管理コード転記', '#4ecca3');
    }

    log('🎉 転記完了！内容を確認してください', '#4ecca3');
  };

  // ── ユーティリティ：input/textarea に値をセット ─
  function setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    setNativeValue(el, value);
  }

  function setNativeValue(el, value) {
    const nativeInput =
      Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        'value'
      );
    nativeInput.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── ユーティリティ：selectをテキストで選択 ────
  function setSelectByText(select, text) {
    for (const opt of select.options) {
      if (opt.text.includes(text)) {
        select.value = opt.value;
        select.dispatchEvent(
          new Event('change', { bubbles: true })
        );
        return;
      }
    }
  }

  // ── ユーティリティ：コンディションをクリック ──
  // 実際のポップアップHTMLを確認したところ、[data-testid="modal"]という共通ラッパーは
  // 存在せず、各選択肢が固有のdata-testid(condition-list-modal-item-{ID})を持つ
  // 独立したポップアップだった。テキスト一致より確実なのでtestidで直接選ぶ。
  async function setCondition(condition) {
    const box = document.querySelector(
      '[data-testid="condition-select-box"]'
    );
    if (!box) return;
    box.click();

    const testidSuffix = CONDITION_TESTID_MAP[condition];
    if (!testidSuffix) return;
    const item = await lhWaitForSelector(
      `[data-testid="condition-list-modal-item-${testidSuffix}"]`
    );
    if (!item) return;
    item.click();
    await new Promise(r => setTimeout(r, 500));
  }

  // ── ユーティリティ：カテゴリを階層選択 ────
  // 実際のポップアップHTMLを確認したところ、[data-testid="modal"]という共通ラッパーは
  // 無く、各項目が[data-testid="nested-list-modal-item"]（全項目共通、テキストで区別）
  // というポップアップだった。また、カテゴリボックスを開くたびに常にトップ階層
  // （「ファッション」から始まる一覧）が表示される挙動を確認したため、旧コードにあった
  // 「トップまで戻る」ナビゲーションは不要と判断し削除した。
  async function setCategory(category) {
    const parts = category
      .split(/[\/／>＞]/)
      .map(s => s.trim())
      .filter(Boolean);

    const catBox = document.querySelector(
      '[data-testid="categories"]'
    );
    if (!catBox) return;
    catBox.click();
    await lhWaitForSelector('[data-testid="nested-list-modal-item"]');

    // クリックヘルパー（完全一致優先・部分一致フォールバック）
    const clickItem = async (text) => {
      const items = document.querySelectorAll(
        '[data-testid="nested-list-modal-item"]'
      );
      if (!items.length) return false;

      // カッコ内を除去して比較
      const cleanText = text.replace(/[（(].*[）)]/g, '').trim();

      // 完全一致を優先
      for (const item of items) {
        const t = item.textContent.trim();
        if (t === cleanText || t === text) {
          item.click();
          await new Promise(r => setTimeout(r, 600));
          return true;
        }
      }
      // 部分一致フォールバック
      for (const item of items) {
        const t = item.textContent.trim();
        if (t.includes(cleanText)) {
          item.click();
          await new Promise(r => setTimeout(r, 600));
          return true;
        }
      }
      return false;
    };

    // トップカテゴリを自動補完
    const TOP_MAP = {
      'レディース': 'ファッション',
      'メンズ': 'ファッション',
      'バッグ': 'ファッション',
      'アクセサリー': 'ファッション',
      '靴': 'ファッション',
      '時計': 'ファッション',
      'サングラス': 'ファッション',
      '帽子': 'ファッション',
      'トップス': 'ファッション',
      'パンツ': 'ファッション',
      'スカート': 'ファッション',
      'ワンピース': 'ファッション',
      'ジャケット': 'ファッション',
      'コート': 'ファッション',
      'ベビー': 'ベビー・キッズ',
      'キッズ': 'ベビー・キッズ',
      'スポーツ': 'スポーツ',
      'アウトドア': 'アウトドア・釣り・旅行用品',
      'コスメ': 'コスメ・美容',
      '本': '本・雑誌・漫画',
      '家具': '家具・インテリア',
      'ゲーム': 'ゲーム・おもちゃ・グッズ',
    };

    const firstPart = parts[0];
    const topCategory = TOP_MAP[firstPart];
    if (topCategory) {
      await clickItem(topCategory);
    }

    for (const part of parts) {
      const ok = await clickItem(part);
      if (!ok) break;
    }
  }
　

  // SOLD一覧をサムネイル画像付きグリッドで表示する。テキストの商品名だけでは
  // 本当に同じ商品か確信が持てないという指摘を受けて追加。STEP1の画像サムネイル
  // 表示(lh-thumbs)と同じ見た目のパターンを流用する。imageUrlが無い項目はスキップ
  // （一覧ページ抽出でサムネイルが拾えなかった場合など）。
  function renderSoldThumbnails(sold) {
    const withImage = sold.filter(r => r.imageUrl);
    if (withImage.length === 0) return;

    const grid = document.createElement('div');
    grid.style.cssText =
      'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;';

    withImage.forEach(r => {
      const card = document.createElement('a');
      card.href = r.url;
      card.target = '_blank';
      card.rel = 'noopener';
      card.style.cssText =
        'display:block;width:74px;text-decoration:none;color:#e0e0e0;';

      const daysNote = (typeof r.daysToSell === 'number')
        ? (r.daysToSell <= 0 ? '当日' : r.daysToSell + '日')
        : '?';

      const img = document.createElement('img');
      img.src = r.imageUrl;
      img.style.cssText =
        'width:74px;height:74px;object-fit:cover;border-radius:4px;' +
        'border:1px solid #0f3460;display:block;';

      const caption = document.createElement('div');
      caption.style.cssText =
        'font-size:10px;text-align:center;margin-top:2px;line-height:1.4;';
      caption.innerHTML =
        `¥${r.price.toLocaleString()}<br>${daysNote}で売却`;

      card.appendChild(img);
      card.appendChild(caption);
      grid.appendChild(card);
    });

    document.getElementById('lh-log').appendChild(grid);
  }

  // 中央値（降順ソート済み配列用）
  function lhMedian(arr) {
    const n = arr.length;
    const mid = Math.floor(n / 2);
    return n % 2
      ? arr[mid].price
      : Math.round(
          (arr[mid - 1].price + arr[mid].price) / 2
        );
  }

  // ⚠判定（派生モデル検出・JSON入力から材料取得）
  function lhWarnCheck(title) {
    let pn = '', hvk = '', brand = '', kana = '';
    try {
      const j = JSON.parse(
        document.getElementById('lh-json-input').value
      );
      pn = j.proper_noun || '';
      hvk = (j.high_value_keywords || '')
        .split(/[\s　]+/)[0] || '';
      brand = j.brand || '';
      kana = j.brand_kana || '';
    } catch (e) {
      return false;
    }
    const norm = s => (s || '').toUpperCase()
      .replace(/[^A-Z0-9ァ-ヶー]/g, '');
    const t = title || '';
    for (const n of [pn, hvk]) {
      if (!n) continue;
      const idx = t.toUpperCase()
        .indexOf(n.toUpperCase());
      if (idx <= 0) continue;
      const pre = t.slice(0, idx)
        .replace(/[\s　]+$/, '');
      const m = pre.match(
        /([A-Za-z0-9ァ-ヶー.\-・]+)$/
      );
      if (!m) continue;
      const w = norm(m[1]);
      if (!w || w === norm(brand) || w === norm(kana)) {
        continue;
      }
      return true;
    }
    return false;
  }


  // ── Lensログ・結果受信 ────────────────────────
  /* Android WebViewにはChrome拡張APIがない。Quetta/PCの受信口だけを
     利用し、アプリ側では出品ツール本体を止めない。 */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'lensLog') {
      console.log('[LH-CS] lensLog受信:', msg.msg);
      log(msg.msg, '#f5a623');
    }
    if (msg.action === 'lensLink') {
      const el = document.getElementById('lh-log');
      el.innerHTML +=
        `<div style="margin-bottom:4px;">` +
        `<a href="${msg.url}" target="_blank" ` +
        `style="color:#4ecca3; font-size:11px; ` +
        `word-break:break-all;">` +
        `${msg.text}</a></div>`;
    }
    if (msg.action === 'lensResult') {
      const results = msg.results;
      if (results.length === 0) {
        log('❌ Lens結果なし→AIタイトルを採用', '#aaa');
        return;
      }
      const sold = results
        .filter(r => r.sold)
        .sort((a, b) => b.price - a.price);
      if (sold.length > 0) {
        log(
          `✅ SOLD相場: ¥${sold[sold.length-1].price}〜¥${sold[0].price}(中央値¥${lhMedian(sold)})`,
          '#4ecca3'
        );
        const clean = sold.filter(
          r => !lhWarnCheck(r.title)
        );
        if (clean.length > 0 &&
            clean.length < sold.length) {
          log(
            `✅ SOLD相場(⚠除外): ¥${clean[clean.length-1].price}〜¥${clean[0].price}(中央値¥${lhMedian(clean)})`,
            '#4ecca3'
          );
        }
        // タイトルの文字だけでは本当に同じ商品か確信が持てないという声を受けて、
        // サムネイル画像付きの一覧も表示する（クリックで商品ページを開ける）。
        renderSoldThumbnails(sold);
      }
    }
  });
  }

  // ★2026-08-01: 開いた時点で下書きからサイズ・管理番号を拾って入れておく。
  //   下書きの読み込みが遅れることがあるので、空なら数回だけ拾い直す。
  try {
    lhFillFromDraft();
    let tries = 0;
    const t = setInterval(() => {
      const info = lhFillFromDraft();
      if ((info.sizeBlock && info.sku) || ++tries > 10) clearInterval(t);
    }, 700);
  } catch (e) {}

  log('出品ヘルパー起動済み', '#4ecca3');
  }

  // 最初の1回。出品フォームのページで開いた場合はここで出る。
  if (lhIsFormPage()) lhInit();

  // SPA遷移の見張り。一覧から下書きを開いた時など、ページを読み込み直さずに
  //   URLだけが変わる場合に作る。見るだけで通信は一切しない。
  let lhLastUrl = location.href;
  setInterval(() => {
    if (location.href === lhLastUrl) return;
    lhLastUrl = location.href;
    try { if (lhIsFormPage()) lhInit(); } catch (e) {}
  }, 800);
})();
