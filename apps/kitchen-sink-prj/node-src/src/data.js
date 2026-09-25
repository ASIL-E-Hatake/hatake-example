// 決め打ちのデータ（**DB を持たない**）。
//
// 網羅が目的なので、業務としての意味はありません。代わりに「確かめたいこと」が
// 出る形に寄せてあります:
//
//   ・畳み込みの打ち切り … 明細が4本以上ある1件（`ほか N 件` が出る）
//   ・区切って実行     … 12件（区切り5なら3回に分かれる）
//   ・部分失敗         … 試用（trial）の行は一括で必ず失敗する
//   ・選択肢の連動     … 子はグループでしか出ない
//
// 毎回ここから作り直すので、**何度触っても同じ状態から始まります**（証跡が撮り直せる）。

export const groups = [
  { groupCode: 'G1', groupName: '第一グループ' },
  { groupCode: 'G2', groupName: '第二グループ' },
];

export const children = [
  { childCode: 'C11', childName: '子 1-1', groupCode: 'G1' },
  { childCode: 'C12', childName: '子 1-2', groupCode: 'G1' },
  { childCode: 'C21', childName: '子 2-1', groupCode: 'G2' },
  { childCode: 'C22', childName: '子 2-2', groupCode: 'G2' },
];

const KINDS = ['standard', 'special', 'trial'];

/** 1件ぶん。明細は件数を変えてある（畳み込みの打ち切りを見るため）。 */
function item(n) {
  const kind = KINDS[n % 3];
  const lineCount = (n % 4) + 2; // 2〜5本
  return {
    itemCode: `ITEM-${String(n).padStart(3, '0')}`,
    itemName: `網羅の ${n} 件目`,
    kind,
    amount: n * 500,
    approved: n % 2 === 0,
    groupCode: n % 2 === 0 ? 'G1' : 'G2',
    childCode: n % 2 === 0 ? 'C11' : 'C21',
    lines: Array.from({ length: lineCount }, (_, i) => ({
      lineName: `明細 ${n}-${i + 1}`,
      lineAmount: (i + 1) * 100 + n,
    })),
  };
}

/** 毎回まっさらに作り直す。 */
export const freshItems = () => Array.from({ length: 12 }, (_, i) => item(i + 1));

/** 帳票が読む明細（1行1件に開く）。 */
export const linesOf = (items) =>
  items.flatMap((one) =>
    one.lines.map((line) => ({
      itemCode: one.itemCode,
      lineName: line.lineName,
      lineAmount: line.lineAmount,
    })),
  );
