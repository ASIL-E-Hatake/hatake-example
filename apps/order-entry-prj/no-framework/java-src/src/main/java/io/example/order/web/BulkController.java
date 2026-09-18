package io.example.order.web;

import io.example.order.Db;
import io.example.order.OrderStore;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 一括（まとめて取り消す）— フレームワーク無し版。
 *
 * <p>中身（1件ずつ確定して失敗した行を返す）は hatake 版と<b>まったく同じ</b>。
 * 一括の中身はもともとアプリの担当なので、ここは枠組みの有無で変わらない。
 *
 * <p>変わるのは<b>上限の出どころ</b>。hatake 版は定義に書いた
 * `maxRows: { default: 50, byRole: { clerk: 20 } }` を画面もサーバも同じ所から読んで
 * いたが、この版は下の表と<b>画面側の同じ表</b>の2か所に書く。
 * 片方だけ直すと、画面では押せるのに API が弾く（またはその逆）。
 */
@RestController
@RequestMapping("/api/bulk")
public class BulkController {

    /** 押せる役割。 */
    private static final List<String> ALLOWED = List.of("clerk");

    /** 1回で動かせる行数。役割ごとの指定が優先。 */
    private static final int DEFAULT_LIMIT = 50;
    private static final Map<String, Integer> BY_ROLE = Map.of("clerk", 20);

    private final Db db;
    private final OrderStore orders;
    private final Sessions sessions;
    private final Audit audit;

    public BulkController(Db db, OrderStore orders, Sessions sessions, Audit audit) {
        this.db = db;
        this.orders = orders;
        this.sessions = sessions;
        this.audit = audit;
    }

    @PostMapping("/cancel")
    public Map<String, Object> cancel(
            HttpServletRequest request, @RequestBody Map<String, Object> body) {
        User user = sessions.require(request);
        ColumnRoles.require(user, ALLOWED.toArray(String[]::new));

        List<String> keys = keysOf(body);
        if (keys.isEmpty()) {
            throw new Errors.Invalid(List.of());
        }
        int limit = limitFor(user);
        if (keys.size() > limit) {
            // 文言も**画面側と揃える**（違うと、押した人が同じ操作で違う説明を見る）。
            throw new Errors.Conflict(
                    "1回に実行できるのは " + limit + " 件までです（" + keys.size() + " 件届きました）");
        }

        List<Map<String, Object>> rejected = new ArrayList<>();
        int succeeded = 0;
        for (String key : keys) {
            String reason = cancelOne(key);
            if (reason == null) {
                succeeded += 1;
            } else {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("key", key);
                row.put("reason", reason);
                rejected.add(row);
            }
        }

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("asked", keys.size());
        detail.put("succeeded", succeeded);
        audit.record(user, "bulkCancel", "orders", null, detail.toString());

        return Map.of("succeeded", succeeded, "rejected", rejected);
    }

    /** 当てはまる役割が複数あれば一番ゆるい方（役割は持っているほど広がる）。 */
    private static int limitFor(User user) {
        int widest = -1;
        for (String role : user.roles()) {
            Integer found = BY_ROLE.get(role);
            if (found != null) {
                widest = Math.max(widest, found);
            }
        }
        return widest >= 0 ? widest : DEFAULT_LIMIT;
    }

    /** 1件ぶん。通れば null、通らなければ押した人に分かる言葉で理由を返す。 */
    private String cancelOne(String orderNo) {
        Map<String, Object> current = orders.header(orderNo);
        if (current == null) {
            return "見つかりません";
        }
        if ("cancelled".equals(current.get("orderStatus"))) {
            return "すでに取消です";
        }
        if ("shipped".equals(current.get("orderStatus"))) {
            return "出荷済なので取り消せません";
        }
        if (orders.isClosed(current.get("orderDate"))) {
            return "締めた月なので取り消せません";
        }
        db.update(
                "update orders set order_status = 'cancelled', updated_at = now()"
                        + " where order_no = ?",
                orderNo);
        return null;
    }

    private static List<String> keysOf(Map<String, Object> body) {
        List<String> keys = new ArrayList<>();
        if (body.get("keys") instanceof List<?> list) {
            list.forEach(one -> keys.add(String.valueOf(one)));
        }
        return keys;
    }
}
