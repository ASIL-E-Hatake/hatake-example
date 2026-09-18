-- 受注入力の表。
--
-- hatake は DB を知らない（Repository の契約しか知らない）ので、ここは**この案件の
-- 都合**。定義から決まるのは「どの項目を受け取るか」までで、置き方はこちらが決める。
--
-- 列は snake_case（業務システムの慣習）。画面と定義は camelCase で話すので、
-- 変換は `Db.columnOf` / `Db.fieldOf` が1か所でやる。

-- 受注番号の採番（前書きの `numbering` の答え＝サーバが採る）。
create sequence order_no_seq start 1;

-- ログインする人。**枠組みの外**（hatake は認証を持たない）。
-- 本番は社内ポータルが返す。この見本では表1枚で代わりをする。
create table app_users (
  user_id       text primary key,
  user_name     text not null,
  -- 役割はカンマ区切り（sales / clerk / manager）。定義の `app.roles` と同じ名前。
  roles         text not null,
  -- 拠点。**画面には出てこない**が、営業を自分の拠点だけに絞るためにサーバが使う。
  office_code   text not null,
  password_salt text not null,
  password_hash text not null
);

-- 取引先（照会だけ。直すのは別の案件の担当）。
create table customers (
  customer_code text primary key,
  customer_name text not null,
  customer_name_kana text,
  closing_day   int
);

-- 商品（照会だけ。**単価と税率の出どころ**）。
create table products (
  product_code text primary key,
  product_name text not null,
  unit_price   bigint not null,
  -- 軽減税率の商品が混ざる（0.10 / 0.08）。**税率は行が持つ**（伝票に1つではない）。
  tax_rate     numeric(4,3) not null default 0.100
);

-- 締めた月（前書き: 締めた月の受注は直せない）。締めの在り処は**サーバ**。
create table closed_months (
  month text primary key   -- 'YYYY-MM'
);

create table orders (
  order_no          text primary key,
  customer_code     text not null references customers(customer_code),
  order_date        date not null,
  due_date          date not null,
  -- draft / confirmed / shipped / cancelled（定義の options と同じ値）。
  order_status      text not null default 'draft',
  sales_person_name text not null,
  delivery_place    text,
  note              text,
  office_code       text not null,
  -- 金額は**サーバが計算した値**を持つ（画面も同じ数を出すが、正はこちら）。
  subtotal_amount   bigint not null default 0,
  tax_amount        bigint not null default 0,
  total_amount      bigint not null default 0,
  line_count        int    not null default 0,
  created_by        text not null,
  created_at        timestamptz not null default now(),
  -- 同時更新の合言葉（前書きの `concurrency` の答え）。画面はこれを送り返す。
  updated_at        timestamptz not null default now()
);

create index orders_order_date_idx on orders (order_date);
create index orders_customer_idx on orders (customer_code);

create table order_lines (
  order_no     text not null references orders(order_no) on delete cascade,
  line_no      int  not null,
  product_code text not null references products(product_code),
  quantity     numeric(10,2) not null,
  unit_price   bigint not null,
  tax_rate     numeric(4,3) not null,
  amount       bigint not null,
  cancelled    boolean not null default false,
  primary key (order_no, line_no)
);

-- 監査（前書きの `audit` の答え＝枠組みの外）。
create table audit_log (
  id         bigserial primary key,
  user_id    text not null,
  action     text not null,
  target     text not null,
  target_key text,
  detail     text,
  at         timestamptz not null default now()
);

-- 一覧が読む形（取引先名まで足す）。画面は `customerName` を列に書いている。
create view v_orders as
select o.*, c.customer_name
from orders o
join customers c on c.customer_code = o.customer_code;

-- 帳票（注文請書）が読む形。**明細1行が1件**。
create view v_order_lines as
select
  l.order_no,
  l.line_no,
  o.order_date,
  o.due_date,
  o.order_status,
  o.customer_code,
  c.customer_name,
  l.product_code,
  p.product_name,
  l.quantity,
  l.unit_price,
  l.tax_rate,
  l.amount,
  l.cancelled
from order_lines l
join orders o on o.order_no = l.order_no
join customers c on c.customer_code = o.customer_code
join products p on p.product_code = l.product_code
where l.cancelled = false;
