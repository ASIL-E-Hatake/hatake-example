package io.example.order.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/** リクエストから「いま誰か」を取り出す。<b>枠組みの外</b>。 */
@Component
public class Sessions {

    private final Tokens tokens;

    public Sessions(Tokens tokens) {
        this.tokens = tokens;
    }

    /** ログインしていることを求める（していなければ 401）。 */
    public User require(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        User user = tokens.read(header == null ? null : header.replaceFirst("^Bearer ", ""));
        if (user == null) {
            throw new Errors.Unauthorized("ログインしてください");
        }
        return user;
    }
}
