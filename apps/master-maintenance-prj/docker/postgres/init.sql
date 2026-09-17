-- 社内マスタメンテナンスの初期データ。
--
-- 列の名前は**定義の項目名を snake_case にしたもの**（node-src/src/db.js が変換する）。
-- 業務システムの慣習に合わせて DB は snake_case、定義と画面は camelCase で話す。

create table users (
  user_id       text primary key,
  display_name  text not null,
  roles         text[] not null,
  salt          text not null,
  password_hash text not null
);

create table departments (
  department_code        text primary key,
  department_name        text not null,
  short_name             text,
  parent_department_code text references departments(department_code),
  valid_from_date        date not null,
  valid_to_date          date,
  updated_at             timestamptz not null default now()
);

create table employees (
  employee_no       text primary key,
  name              text not null,
  name_kana         text not null,
  department_code   text not null references departments(department_code),
  position          text,
  email             text,
  extension         text,
  employment_status text not null,
  hire_date         date not null,
  retire_date       date,
  updated_at        timestamptz not null default now()
);

create table suppliers (
  supplier_code      text primary key,
  supplier_name      text not null,
  supplier_name_kana text,
  supplier_type      text not null,
  invoice_no         text,
  postal_code        text,
  address            text,
  phone              text,
  credit_limit       bigint not null default 0,
  closing_day        int not null,
  payment_site_days  int,
  trade_status       text not null,
  updated_at         timestamptz not null default now()
);

-- 監査（誰が・いつ・何を）。前書きの `audit` の答え＝**削除と一括は必ず残す**。
create table audit_log (
  id          bigserial primary key,
  user_id     text not null,
  action      text not null,
  target      text not null,
  target_key  text,
  detail      jsonb,
  at          timestamptz not null default now()
);

-- 定義の一覧に出る「所属部署（名前）」は**別の表から来る**ので、読むときはビューを使う
-- （書くのは実表）。定義に `departmentName` と書いてあるのに実表に無い、を埋める所。
create view employees_view as
  select e.*, d.department_name
  from employees e join departments d on d.department_code = e.department_code;

create view departments_view as
  select d.*, p.department_name as parent_department_name
  from departments d left join departments p on p.department_code = d.parent_department_code;

insert into users (user_id, display_name, roles, salt, password_hash) values
  ('admin', '情シス 太郎', '{admin}', 'd39db3df44aa00b67b017163c13a8feb', 'b8bf8783a8dc1ed7c5d050a913aff652a957639ad52c1b58489f660ed62bcf9601d2808adebfcbd74c150a083151aaec516261081d2cfda5c55616453723f70a'),
  ('hr', '人事 花子', '{hr}', '31645c60cd371f84a66b892a91410afd', 'c130ac4906b09280540d850fe0eaa13cfd4b8723ea83e36f1660f95c35b4cd737adf2bec3dc781c2c509c91368ed4ebc3d36f61dc598b89ee4be9bde0099f73e'),
  ('viewer', '一般 次郎', '{viewer}', 'a6958a246a4cc538fbb75c909986fc4b', 'fa9da6bf4f027529ee4301eb01d9d2ee79962c6aeb1635498c3e62422093ccde3dec7d458146fb317d3f6d0082606dc89c3bc057fd27b59d3c0d67d0f30f2340');

insert into departments (department_code, department_name, short_name, parent_department_code, valid_from_date, valid_to_date) values
  ('HONB', '本社', '本社', null, '2020-04-01', null),
  ('JINJ', '人事部', '人事', 'HONB', '2020-04-01', null),
  ('KOUB', '購買部', '購買', 'HONB', '2020-04-01', null),
  ('EIGY', '営業部', '営業', 'HONB', '2020-04-01', null),
  ('EIG1', '営業1課', '営1', 'EIGY', '2020-04-01', null),
  ('EIG2', '営業2課', '営2', 'EIGY', '2020-04-01', null),
  ('JOHO', '情報システム部', '情シス', 'HONB', '2020-04-01', null);

