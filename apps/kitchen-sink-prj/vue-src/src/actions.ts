import type { ActionContext, ActionHandler } from "@hatake-fw/runtime";
import { ActionOutcome } from "@hatake-fw/runtime";

/**
 * 定義が `plugin:` と言っている中身。Flutter 版（`bulk_actions.dart`）と同じもの。
 *
 * 網羅アプリなので業務は持たない。**確かめたいのは渡され方**:
 *
 * | 定義に書いたもの | ここに届くもの |
 * |---|---|
 * | `prompt.fields` | `context.input`（押す前に聞いた値） |
 * | `scope: selection` | `context.records`（選んだ行） |
 * | `batchSize` | **区切って何度も呼ばれる**（1回ぶんずつ届く） |
 * | `onError` の `{failedKeys}` | `ActionOutcome.rejected({ rows })` に入れた行 |
 *
 * `batchSize` が効いているかは**呼ばれた回数**で分かる。区切りが効いていれば
 * 12件を選んで（区切り5で）3回呼ばれ、効いていなければ1回で全部届く。
 */
export interface BatchCounter {
  calls: number;
  rows: number;
  /**
   * 変わったと知らせる口。**入れなくても動く。**
   *
   * Vue 版は入れ物を `reactive` で包むだけで画面が追いつくが、React は「変わった」と
   * 言われないと描き直さない。枠組みの話ではなく**描く側の作法の違い**なので、
   * 業務のコード（この file）は口を1つ開けておくだけにして、繋ぐのは各版の `main`。
   */
  onChange?: () => void;
}

export const newCounter = (): BatchCounter => ({ calls: 0, rows: 0 });

export const bulkAction =
  (baseUrl: string, path: string, counter: BatchCounter): ActionHandler =>
  async (context: ActionContext) => {
    counter.calls += 1;
    counter.rows += context.records.length;
    counter.onChange?.();

    const keys = context.records
      .map((row) => row.itemCode)
      .filter((one) => one !== undefined && one !== null)
      .map(String);

    const response = await fetch(`${baseUrl}/bulk/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 押す前に聞いた値。`prompt` を書いていないボタンでは空。
      body: JSON.stringify({ keys, input: context.input }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(body.message ?? "処理できませんでした"));
    }

    const rejected = Array.isArray(body.rejected) ? body.rejected : [];
    if (rejected.length === 0) return;

    // **通らなかった行を名指しする。** 数だけ返すと、現場は全部やり直すことになる
    // （名指しできれば、その行だけ直せる ——`{failedKeys}` に入る）。
    context.report(
      ActionOutcome.rejected({
        succeeded: context.records.length - rejected.length,
        rows: rejected.map((one) => {
          const row = one as Record<string, unknown>;
          return { key: row.key, reason: row.reason === undefined ? undefined : String(row.reason) };
        }),
      }),
    );
  };
