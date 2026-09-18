package io.example.order.web;

import io.example.order.Db;
import io.example.order.OrderStore;
import io.example.order.form.OrderQuery;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 受注を読む（フレームワーク無し版）。
 *
 * <p>hatake 版との差はここに出る:
 * <ul>
 *   <li>検索できる条件は {@link OrderQuery} の白名簿（定義からは来ない）</li>
 *   <li>返さない列は {@link ColumnRoles} の表（定義からは来ない）</li>
 * </ul>
 * どちらも<b>画面側にもう一度書く</b>ことになる。
 */
@RestController
@RequestMapping("/api/orders")
public class OrderQueryController {

    private final Db db;
    private final OrderStore orders;
    private final Sessions sessions;

    public OrderQueryController(Db db, OrderStore orders, Sessions sessions) {
        this.db = db;
        this.orders = orders;
        this.sessions = sessions;
    }

    @GetMapping
    public Map<String, Object> list(HttpServletRequest request) {
        User user = sessions.require(request);

        // 営業は自分の拠点のぶんだけ（画面には出てこない条件）。
        List<String> extraWhere = new ArrayList<>();
        List<Object> extraParams = new ArrayList<>();
        if (user.is("sales") && !user.is("clerk") && !user.is("manager")) {
            extraWhere.add("office_code = ?");
            extraParams.add(officeOf(user));
        }

        OrderQuery.Built built =
                OrderQuery.build("v_orders", paramsOf(request), extraWhere, extraParams);
        List<Map<String, Object>> rows = db.query(built.rows(), built.rowParams());
        return Map.of(
                "items", ColumnRoles.hide(rows, user),
                "totalCount", db.count(built.count(), built.countParams()));
    }

    @GetMapping("/{orderNo}")
    public Map<String, Object> one(HttpServletRequest request, @PathVariable String orderNo) {
        User user = sessions.require(request);
        Map<String, Object> record = orders.full(orderNo);
        if (record == null) {
            throw new Errors.NotFound("見つかりません");
        }
        if (user.is("sales") && !user.is("clerk") && !user.is("manager")
                && !officeOf(user).equals(String.valueOf(record.get("officeCode")))) {
            throw new Errors.Forbidden("ほかの拠点の受注は見られません");
        }
        return ColumnRoles.hide(List.of(record), user).get(0);
    }

    private String officeOf(User user) {
        Map<String, Object> row =
                db.one("select office_code from app_users where user_id = ?", user.userId());
        return row == null ? "" : String.valueOf(row.get("officeCode"));
    }

    /** 同じ名前が複数回来る形（`?orderStatus=draft&orderStatus=confirmed`）を保つ。 */
    private static Map<String, List<String>> paramsOf(HttpServletRequest request) {
        Map<String, List<String>> params = new LinkedHashMap<>();
        request.getParameterMap()
                .forEach((name, values) -> params.put(name, Arrays.asList(values)));
        return params;
    }
}
