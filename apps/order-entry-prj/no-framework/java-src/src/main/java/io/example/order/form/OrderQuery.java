package io.example.order.form;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 受注照会の検索条件を SQL にする。
 *
 * <p><b>ここが `QueryBuilder` の代わり。</b> hatake 版では定義の `search.filters` から
 * 「どの項目で・どう絞れるか」が決まるので、サーバは
 * {@code QueryBuilder.build(page.search(), params)} の1行で済んだ。この版では
 *
 * <ul>
 *   <li>通す項目の<b>白名簿</b>（書かないと任意の列で検索されてしまう）</li>
 *   <li>項目ごとの<b>比べ方</b>（等しい / 含む / 範囲 / どれか）</li>
 *   <li>項目ごとの<b>型</b>（数と日付はキャストが要る）</li>
 *   <li>並べ替えに使ってよい列（渡された名前をそのまま SQL に入れない）</li>
 * </ul>
 *
 * を全部ここに書く。そして<b>画面の検索欄はこれとは別に組む</b>ので、
 * 「画面には出ているのにサーバが見ていない条件」が作れてしまう（作っても誰も言わない）。
 */
public final class OrderQuery {

    /** 1つの条件の書き方。 */
    private record Rule(String column, String operator, String cast) {
    }

    /**
     * 通す条件（白名簿）。
     *
     * <p>ここに書いていない問い合わせは<b>黙って無視する</b>（hatake 版と同じふるまい）。
     */
    private static final Map<String, Rule> RULES = Map.of(
            "orderNo", new Rule("order_no", "equals", "?"),
            "customerCode", new Rule("customer_code", "equals", "?"),
            "orderDate", new Rule("order_date", "between", "?::date"),
            "dueDate", new Rule("due_date", "between", "?::date"),
            "orderStatus", new Rule("order_status", "in", "?"),
            "totalAmount", new Rule("total_amount", "between", "?::numeric"));

    /** 並べ替えに使ってよい項目 → 列。 */
    private static final Map<String, String> SORTABLE = Map.of(
            "orderNo", "order_no",
            "customerName", "customer_name",
            "orderDate", "order_date",
            "dueDate", "due_date",
            "totalAmount", "total_amount");

    private static final int DEFAULT_PAGE_SIZE = 50;

    /** 組み立てた SQL と、その引数。 */
    public record Built(String rows, String count, Object[] rowParams, Object[] countParams) {
    }

    private OrderQuery() {
    }

    public static Built build(
            String table,
            Map<String, List<String>> params,
            List<String> extraWhere,
            List<Object> extraParams) {
        List<String> where = new ArrayList<>(extraWhere);
        List<Object> values = new ArrayList<>(extraParams);

        for (Map.Entry<String, Rule> entry : RULES.entrySet()) {
            List<String> given = params.get(entry.getKey());
            if (given == null || given.isEmpty() || given.get(0).isBlank()) {
                continue;
            }
            Rule rule = entry.getValue();
            String column = "\"" + rule.column() + "\"";
            switch (rule.operator()) {
                case "contains" -> {
                    values.add("%" + given.get(0) + "%");
                    where.add(column + " ilike ?");
                }
                case "between" -> {
                    // 片方だけ来ることもある（「以上」だけ入れた、など）。
                    String from = given.get(0);
                    String to = given.size() > 1 ? given.get(1) : null;
                    if (to == null || to.isBlank()) {
                        values.add(from);
                        where.add(column + " >= " + rule.cast());
                    } else {
                        values.add(from);
                        values.add(to);
                        where.add(column + " between " + rule.cast() + " and " + rule.cast());
                    }
                }
                case "in" -> {
                    List<String> marks = new ArrayList<>();
                    for (String one : given) {
                        values.add(one);
                        marks.add(rule.cast());
                    }
                    where.add(column + " in (" + String.join(", ", marks) + ")");
                }
                default -> {
                    values.add(given.get(0));
                    where.add(column + " = " + rule.cast());
                }
            }
        }

        String clause = where.isEmpty() ? "" : " where " + String.join(" and ", where);

        String sortField = first(params, "sortField");
        String sortColumn = sortField == null ? null : SORTABLE.get(sortField);
        // **文字列で届く**（`?sortAscending=false`）ので、真偽に直す。
        String asked = first(params, "sortAscending");
        boolean ascending = !"false".equals(asked);
        String order = sortColumn == null
                ? ""
                : " order by \"" + sortColumn + "\"" + (ascending ? " asc" : " desc");

        int pageSize = intOf(first(params, "pageSize"), DEFAULT_PAGE_SIZE);
        int page = intOf(first(params, "page"), 0);

        Object[] countParams = values.toArray();
        values.add(pageSize);
        values.add(page * pageSize);
        return new Built(
                "select * from " + table + clause + order + " limit ? offset ?",
                "select count(*)::int from " + table + clause,
                values.toArray(),
                countParams);
    }

    private static String first(Map<String, List<String>> params, String name) {
        List<String> given = params.get(name);
        return given == null || given.isEmpty() ? null : given.get(0);
    }

    private static int intOf(String value, int fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
