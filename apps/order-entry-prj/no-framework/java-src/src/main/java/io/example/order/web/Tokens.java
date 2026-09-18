package io.example.order.web;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * 署名つきトークン。<b>ここは hatake の外</b>（{@code hatake where 認証} がそう言う）。
 *
 * <p>状態を持たない＝再起動でログインが消えない。中身は隠していない（社内システムなので
 * 誰であるかは秘密ではない）が、<b>書き換えられない</b>ことだけを保証する。
 */
@Component
public class Tokens {

    private static final long TTL_SECONDS = 8 * 60 * 60;
    private final byte[] secret;

    public Tokens() {
        String configured = System.getenv("TOKEN_SECRET");
        if (configured != null && !configured.isBlank()) {
            secret = configured.getBytes(StandardCharsets.UTF_8);
        } else {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            secret = HexFormat.of().formatHex(random).getBytes(StandardCharsets.UTF_8);
        }
    }

    public String issue(User user) {
        String body = Base64.getUrlEncoder().withoutPadding().encodeToString(
                (user.userId() + "\u001f" + user.name() + "\u001f"
                        + String.join(",", user.roles()) + "\u001f"
                        + (Instant.now().getEpochSecond() + TTL_SECONDS))
                        .getBytes(StandardCharsets.UTF_8));
        return body + "." + sign(body);
    }

    /** 偽物・期限切れは null（<b>理由は返さない</b>＝総当たりの手掛かりにしない）。 */
    public User read(String token) {
        if (token == null || !token.contains(".")) {
            return null;
        }
        String[] parts = token.split("\\.", 2);
        if (!sign(parts[0]).equals(parts[1])) {
            return null;
        }
        String[] claim = new String(
                Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8).split("\u001f");
        if (claim.length != 4 || Long.parseLong(claim[3]) <= Instant.now().getEpochSecond()) {
            return null;
        }
        Set<String> roles = new LinkedHashSet<>(
                claim[2].isEmpty() ? List.of() : List.of(claim[2].split(",")));
        return new User(claim[0], claim[1], roles);
    }

    private String sign(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
