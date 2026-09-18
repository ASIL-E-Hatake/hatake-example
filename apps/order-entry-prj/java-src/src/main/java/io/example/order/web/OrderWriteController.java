package io.example.order.web;

import io.example.order.Db;
import io.example.order.Definition;
import io.example.order.OrderStore;
import io.example.order.OrderTotals;
import io.hatake.core.FieldDefinition;
import io.hatake.core.FormDefinition;
import io.hatake.core.FormValidator;
import io.hatake.core.PageDefinition;
import io.hatake.core.SectionDefinition;
import io.hatake.core.WizardStepDefinition;
import jakarta.servlet.http.HttpServletRequest;
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
 * 受注を書く。
 *
 * <p>ここが「画面と同じ定義でサーバでも検証する」の実物（前書きの
 * {@code validation-server} の答え）。画面の検証は<b>親切</b>であって守りではない＝
 * API を直接叩けば通ってしまうので、同じ {@code form} を同じ {@link FormValidator} に
 * 通す。ウィザードはステップごとに区画を作れば、そのまま1枚のフォームとして見られる
 * （{@link WizardStepDefinition#form()} と同じ組み立て）。
 */
@RestController
@RequestMapping("/api/orders")
public class OrderWriteController {

    private static final String PAGE = "order_entry";

    private final Db db;
    private final Definition definition;
    private final OrderStore orders;
    private final Sessions sessions;
    private final Audit audit;
    private final FormValidator validator = new FormValidator();

    public OrderWriteController(
            Db db, Definition definition, OrderStore orders, Sessions sessions, Audit audit) {
        this.db = db;
        this.definition = definition;
        this.orders = orders;
        this.sessions = sessions;
        this.audit = audit;
    }

    @PostMapping
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(
            HttpServletRequest request, @RequestBody Map<String, Object> body) {
        User user = sessions.require(request);
        Authz.require(user, "sales", "clerk");

        Map<String, Object> record = accept(body, "create");
        // 受注番号は**入れさせない**（前書きの numbering の答え）。送られてきても捨てる。
        String orderNo = orders.nextOrderNo();
        List<Map<String, Object>> lines = orders.withMasterPrices(linesOf(record));
        OrderTotals.Totals totals = OrderTotals.of(lines);

        db.update(
                "insert into orders (order_no, customer_code, order_date, due_date, order_status,"
                        + " sales_person_name, delivery_place, note, office_code,"
                        + " subtotal_amount, tax_amount, total_amount, line_count,"
                        + " created_by, created_at, updated_at)"
                        + " values (?, ?, ?::date, ?::date, 'draft', ?, ?, ?, ?, ?, ?, ?, ?,"
                        + " ?, now(), now())",
                orderNo,
                record.get("customerCode"),
                record.get("orderDate"),
                record.get("dueDate"),
                record.get("salesPersonName"),
                record.get("deliveryPlace"),
                record.get("note"),
                officeOf(user),
                totals.subtotalAmount(),
                totals.taxAmount(),
                totals.totalAmount(),
                totals.lineCount(),
                user.userId());
        orders.replaceLines(orderNo, lines);
        audit.record(user, "create", "orders", orderNo, null);
        // **作ったレコードを返す**（契約。画面はこれで手元を入れ替える）。
        return orders.full(orderNo);
    }

    @PutMapping("/{orderNo}")
    @Transactional
    public Map<String, Object> update(
            HttpServletRequest request,
            @PathVariable String orderNo,
            @RequestBody Map<String, Object> body) {
        User user = sessions.require(request);
        Authz.require(user, "sales", "clerk");

        Map<String, Object> current = orders.header(orderNo);
        if (current == null) {
            throw new Errors.NotFound("見つかりません");
        }
        if (user.is("sales") && !user.is("clerk")
                && !officeOf(user).equals(String.valueOf(current.get("officeCode")))) {
            throw new Errors.Forbidden("ほかの拠点の受注は直せません");
        }
        // 締めた月は直せない（前書き）。画面は結果だけを見せる。
        if (orders.isClosed(current.get("orderDate"))) {
            throw new Errors.Conflict("締めた月の受注は直せません");
        }
        if ("cancelled".equals(current.get("orderStatus"))) {
            throw new Errors.Conflict("取り消した受注は直せません");
        }

        Map<String, Object> record = accept(body, "edit");
        List<Map<String, Object>> lines = orders.withMasterPrices(linesOf(record));
        OrderTotals.Totals totals = OrderTotals.of(lines);

        // **更新日時が変わっていたら弾く**（前書きの concurrency の答え）。
        Object seen = body.get("updatedAt");
        int changed = db.update(
                "update orders set customer_code = ?, order_date = ?::date, due_date = ?::date,"
                        + " sales_person_name = ?, delivery_place = ?, note = ?,"
                        + " subtotal_amount = ?, tax_amount = ?, total_amount = ?, line_count = ?,"
                        + " updated_at = now()"
                        + " where order_no = ?"
                        + "   and (?::timestamptz is null or updated_at = ?::timestamptz)",
                record.get("customerCode"),
                record.get("orderDate"),
                record.get("dueDate"),
                record.get("salesPersonName"),
                record.get("deliveryPlace"),
                record.get("note"),
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

    /**
     * 取り消す。<b>消さない</b>（前書きの {@code erase} の答え＝状態を「取消」にするだけ）。
     *
     * <p>画面の「削除」が実際に何をするかは定義に書けない。書けるのは「消せる」まで。
     */
    @DeleteMapping("/{orderNo}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(HttpServletRequest request, @PathVariable String orderNo) {
        User user = sessions.require(request);
        Authz.require(user, "clerk");
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

    /**
     * 定義に書いてある項目だけを拾い、<b>画面とまったく同じ検証</b>を通す。
     *
     * <p>書いていないキーは捨てる＝API からだけ入る隠し項目を作らない。
     */
    private Map<String, Object> accept(Map<String, Object> body, String mode) {
        FormDefinition form = wholeForm(definition.page(PAGE));
        Map<String, Object> record = new LinkedHashMap<>();
        for (SectionDefinition section : form.sections()) {
            for (FieldDefinition field : section.fields()) {
                Object value = body.get(field.field());
                if (value != null) {
                    record.put(field.field(), "".equals(value) ? null : value);
                }
            }
        }
        FormValidator.ValidationResult checked = validator.validate(form, record, mode);
        if (!checked.valid()) {
            throw new Errors.Invalid(checked.errors());
        }
        return record;
    }

    /** ウィザードの全ステップを1枚のフォームにする（保存は最後に1回なので、全部見る）。 */
    private static FormDefinition wholeForm(PageDefinition page) {
        List<SectionDefinition> sections = new ArrayList<>();
        for (WizardStepDefinition step : page.steps()) {
            sections.add(new SectionDefinition(step.title(), step.fields(), step.visibleWhen()));
        }
        return new FormDefinition(sections);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> linesOf(Map<String, Object> record) {
        Object raw = record.get("lines");
        return raw instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }

    private String officeOf(User user) {
        Map<String, Object> row =
                db.one("select office_code from app_users where user_id = ?", user.userId());
        return row == null ? "" : String.valueOf(row.get("officeCode"));
    }
}
