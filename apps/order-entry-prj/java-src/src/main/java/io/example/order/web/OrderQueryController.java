package io.example.order.web;

import io.example.order.Db;
import io.example.order.Definition;
import io.example.order.OrderStore;
import io.example.order.Sql;
import io.hatake.core.QueryBuilder;
import io.hatake.core.QuerySpec;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 受注を読む。
 *
 * <p>定義から決まるもの:
 * <ul>
 *   <li>検索できる条件 … {@link QueryBuilder}（<b>書いていない項目は無視</b>＝
 *       任意の項目で検索されない）</li>
 *   <li>返さない列 … {@code table.columns[].roles}（{@link Authz#hideColumns}）</li>
 * </ul>
 *
 * <p>返す形は <b>{@code hatake_http}（Flutter の REST アダプタ）の契約</b>に合わせる:
 * 一覧は {@code {items, totalCount}}、1件はレコードそのまま（無ければ 404）。
 */
@RestController
@RequestMapping("/api/orders")
public class OrderQueryController {

    private final Db db;
    private final Definition definition;
    private final OrderStore orders;
    private final Sessions sessions;

    public OrderQueryController(
            Db db, Definition definition, OrderStore orders, Sessions sessions) {
        this.db = db;
        this.definition = definition;
        this.orders = orders;
        this.sessions = sessions;
    }

    @GetMapping
    public Map<String, Object> list(
            HttpServletRequest request, @RequestParam Map<String, String> params) {
        User user = sessions.require(request);
        QuerySpec spec = QueryBuilder.build(
                definition.page("order_search").search(), asQuery(request, params));

        // **定義の外から足す条件**。営業は自分の拠点のぶんだけ（前書きの決めごと）。
        // 画面にはこの条件が出てこない＝画面で隠すのではなく、**そもそも来ない**。
        List<String> extraWhere = new ArrayList<>();
        List<Object> extraParams = new ArrayList<>();
        if (user.is("sales") && !user.is("clerk") && !user.is("manager")) {
            extraWhere.add("office_code = ?");
            extraParams.add(officeOf(user));
        }

        Sql.Built built = Sql.of(
                "v_orders", definition.page("order_search").search(), spec, extraWhere, extraParams);
        List<Map<String, Object>> rows = db.query(built.rows(), built.rowParams());
        return Map.of(
                "items", Authz.hideColumns(definition.columnRoles("order_search"), rows, user),
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
        return Authz.hideColumns(definition.columnRoles("order_search"), List.of(record), user)
                .get(0);
    }

    /** 拠点はトークンには入れていないので、その都度引く（役割だけが合言葉）。 */
    private String officeOf(User user) {
        Map<String, Object> row =
                db.one("select office_code from app_users where user_id = ?", user.userId());
        return row == null ? "" : String.valueOf(row.get("officeCode"));
    }

    /**
     * 受け取った問い合わせをそのまま渡す。
     *
     * <p><b>ここで先回りして整えない</b>＝整え方が定義側と食い違うと、画面と API で
     * 違う結果が出る。同じ名前が複数回来る形（`?orderStatus=draft&orderStatus=confirmed`）
     * だけは Spring が1つに畳んでしまうので、並びに戻す。
     */
    private static Map<String, Object> asQuery(
            HttpServletRequest request, Map<String, String> params) {
        Map<String, Object> query = new LinkedHashMap<>();
        for (String name : params.keySet()) {
            String[] values = request.getParameterValues(name);
            query.put(name, values != null && values.length > 1 ? List.of(values) : params.get(name));
        }
        return query;
    }
}
