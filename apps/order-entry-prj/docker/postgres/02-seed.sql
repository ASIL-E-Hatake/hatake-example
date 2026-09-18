-- 動かして見るためのデータ。
--
-- **エビデンスを撮り直しても同じ絵になる**ように、全部べた書きにしてある
-- （乱数も now() も使わない）。日付は 2026-07〜09 に固定。

-- ログインする人（**枠組みの外**）。合言葉は `<id>123`。
-- ハッシュは sha256(salt + password) の16進（`AuthController` と同じ数え方）。
insert into app_users (user_id, user_name, roles, office_code, password_salt, password_hash) values
  ('sato',   '佐藤 健一', 'sales',   'OSA', 'sato-salt',   '878970192ef985703f58530007cc8442413a50558d1ff727888a738243ae8ac7'),
  ('suzuki', '鈴木 花',   'sales',   'TKY', 'suzuki-salt', '25f13625af4878b303753d07c3320f435482033f564724ce37c748431f69881e'),
  ('tanaka', '田中 優子', 'clerk',   'TKY', 'tanaka-salt', '62091cb1caee98e166dd3ed1055771b4274468c64fe8fd0c5963926647dc1d77'),
  ('yamada', '山田 太郎', 'manager', 'TKY', 'yamada-salt', '95875991967d36e8a0ebc42730d60741baa0716cdf7076c8f1049c95c8ad76f7');

insert into customers (customer_code, customer_name, customer_name_kana, closing_day) values
  ('C001', '株式会社あおぞら商事', 'アオゾラショウジ', 20),
  ('C002', 'みどり物産株式会社',   'ミドリブッサン',   31),
  ('C003', '北山フーズ株式会社',   'キタヤマフーズ',   10),
  ('C004', '西口電機株式会社',     'ニシグチデンキ',   31),
  ('C005', '南商店',               'ミナミショウテン', 15);

-- 軽減税率（0.080）が混ざる＝**税率は行が持つ**（伝票に1つではない）。
insert into products (product_code, product_name, unit_price, tax_rate) values
  ('P001', 'A4コピー用紙（500枚）',   480, 0.100),
  ('P002', 'ボールペン 黒（10本）',   780, 0.100),
  ('P003', 'クリアファイル（100枚）', 1200, 0.100),
  ('P004', 'デスクマット',            3200, 0.100),
  ('P005', '事務イス',               18500, 0.100),
  ('P006', 'ミネラルウォーター（24本）', 1580, 0.080),
  ('P007', 'ドリップコーヒー（50袋）',  2480, 0.080),
  ('P008', '来客用茶葉（1kg）',        4200, 0.080);

-- 7月は締めた（前書き: 締めた月の受注は直せない）。
insert into closed_months (month) values ('2026-07');

-- 受注。採番は本来サーバがやるが、種は番号を固定して入れる
-- （撮り直しても同じ絵にするため）。**金額は 0 で入れて、下で行から計算し直す**。
insert into orders (order_no, customer_code, order_date, due_date, order_status,
                    sales_person_name, delivery_place, note, office_code,
                    subtotal_amount, tax_amount, total_amount, line_count,
                    created_by, created_at, updated_at) values
  ('SO2026070001', 'C001', '2026-07-03', '2026-07-10', 'shipped',   '佐藤 健一', '本社総務部', null,             'OSA', 0, 0, 0, 0, 'sato',   '2026-07-03 09:12:00+09', '2026-07-05 10:00:00+09'),
  ('SO2026070002', 'C003', '2026-07-08', '2026-07-15', 'shipped',   '鈴木 花',   '川崎センター', '定期便',        'TKY', 0, 0, 0, 0, 'suzuki', '2026-07-08 11:30:00+09', '2026-07-09 14:00:00+09'),
  ('SO2026080001', 'C002', '2026-08-04', '2026-08-12', 'shipped',   '鈴木 花',   null,          null,            'TKY', 0, 0, 0, 0, 'suzuki', '2026-08-04 10:05:00+09', '2026-08-06 09:00:00+09'),
  ('SO2026080002', 'C001', '2026-08-11', '2026-08-20', 'confirmed', '佐藤 健一', '第二倉庫',     '至急',          'OSA', 0, 0, 0, 0, 'sato',   '2026-08-11 13:40:00+09', '2026-08-11 13:40:00+09'),
  ('SO2026080003', 'C004', '2026-08-19', '2026-08-28', 'cancelled', '田中 優子', null,          '先方都合で取消', 'TKY', 0, 0, 0, 0, 'tanaka', '2026-08-19 15:20:00+09', '2026-08-22 09:10:00+09'),
  ('SO2026090001', 'C005', '2026-09-01', '2026-09-08', 'confirmed', '佐藤 健一', null,          null,            'OSA', 0, 0, 0, 0, 'sato',   '2026-09-01 09:00:00+09', '2026-09-01 09:00:00+09'),
  ('SO2026090002', 'C002', '2026-09-03', '2026-09-11', 'confirmed', '鈴木 花',   '本社',         null,            'TKY', 0, 0, 0, 0, 'suzuki', '2026-09-03 10:15:00+09', '2026-09-03 10:15:00+09'),
  ('SO2026090003', 'C003', '2026-09-08', '2026-09-18', 'draft',     '田中 優子', null,          '数量確認中',     'TKY', 0, 0, 0, 0, 'tanaka', '2026-09-08 16:45:00+09', '2026-09-08 16:45:00+09'),
  ('SO2026090004', 'C001', '2026-09-10', '2026-09-17', 'draft',     '佐藤 健一', '本社総務部',   null,            'OSA', 0, 0, 0, 0, 'sato',   '2026-09-10 08:50:00+09', '2026-09-10 08:50:00+09');

