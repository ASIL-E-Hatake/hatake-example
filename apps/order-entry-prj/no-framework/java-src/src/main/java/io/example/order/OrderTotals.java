package io.example.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 受注1件の金額を出す。
 *
 * <p><b>ここが `Tax.computeInvoice` の代わり。</b> hatake 版では枠組みが持っている
 * 適格請求書の数え方をそのまま呼んでいたので、アプリが書くのは「取り消した行を外す」
 * だけだった。この版では<b>数え方そのものを書く</b>:
 *
 * <ol>
 *   <li>税率ごとに金額を畳む</li>
 *   <li>税率ごとに<b>1回だけ</b>丸める（明細ごとに丸めると請求書と1円ずれる）</li>
 *   <li>丸めた税額を足す</li>
 * </ol>
 *
 * <p>そして<b>画面側にも同じものを書く</b>（`no-framework/flutter-src/lib/totals.dart`）。
 * 2つが同じ答えを出すことは、誰も保証してくれない。
 */
public final class OrderTotals {

    /** 小計・消費税・合計・明細行数。 */
    public record Totals(long subtotalAmount, long taxAmount, long totalAmount, int lineCount) {
    }

    private OrderTotals() {
    }

    /** 取り消した行は数えない（絞らないと業務の合計にならない）。 */
    public static Totals of(List<Map<String, Object>> lines) {
        // 税率 → その税率ぶんの金額。**並び順を保つ**（同じ入力なら同じ答えにする）。
        Map<BigDecimal, Long> byRate = new LinkedHashMap<>();
        long subtotal = 0;
        int count = 0;

        for (Map<String, Object> line : lines) {
            if (Boolean.TRUE.equals(line.get("cancelled"))) {
                continue;
            }
            long amount = amountOf(line);
            BigDecimal rate = num(line.get("taxRate"));
            subtotal += amount;
            count += 1;
            byRate.merge(rate, amount, Long::sum);
        }

        long tax = 0;
        for (Map.Entry<BigDecimal, Long> entry : byRate.entrySet()) {
            // 切り捨て（この案件の決めごと）。税率ごとに**1回だけ**。
            tax += BigDecimal.valueOf(entry.getValue())
                    .multiply(entry.getKey())
                    .setScale(0, RoundingMode.FLOOR)
                    .longValue();
        }
        return new Totals(subtotal, tax, subtotal + tax, count);
    }

    /** 明細1行の金額 = 数量 × 単価。 */
    public static long amountOf(Map<String, Object> line) {
        return num(line.get("quantity")).multiply(num(line.get("unitPrice"))).longValue();
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
