// 機能網羅のモック API。
//
// **業務ロジックは持ちません。** 持っているのは3つだけ:
//   ・定義を配る（画面はコピーを持たない）
//   ・決め打ちのデータを、定義に書いてある条件で絞って返す
//   ・一括で「わざと失敗する行」を返す（部分失敗を確かめるため）
//
// 検証だけは**画面と同じ定義**で回します。網羅アプリでも、そこは省きません
// （省くと「画面では止まるのに API では通る」を見逃す道ができる）。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { buildQuery, FormValidator, parseAppSource } from '@hatake-fw/api';

import { children, freshItems, groups, linesOf } from './data.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..', '..', 'definitions', 'app.yaml');
const source = readFileSync(SOURCE, 'utf8');
const parsed = parseAppSource(source);
const pages = new Map(parsed.pages.map((page) => [page.id, page]));
const validator = new FormValidator();

/** 毎回まっさらから始める（証跡が撮り直せる）。 */
let items = freshItems();

const app = express();
app.use(express.json());

/** 役割は URL の `?role=` か見出しから。**見本のための割り切り**（認証は持たない）。 */
const rolesOf = (request) =>
  String(request.query.role ?? request.get('x-role') ?? 'tester')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);

/** 画面と同じ1枚を配る。 */
app.get('/api/definition.yaml', (_request, response) => {
  response.type('text/plain').send(source);
});

/** 定義に書いてある条件だけで絞る（書いていない項目では絞らない）。 */
function filtered(pageId, query) {
  const page = pages.get(pageId);
  const spec = buildQuery(page.search, { ...query });
  let rows = items;
  for (const one of spec.conditions) {
    const { field, operator, value } = one;
    rows = rows.filter((row) => {
      const at = row[field];
      if (operator === 'startsWith') return String(at ?? '').startsWith(String(value));
      if (operator === 'contains') return String(at ?? '').includes(String(value));
      if (operator === 'in') return [].concat(value).map(String).includes(String(at));
      if (operator === 'between') {
        const [from, to] = value;
        return Number(at) >= Number(from) && Number(at) <= Number(to);
      }
      return String(at) === String(value);
    });
  }
  if (spec.sortField !== undefined) {
    rows = [...rows].sort((a, b) => {
      const left = a[spec.sortField];
      const right = b[spec.sortField];
      const order = left === right ? 0 : left > right ? 1 : -1;
      return spec.sortAscending ? order : -order;
    });
  }
  const from = spec.page * spec.pageSize;
  return { rows: rows.slice(from, from + spec.pageSize), totalCount: rows.length };
}

// --- 網羅用の1件 -------------------------------------------------------------

app.get('/api/items', (request, response) => {
  // 画面が3枚ぶら下がっているので、条件を持っている画面の定義で絞る。
  const pageId = request.query.groupCode === undefined ? 'press_list' : 'linked_master';
  const { rows, totalCount } = filtered(pageId, request.query);
  response.json({ items: rows, totalCount });
});

app.get('/api/items/:key', (request, response) => {
  const found = items.find((one) => one.itemCode === request.params.key);
  if (found === undefined) return response.status(404).json({ message: '見つかりません' });
  response.json(found);
});

/** 画面と**同じ定義**で検証する（網羅アプリでもここは省かない）。 */
function accept(pageId, body, mode) {
  const page = pages.get(pageId);
  const form = page.kind === 'wizard'
    ? { sections: page.steps.map((step) => ({ title: step.title, fields: step.fields })) }
    : page.form;
  const allowed = new Set(
    form.sections.flatMap((section) => section.fields).map((one) => one.field),
  );
  const record = {};
  for (const [key, value] of Object.entries(body ?? {})) {
    if (allowed.has(key)) record[key] = value === '' ? null : value;
  }
  const checked = validator.validate(form, record, mode);
  return { record, checked };
}

app.post('/api/items', (request, response) => {
  const { record, checked } = accept('combo_form', request.body, 'create');
  if (!checked.valid) return response.status(400).json({ valid: false, errors: checked.errors });
  const made = { lines: [], ...record };
  items = [...items, made];
  response.status(201).json(made);
});

