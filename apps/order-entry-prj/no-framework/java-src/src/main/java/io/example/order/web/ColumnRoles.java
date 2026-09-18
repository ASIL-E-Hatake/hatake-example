package io.example.order.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 役割で見せない列を落とす。
 *
 * <p><b>ここが `ColumnDefinition.roles` の代わり。</b> hatake 版では列に書いた
 * `roles: [clerk, manager]` を<b>画面もサーバも同じ1か所から</b>読んでいた。
 * この版では
 *
 * <ul>
 *   <li>サーバ … この表</li>
 *   <li>画面 … 一覧を組む Widget（`no-framework/flutter-src`）</li>
 * </ul>
 *
 * の2か所に同じことを書く。<b>片方だけ直すと、画面から消えたのに API では取れる</b>
 * （またはその逆）という状態になり、しかもテストを書くまで気づけない。
 */
public final class ColumnRoles {

    /** 項目名 → その列を見てよい役割。書いていない項目は全員に見える。 */
    private static final Map<String, Set<String>> HIDDEN = Map.of(
            "createdBy", Set.of("clerk", "manager"));

    private ColumnRoles() {
    }

    /** その役割のどれかを持っていることを求める。足りなければ 403。 */
    public static void require(User user, String... allowed) {
        for (String role : allowed) {
            if (user.roles().contains(role)) {
                return;
            }
        }
        throw new Errors.Forbidden("この操作は許可されていません");
    }

    /** 見えない列を**返さない**（画面で隠すだけでは足りない）。 */
    public static List<Map<String, Object>> hide(List<Map<String, Object>> rows, User user) {
        List<String> drop = HIDDEN.entrySet().stream()
                .filter(entry -> entry.getValue().stream().noneMatch(user.roles()::contains))
                .map(Map.Entry::getKey)
                .toList();
        if (drop.isEmpty()) {
            return rows;
        }
        return rows.stream()
                .map(row -> {
                    Map<String, Object> copy = new LinkedHashMap<>(row);
                    drop.forEach(copy::remove);
                    return (Map<String, Object>) copy;
                })
                .toList();
    }
}
