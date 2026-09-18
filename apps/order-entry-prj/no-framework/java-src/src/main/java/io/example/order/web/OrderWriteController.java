package io.example.order.web;

import io.example.order.Db;
import io.example.order.OrderStore;
import io.example.order.OrderTotals;
import io.example.order.form.CrossFieldRules;
import io.example.order.form.OrderRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Validator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 受注を書く（フレームワーク無し版）。
 *
 * <p>検証は2段になる。Bean Validation（注釈）が1つの項目を見て、
 * {@link CrossFieldRules} が項目をまたぐものを見る。**両方を通してから**でないと
 * 保存できないので、順番を間違えると片方が素通りする。
 *
 * <p>hatake 版はここが `validator.validate(form, record, mode)` の1行だった
 * （定義に書いた規則を、画面とまったく同じ順で全部回す）。
 */
@RestController
@RequestMapping("/api/orders")
public class OrderWriteController {

    private final Db db;
    private final OrderStore orders;
    private final Sessions sessions;
    private final Audit audit;
    private final Validator validator;

    public OrderWriteController(
            Db db, OrderStore orders, Sessions sessions, Audit audit, Validator validator) {
        this.db = db;
        this.orders = orders;
        this.sessions = sessions;
        this.audit = audit;
        this.validator = validator;
    }

    @PostMapping
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(
            HttpServletRequest request, @RequestBody OrderRequest body) {
        User user = sessions.require(request);
        ColumnRoles.require(user, "sales", "clerk");
        reject(CrossFieldRules.checkAll(validator, body));

        String orderNo = orders.nextOrderNo();
        List<Map<String, Object>> lines = orders.withMasterPrices(linesOf(body));
        OrderTotals.Totals totals = OrderTotals.of(lines);

        db.update(
                "insert into orders (order_no, customer_code, order_date, due_date, order_status,"
                        + " sales_person_name, delivery_place, note, office_code,"
                        + " subtotal_amount, tax_amount, total_amount, line_count,"
                        + " created_by, created_at, updated_at)"
                        + " values (?, ?, ?::date, ?::date, 'draft', ?, ?, ?, ?, ?, ?, ?, ?,"
                        + " ?, now(), now())",
                orderNo,
                body.customerCode(),
                body.orderDate(),
                body.dueDate(),
                body.salesPersonName(),
                body.deliveryPlace(),
                body.note(),
                officeOf(user),
                totals.subtotalAmount(),
                totals.taxAmount(),
                totals.totalAmount(),
                totals.lineCount(),
                user.userId());
        orders.replaceLines(orderNo, lines);
        audit.record(user, "create", "orders", orderNo, null);
        return orders.full(orderNo);
    }

    @PutMapping("/{orderNo}")
    @Transactional
    public Map<String, Object> update(
            HttpServletRequest request,
            @PathVariable String orderNo,
            @RequestBody OrderRequest body) {
        User user = sessions.require(request);
        ColumnRoles.require(user, "sales", "clerk");

        Map<String, Object> current = orders.header(orderNo);
        if (current == null) {
            throw new Errors.NotFound("見つかりません");
        }
        if (user.is("sales") && !user.is("clerk")
                && !officeOf(user).equals(String.valueOf(current.get("officeCode")))) {
            throw new Errors.Forbidden("ほかの拠点の受注は直せません");
        }
        if (orders.isClosed(current.get("orderDate"))) {
            throw new Errors.Conflict("締めた月の受注は直せません");
        }
        if ("cancelled".equals(current.get("orderStatus"))) {
            throw new Errors.Conflict("取り消した受注は直せません");
        }
        reject(CrossFieldRules.checkAll(validator, body));

        List<Map<String, Object>> lines = orders.withMasterPrices(linesOf(body));
        OrderTotals.Totals totals = OrderTotals.of(lines);

        Object seen = body.updatedAt();
        int changed = db.update(
                "update orders set customer_code = ?, order_date = ?::date, due_date = ?::date,"
                        + " sales_person_name = ?, delivery_place = ?, note = ?,"
                        + " subtotal_amount = ?, tax_amount = ?, total_amount = ?, line_count = ?,"
                        + " updated_at = now()"
                        + " where order_no = ?"
                        + "   and (?::timestamptz is null or updated_at = ?::timestamptz)",
                body.customerCode(),
                body.orderDate(),
                body.dueDate(),
                body.salesPersonName(),
                body.deliveryPlace(),
                body.note(),
                totals.subtotalAmount(),
                totals.taxAmount(),
                totals.totalAmount(),
                totals.lineCount(),
                orderNo,
                seen,
                seen);
        if (changed == 0) {
            throw new Errors.Conflict("ほかの人が先に更新しています。読み直してください");
        }
        orders.replaceLines(orderNo, lines);
        audit.record(user, "update", "orders", orderNo, null);
        return orders.full(orderNo);
    }

    @DeleteMapping("/{orderNo}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(HttpServletRequest request, @PathVariable String orderNo) {
        User user = sessions.require(request);
        ColumnRoles.require(user, "clerk");
        Map<String, Object> current = orders.header(orderNo);
        if (current == null) {
            throw new Errors.NotFound("見つかりません");
        }
        if (orders.isClosed(current.get("orderDate"))) {
            throw new Errors.Conflict("締めた月の受注は取り消せません");
        }
        db.update(
                "update orders set order_status = 'cancelled', updated_at = now()"
                        + " where order_no = ?",
                orderNo);
        audit.record(user, "cancel", "orders", orderNo, null);
    }

    // **返る形が1つになった。** `@Valid` に任せていたときは、注釈が弾いたときだけ
    // Spring の既定の形で返り、項目をまたぐ規則で弾いたときはこちらの形で返っていた
    // ＝画面が2つの形を読む羽目になる。自分で集めるようにして、その手当ても消えた。

    private static void reject(List<CrossFieldRules.Error> errors) {
        if (!errors.isEmpty()) {
            throw new Errors.Invalid(errors);
        }
    }

    private static List<Map<String, Object>> linesOf(OrderRequest body) {
        List<Map<String, Object>> lines = new ArrayList<>();
        for (OrderRequest.OrderLineRequest line : body.lines()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("productCode", line.productCode());
            row.put("quantity", line.quantity());
            row.put("unitPrice", line.unitPrice());
            row.put("cancelled", Boolean.TRUE.equals(line.cancelled()));
            lines.add(row);
        }
        return lines;
    }

    private String officeOf(User user) {
        Map<String, Object> row =
                db.one("select office_code from app_users where user_id = ?", user.userId());
        return row == null ? "" : String.valueOf(row.get("officeCode"));
    }
}