insert into order_lines (order_no, line_no, product_code, quantity, unit_price, tax_rate, amount, cancelled) values
  ('SO2026070001', 1, 'P001', 10, 480, 0.100, 4800, false),
  ('SO2026070001', 2, 'P002',  2, 780, 0.100, 1560, false),
  ('SO2026070002', 1, 'P006',  3, 1580, 0.080, 4740, false),
  ('SO2026070002', 2, 'P007',   2, 2480, 0.080, 4960, false),
  ('SO2026080001', 1, 'P005',  2, 18500, 0.100, 37000, false),
  ('SO2026080002', 1, 'P001',  5, 480, 0.100, 2400, false),
  ('SO2026080002', 2, 'P003',  1, 1200, 0.100, 1200, false),
  ('SO2026080002', 3, 'P006',  1, 1580, 0.080, 1580, false),
  ('SO2026080003', 1, 'P005',  1, 18500, 0.100, 18500, false),
  ('SO2026090001', 1, 'P006',  1, 1580, 0.080, 1580, false),
  ('SO2026090001', 2, 'P007',  1, 2480, 0.080, 2480, false),
  ('SO2026090002', 1, 'P004',  1, 3200, 0.100, 3200, false),
  ('SO2026090002', 2, 'P002',  4, 780, 0.100, 3120, false),
  ('SO2026090002', 3, 'P008',  1, 4200, 0.080, 4200, false),
  ('SO2026090003', 1, 'P008',  1, 4200, 0.080, 4200, false),
  ('SO2026090003', 2, 'P007',  1, 2480, 0.080, 2480, false),
  ('SO2026090004', 1, 'P001',  2, 480, 0.100, 960, false),
  ('SO2026090004', 2, 'P003',  1, 1200, 0.100, 1200, false);

-- **ヘッダの金額は行から計算する**（べた書きしない）。
--
-- 書き写すと必ずずれるし、ずれても誰も気づかない。ここに書いてある数え方は
-- サーバ（`OrderTotals`）と画面（計算項目 `op: tax`）とまったく同じ:
-- 税率ごとに畳んで、**税率ごとに1回だけ切り捨てる**（軽減税率が混ざるので）。
with by_rate as (
  select order_no, tax_rate, sum(amount) as amount, count(*) as lines
  from order_lines
  where cancelled = false
  group by order_no, tax_rate
), totals as (
  select order_no,
         sum(amount)::bigint as subtotal,
         sum(floor(amount * tax_rate))::bigint as tax,
         sum(lines)::int as line_count
  from by_rate
  group by order_no
)
update orders o
set subtotal_amount = t.subtotal,
    tax_amount      = t.tax,
    total_amount    = t.subtotal + t.tax,
    line_count      = t.line_count
from totals t
where t.order_no = o.order_no;

-- 採番の続きは、種で使った番号の次から。
select setval('order_no_seq', 100, true);
