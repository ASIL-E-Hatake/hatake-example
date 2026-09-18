package io.example.order.web;

import io.example.order.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 注文請書（帳票）が読む明細 — フレームワーク無し版。
 *
 * <p>帳票の出力条件も白名簿で書く。hatake 版では定義の
 * `search.filters` がそのまま条件になっていた所。
 */
@RestController
public class OrderLineController {

    private final Db db;
    private final Sessions sessions;

    public OrderLineController(Db db, Sessions sessions) {
        this.db = db;
        this.sessions = sessions;
    }

    @GetMapping("/api/order-lines")
    public Map<String, Object> list(
            HttpServletRequest request,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) List<String> orderDate,
            @RequestParam(required = false, defaultValue = "200") int pageSize) {
        User user = sessions.require(request);
        ColumnRoles.require(user, "clerk", "manager");

        StringBuilder where = new StringBuilder(" where order_status <> 'cancelled'");
        List<Object> params = new java.util.ArrayList<>();
        if (orderNo != null && !orderNo.isBlank()) {
            where.append(" and order_no = ?");
            params.add(orderNo);
        }
        if (orderDate != null && !orderDate.isEmpty() && !orderDate.get(0).isBlank()) {
            if (orderDate.size() > 1 && !orderDate.get(1).isBlank()) {
                where.append(" and order_date between ?::date and ?::date");
                params.add(orderDate.get(0));
                params.add(orderDate.get(1));
            } else {
                where.append(" and order_date >= ?::date");
                params.add(orderDate.get(0));
            }
        }
        Object[] countParams = params.toArray();
        params.add(pageSize);
        List<Map<String, Object>> rows = db.query(
                "select * from v_order_lines" + where + " order by order_no, line_no limit ?",
                params.toArray());
        return Map.of(
                "items", rows,
                "totalCount", db.count("select count(*)::int from v_order_lines" + where, countParams));
    }
}
