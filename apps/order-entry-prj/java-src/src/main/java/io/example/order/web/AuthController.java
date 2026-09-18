package io.example.order.web;

import io.example.order.Db;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * ログイン。<b>定義に書けない口</b>（hatake は認証を持たない）。
 *
 * <p>前書きではこう決めてある: 「ログインは hatake の外。社内ポータルの ID を使い、
 * 役割もそちらが返す」。この見本ではその社内ポータルの代わりを DB の表1枚で置いている。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final Db db;
    private final Tokens tokens;

    public AuthController(Db db, Tokens tokens) {
        this.db = db;
        this.tokens = tokens;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body) {
        String userId = String.valueOf(body.getOrDefault("userId", ""));
        String password = String.valueOf(body.getOrDefault("password", ""));
        Map<String, Object> found = db.one(
                "select user_id, user_name, roles, office_code, password_salt, password_hash"
                        + " from app_users where user_id = ?",
                userId);
        // **なぜ通らなかったかは言わない**（居ないのか、合っていないのかを分けると
        // 「この ID は在る」が漏れる）。
        if (found == null || !matches(password, found)) {
            throw new Errors.Unauthorized("ID かパスワードが違います");
        }
        User user = new User(
                userId,
                String.valueOf(found.get("userName")),
                new LinkedHashSet<>(List.of(String.valueOf(found.get("roles")).split(","))));
        return Map.of(
                "token", tokens.issue(user),
                "user", Map.of(
                        "userId", user.userId(),
                        "name", user.name(),
                        "roles", user.roles(),
                        // 拠点は画面に出さないが、**サーバが自分の拠点だけに絞る**ために使う。
                        "officeCode", String.valueOf(found.get("officeCode"))));
    }

    private static boolean matches(String password, Map<String, Object> row) {
        String salt = String.valueOf(row.get("passwordSalt"));
        String known = String.valueOf(row.get("passwordHash"));
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(salt.getBytes(StandardCharsets.UTF_8));
            String made = HexFormat.of()
                    .formatHex(digest.digest(password.getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(
                    made.getBytes(StandardCharsets.UTF_8), known.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
