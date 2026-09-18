package io.example.order.web;

import io.example.order.Db;
import io.example.order.Definition;
import io.example.order.OrderStore;
import io.hatake.core.BulkLimits;
import io.hatake.core.MessageResolver;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.yaml.snakeyaml.Yaml;

/**
 * 一括（まとめて取り消す）。
 *
 * <p>定義に書いてあるのは「選んだ行にまとめて実行する」「1回 50 件まで（clerk は 20 件）」
 * までで、<b>中身はアプリ側</b>（前書きで {@code where: plugin} と宣言してある）。
 *
 * <p>ここで効いているのが2つ:
 * <ul>
 *   <li><b>件数の上限をサーバでも守る</b>（{@link BulkLimits#check}）。画面が止めても
 *       API を直接叩けば通るので、守る側が<b>同じ定義から同じ数</b>を出す</li>
 *   <li><b>1件ずつ確定して、失敗した行だけ返す</b>（前書きの {@code partial-failure} の
 *       答え）。締めた月が混ざるのは普通に起きるので、全部取り消すと
 *       「1件のために49件やり直し」になる</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/bulk")
public class BulkController {

    private final Db db;
    private final Definition definition;
    private final OrderStore orders;
    private final Sessions sessions;
    private final Audit audit;
    private final Map<String, Object> document;

    @SuppressWarnings("unchecked")
    public BulkController(
            Db db, Definition definition, OrderStore orders, Sessions sessions, Audit audit) {
        this.db = db;
        this.definition = definition;
        this.orders = orders;
        this.sessions = sessions;
        this.audit = audit;
        // 上限を読む道具は**素の定義**を受ける（ボタンは UI の話なので、解析後のモデルが
        // 持っていない）。定義そのものは Definition が読んだ文字列を使い回す。
        this.document = (Map<String, Object>) new Yaml().load(definition.source());
    }

    @PostMapping("/cancel")
    public Map<String, Object> cancel(
            HttpServletRequest request, @RequestBody Map<String, Object> body) {
        User user = sessions.require(request);
        // 押せる役割も**定義から**引く（ここで別の表を持つと、画面と API が食い違う）。
        Authz.require(user, rolesOfAction("order_search", "bulkCancel").toArray(String[]::new));

        List<String> keys = keysOf(body);
        if (keys.isEmpty()) {
            throw new Errors.Invalid(List.of());
        }
        // 上限は**定義から**引く（ここで別の数を書くと、画面と API で食い違う）。
        String tooMany = BulkLimits.check(
                document, "bulkCancel", keys.size(), user.roles(), new MessageResolver());
        if (tooMany != null) {
            throw new Errors.Conflict(tooMany);
        }

        // 1件ずつ確定する。**全部取り消さない**＝20件目で落ちても、19件は残る。
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

        // `rejected` に**行を名指しで**返す（定義の onError が {failedKeys} を使っている）。
        return Map.of("succeeded", succeeded, "rejected", rejected);
    }

    /** 1件ぶん。通れば null、通らなければ<b>押した人に分かる言葉</b>で理由を返す。 */
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

    /** 定義に書いてあるそのボタンの `roles`。 */
    @SuppressWarnings("unchecked")
    private List<String> rolesOfAction(String pageId, String actionId) {
        Object pages = ((Map<String, Object>) document.get("app")).get("pages");
        for (Object one : (List<Object>) pages) {
            Map<String, Object> page = (Map<String, Object>) one;
            if (!pageId.equals(page.get("id")) || !(page.get("actions") instanceof List<?> acts)) {
                continue;
            }
            for (Object act : acts) {
                Map<String, Object> action = (Map<String, Object>) act;
                if (actionId.equals(action.get("id")) && action.get("roles") instanceof List<?> r) {
                    List<String> roles = new ArrayList<>();
                    r.forEach(role -> roles.add(String.valueOf(role)));
                    return roles;
                }
            }
        }
        throw new IllegalStateException(
                "定義に " + pageId + " の " + actionId + " がありません");
    }

    private static List<String> keysOf(Map<String, Object> body) {
        List<String> keys = new ArrayList<>();
        if (body.get("keys") instanceof List<?> list) {
            list.forEach(one -> keys.add(String.valueOf(one)));
        }
        return keys;
    }
}