insert into employees (employee_no, name, name_kana, department_code, position, email, extension, employment_status, hire_date, retire_date) values
  ('100001', '佐藤 太郎', 'サトウ タロウ', 'JINJ', '部長', 'user0@example.co.jp', '4000', 'leave', '2012-04-01', null),
  ('100002', '鈴木 彩', 'スズキ アヤ', 'KOUB', '課長', 'user1@example.co.jp', '4001', 'active', '2013-04-01', null),
  ('100003', '高橋 涼', 'タカハシ リョウ', 'EIGY', '主任', 'user2@example.co.jp', '4002', 'active', '2014-04-01', null),
  ('100004', '田中 美咲', 'タナカ ミサキ', 'EIG1', '担当', 'user3@example.co.jp', '4003', 'active', '2015-04-01', null),
  ('100005', '伊藤 翔', 'イトウ ショウ', 'EIG2', '担当', 'user4@example.co.jp', '4004', 'active', '2016-04-01', null),
  ('100006', '渡辺 花子', 'ワタナベ ハナコ', 'JOHO', '担当', 'user5@example.co.jp', '4005', 'active', '2017-04-01', null),
  ('100007', '山本 大輔', 'ヤマモト ダイスケ', 'JINJ', '部長', 'user6@example.co.jp', '4006', 'active', '2018-04-01', null),
  ('100008', '中村 真央', 'ナカムラ マオ', 'KOUB', '課長', 'user7@example.co.jp', '4007', 'active', '2019-04-01', null),
  ('100009', '小林 健', 'コバヤシ ケン', 'EIGY', '主任', 'user8@example.co.jp', '4008', 'retired', '2020-04-01', '2022-03-31'),
  ('100010', '加藤 菜々', 'カトウ ナナ', 'EIG1', '担当', 'user9@example.co.jp', '4009', 'active', '2021-04-01', null),
  ('100011', '吉田 一郎', 'ヨシダ イチロウ', 'EIG2', '担当', 'user10@example.co.jp', '4010', 'active', '2022-04-01', null),
  ('100012', '山田 恵', 'ヤマダ メグミ', 'JOHO', '担当', 'user11@example.co.jp', '4011', 'active', '2023-04-01', null),
  ('100013', '佐藤 太郎', 'サトウ タロウ', 'JINJ', '部長', 'user12@example.co.jp', '4012', 'active', '2024-04-01', null),
  ('100014', '鈴木 彩', 'スズキ アヤ', 'KOUB', '課長', 'user13@example.co.jp', '4013', 'active', '2025-04-01', null),
  ('100015', '高橋 涼', 'タカハシ リョウ', 'EIGY', '主任', 'user14@example.co.jp', '4014', 'active', '2012-04-01', null),
  ('100016', '田中 美咲', 'タナカ ミサキ', 'EIG1', '担当', 'user15@example.co.jp', '4015', 'active', '2013-04-01', null),
  ('100017', '伊藤 翔', 'イトウ ショウ', 'EIG2', '担当', 'user16@example.co.jp', '4016', 'leave', '2014-04-01', null),
  ('100018', '渡辺 花子', 'ワタナベ ハナコ', 'JOHO', '担当', 'user17@example.co.jp', '4017', 'active', '2015-04-01', null),
  ('100019', '山本 大輔', 'ヤマモト ダイスケ', 'JINJ', '部長', 'user18@example.co.jp', '4018', 'active', '2016-04-01', null),
  ('100020', '中村 真央', 'ナカムラ マオ', 'KOUB', '課長', 'user19@example.co.jp', '4019', 'active', '2017-04-01', null),
  ('100021', '小林 健', 'コバヤシ ケン', 'EIGY', '主任', 'user20@example.co.jp', '4020', 'active', '2018-04-01', null),
  ('100022', '加藤 菜々', 'カトウ ナナ', 'EIG1', '担当', 'user21@example.co.jp', '4021', 'active', '2019-04-01', null),
  ('100023', '吉田 一郎', 'ヨシダ イチロウ', 'EIG2', '担当', 'user22@example.co.jp', '4022', 'active', '2020-04-01', null),
  ('100024', '山田 恵', 'ヤマダ メグミ', 'JOHO', '担当', 'user23@example.co.jp', '4023', 'active', '2021-04-01', null),
  ('100025', '佐藤 太郎', 'サトウ タロウ', 'JINJ', '部長', 'user24@example.co.jp', '4024', 'retired', '2022-04-01', '2020-03-31'),
  ('100026', '鈴木 彩', 'スズキ アヤ', 'KOUB', '課長', 'user25@example.co.jp', '4025', 'active', '2023-04-01', null),
  ('100027', '高橋 涼', 'タカハシ リョウ', 'EIGY', '主任', 'user26@example.co.jp', '4026', 'active', '2024-04-01', null),
  ('100028', '田中 美咲', 'タナカ ミサキ', 'EIG1', '担当', 'user27@example.co.jp', '4027', 'active', '2025-04-01', null),
  ('100029', '伊藤 翔', 'イトウ ショウ', 'EIG2', '担当', 'user28@example.co.jp', '4028', 'active', '2012-04-01', null),
  ('100030', '渡辺 花子', 'ワタナベ ハナコ', 'JOHO', '担当', 'user29@example.co.jp', '4029', 'active', '2013-04-01', null),
  ('100031', '山本 大輔', 'ヤマモト ダイスケ', 'JINJ', '部長', 'user30@example.co.jp', '4030', 'active', '2014-04-01', null),
  ('100032', '中村 真央', 'ナカムラ マオ', 'KOUB', '課長', 'user31@example.co.jp', '4031', 'active', '2015-04-01', null),
  ('100033', '小林 健', 'コバヤシ ケン', 'EIGY', '主任', 'user32@example.co.jp', '4032', 'leave', '2016-04-01', null),
  ('100034', '加藤 菜々', 'カトウ ナナ', 'EIG1', '担当', 'user33@example.co.jp', '4033', 'active', '2017-04-01', null),
  ('100035', '吉田 一郎', 'ヨシダ イチロウ', 'EIG2', '担当', 'user34@example.co.jp', '4034', 'active', '2018-04-01', null),
  ('100036', '山田 恵', 'ヤマダ メグミ', 'JOHO', '担当', 'user35@example.co.jp', '4035', 'active', '2019-04-01', null),
  ('100037', '佐藤 太郎', 'サトウ タロウ', 'JINJ', '部長', 'user36@example.co.jp', '4036', 'active', '2020-04-01', null),
  ('100038', '鈴木 彩', 'スズキ アヤ', 'KOUB', '課長', 'user37@example.co.jp', '4037', 'active', '2021-04-01', null),
  ('100039', '高橋 涼', 'タカハシ リョウ', 'EIGY', '主任', 'user38@example.co.jp', '4038', 'active', '2022-04-01', null),
  ('100040', '田中 美咲', 'タナカ ミサキ', 'EIG1', '担当', 'user39@example.co.jp', '4039', 'active', '2023-04-01', null),
  ('100041', '伊藤 翔', 'イトウ ショウ', 'EIG2', '担当', 'user40@example.co.jp', '4040', 'retired', '2024-04-01', '2024-03-31'),
  ('100042', '渡辺 花子', 'ワタナベ ハナコ', 'JOHO', '担当', 'user41@example.co.jp', '4041', 'active', '2025-04-01', null),
  ('100043', '山本 大輔', 'ヤマモト ダイスケ', 'JINJ', '部長', 'user42@example.co.jp', '4042', 'active', '2012-04-01', null),
  ('100044', '中村 真央', 'ナカムラ マオ', 'KOUB', '課長', 'user43@example.co.jp', '4043', 'active', '2013-04-01', null),
  ('100045', '小林 健', 'コバヤシ ケン', 'EIGY', '主任', 'user44@example.co.jp', '4044', 'active', '2014-04-01', null),
  ('100046', '加藤 菜々', 'カトウ ナナ', 'EIG1', '担当', 'user45@example.co.jp', '4045', 'active', '2015-04-01', null),
  ('100047', '吉田 一郎', 'ヨシダ イチロウ', 'EIG2', '担当', 'user46@example.co.jp', '4046', 'active', '2016-04-01', null),
  ('100048', '山田 恵', 'ヤマダ メグミ', 'JOHO', '担当', 'user47@example.co.jp', '4047', 'active', '2017-04-01', null);

