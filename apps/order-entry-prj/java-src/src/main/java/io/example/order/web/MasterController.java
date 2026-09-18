package io.example.order.web;

import io.example.order.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 取引先・商品（<b>照会だけ</b>）。
 *
 * <p>この2つは画面に出てこない（どの画面の {@code repository} でもない）が、
 * 選択肢の出どころとして定義に書いてある（{@code optionsSource}）。画面は
 * 「取引先の一覧をください」と Repository に頼むだけなので、口はやはり
 * {@code hatake_http} の契約どおりに要る。
 *
 * <p>直すのは別の案件の担当（前書きの {@code external} にそう書いてある）ので、
 * ここに置くのは読む口だけ。
 */
@RestController
public class MasterController {

    private final Db db;
    private final Sessions sessions;

    public MasterController(Db db, Sessions sessions) {
        this.db = db;
        this.sessions = sessions;
    }

    @GetMapping("/api/customers")
    public Map<String, Object> customers(
            HttpServletRequest request,
            @RequestParam(required = false) String customerName) {
        sessions.require(request);
        return page("customers", "customer_name", customerName);
    }

    @GetMapping("/api/customers/{code}")
    public Map<String, Object> customer(HttpServletRequest request, @PathVariable String code) {
        sessions.require(request);
        return found(db.one("select * from customers where customer_code = ?", code));
    }

    @GetMapping("/api/products")
    public Map<String, Object> products(
            HttpServletRequest request,
            @RequestParam(required = false) String productName) {
        sessions.require(request);
        return page("products", "product_name", productName);
    }

    @GetMapping("/api/products/{code}")
    public Map<String, Object> product(HttpServletRequest request, @PathVariable String code) {
        sessions.require(request);
        return found(db.one("select * from products where product_code = ?", code));
    }

    /** 選択肢として全部返す（マスタは数百件なのでページ送りを掛けない）。 */
    private Map<String, Object> page(String table, String nameColumn, String contains) {
        List<Map<String, Object>> rows = contains == null || contains.isBlank()
                ? db.query("select * from " + table + " order by 1")
                : db.query(
                        "select * from " + table + " where " + nameColumn + " ilike ? order by 1",
                        "%" + contains + "%");
        return Map.of("items", rows, "totalCount", rows.size());
    }

    private static Map<String, Object> found(Map<String, Object> row) {
        if (row == null) {
            throw new Errors.NotFound("見つかりません");
        }
        return row;
    }
}
