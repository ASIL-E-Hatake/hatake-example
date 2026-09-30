package io.example.order.web;

import io.example.order.Definition;
import io.hatake.core.Access;
import io.hatake.core.ServerAccess;
import java.util.ArrayList;
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
 * <p>何をどの役割に許すかは<b>定義に書いてある</b>（画面の {@code roles}・ボタンの
 * {@code roles}・列と項目の {@code roles}）。ここはそれを枠組みの {@link ServerAccess}
 * （画面と同じ規則）で読むだけで、<b>役割名をここに書かない</b>。0.9.20 までは
 * 「入力できるのは sales と clerk」をサーバに決め打ちしていて、要件で「全部できる」
 * はずの manager が、画面から入力を開けるのに保存で 403 になっていた。
 */
public final class Authz {

    private Authz() {
    }

    /** その画面を開ける人だけ通す（画面自身の {@code roles}）。 */
    public static void requirePage(Definition definition, User user, String pageId) {
        if (!ServerAccess.canOpenPage(definition.document(), pageId, user.roles())) {
            throw forbidden();
        }
    }

    /**
     * その画面のボタン（{@code create} / {@code edit} / {@code delete} か、宣言したボタンの id）
     * を押せる人だけ通す。画面に無いボタンは押せない。
     */
    public static void requireAction(
            Definition definition, User user, String pageId, String actionId) {
        if (!ServerAccess.canRunAction(definition.document(), pageId, actionId, user.roles())) {
            throw forbidden();
        }
    }

    /**
     * 定義に無い操作の役割（出荷のような状態を進める操作）。
     *
     * <p>定義に書けるのは「この状態なら押せる」までで、状態を進める操作そのものは
     * 枠組みの外（前書きの {@code state-owner}）。だからここだけは役割をサーバが持つ。
     */
    public static void require(User user, String... allowed) {
        if (!Access.isAllowed(List.of(allowed), user.roles())) {
            throw forbidden();
        }
    }

    /**
     * その人に見せない項目を<b>返さない</b>（列か入力欄のどこか一つでも {@code roles} から
     * 外れていれば落とす＝{@link ServerAccess#visibleRecord}）。
     */
    public static List<Map<String, Object>> visible(
            Definition definition, String pageId, List<Map<String, Object>> rows, User user) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            out.add(ServerAccess.visibleRecord(definition.document(), pageId, row, user.roles()));
        }
        return out;
    }

    // 403（居ることは認めるが、その操作は許さない）。社内システムなので
    // 「権限が足りない」と言ったほうが問い合わせが減る。
    private static Errors.Forbidden forbidden() {
        return new Errors.Forbidden("この操作は許可されていません");
    }
}
