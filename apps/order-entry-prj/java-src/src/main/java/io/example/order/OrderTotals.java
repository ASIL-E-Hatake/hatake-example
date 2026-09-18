package io.example.order;

import io.hatake.core.Tax;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 受注1件の金額を出す。<b>保存する値の正はここ</b>（画面も同じ数を出すが、通るのは
 * この値）。
 *
 * <p>丸めは業務の決めごとなので定義には書けない（前書きの {@code rounding} の答え＝
 * 切り捨て・伝票単位で1回）。ただし<b>軽減税率の商品が混ざる</b>ので、正確には
 * 「税率ごとに畳んで、税率ごとに1回だけ丸める」。これは枠組みの
 * {@link Tax#computeInvoice} がそのままやってくれる（適格請求書の数え方）。
 *
 * <p>画面側（Flutter）は同じ {@code computeTax} / {@code computeInvoice} を
 * 計算項目 {@code op: tax} から呼ぶ＝<b>3版が同じ出力</b>なので、画面の数字と
 * 保存された数字がずれない。
 */
public final class OrderTotals {

    /** 小計・消費税・合計・明細行数。 */
    public record Totals(long subtotalAmount, long taxAmount, long totalAmount, int lineCount) {
    }

    /** 端数は切り捨て（前書きの `rounding` の答え）。 */
    private static final String ROUNDING = "floor";

    private OrderTotals() {
    }

    /** 取り消した行は数えない（絞らないと業務の合計にならない）。 */
    public static Totals of(List<Map<String, Object>> lines) {
        List<Tax.InvoiceLine> taxable = new ArrayList<>();
        long subtotal = 0;
        int count = 0;
        for (Map<String, Object> line : lines) {
            if (Boolean.TRUE.equals(line.get("cancelled"))) {
                continue;
            }
            long amount = amountOf(line);
            subtotal += amount;
            count += 1;
            taxable.add(new Tax.InvoiceLine(amount, rateOf(line)));
        }
        long tax = Tax.computeInvoice(taxable, false, ROUNDING).total().tax();
        return new Totals(subtotal, tax, subtotal + tax, count);
    }

    /** 明細1行の金額 = 数量 × 単価（画面の計算項目と同じ式）。 */
    public static long amountOf(Map<String, Object> line) {
        return num(line.get("quantity")).multiply(num(line.get("unitPrice"))).longValue();
    }

    private static double rateOf(Map<String, Object> line) {
        return num(line.get("taxRate")).doubleValue();
    }

    private static BigDecimal num(Object value) {
        if (value instanceof BigDecimal d) {
            return d;
        }
        if (value instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        if (value instanceof String s && !s.isBlank()) {
            return new BigDecimal(s.trim());
        }
        return BigDecimal.ZERO;
    }
}
