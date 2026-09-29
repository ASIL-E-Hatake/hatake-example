import type { ExportSink, PrintSink } from "@hatake-fw/runtime";

/**
 * `type: export` のボタンが作った CSV を、どこへ出すか。
 *
 * **枠組みが持つのは CSV を組むところまで**（列も見出しも順番も定義から決まる）。
 * 利用者に届けるのはアプリの仕事なので、ここで受ける。
 *
 * ブラウザなので素直に落とす。実案件では共有フォルダに置く／メールで送る、に
 * なることもある —— **どれにするかは業務の決めごと**で、枠組みが決めることでは
 * ない（だから口だけが開いている）。
 *
 * 文字コードは**定義が言ったものを見る**。枠組みは変換しない（`charset` に
 * 何を求められているかだけを伝える）ので、cp932 が要るならここで変換する。
 * この見本は utf-8 のままで足りる。
 */
export const downloadCsv: ExportSink = (request) => {
  // **BOM は枠組みが要ると判断したときに既に入っている。** ここで足すと二重になる。
  const blob = new Blob([request.text], { type: request.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = request.filename;
  link.click();
  URL.revokeObjectURL(url);

  // 画面の試験が「出た」ことを見られるように、最後の1件を残す。
  // **業務には要らない**が、証跡を撮る側から見えるものが何も無いと確かめられない。
  (window as unknown as { hatakeLastExport?: unknown }).hatakeLastExport = {
    filename: request.filename,
    charset: request.charset,
    actionId: request.actionId,
    lines: request.text.split("\n").length,
  };
};

/**
 * `type: print` のボタンが組んだ紙を、どこへ出すか。
 *
 * 枠組みが組むのは**紙の中身**（改ページも小計も定義から決まる）。PDF にするか
 * プリンタに送るかはアプリの話。見本なので出たことだけを残す。
 */
export const showPrint: PrintSink = (request) => {
  (window as unknown as { hatakeLastPrint?: unknown }).hatakeLastPrint = {
    filename: request.filename,
    actionId: request.actionId,
  };
};
