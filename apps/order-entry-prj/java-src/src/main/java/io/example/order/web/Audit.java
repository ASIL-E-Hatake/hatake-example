package io.example.order.web;

import io.example.order.Db;
import org.springframework.stereotype.Component;

/**
 * 監査（誰が・いつ・何をしたか）。
 *
 * <p>案件の前書きで {@code audit} の問いにこう答えてある:
 * 「誰が・いつ・どの受注を直したかを残す」＝<b>枠組みの外</b>。
 * hatake は押されたことをアプリ側に渡すだけで、記録は持たない
 * （誰がログインしているかも知らない）。
 */
@Component
public class Audit {

    private final Db db;

    public Audit(Db db) {
        this.db = db;
    }

    public void record(User user, String action, String target, String key, String detail) {
        db.update(
                "insert into audit_log (user_id, action, target, target_key, detail)"
                        + " values (?, ?, ?, ?, ?)",
                user.userId(), action, target, key, detail);
    }
}