app.put('/api/items/:key', (request, response) => {
  const at = items.findIndex((one) => one.itemCode === request.params.key);
  if (at < 0) return response.status(404).json({ message: '見つかりません' });
  const { record, checked } = accept('combo_form', request.body, 'edit');
  if (!checked.valid) return response.status(400).json({ valid: false, errors: checked.errors });
  items[at] = { ...items[at], ...record };
  response.json(items[at]);
});

app.delete('/api/items/:key', (request, response) => {
  items = items.filter((one) => one.itemCode !== request.params.key);
  response.status(204).end();
});

// --- 選択肢 ------------------------------------------------------------------

app.get('/api/groups', (_request, response) =>
  response.json({ items: groups, totalCount: groups.length }));

/** 親で絞る（`optionsSource.parentKey` が `{ groupCode: <親の値> }` で投げてくる）。 */
app.get('/api/children', (request, response) => {
  const parent = request.query.groupCode;
  const rows = parent === undefined
    ? children
    : children.filter((one) => one.groupCode === String(parent));
  response.json({ items: rows, totalCount: rows.length });
});

// --- 帳票が読む明細 -----------------------------------------------------------

app.get('/api/lines', (request, response) => {
  let rows = linesOf(items);
  if (request.query.itemCode !== undefined && request.query.itemCode !== '') {
    rows = rows.filter((one) => one.itemCode === String(request.query.itemCode));
  }
  // **並べ替えは Repository の担当**。帳票の `report.sort` は
  // `?sortField=&sortAscending=` で届くので、ここで並べる。
  // 無視すると `ascending: false` と書いてあるのに昇順で刷られる
  // ── 実際に一度そうなって、撮った絵で気づいた。
  const sortField = request.query.sortField;
  if (typeof sortField === 'string' && sortField !== '') {
    const ascending = String(request.query.sortAscending ?? 'true') !== 'false';
    rows = [...rows].sort((a, b) => {
      const left = a[sortField];
      const right = b[sortField];
      const order = left === right ? 0 : left > right ? 1 : -1;
      return ascending ? order : -order;
    });
  }
  response.json({ items: rows, totalCount: rows.length });
});

// --- 一括（部分失敗をわざと起こす） --------------------------------------------

/** 試用（trial）の行は必ず失敗する＝**失敗した行を名指しで返す**所を確かめられる。 */
function bulk(keys, apply) {
  const rejected = [];
  let succeeded = 0;
  for (const key of keys) {
    const found = items.find((one) => one.itemCode === key);
    if (found === undefined) {
      rejected.push({ key, reason: '見つかりません' });
    } else if (found.kind === 'trial') {
      rejected.push({ key, reason: '試用のものは変えられません' });
    } else {
      apply(found);
      succeeded += 1;
    }
  }
  return { succeeded, rejected };
}

app.post('/api/bulk/reprice', (request, response) => {
  const keys = Array.isArray(request.body?.keys) ? request.body.keys : [];
  // 押す前に聞いた値は `input` で届く（定義の `prompt.fields` がそのまま）。
  const amount = Number(request.body?.input?.newAmount ?? 0);
  response.json(bulk(keys, (one) => {
    one.amount = amount;
  }));
});

app.post('/api/bulk/archive', (request, response) => {
  const keys = Array.isArray(request.body?.keys) ? request.body.keys : [];
  response.json(bulk(keys, (one) => {
    one.archived = true;
  }));
});

/** 役割は見せ方だけではなく、ここでも見る（持ち出しは admin だけ）。 */
app.get('/api/export-allowed', (request, response) =>
  response.json({ allowed: rolesOf(request).includes('admin') }));

/** データを初期状態に戻す（証跡を撮る前に叩く）。 */
app.post('/api/reset', (_request, response) => {
  items = freshItems();
  response.json({ ok: true, count: items.length });
});

// Express 4 は非同期の例外を拾わないが、この API は同期しか無いので素のままでよい。
app.listen(3000, () => console.log('kitchen-sink API :3000'));
