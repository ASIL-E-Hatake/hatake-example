package io.example.order.web;

import io.hatake.core.Access;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 役割で止める。
 *
 * <p><b>画面の {@code roles} は見せ方だけ</b>（API を直接叩けばデータは取れる）。案件の
 * 前書きで {@code authz-server} の問いにこう答えてある:
 *
 * <pre>役割で隠したものは API でも役割を見て止める</pre>
 *
 * <p>ここが無いと、hatake の {@code roles} は「隠しただけ」になる。判定そのものは
 * 枠組みの {@link Access}（3版で同じ判定）を使う＝<b>判定を2つ持たない</b>。
 */
public final class Authz {

    private Authz() {
    }

    /** その役割のどれかを持っていることを求める。足りなければ 403。 */
    public static void require(User user, String... allowed) {
        if (!Access.isAllowed(List.of(allowed), user.roles())) {
            // 403（居ることは認めるが、その操作は許さない）。社内システムなので
            // 「権限が足りない」と言ったほうが問い合わせが減る。
            throw new Errors.Forbidden("この操作は許可されていません");
        }
    }

    /**
     * 定義で {@code roles} を書いている列のうち、その人に見えないものを<b>返さない</b>。
     *
     * <p><b>定義を正にする</b>のが要点。ここで別の表を持つと、画面では隠れているのに
     * API では通る（またはその逆）が起きて、しかも誰も気づかない。
     *
     * <p>{@code columnRoles} を外から受けるのは、0.9.0 の Java 版が列の {@code roles} を
     * 読まないから（{@code HatakeGap} を参照。次の版で {@code column.roles()} に戻せる）。
     */
    public static List<Map<String, Object>> hideColumns(
            Map<String, List<String>> columnRoles,
            List<Map<String, Object>> rows,
            User user) {
        List<String> hidden = new ArrayList<>();
        for (Map.Entry<String, List<String>> column : columnRoles.entrySet()) {
            if (!Access.isAllowed(column.getValue(), user.roles())) {
                hidden.add(column.getKey());
            }
        }
        if (hidden.isEmpty()) {
            return rows;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> copy = new LinkedHashMap<>(row);
            hidden.forEach(copy::remove);
            out.add(copy);
        }
        return out;
    }
}
