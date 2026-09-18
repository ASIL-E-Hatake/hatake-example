package io.example.order;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 受注1件の読み書き（DB の都合だけを持つ）。
 *
 * <p>hatake は DB を知らないので、ヘッダと明細をどう置くか・採番をどう取るか・
 * 締めをどう見るかは<b>全部この案件の担当</b>。定義から決まるのは「どの項目を
 * 受け取るか」「何を検証するか」までで、そこは {@link Definition} 側が持つ。
 */
@Component
public class OrderStore {

    private final Db db;

    public OrderStore(Db db) {
        this.db = db;
    }

    /** 受注番号を採番する（前書きの `numbering` の答え＝サーバが採る）。 */
    public String nextOrderNo() {
        Map<String, Object> row = db.one(
                "select 'SO' || to_char(now(), 'YYYYMM')"
                        + " || lpad(nextval('order_no_seq')::text, 4, '0') as order_no");
        return String.valueOf(row.get("orderNo"));
    }

    /** ヘッダ1件（取引先名まで足したビューから）。無ければ null。 */
    public Map<String, Object> header(String orderNo) {
        return db.one("select * from v_orders where order_no = ?", orderNo);
    }

    /** 明細（行番号の順）。 */
    public List<Map<String, Object>> lines(String orderNo) {
        return db.query(
                "select * from v_order_lines where order_no = ? order by line_no", orderNo);
    }

    /** ヘッダ＋明細で1件のレコードにする（画面が受け取る形）。 */
    public Map<String, Object> full(String orderNo) {
        Map<String, Object> header = header(orderNo);
        if (header == null) {
            return null;
        }
        Map<String, Object> record = new LinkedHashMap<>(header);
        record.put("lines", lines(orderNo));
        return record;
    }

    /**
     * その月が締まっているか（前書き: 締めた月の受注は直せない）。
     *
     * <p>締めの在り処は<b>サーバ</b>で、画面は「直せない」という結果だけを見せる。
     */
    public boolean isClosed(Object orderDate) {
        String date = String.valueOf(orderDate);
        if (date.length() < 7) {
            return false;
        }
        return db.count("select count(*)::int from closed_months where month = ?",
                date.substring(0, 7)) > 0;
    }

    /** 明細を入れ替える（1件ぶんを消して入れ直す＝行番号の穴を作らない）。 */
    public void replaceLines(String orderNo, List<Map<String, Object>> lines) {
        db.update("delete from order_lines where order_no = ?", orderNo);
        int lineNo = 0;
        for (Map<String, Object> line : lines) {
            lineNo += 1;
            db.update(
                    "insert into order_lines"
                            + " (order_no, line_no, product_code, quantity, unit_price,"
                            + "  tax_rate, amount, cancelled)"
                            + " values (?, ?, ?, ?, ?, ?, ?, ?)",
                    orderNo,
                    lineNo,
                    line.get("productCode"),
                    line.get("quantity"),
                    line.get("unitPrice"),
                    line.get("taxRate"),
                    OrderTotals.amountOf(line),
                    Boolean.TRUE.equals(line.get("cancelled")));
        }
    }

    /**
     * 明細に<b>商品マスタの単価と税率を当てる</b>。
     *
     * <p>前書き: 「単価は商品マスタの定価を使う」。画面も同じものを出すが、
     * <b>送られてきた単価は信じない</b>（API を直接叩けば好きな単価を送れる）。
     */
    public List<Map<String, Object>> withMasterPrices(List<Map<String, Object>> lines) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> line : lines) {
            Map<String, Object> product = db.one(
                    "select unit_price, tax_rate from products where product_code = ?",
                    line.get("productCode"));
            Map<String, Object> copy = new LinkedHashMap<>(line);
            if (product != null) {
                copy.put("unitPrice", product.get("unitPrice"));
                copy.put("taxRate", product.get("taxRate"));
            }
            out.add(copy);
        }
        return out;
    }
}
