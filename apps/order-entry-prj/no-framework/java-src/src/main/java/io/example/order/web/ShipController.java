package io.example.order.web;

import io.example.order.Db;
import io.example.order.OrderStore;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 出荷指示を基幹システムへ投げる。<b>枠組みの外</b>（前書きの {@code shipmentGateway}）。
 *
 * <p>前書きにこう書いてある: 「出荷指示は基幹システムの担当。こちらからは投げるだけで、
 * 結果は持たない」。だからここがやるのは<b>投げたことを残す</b>までで、
 * 相手が何をしたかは追いかけない（追いかけると、相手の都合がこちらの画面に漏れる）。
 *
 * <p>この見本では相手のシステムが無いので、投げた記録を監査に残して状態を「出荷済」に
 * するところまでを置いている。実物に差し替えるのはこのクラス1枚。
 */
@RestController
public class ShipController {

    private final Db db;
    private final OrderStore orders;
    private final Sessions sessions;
    private final Audit audit;

    public ShipController(Db db, OrderStore orders, Sessions sessions, Audit audit) {
        this.db = db;
        this.orders = orders;
        this.sessions = sessions;
        this.audit = audit;
    }

    @PostMapping("/api/orders/{orderNo}/ship")
    public Map<String, Object> ship(HttpServletRequest request, @PathVariable String orderNo) {
        User user = sessions.require(request);
        ColumnRoles.require(user, "clerk", "manager");

        Map<String, Object> current = orders.header(orderNo);
        if (current == null) {
            throw new Errors.NotFound("見つかりません");
        }
        if ("cancelled".equals(current.get("orderStatus"))) {
            throw new Errors.Conflict("取り消した受注は出荷指示できません");
        }
        if ("shipped".equals(current.get("orderStatus"))) {
            throw new Errors.Conflict("すでに出荷指示済みです");
        }

        // ここで基幹システムに投げる（この見本では投げた記録だけ）。
        audit.record(user, "ship", "orders", orderNo, "基幹システムへ出荷指示");
        db.update(
                "update orders set order_status = 'shipped', updated_at = now()"
                        + " where order_no = ?",
                orderNo);
        return orders.full(orderNo);
    }
}
