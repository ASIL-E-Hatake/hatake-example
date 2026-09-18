package io.example.order;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * Postgres への口。
 *
 * <p>hatake は DB を知らない（Repository の契約しか知らない）ので、ここは<b>この案件の
 * 都合</b>で書く。定義から決まるのは「どの項目を受け取るか」まで。
 */
@Component
public class Db {

    private final JdbcTemplate jdbc;

    public Db(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public JdbcTemplate jdbc() {
        return jdbc;
    }

    /** camelCase の項目名 → snake_case の列名（DB は業務システムの慣習に合わせる）。 */
    public static String columnOf(String field) {
        StringBuilder out = new StringBuilder();
        for (char c : field.toCharArray()) {
            if (Character.isUpperCase(c)) {
                out.append('_').append(Character.toLowerCase(c));
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** 列名 → 項目名（画面と定義は camelCase で話す）。 */
    public static String fieldOf(String column) {
        StringBuilder out = new StringBuilder();
        boolean up = false;
        for (char c : column.toCharArray()) {
            if (c == '_') {
                up = true;
            } else {
                out.append(up ? Character.toUpperCase(c) : c);
                up = false;
            }
        }
        return out.toString();
    }

    /**
     * 行を Map にする。
     *
     * <p><b>日付と日時は文字列のまま受け取る</b>。既定だと {@code java.sql.Date} /
     * {@code Timestamp} になり、時刻ぶんを落とすか足すかで日付がずれる。
     * {@code timestamptz} はさらに深刻で、μ秒が落ちると返した {@code updatedAt} を
     * そのまま送り返しても一致しない＝<b>必ず「他の人が先に更新しています」になる</b>
     * （同時更新の判定に使っているので致命的。1本目で実際に踏んだ）。
     * 画面にとって {@code updatedAt} は<b>見せる値ではなく合言葉</b>なので、
     * 字のまま往復させる。
     */
    public static final RowMapper<Map<String, Object>> ROW = (ResultSet rs, int index) -> {
        ResultSetMetaData meta = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            row.put(fieldOf(meta.getColumnLabel(i)), value(rs, meta, i));
        }
        return row;
    };

    private static Object value(ResultSet rs, ResultSetMetaData meta, int i) throws SQLException {
        int type = meta.getColumnType(i);
        if (type == Types.DATE || type == Types.TIMESTAMP || type == Types.TIMESTAMP_WITH_TIMEZONE) {
            return rs.getString(i);
        }
        return rs.getObject(i);
    }

    public List<Map<String, Object>> query(String sql, Object... params) {
        return jdbc.query(sql, ROW, params);
    }

    public Map<String, Object> one(String sql, Object... params) {
        List<Map<String, Object>> rows = query(sql, params);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int update(String sql, Object... params) {
        return jdbc.update(sql, params);
    }

    public int count(String sql, Object... params) {
        Integer counted = jdbc.queryForObject(sql, Integer.class, params);
        return counted == null ? 0 : counted;
    }

    /** 同じ形の行を並べ替えずに集める（このクラスの外で使う小さな助け）。 */
    public static List<Map<String, Object>> list(Iterable<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        rows.forEach(out::add);
        return out;
    }
}
