package io.example.order.web;

import io.example.order.Db;
import io.example.order.Definition;
import io.example.order.Sql;
import io.hatake.core.QueryBuilder;
import io.hatake.core.QuerySpec;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 注文請書（帳票）が読む明細。
 *
 * <p>帳票は<b>明細を1行1件で刷る</b>ので、ヘッダではなく明細の出どころを見る
 * （定義の {@code repository: orderLineRepository}）。並べ替えとグループは
 * 定義の {@code report.sort} / {@code groupBy} が決めるが、<b>並んだ行を返すのは
 * こちら</b>（コントロールブレイクなので、並んでいないと小計が壊れる）。
 *
 * <p>前書きの {@code report-source} の答え: 刷った時点の値を読む（締めた月は直せない
 * ので、確定後は変わらない）。
 */
@RestController
public class OrderLineController {

    private final Db db;
    private final Definition definition;
    private final Sessions sessions;

    public OrderLineController(Db db, Definition definition, Sessions sessions) {
        this.db = db;
        this.definition = definition;
        this.sessions = sessions;
    }

    @GetMapping("/api/order-lines")
    public Map<String, Object> list(
            HttpServletRequest request, @RequestParam Map<String, String> params) {
        User user = sessions.require(request);
        Authz.require(user, "clerk", "manager");

        QuerySpec spec = QueryBuilder.build(
                definition.page("order_slip").search(), new LinkedHashMap<>(params));
        // 取り消した受注は刷らない（紙は取引先に送るもの）。定義には書けない決めごと。
        Sql.Built built = Sql.of(
                "v_order_lines",
                definition.page("order_slip").search(),
                spec,
                List.of("order_status <> ?"),
                List.of("cancelled"));
        List<Map<String, Object>> rows = db.query(built.rows(), built.rowParams());
        return Map.of("items", rows, "totalCount", db.count(built.count(), built.countParams()));
    }
}