insert into suppliers (supplier_code, supplier_name, supplier_name_kana, supplier_type, invoice_no, postal_code, address, phone, credit_limit, closing_day, payment_site_days, trade_status) values
  ('S1001', '山田製作所', 'ヤマダセイサクショ', 'individual', null, '100-1000', '東京都千代田区1-1', '03-3000-5000', 0, 10, 30, 'active'),
  ('S1002', '大阪金属', 'オオサカキンゾク', 'corp', 'T1000000000001', '101-1001', '東京都千代田区2-2', '03-3001-5001', 500000, 15, 45, 'active'),
  ('S1003', '東京電機', 'トウキョウデンキ', 'corp', 'T1000000000002', '102-1002', '東京都千代田区3-3', '03-3002-5002', 1000000, 20, 60, 'active'),
  ('S1004', '中部樹脂', 'チュウブジュシ', 'corp', 'T1000000000003', '103-1003', '東京都千代田区4-4', '03-3003-5003', 3000000, 31, 30, 'suspended'),
  ('S1005', '九州紙業', 'キュウシュウシギョウ', 'corp', 'T1000000000004', '104-1004', '東京都千代田区5-5', '03-3004-5004', 10000000, 10, 45, 'closed'),
  ('S1006', '北海食品', 'ホッカイショクヒン', 'individual', null, '105-1005', '東京都千代田区6-6', '03-3005-5005', 0, 15, 60, 'active'),
  ('S1007', '関西運輸', 'カンサイウンユ', 'corp', 'T1000000000006', '106-1006', '東京都千代田区7-7', '03-3006-5006', 500000, 20, 30, 'active'),
  ('S1008', '信州精密', 'シンシュウセイミツ', 'corp', 'T1000000000007', '107-1007', '東京都千代田区8-8', '03-3007-5007', 1000000, 31, 45, 'active'),
  ('S1009', 'みどり商事', 'ミドリショウジ', 'corp', 'T1000000000008', '108-1008', '東京都千代田区9-9', '03-3008-5008', 3000000, 10, 60, 'suspended'),
  ('S1010', 'あおぞら工業', 'アオゾラコウギョウ', 'corp', 'T1000000000009', '109-1009', '東京都千代田区1-10', '03-3009-5009', 10000000, 15, 30, 'closed'),
  ('S1011', 'さくら物流', 'サクラブツリュウ', 'individual', null, '110-1010', '東京都千代田区2-11', '03-3010-5010', 0, 20, 45, 'active'),
  ('S1012', 'ひまわり建材', 'ヒマワリケンザイ', 'corp', 'T1000000000011', '111-1011', '東京都千代田区3-12', '03-3011-5011', 500000, 31, 60, 'active'),
  ('S1013', '山田製作所（2）', 'ヤマダセイサクショ', 'corp', 'T1000000000012', '112-1012', '東京都千代田区4-13', '03-3012-5012', 1000000, 10, 30, 'active'),
  ('S1014', '大阪金属（2）', 'オオサカキンゾク', 'corp', 'T1000000000013', '113-1013', '東京都千代田区5-14', '03-3013-5013', 3000000, 15, 45, 'suspended'),
  ('S1015', '東京電機（2）', 'トウキョウデンキ', 'corp', 'T1000000000014', '114-1014', '東京都千代田区6-15', '03-3014-5014', 10000000, 20, 60, 'closed'),
  ('S1016', '中部樹脂（2）', 'チュウブジュシ', 'individual', null, '115-1015', '東京都千代田区7-16', '03-3015-5015', 0, 31, 30, 'active'),
  ('S1017', '九州紙業（2）', 'キュウシュウシギョウ', 'corp', 'T1000000000016', '116-1016', '東京都千代田区8-17', '03-3016-5016', 500000, 10, 45, 'active'),
  ('S1018', '北海食品（2）', 'ホッカイショクヒン', 'corp', 'T1000000000017', '117-1017', '東京都千代田区9-18', '03-3017-5017', 1000000, 15, 60, 'active'),
  ('S1019', '関西運輸（2）', 'カンサイウンユ', 'corp', 'T1000000000018', '118-1018', '東京都千代田区1-19', '03-3018-5018', 3000000, 20, 30, 'suspended'),
  ('S1020', '信州精密（2）', 'シンシュウセイミツ', 'corp', 'T1000000000019', '119-1019', '東京都千代田区2-20', '03-3019-5019', 10000000, 31, 45, 'closed'),
  ('S1021', 'みどり商事（2）', 'ミドリショウジ', 'individual', null, '120-1020', '東京都千代田区3-1', '03-3020-5020', 0, 10, 60, 'active'),
  ('S1022', 'あおぞら工業（2）', 'アオゾラコウギョウ', 'corp', 'T1000000000021', '121-1021', '東京都千代田区4-2', '03-3021-5021', 500000, 15, 30, 'active'),
  ('S1023', 'さくら物流（2）', 'サクラブツリュウ', 'corp', 'T1000000000022', '122-1022', '東京都千代田区5-3', '03-3022-5022', 1000000, 20, 45, 'active'),
  ('S1024', 'ひまわり建材（2）', 'ヒマワリケンザイ', 'corp', 'T1000000000023', '123-1023', '東京都千代田区6-4', '03-3023-5023', 3000000, 31, 60, 'suspended'),
  ('S1025', '山田製作所（3）', 'ヤマダセイサクショ', 'corp', 'T1000000000024', '124-1024', '東京都千代田区7-5', '03-3024-5024', 10000000, 10, 30, 'closed'),
  ('S1026', '大阪金属（3）', 'オオサカキンゾク', 'individual', null, '125-1025', '東京都千代田区8-6', '03-3025-5025', 0, 15, 45, 'active'),
  ('S1027', '東京電機（3）', 'トウキョウデンキ', 'corp', 'T1000000000026', '126-1026', '東京都千代田区9-7', '03-3026-5026', 500000, 20, 60, 'active'),
  ('S1028', '中部樹脂（3）', 'チュウブジュシ', 'corp', 'T1000000000027', '127-1027', '東京都千代田区1-8', '03-3027-5027', 1000000, 31, 30, 'active'),
  ('S1029', '九州紙業（3）', 'キュウシュウシギョウ', 'corp', 'T1000000000028', '128-1028', '東京都千代田区2-9', '03-3028-5028', 3000000, 10, 45, 'suspended'),
  ('S1030', '北海食品（3）', 'ホッカイショクヒン', 'corp', 'T1000000000029', '129-1029', '東京都千代田区3-10', '03-3029-5029', 10000000, 15, 60, 'closed');
