package io.example.order;

import io.hatake.core.FilterDefinition;
import io.hatake.core.QuerySpec;
import io.hatake.core.SearchDefinition;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link QuerySpec} を SQL に落とす。ここは<b>この案件の都合</b>（hatake は SQL を
 * 知らない）。
 *
 * <p>要点は「渡された名前をそのまま SQL に入れない」こと。条件も並べ替えも
 * <b>定義に書いてある項目だけ</b>が {@link QuerySpec} に入ってくるので、
 * ここに来た時点で名前は安全。値だけをプレースホルダで渡す。
 *
 * <p><b>値の型も定義から決める。</b> 問い合わせ文字列で届く値はぜんぶ文字なので、
 * そのまま渡すと Postgres が「bigint と text は比べられない」と言って落ちる
 * （`?between 5000 and 11000` で実際に 500 になった）。かといって「数字に見えたら
 * 数にする」と当てにいくと、`0001` のような文字コードを壊す。定義の
 * {@code filters[].type} が答えを持っているので、そこから受け取って
 * {@code ?::numeric} / {@code ?::date} を付ける。
 */
public final class Sql {

    /** 組み立てた SQL と、その引数。 */
    public record Built(String rows, String count, Object[] rowParams, Object[] countParams) {
    }

    private Sql() {
    }

    public static Built of(String table, SearchDefinition search, QuerySpec spec) {
        return of(table, search, spec, List.of(), List.of());
    }

    /** {@code extraWhere} は定義の外から足す条件（自分の拠点だけ、など）。 */
    public static Built of(
            String table,
            SearchDefinition search,
            QuerySpec spec,
            List<String> extraWhere,
            List<Object> extraParams) {
        Map<String, String> castOf = castsOf(search);
        List<String> where = new ArrayList<>(extraWhere);
        List<Object> params = new ArrayList<>(extraParams);

        for (QuerySpec.Condition one : spec.conditions()) {
            String column = "\"" + Db.columnOf(one.field()) + "\"";
            String mark = castOf.getOrDefault(one.field(), "?");
            switch (one.operator()) {
                case "contains" -> {
                    params.add("%" + one.value() + "%");
                    where.add(column + " ilike ?");
                }
                case "between" -> {
                    List<?> range = (List<?>) one.value();
                    params.add(range.get(0));
                    params.add(range.get(1));
                    where.add(column + " between " + mark + " and " + mark);
                }
                case "in" -> {
                    List<?> values = one.value() instanceof List<?> l ? l : List.of(one.value());
                    List<String> marks = new ArrayList<>();
                    for (Object value : values) {
                        params.add(value);
                        marks.add(mark);
                    }
                    where.add(column + " in (" + String.join(", ", marks) + ")");
                }
                default -> {
                    params.add(one.value());
                    where.add(column + " = " + mark);
                }
            }
        }

        String clause = where.isEmpty() ? "" : " where " + String.join(" and ", where);
        String order = spec.sortField() == null
                ? ""
                : " order by \"" + Db.columnOf(spec.sortField()) + "\""
                        + (spec.sortAscending() ? " asc" : " desc");

        Object[] countParams = params.toArray();
        params.add(spec.pageSize());
        params.add(spec.page() * spec.pageSize());
        return new Built(
                "select * from " + table + clause + order + " limit ? offset ?",
                "select count(*)::int from " + table + clause,
                params.toArray(),
                countParams);
    }

    /**
     * 項目名 → プレースホルダ（型が要るものだけ `?::型`）。
     *
     * <p>文字は付けない（{@code ?} のまま）＝付けると `'0001'` のような値を壊す。
     */
    private static Map<String, String> castsOf(SearchDefinition search) {
        Map<String, String> casts = new LinkedHashMap<>();
        for (FilterDefinition filter : search.filters()) {
            String cast = switch (filter.type() == null ? "text" : filter.type()) {
                case "number" -> "?::numeric";
                case "date" -> "?::date";
                case "dateTime" -> "?::timestamptz";
                default -> "?";
            };
            casts.put(filter.field(), cast);
        }
        return casts;
    }
}
